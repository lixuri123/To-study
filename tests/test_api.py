import pytest
from fastapi.testclient import TestClient

from backend.main import create_app


@pytest.fixture
def client(tmp_path):
    from backend.models import Base

    app = create_app(f"sqlite:///{tmp_path / 'test.db'}")
    Base.metadata.create_all(app.state.engine)
    with TestClient(app, headers={"X-Qingjian-Request": "1"}) as c:
        yield c
    app.state.engine.dispose()


def account(client, name="alice"):
    client.cookies.clear()
    response = client.post(
        "/api/auth/register", json={"username": name, "password": "test-password"}
    )
    assert response.status_code == 201
    token = client.cookies.get("qingjian_session")
    client.cookies.clear()
    return {"Cookie": "qingjian_session=" + token}


def test_auth_and_revocation(client):
    assert client.get("/api/notes").status_code == 401
    headers = account(client)
    assert client.get("/api/auth/me", headers=headers).json()["username"] == "alice"
    assert (
        client.post(
            "/api/auth/login", json={"username": "alice", "password": "wrong-password"}
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/auth/register",
            json={"username": "alice", "password": "test-password"},
        ).status_code
        == 409
    )
    assert client.post("/api/auth/logout", headers=headers).status_code == 204
    assert client.get("/api/notes", headers=headers).status_code == 401
    assert (
        client.post(
            "/api/auth/login", json={"username": "alice", "password": "test-password"}
        ).status_code
        == 200
    )


def test_notes_crud_isolation_and_validation(client):
    a, b = account(client), account(client, "bobby")
    assert (
        client.post(
            "/api/notes", headers=a, json={"title": "  ", "content": ""}
        ).status_code
        == 422
    )
    response = client.post(
        "/api/notes", headers=a, json={"title": "笔记", "content": "第一段"}
    )
    assert response.status_code == 201
    note = response.json()
    path = f"/api/notes/{note['id']}"
    assert client.get("/api/notes", headers=b).json() == []
    assert (
        client.put(path, headers=b, json={"title": "偷改", "content": ""}).status_code
        == 404
    )
    assert client.delete(path, headers=b).status_code == 404
    assert (
        client.put(path, headers=a, json={"title": "更新", "content": "内容"}).json()[
            "content"
        ]
        == "内容"
    )
    assert client.get("/api/notes", headers=a).json()[0]["title"] == "更新"
    assert client.delete(path, headers=a).status_code == 204
    assert client.get("/api/notes", headers=a).json() == []


def test_tasks_crud_and_isolation(client):
    a, b = account(client), account(client, "bobby")
    assert client.post("/api/tasks", headers=a, json={"title": " "}).status_code == 422
    response = client.post("/api/tasks", headers=a, json={"title": "读书"})
    assert response.status_code == 201
    path = f"/api/tasks/{response.json()['id']}"
    assert (
        client.patch(path, headers=a, json={"completed": True}).json()["completed"]
        is True
    )
    assert (
        client.patch(path, headers=a, json={"completed": False}).json()["completed"]
        is False
    )
    assert client.patch(path, headers=a, json={"completed": None}).status_code == 422
    assert client.get("/api/tasks", headers=b).json() == []
    assert client.patch(path, headers=b, json={"completed": True}).status_code == 404
    assert client.delete(path, headers=b).status_code == 404
    assert client.delete(path, headers=a).status_code == 204


def test_tasks_support_due_dates_title_updates_and_clearing(client):
    headers = account(client)
    response = client.post(
        "/api/tasks",
        headers=headers,
        json={"title": "交报告", "due_date": "2026-09-08"},
    )
    assert response.status_code == 201
    task = response.json()
    assert task["due_date"] == "2026-09-08"

    response = client.patch(
        f"/api/tasks/{task['id']}",
        headers=headers,
        json={"title": "提交报告", "due_date": "2026-09-09"},
    )
    assert response.status_code == 200
    assert response.json()["title"] == "提交报告"
    assert response.json()["due_date"] == "2026-09-09"

    response = client.patch(
        f"/api/tasks/{task['id']}", headers=headers, json={"due_date": None}
    )
    assert response.status_code == 200
    assert response.json()["due_date"] is None


@pytest.mark.parametrize("due_date", ["2026-02-30", "09/08/2026", "2026-9-8", ""])
def test_tasks_reject_invalid_due_dates(client, due_date):
    headers = account(client)
    assert (
        client.post(
            "/api/tasks",
            headers=headers,
            json={"title": "交报告", "due_date": due_date},
        ).status_code
        == 422
    )


def test_task_due_date_remains_account_isolated(client):
    a, b = account(client), account(client, "bobby")
    task = client.post(
        "/api/tasks", headers=a, json={"title": "私事", "due_date": "2026-09-08"}
    ).json()
    assert client.get("/api/tasks", headers=b).json() == []
    assert (
        client.patch(
            f"/api/tasks/{task['id']}",
            headers=b,
            json={"due_date": "2026-09-09"},
        ).status_code
        == 404
    )


def test_persistence_across_app_restart(client):
    headers = account(client)
    client.post(
        "/api/notes",
        headers=headers,
        json={"title": "持久保存", "content": "重启后存在"},
    )
    app = create_app(str(client.app.state.engine.url))
    with TestClient(app) as reopened:
        assert (
            reopened.get("/api/notes", headers=headers).json()[0]["title"] == "持久保存"
        )
    app.state.engine.dispose()
