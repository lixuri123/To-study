from test_api import account, client as client_fixture

client = client_fixture


def test_delivery_retry_restart_and_completion(client, monkeypatch):
    from backend.reminders import router
    clock = 1900000000
    monkeypatch.setattr(router.time, "time", lambda: clock)
    headers = account(client)
    affair = client.post("/api/affairs", headers=headers, json={"title": "选课", "kind": "affair", "reminders": [{"at": "2026-09-10T10:00:00+08:00", "label": "准备选课"}]}).json()
    device = {"device_id": "desktop-test"}
    first = client.post("/api/reminders/claim", headers=headers, json=device).json()["deliveries"][0]
    assert client.post("/api/reminders/claim", headers=headers, json=device).json()["deliveries"] == []
    # A crash without acknowledgement is recovered when the lease expires.
    clock += 121
    retry = client.post("/api/reminders/claim", headers=headers, json=device).json()["deliveries"][0]
    assert retry["id"] == first["id"] and retry["lease_token"] != first["lease_token"]
    assert client.post(f"/api/reminders/{first['id']}/ack", headers=headers, json={**device,"lease_token":first["lease_token"],"success":True}).status_code == 409
    assert client.post(f"/api/reminders/{retry['id']}/ack", headers=headers, json={**device,"lease_token":retry["lease_token"],"success":False,"error":"暂时失败"}).status_code == 200
    assert client.post("/api/reminders/claim", headers=headers, json=device).json()["deliveries"] == []
    clock += 3601
    final = client.post("/api/reminders/claim", headers=headers, json=device).json()["deliveries"][0]
    assert client.post(f"/api/reminders/{final['id']}/ack", headers=headers, json={**device,"lease_token":final["lease_token"],"success":True}).status_code == 200
    clock += 3601
    assert client.post("/api/reminders/claim", headers=headers, json=device).json()["deliveries"] == []
    affair["status"] = "completed"
    client.put("/api/affairs/" + affair["id"], headers=headers, json=affair)
    assert client.post("/api/reminders/claim", headers=headers, json={"device_id":"another-device"}).json()["deliveries"] == []
    assert client.get("/api/reminders/history", headers=headers).json()[0]["state"] == "sent"
