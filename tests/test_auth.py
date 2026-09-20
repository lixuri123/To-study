import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.main import create_app
from backend.models import Base, SessionToken


@pytest.fixture
def client(tmp_path):
    app = create_app(f"sqlite:///{tmp_path / 'auth.db'}")
    Base.metadata.create_all(app.state.engine)
    with TestClient(app, headers={"X-Qingjian-Request": "1"}) as client:
        yield client
    app.state.engine.dispose()


def register(client, username="alice"):
    return client.post(
        "/api/auth/register",
        json={"username": username, "password": " password with spaces "},
    )


def test_login_cookie_persists_without_exposing_token(client):
    response = register(client)
    assert response.status_code == 201
    assert "token" not in response.json()
    assert response.json()["id"]
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie
    assert "max-age=34560000" in cookie
    assert response.headers["cache-control"] == "no-store"
    assert client.get("/api/auth/me").json()["username"] == "alice"


def test_persistent_session_survives_time_and_restart(client, monkeypatch):
    register(client)
    with Session(client.app.state.engine) as db:
        assert db.scalar(select(SessionToken)).expires_at == 0
    future = time.time() + 365 * 86400
    monkeypatch.setattr(time, "time", lambda: future)
    app = create_app(str(client.app.state.engine.url))
    with TestClient(app, cookies=client.cookies) as reopened:
        response = reopened.get("/api/auth/me")
        assert response.status_code == 200
        assert "max-age=34560000" in response.headers["set-cookie"].lower()
    app.state.engine.dispose()


def test_logout_idempotent_and_revokes_stolen_cookie(client):
    register(client)
    stolen = dict(client.cookies)
    assert client.post("/api/auth/logout").status_code == 204
    assert client.post("/api/auth/logout").status_code == 204
    assert not client.cookies.get("qingjian_session")
    with TestClient(client.app, cookies=stolen) as other:
        assert other.get("/api/auth/me").status_code == 401


def test_cookie_auth_rejects_csrf_and_cross_origin_login(client):
    register(client)
    with TestClient(client.app, cookies=client.cookies) as other:
        assert other.post("/api/notes", json={"title": "forged"}).status_code == 403
        assert other.post("/api/auth/logout").status_code == 403
        assert (
            other.post(
                "/api/auth/login",
                json={"username": "alice", "password": " password with spaces "},
            ).status_code
            == 403
        )
    assert (
        client.post(
            "/api/notes",
            headers={"Origin": "https://evil.example"},
            json={"title": "forged"},
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/notes",
            headers={"Origin": "http://testserver"},
            json={"title": "valid"},
        ).status_code
        == 201
    )


def test_password_preserved_and_validation_is_field_specific(client):
    register(client)
    client.post("/api/auth/logout")
    assert (
        client.post(
            "/api/auth/login",
            json={"username": "ALICE", "password": " password with spaces "},
        ).status_code
        == 200
    )
    response = client.post(
        "/api/auth/register", json={"username": "x", "password": "short"}
    )
    assert response.status_code == 422
    assert set(response.json()["fields"]) == {"username", "password"}
    assert "short" not in response.text


def test_account_throttle_survives_restart_and_resets(client, monkeypatch):
    for _ in range(5):
        assert (
            client.post(
                "/api/auth/login", json={"username": "alice", "password": "incorrect"}
            ).status_code
            == 401
        )
    app = create_app(str(client.app.state.engine.url))
    with TestClient(app, headers={"X-Qingjian-Request": "1"}) as reopened:
        response = reopened.post(
            "/api/auth/login", json={"username": "ALICE", "password": "incorrect"}
        )
        assert response.status_code == 429
        assert 0 < int(response.headers["retry-after"]) <= 300
    app.state.engine.dispose()
    future = time.time() + 301
    monkeypatch.setattr(time, "time", lambda: future)
    assert (
        client.post(
            "/api/auth/login", json={"username": "alice", "password": "incorrect"}
        ).status_code
        == 401
    )


def test_secure_cookie_deployment_setting(client, monkeypatch):
    monkeypatch.setenv("COOKIE_SECURE", "true")
    app = create_app(str(client.app.state.engine.url))
    with TestClient(
        app, base_url="https://testserver", headers={"X-Qingjian-Request": "1"}
    ) as secure:
        response = register(secure)
        assert "; Secure" in response.headers["set-cookie"]
        assert secure.get("/api/auth/me").status_code == 200
    app.state.engine.dispose()


def test_ip_throttle_covers_different_accounts(client):
    for number in range(30):
        assert (
            client.post(
                "/api/auth/login",
                json={"username": f"account{number}", "password": "incorrect"},
            ).status_code
            == 401
        )
    response = client.post(
        "/api/auth/login",
        json={"username": "another", "password": "incorrect"},
        headers={"X-Forwarded-For": "192.0.2.99"},
    )
    assert response.status_code == 429


def test_concurrent_attempts_cannot_bypass_account_limit(client):
    from concurrent.futures import ThreadPoolExecutor

    def attempt(_):
        return client.post(
            "/api/auth/login", json={"username": "alice", "password": "incorrect"}
        ).status_code

    with ThreadPoolExecutor(max_workers=8) as pool:
        statuses = list(pool.map(attempt, range(8)))
    assert statuses.count(401) == 5
    assert statuses.count(429) == 3


def test_login_rotates_current_cookie_and_invalid_bearer_cannot_fall_back(client):
    register(client)
    old_cookie = dict(client.cookies)
    response = client.post(
        "/api/auth/login",
        json={"username": "alice", "password": " password with spaces "},
    )
    assert response.status_code == 200
    assert dict(client.cookies) != old_cookie
    with TestClient(client.app, cookies=old_cookie) as stolen:
        assert stolen.get("/api/auth/me").status_code == 401
    assert (
        client.get(
            "/api/auth/me", headers={"Authorization": "Bearer invalid"}
        ).status_code
        == 401
    )
    assert client.get("/api/auth/me").status_code == 200


@pytest.mark.parametrize("expired", [False, True])
def test_legacy_bearer_upgrades_only_while_valid(client, expired):
    register(client)
    token = client.cookies.get("qingjian_session")
    client.cookies.clear()
    with Session(client.app.state.engine) as db:
        session = db.scalar(select(SessionToken))
        session.expires_at = int(time.time()) + (-10 if expired else 3600)
        db.commit()
    response = client.get("/api/auth/me", headers={"Authorization": "Bearer " + token})
    assert response.status_code == (401 if expired else 200)
    if not expired:
        assert client.cookies.get("qingjian_session") == token
        with Session(client.app.state.engine) as db:
            assert db.scalar(select(SessionToken)).expires_at == 0


def test_stale_tab_cannot_read_or_write_as_new_cookie_account(client):
    alice_id = register(client).json()["id"]
    bobby_id = register(client, "bobby").json()["id"]
    stale = {"X-Qingjian-User": alice_id}
    assert client.get("/api/notes", headers=stale).status_code == 401
    assert (
        client.post(
            "/api/notes", headers=stale, json={"title": "Alice private draft"}
        ).status_code
        == 401
    )
    assert client.get("/api/notes", headers={"X-Qingjian-User": bobby_id}).json() == []
