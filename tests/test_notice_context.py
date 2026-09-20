from test_api import account, client
from test_agent_workflow import command


def test_capture_recovery_and_receipt_scope(client):
    headers = account(client)
    notice = command(client, headers, "capture_information", "capture-root-01", {"title": "通知", "original": "已保存文字"}).json()["record"]
    ident = notice["id"]
    args = {"affair_id": ident, "expected_version": 1, "attempt": {"state": "failed", "error_kind": "timeout", "detail": "超时"}}
    first = command(client, headers, "record_capture_attempt", "capture-failure-01", args)
    assert first.status_code == 200
    assert command(client, headers, "record_capture_attempt", "capture-failure-01", args).json()["replayed"]
    assert command(client, headers, "record_capture_attempt", "capture-stale-01", args).status_code == 409
    read = client.get(f"/api/agent/records/affair/{ident}", headers=headers).json()
    assert read["original"] == "已保存文字" and read["capture"]["attempts"] == 1
    args = {"affair_id": ident, "expected_version": 2, "attempt": {"state": "partial", "missing": ["流程图"]}, "original": "恢复的文字"}
    assert command(client, headers, "record_capture_attempt", "capture-recovery-01", args).status_code == 200
    read = client.get(f"/api/agent/records/affair/{ident}", headers=headers).json()
    assert len(read["capture"]["history"]) == 2
    assert read["original"] == "恢复的文字"
    child = command(client, headers, "create_affair", "capture-child-01", {"title": "办理", "source_information_id": ident}).json()["record"]
    receipts = client.get(f"/api/agent/receipts?record_id={ident}", headers=headers).json()
    assert any(row["record"]["id"] == child["id"] for row in receipts["items"])
    assert len(receipts["items"]) == 4
    # A normal UI edit must retain capture history even if an old client omits it.
    read.pop("capture")
    assert client.put(f"/api/affairs/{ident}", headers=headers, json=read).status_code == 200
    assert client.get(f"/api/agent/records/affair/{ident}", headers=headers).json()["capture"]["attempts"] == 2
    headers = account(client, "another-user")
    assert client.get(f"/api/agent/receipts?record_id={ident}", headers=headers).status_code == 404
    assert client.get("/api/agent/receipts", headers=headers).json()["items"] == []

