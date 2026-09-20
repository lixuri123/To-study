from test_api import account, client
from test_agent_workflow import command


def test_links_undo_and_pending_questions(client):
    headers = account(client)
    args = {"title": "通知", "source_url": "https://example.com/a?utm_source=x", "summary": "9月18日报到"}
    root = command(client, headers, "capture_information", "reliable-root-01", args).json()["record"]
    other = command(client, headers, "capture_information", "reliable-root-02", {**args, "source_url": "https://example.com/a#top"}).json()["record"]
    assert other["id"] == root["id"] and other["reused"]
    changed = command(client, headers, "update_affair", "reliable-edit-01", {"affair_id": root["id"], "expected_version": 1, "changes": {"summary": "9月19日报到", "pending_questions": [{"question": "宿舍？", "answer": ""}]}})
    assert changed.status_code == 200
    read = client.get(f'/api/affairs/{root["id"]}', headers=headers).json()
    assert read["source_content_version"] == 2 and len(read["source_revisions"]) == 1
    data = {"request_ids": ["reliable-edit-01"], "preview": True}
    assert client.post("/api/agent/undo", headers=headers, json=data).status_code == 200
    assert client.get(f'/api/affairs/{root["id"]}', headers=headers).json()["summary"] == "9月19日报到"
    assert client.post("/api/agent/undo", headers=headers, json={**data, "preview": False}).status_code == 200
    assert client.get(f'/api/affairs/{root["id"]}', headers=headers).json()["summary"] == "9月18日报到"
    assert client.post("/api/agent/undo", headers=headers, json=data).status_code == 409


def test_undo_protects_manual_changes_and_backup_restores_links(client):
    headers = account(client)
    note = command(client, headers, "create_note", "backup-note-01", {"title": "清单", "content": "证件"}).json()["record"]
    affair = command(client, headers, "create_affair", "backup-affair-01", {"title": "准备", "note_ids": [note["id"]]}).json()["record"]
    current = client.get(f'/api/affairs/{affair["id"]}', headers=headers).json()
    assert client.put(f'/api/affairs/{affair["id"]}', headers=headers, json={**current, "title": "手动改过"}).status_code == 200
    assert client.post("/api/agent/undo", headers=headers, json={"request_ids": ["backup-affair-01"], "preview": False}).status_code == 409
    archive = client.get("/api/backup", headers=headers).json()
    second = account(client, "backup-recipient")
    assert client.post("/api/backup/restore", headers=second, json={"archive": archive}).json()["preview"]
    assert client.get("/api/affairs", headers=second).json() == []
    response = client.post("/api/backup/restore", headers=second, json={"archive": archive, "preview": False})
    assert response.status_code == 200 and response.json()["restored"]
    restored = client.get("/api/affairs", headers=second).json()[0]
    restored_note = client.get("/api/notes", headers=second).json()[0]
    assert restored["note_ids"] == [restored_note["id"]]
    assert restored["id"] != affair["id"]
    assert not client.post("/api/backup/restore", headers=second, json={"archive": archive, "preview": False}).json()["restored"]


def test_repeat_stops_on_acknowledgement(client, monkeypatch):
    import backend.reminders.router as reminders
    from datetime import datetime, timezone
    headers = account(client)
    at = 1800000000
    monkeypatch.setattr(reminders.time, "time", lambda: at)
    body = {"title": "准备", "kind": "affair", "reminders": [{"at": datetime.fromtimestamp(at, timezone.utc).isoformat(), "repeat_minutes": 60, "repeat_limit": 3}]}
    item = client.post("/api/affairs", headers=headers, json=body).json()
    def claim():
        return client.post("/api/reminders/claim", headers=headers, json={"device_id": "test-device-01"}).json()["deliveries"]
    first = claim()[0]
    assert client.post(f'/api/reminders/{first["id"]}/ack', headers=headers, json={"device_id": "test-device-01", "lease_token": first["lease_token"], "success": True}).status_code == 200
    assert claim() == []
    monkeypatch.setattr(reminders.time, "time", lambda: at + 3600)
    assert claim()[0]["id"] != first["id"]
    item["reminders"][0]["acknowledged"] = True
    assert client.put(f'/api/affairs/{item["id"]}', headers=headers, json=item).status_code == 200
    assert claim() == []


def test_batch_undo_and_monitor_failure_preserves_baseline(client):
    headers = account(client)
    root = command(client, headers, "capture_information", "batch-root-001", {"title": "来源", "source_url": "https://example.com/notices", "monitor": {"state": "success", "last_success_at": "2026-09-14T09:00:00+08:00", "seen_links": ["https://example.com/1"]}}).json()["record"]
    changed = command(client, headers, "update_affair", "batch-edit-001", {"affair_id": root["id"], "expected_version": 1, "changes": {"monitor": {"state": "failed", "seen_links": []}}})
    assert changed.status_code == 200
    current = client.get(f'/api/affairs/{root["id"]}', headers=headers).json()
    assert current["monitor"]["seen_links"] == ["https://example.com/1"]
    assert current["monitor"]["last_success_at"] == "2026-09-14T09:00:00+08:00"
    data = {"request_ids": ["batch-root-001", "batch-edit-001"], "preview": True}
    assert client.post("/api/agent/undo", headers=headers, json=data).status_code == 200
    assert len(client.get("/api/affairs", headers=headers).json()) == 1
    assert client.post("/api/agent/undo", headers=headers, json={**data, "preview": False}).status_code == 200
    assert client.get("/api/affairs", headers=headers).json() == []


def test_server_backup_is_readable(tmp_path):
    import sqlite3
    from scripts.database_backup import backup
    source = tmp_path / "source.db"
    target = tmp_path / "backup.db"
    with sqlite3.connect(source) as db:
        db.execute("CREATE TABLE example(value TEXT)")
        db.execute("INSERT INTO example VALUES ('preserved')")
    backup(source, target)
    with sqlite3.connect(target) as db:
        assert db.execute("SELECT value FROM example").fetchone()[0] == "preserved"
