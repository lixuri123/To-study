import pytest
from fastapi.testclient import TestClient

from backend.main import create_app


@pytest.fixture
def client(tmp_path):
    from backend.models import Base

    app = create_app(f"sqlite:///{tmp_path / 'goals.db'}")
    Base.metadata.create_all(app.state.engine)
    with TestClient(app, headers={"X-Qingjian-Request": "1"}) as value:
        yield value
    app.state.engine.dispose()


def account(client, name="alice"):
    client.cookies.clear()
    response = client.post(
        "/api/auth/register",
        json={"username": name, "password": "test-password"},
    )
    assert response.status_code == 201
    token = client.cookies.get("qingjian_session")
    client.cookies.clear()
    return {"Cookie": "qingjian_session=" + token}


def simple_goal():
    return {
        "title": "准备毕业",
        "description": "完成毕业所需事项",
        "blocks": [{
            "kind": "checklist",
            "title": "毕业手续",
            "unit_label": "项",
            "position": 0,
            "checklist_items": [
                {"title": "提交论文初稿", "position": 0},
                {"title": "完成预答辩", "position": 1},
            ],
            "categories": [],
        }],
    }


def test_goal_routes_require_authentication(client):
    assert client.get("/api/goals").status_code == 401
    assert client.post("/api/goals", json=simple_goal()).status_code == 401


def test_goal_crud_lifecycle_and_account_isolation(client):
    alice = account(client)
    bob = account(client, "bobby")
    created = client.post("/api/goals", headers=alice, json=simple_goal())
    assert created.status_code == 201
    goal = created.json()
    assert goal["summary"]["attained"] is False
    assert client.get("/api/goals", headers=bob).json() == []
    assert client.get(f"/api/goals/{goal['id']}", headers=bob).status_code == 404
    archived = client.patch(
        f"/api/goals/{goal['id']}/lifecycle",
        headers=alice,
        json={"archived": True},
    )
    assert archived.status_code == 200
    assert archived.json()["archived_at"] is not None
    assert client.delete(f"/api/goals/{goal['id']}", headers=alice).status_code == 204


def test_goal_requires_a_non_empty_structure(client):
    headers = account(client)
    response = client.post(
        "/api/goals", headers=headers, json={"title": "空目标", "blocks": []}
    )
    assert response.status_code == 422


def test_full_time_template_is_copied_and_rule_complete(client):
    headers = account(client)
    templates = client.get("/api/goals/templates", headers=headers).json()
    assert templates == [{
        "key": "full-time-postgraduate-quality",
        "title": "完成研究生综合素质要求",
        "description": "全日制研究生：核心素质 4 类各至少 1 次且总计至少 8 次；素质提升至少覆盖 3 类且总计至少 3 次。",
    }]
    response = client.post(
        "/api/goals/from-template/full-time-postgraduate-quality",
        headers=headers,
    )
    assert response.status_code == 201
    goal = response.json()
    core, quality = goal["blocks"]
    assert core["minimum_total"] == 8
    assert core["minimum_distinct_categories"] == 4
    assert len(core["categories"]) == 4
    assert all(category["is_required"] for category in core["categories"])
    assert quality["minimum_total"] == 3
    assert quality["minimum_distinct_categories"] == 3
    assert len(quality["categories"]) == 8
    volunteer = next(category for category in quality["categories"] if category["name"] == "志愿服务")
    assert "“志愿北京”平台累计志愿服务满 10 小时" in [
        suggestion["title"] for suggestion in volunteer["suggestions"]
    ]
