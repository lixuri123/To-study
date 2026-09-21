from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.goals.models import GoalChecklistItem, GoalProgressEntry
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


def structured_goal():
    return {
        "title": "综合目标",
        "description": "记录各项完成情况",
        "blocks": [
            {
                "kind": "checklist",
                "title": "资料准备",
                "unit_label": "项",
                "position": 0,
                "checklist_items": [
                    {"title": "提交材料", "position": 0},
                    {"title": "领取证书", "position": 1},
                ],
                "categories": [],
            },
            {
                "kind": "quota",
                "title": "实践活动",
                "unit_label": "次",
                "minimum_total": 1,
                "minimum_distinct_categories": None,
                "position": 1,
                "checklist_items": [],
                "categories": [
                    {
                        "name": "志愿服务",
                        "minimum_amount": 1,
                        "is_required": False,
                        "position": 0,
                        "suggestions": [{"title": "社区服务", "position": 0}],
                    },
                    {
                        "name": "社会实践",
                        "minimum_amount": 1,
                        "is_required": False,
                        "position": 1,
                        "suggestions": [],
                    },
                ],
            },
        ],
    }


def structure_from_goal(goal):
    return {
        "title": goal["title"],
        "description": goal["description"],
        "blocks": goal["blocks"],
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


def test_structure_save_preserves_owned_ids_and_updates_names(client):
    headers = account(client)
    goal = client.post("/api/goals", headers=headers, json=structured_goal()).json()
    payload = structure_from_goal(goal)
    payload["title"] = "已更新综合目标"
    payload["blocks"][1]["categories"][0]["name"] = "公益服务"

    response = client.put(f"/api/goals/{goal['id']}/structure", headers=headers, json=payload)

    assert response.status_code == 200
    saved = response.json()
    assert saved["id"] == goal["id"]
    assert saved["blocks"][0]["id"] == goal["blocks"][0]["id"]
    assert saved["blocks"][0]["checklist_items"][0]["id"] == goal["blocks"][0]["checklist_items"][0]["id"]
    assert saved["blocks"][1]["categories"][0]["id"] == goal["blocks"][1]["categories"][0]["id"]
    assert saved["blocks"][1]["categories"][0]["suggestions"][0]["id"] == goal["blocks"][1]["categories"][0]["suggestions"][0]["id"]
    assert saved["title"] == "已更新综合目标"
    assert saved["blocks"][1]["categories"][0]["name"] == "公益服务"


def test_structure_preview_projects_stricter_rules_without_writing(client):
    headers = account(client)
    data = structured_goal()
    data["blocks"] = [data["blocks"][1]]
    goal = client.post("/api/goals", headers=headers, json=data).json()
    quota = goal["blocks"][0]
    category = quota["categories"][0]
    with Session(client.app.state.engine) as db:
        db.add(GoalProgressEntry(
            block_id=quota["id"],
            category_id=category["id"],
            title="已有活动",
            completed_on=date(2026, 9, 20),
            amount=1,
        ))
        db.commit()
    goal = client.get(f"/api/goals/{goal['id']}", headers=headers).json()
    stricter = structure_from_goal(goal)
    stricter["blocks"][0]["minimum_total"] = 2

    preview = client.post(
        f"/api/goals/{goal['id']}/structure/preview",
        headers=headers,
        json=stricter,
    )

    assert preview.status_code == 200
    assert preview.json()["current_summary"] == goal["summary"]
    assert preview.json()["current_summary"]["attained"] is True
    assert preview.json()["proposed_summary"]["attained"] is False
    assert client.get(f"/api/goals/{goal['id']}", headers=headers).json()["title"] == goal["title"]


def test_structure_save_rejects_omitting_completed_checklist_item(client):
    headers = account(client)
    goal = client.post("/api/goals", headers=headers, json=structured_goal()).json()
    item_id = goal["blocks"][0]["checklist_items"][0]["id"]
    with Session(client.app.state.engine) as db:
        item = db.get(GoalChecklistItem, item_id)
        item.completed_on = date(2026, 9, 20)
        db.commit()
    payload = structure_from_goal(goal)
    payload["blocks"][0]["checklist_items"] = payload["blocks"][0]["checklist_items"][1:]

    response = client.put(f"/api/goals/{goal['id']}/structure", headers=headers, json=payload)

    assert response.status_code == 409
    assert "提交材料" in response.json()["detail"]


def test_structure_save_rejects_omitting_category_with_entries(client):
    headers = account(client)
    goal = client.post("/api/goals", headers=headers, json=structured_goal()).json()
    quota = goal["blocks"][1]
    category = quota["categories"][0]
    with Session(client.app.state.engine) as db:
        db.add(GoalProgressEntry(
            block_id=quota["id"],
            category_id=category["id"],
            title="已有活动",
            completed_on=date(2026, 9, 20),
            amount=1,
        ))
        db.commit()
    payload = structure_from_goal(goal)
    payload["blocks"][1]["categories"] = payload["blocks"][1]["categories"][1:]

    response = client.put(f"/api/goals/{goal['id']}/structure", headers=headers, json=payload)

    assert response.status_code == 409
    assert "志愿服务" in response.json()["detail"]


def test_structure_save_rejects_cross_account_block_id_without_writes(client):
    alice = account(client)
    bob = account(client, "bobby")
    alice_goal = client.post("/api/goals", headers=alice, json=structured_goal()).json()
    bob_goal = client.post("/api/goals", headers=bob, json=structured_goal()).json()
    payload = structure_from_goal(bob_goal)
    payload["blocks"][0]["id"] = alice_goal["blocks"][0]["id"]

    response = client.put(f"/api/goals/{bob_goal['id']}/structure", headers=bob, json=payload)

    assert response.status_code == 404
    assert response.json()["detail"] == "目标内容不存在"
    assert client.get(f"/api/goals/{alice_goal['id']}", headers=alice).json()["title"] == alice_goal["title"]
    assert client.get(f"/api/goals/{bob_goal['id']}", headers=bob).json()["title"] == bob_goal["title"]


def test_structure_save_rejects_existing_child_id_under_new_parent(client):
    headers = account(client)
    goal = client.post("/api/goals", headers=headers, json=structured_goal()).json()
    payload = structure_from_goal(goal)
    payload["blocks"][0]["id"] = None

    response = client.put(f"/api/goals/{goal['id']}/structure", headers=headers, json=payload)

    assert response.status_code == 404
    assert response.json()["detail"] == "目标内容不存在"
