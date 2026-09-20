"""Interactive authorization helper; credentials are never printed."""

import argparse
import getpass
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
import httpx  # noqa: E402

from integrations.qingjian_mcp.client import (
    CREDENTIALS,
    ROOT,
    read_credentials,
    save_credentials,
    validate_url,
)  # noqa: E402


def revoke(credentials):
    with httpx.Client(timeout=20, follow_redirects=False, trust_env=False) as client:
        result = client.post(
            credentials["url"] + "/api/auth/logout",
            headers={
                "Authorization": "Bearer " + credentials["token"],
                "X-Qingjian-Request": "1",
            },
        )
        if result.status_code not in {204, 401}:
            raise RuntimeError("服务未确认撤销，请检查服务地址后重试")


def main():
    parser = argparse.ArgumentParser(description="青笺 MCP 本地授权与配置")
    parser.add_argument("action", choices=["login", "logout", "status", "config"])
    parser.add_argument("--url", default="http://127.0.0.1:8000")
    args = parser.parse_args()
    if args.action == "config":
        print("[mcp_servers.qingjian]")
        print("command = " + json.dumps(sys.executable))
        print(
            "args = ["
            + json.dumps(str(ROOT / "integrations/qingjian_mcp/run.py"))
            + "]"
        )
        print("startup_timeout_sec = 30")
        print("tool_timeout_sec = 45")
        return
    if args.action == "login":
        if not sys.stdin.isatty():
            raise RuntimeError("请在交互终端运行登录，不通过管道或聊天输入密码")
        url = validate_url(args.url)
        previous = read_credentials() if CREDENTIALS.exists() else None
        username = input("青笺用户名：").strip()
        password = getpass.getpass("青笺密码（不会显示）：")
        with httpx.Client(
            base_url=url, timeout=20, follow_redirects=False, trust_env=False
        ) as client:
            response = client.post(
                "/api/auth/login",
                headers={"X-Qingjian-Request": "1"},
                json={"username": username, "password": password},
            )
            del password
            if response.status_code != 200:
                raise RuntimeError(
                    f"登录失败（HTTP {response.status_code}），请检查账号或稍后重试"
                )
            token = response.cookies.get("qingjian_session")
            if not token:
                raise RuntimeError("服务未返回授权会话")
            credentials = {"url": url, "token": token, "user_id": response.json()["id"]}
            try:
                if previous:
                    revoke(previous)
                save_credentials(credentials)
            except Exception:
                revoke(credentials)
                raise
        print("授权已保存。Windows 使用当前系统用户加密；密码未保存。")
        return
    credentials = read_credentials()
    if args.action == "logout":
        revoke(credentials)
        if CREDENTIALS.exists():
            CREDENTIALS.unlink()
        print("MCP 专用会话已撤销；网页登录不受影响。")
        return
    with httpx.Client(timeout=20, follow_redirects=False, trust_env=False) as client:
        response = client.get(
            credentials["url"] + "/api/agent/profile",
            headers={
                "Authorization": "Bearer " + credentials["token"],
                "X-Qingjian-User": credentials["user_id"],
            },
        )
        if response.status_code != 200:
            raise RuntimeError(
                f"连接检查失败（HTTP {response.status_code}），请确认服务已升级并重新授权"
            )
        print("连接正常，账号：" + response.json()["username"])


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
    except (httpx.HTTPError, OSError):
        print(
            "操作未完成。请确认青笺服务可访问、账号正确；可用 status 检查授权。网络失败后不要将凭据发到聊天中。",
            file=sys.stderr,
        )
        sys.exit(1)
