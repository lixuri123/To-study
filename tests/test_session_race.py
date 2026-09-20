from concurrent.futures import ThreadPoolExecutor
from threading import Event

from fastapi.testclient import TestClient

from backend.main import create_app
from backend.models import Base
from backend.notes import service


def test_delayed_business_response_cannot_overwrite_new_login_cookie(
    tmp_path, monkeypatch
):
    app = create_app(f"sqlite:///{tmp_path / 'session-race.db'}")
    Base.metadata.create_all(app.state.engine)
    entered, release = Event(), Event()
    original = service.list_notes

    def delayed(db, user_id):
        entered.set()
        assert release.wait(10), "Timed out waiting for login to finish"
        return original(db, user_id)

    monkeypatch.setattr(service, "list_notes", delayed)
    credentials = {"username": "alice", "password": "password123"}
    with TestClient(app, headers={"X-Qingjian-Request": "1"}) as client:
        assert client.post("/api/auth/register", json=credentials).status_code == 201
        original_cookie = client.cookies.get("qingjian_session")
        with ThreadPoolExecutor(max_workers=1) as pool:
            pending = pool.submit(client.get, "/api/notes")
            try:
                assert entered.wait(10), (
                    "Old request never reached the business handler"
                )
                assert (
                    client.post("/api/auth/login", json=credentials).status_code == 200
                )
                fresh_cookie = client.cookies.get("qingjian_session")
                assert fresh_cookie != original_cookie
            finally:
                release.set()
            assert pending.result(timeout=10).status_code == 200
        assert client.cookies.get("qingjian_session") == fresh_cookie
        assert client.get("/api/auth/me").status_code == 200
