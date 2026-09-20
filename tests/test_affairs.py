from test_api import client, account  # noqa: F401


def test_information_to_affair_and_reminder_history(client):
    headers = account(client)
    note = client.post("/api/notes", headers=headers, json={"title": "备选课程"}).json()
    response = client.post("/api/affairs", headers=headers, json={"title": "选课通知", "original": "下周选课", "note_ids": [note["id"]]})
    assert response.status_code == 201
    item = response.json()
    path = "/api/affairs/" + item["id"]
    item.update(kind="affair", status="pending", starts_at="2026-09-10T01:00:00Z", ends_at="2026-09-13", reminders=[{"at": "2026-09-09T01:00:00Z", "anchor": "starts_at", "offset_minutes": 1440}])
    saved = client.put(path, headers=headers, json=item)
    assert saved.status_code == 200
    updated = saved.json()
    assert len(updated["history"]) == 1
    assert client.put(path, headers=headers, json=item).status_code == 409
    updated["starts_at"] = "2026-09-11T01:00:00Z"
    updated["reminders"][0]["acknowledged"] = True
    updated = client.put(path, headers=headers, json=updated).json()
    assert updated["reminders"][0]["at"].startswith("2026-09-10T01:00:00")
    assert updated["reminders"][0]["acknowledged"] is False
    assert client.get("/api/affairs", headers=headers).json()[0] == updated
    updated.update(status="completed", proof="提交成功")
    assert client.put(path, headers=headers, json=updated).json()["proof"] == "提交成功"


def test_affair_ownership_and_validation(client):
    a, b = account(client), account(client, "bobby")
    note = client.post("/api/notes", headers=a, json={"title": "私有笔记"}).json()
    assert client.post("/api/affairs", headers=b, json={"title": "非法关联", "note_ids": [note["id"]]}).status_code == 404
    item = client.post("/api/affairs", headers=a, json={"title": "通知"}).json()
    assert client.get("/api/affairs", headers=b).json() == []
    assert client.put("/api/affairs/" + item["id"], headers=b, json=item).status_code == 404
    for changes in ({"starts_at": "2026-09-15", "ends_at": "2026-09-10"}, {"source_url": "javascript:alert(1)"}, {"reminders": [{"at": "2026-09-10T10:00:00"}]}):
        assert client.post("/api/affairs", headers=a, json={"title": "通知", **changes}).status_code == 422
