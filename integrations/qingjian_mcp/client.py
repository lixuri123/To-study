"""HTTP-only MCP adapter. Never imports database or ORM code."""

import json
import os
from pathlib import Path
from urllib.parse import urlparse

import httpx

ROOT = Path(__file__).resolve().parents[2]
CREDENTIALS = ROOT / "data" / "mcp-credentials.json"


def validate_url(url: str) -> str:
    parsed = urlparse(url)
    if (
        parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
        or parsed.path not in {"", "/"}
    ):
        raise ValueError("服务地址只能包含协议、主机和端口")
    if not parsed.hostname or not (
        parsed.scheme == "https"
        or (
            parsed.scheme == "http"
            and parsed.hostname in {"127.0.0.1", "localhost", "::1"}
        )
    ):
        raise ValueError("只允许本机 HTTP 或 HTTPS 服务地址")
    return url.rstrip("/")


def read_credentials():
    try:
        if os.getenv("QINGJIAN_TOKEN"):
            return {
                "url": validate_url(os.environ["QINGJIAN_URL"]),
                "token": os.environ["QINGJIAN_TOKEN"],
                "user_id": os.environ["QINGJIAN_USER_ID"],
            }
        stored = json.loads(CREDENTIALS.read_text(encoding="utf-8"))
        if stored.get("protected"):
            import base64

            import win32crypt

            raw = win32crypt.CryptUnprotectData(
                base64.b64decode(stored["data"]), None, None, None, 0
            )[1]
            stored = json.loads(raw)
        validate_url(stored["url"])
        if not stored.get("token") or not stored.get("user_id"):
            raise ValueError()
        return stored
    except Exception:
        raise RuntimeError(
            "青笺尚未授权或凭据不可读。请在本机终端运行 integrations/qingjian_mcp/setup.py login；不要在聊天中提供密码。"
        ) from None


def save_credentials(data):
    raw = json.dumps(data, ensure_ascii=False).encode("utf-8")
    if os.name == "nt":
        import base64

        import win32crypt

        protected = win32crypt.CryptProtectData(
            raw, "Qingjian MCP", None, None, None, 0
        )
        raw = json.dumps(
            {"protected": True, "data": base64.b64encode(protected).decode()}
        ).encode()
    CREDENTIALS.parent.mkdir(parents=True, exist_ok=True)
    temporary = CREDENTIALS.with_suffix(".tmp")
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "wb") as stream:
        stream.write(raw)
    temporary.replace(CREDENTIALS)


class QingjianClient:
    def __init__(self, url=None, token=None, user_id=None, transport=None):
        self.url, self.token, self.user_id = url, token, user_id
        self.transport = transport

    async def request(self, method, path, *, params=None, body=None):
        credentials = (
            {"url": self.url, "token": self.token, "user_id": self.user_id}
            if self.url
            else read_credentials()
        )
        base = validate_url(credentials["url"])
        try:
            async with httpx.AsyncClient(
                base_url=base,
                timeout=30,
                follow_redirects=False,
                trust_env=False,
                transport=self.transport,
            ) as client:
                response = await client.request(
                    method,
                    path,
                    params=params,
                    json=body,
                    headers={
                        "Authorization": "Bearer " + credentials["token"],
                        "X-Qingjian-User": credentials["user_id"],
                        "X-Qingjian-Request": "1",
                    },
                )
        except httpx.HTTPError:
            raise RuntimeError(
                "青笺连接失败或超时。写入结果可能未知，请查询或使用相同 request_id 和原参数重试。"
            ) from None
        if response.status_code == 401:
            raise RuntimeError("青笺授权已撤销或账号不匹配，请重新登录授权。")
        if not response.is_success:
            try:
                detail = response.json().get("detail", "请求失败")
            except ValueError:
                detail = "服务响应不可读"
            raise RuntimeError(f"青笺 HTTP {response.status_code}: {detail}")
        try:
            return response.json()
        except ValueError:
            raise RuntimeError("青笺返回无效结果，不能确认操作成功。") from None

    async def command(self, operation, request_id, arguments):
        return await self.request(
            "POST",
            "/api/agent/commands",
            body={
                "operation": operation,
                "request_id": request_id,
                "arguments": arguments,
            },
        )
