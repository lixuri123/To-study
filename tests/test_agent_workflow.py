import asyncio
import json
import os
import socket
import sys
import threading
import time
from pathlib import Path

import uvicorn
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from test_api import account
from test_api import client as client_fixture

client = client_fixture


def command(client, headers, operation, request_id, arguments):
    return client.post(
        "/api/agent/commands",
        headers=headers,
        json={"operation": operation, "request_id": request_id, "arguments": arguments},
    )


def test_notice_workflow_is_idempotent_and_versioned(client):
    headers = account(client)
    profile = command(
        client,
        headers,
        "update_profile",
        "profile-001",
        {"expected_version": 0, "data": {"major": "计算机科学与技术", "year": "研一"}},
    )
    assert profile.status_code == 200
    assert (
        client.get("/api/agent/profile", headers=headers).json()["data"]["year"]
        == "研一"
    )
    arguments = {
        "title": "选课通知",
        "original": "具体批次另行通知",
        "published_at": "2026-09-07",
    }
    first = command(
        client, headers, "capture_information", "notice-001", arguments
    ).json()
    duplicate = command(
        client, headers, "capture_information", "notice-001", arguments
    ).json()
    assert duplicate["replayed"] and duplicate["record"]["id"] == first["record"]["id"]
    assert (
        command(
            client,
            headers,
            "capture_information",
            "notice-001",
            {"title": "另一个通知"},
        ).status_code
        == 409
    )
    note = command(
        client,
        headers,
        "create_note",
        "notes-001",
        {"title": "备选课程", "content": "算法"},
    ).json()["record"]
    affair = command(
        client,
        headers,
        "create_affair",
        "affair-001",
        {
            "title": "确认本人批次",
            "source_information_id": first["record"]["id"],
            "time_uncertain": True,
        },
    ).json()["record"]
    link = command(
        client,
        headers,
        "link_note",
        "link-0010",
        {"affair_id": affair["id"], "expected_version": 1, "note_id": note["id"]},
    ).json()["record"]
    assert link["note_ids"] == [note["id"]]
    assert (
        command(
            client,
            headers,
            "update_affair",
            "stale-001",
            {
                "affair_id": affair["id"],
                "expected_version": 1,
                "changes": {"title": "过期覆盖"},
            },
        ).status_code
        == 409
    )
    reminder = command(
        client,
        headers,
        "set_reminder",
        "remind-001",
        {
            "affair_id": affair["id"],
            "expected_version": link["version"],
            "reminder": {"at": "2026-09-15T19:00:00+08:00", "label": "确认批次"},
        },
    )
    assert reminder.status_code == 200
    read = client.get(
        f"/api/agent/records/affair/{affair['id']}", headers=headers
    ).json()
    assert read["ends_at"] == "" and len(read["reminders"]) == 1
    matches = client.get("/api/agent/records?query=选课", headers=headers).json()
    assert matches["total"] == 2
    assert {item["record_type"] for item in matches["items"]} == {"note", "affair"}
    # Existing UI endpoint sees the exact same saved data.
    assert next(
        x
        for x in client.get("/api/affairs", headers=headers).json()
        if x["id"] == affair["id"]
    )["note_ids"] == [note["id"]]


def test_isolation_rollback_and_bearer_revocation(client):
    a, b = account(client), account(client, "bobby")
    info = command(
        client,
        a,
        "capture_information",
        "capture-a",
        {"title": "私人通知", "original": "正文"},
    ).json()["record"]
    assert client.get("/api/agent/records", headers=b).json()["total"] == 0
    assert (
        client.get(f"/api/agent/records/affair/{info['id']}", headers=b).status_code
        == 404
    )
    assert (
        command(
            client,
            b,
            "create_affair",
            "bad-link0",
            {"title": "非法来源", "source_information_id": info["id"]},
        ).status_code
        == 404
    )
    # Failed transaction must not leave a receipt locking this request ID.
    assert (
        command(
            client, b, "create_affair", "bad-link0", {"title": "有效事务"}
        ).status_code
        == 200
    )
    assert (
        command(
            client,
            a,
            "create_affair",
            "bad-time0",
            {"title": "错误日期", "starts_at": "2026-09-20", "ends_at": "2026-09-10"},
        ).status_code
        == 422
    )
    bearer = {"Authorization": "Bearer " + a["Cookie"].split("=", 1)[1]}
    assert client.get("/api/agent/profile", headers=bearer).status_code == 200
    assert client.post("/api/auth/logout", headers=bearer).status_code == 204
    assert client.get("/api/agent/profile", headers=bearer).status_code == 401


def test_real_stdio_mcp_roundtrip(client):
    headers = account(client)
    user = client.get("/api/auth/me", headers=headers).json()
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    server = uvicorn.Server(
        uvicorn.Config(client.app, log_level="error", lifespan="off")
    )
    thread = threading.Thread(target=lambda: server.run(sockets=[sock]), daemon=True)
    thread.start()
    for _ in range(100):
        if server.started:
            break
        time.sleep(0.02)
    assert server.started

    async def exercise():
        env = {
            **os.environ,
            "QINGJIAN_URL": f"http://127.0.0.1:{port}",
            "QINGJIAN_TOKEN": headers["Cookie"].split("=", 1)[1],
            "QINGJIAN_USER_ID": user["id"],
        }
        runner = (
            Path(__file__).resolve().parents[1] / "integrations/qingjian_mcp/run.py"
        )
        params = StdioServerParameters(
            command=sys.executable, args=[str(runner)], env=env
        )
        async with stdio_client(params) as (reader, writer):
            async with ClientSession(reader, writer) as session:
                await session.initialize()
                tools = await session.list_tools()
                assert len(tools.tools) == 11
                result = await session.call_tool("get_profile", {})
                assert not result.isError
                created = await session.call_tool(
                    "create_note",
                    {
                        "request_id": "stdio-note1",
                        "title": "MCP 实际写入",
                        "content": "测试资料",
                    },
                )
                assert not created.isError
                repeated = await session.call_tool(
                    "create_note",
                    {
                        "request_id": "stdio-note1",
                        "title": "MCP 实际写入",
                        "content": "测试资料",
                    },
                )
                assert not repeated.isError

                def data(result):
                    assert not result.isError
                    return json.loads(
                        next(
                            block.text
                            for block in result.content
                            if block.type == "text"
                        )
                    )

                note = data(created)["record"]
                notice = data(
                    await session.call_tool(
                        "capture_information",
                        {
                            "request_id": "stdio-notice",
                            "title": "选课通知",
                            "original": "批次待确认",
                        },
                    )
                )["record"]
                affair = data(
                    await session.call_tool(
                        "create_affair",
                        {
                            "request_id": "stdio-affair",
                            "details": {
                                "title": "确认选课批次",
                                "time_uncertain": True,
                                "source_information_id": notice["id"],
                            },
                        },
                    )
                )["record"]
                linked = data(
                    await session.call_tool(
                        "link_note",
                        {
                            "request_id": "stdio-link0",
                            "affair_id": affair["id"],
                            "expected_version": affair["version"],
                            "note_id": note["id"],
                        },
                    )
                )["record"]
                data(
                    await session.call_tool(
                        "set_reminder",
                        {
                            "request_id": "stdio-remind",
                            "affair_id": affair["id"],
                            "expected_version": linked["version"],
                            "reminder": {
                                "at": "2026-09-15T19:00:00+08:00",
                                "label": "确认批次",
                            },
                        },
                    )
                )
                persisted = data(
                    await session.call_tool(
                        "read_record",
                        {"record_type": "affair", "record_id": affair["id"]},
                    )
                )
                assert (
                    persisted["note_ids"] == [note["id"]]
                    and len(persisted["reminders"]) == 1
                )
                searched = await session.call_tool(
                    "search_records", {"query": "MCP 实际写入"}
                )
                assert not searched.isError

    try:
        asyncio.run(asyncio.wait_for(exercise(), timeout=40))
        assert len(client.get("/api/notes", headers=headers).json()) == 1
    finally:
        server.should_exit = True
        thread.join(timeout=5)
        sock.close()


def test_credentials_roundtrip(tmp_path, monkeypatch):
    from integrations.qingjian_mcp import client as module

    monkeypatch.setattr(module, "CREDENTIALS", tmp_path / "credentials.json")
    monkeypatch.delenv("QINGJIAN_TOKEN", raising=False)
    value = {
        "url": "http://127.0.0.1:8000",
        "token": "test-only-not-a-real-token",
        "user_id": "test-account",
    }
    module.save_credentials(value)
    assert module.read_credentials() == value
    if os.name == "nt":
        assert value["token"] not in module.CREDENTIALS.read_text()

