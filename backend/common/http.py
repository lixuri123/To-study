from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


async def api_security(request: Request, call_next):
    if request.url.path.startswith("/api/"):
        if request.method not in {"GET", "HEAD", "OPTIONS"}:
            origin = request.headers.get("origin")
            trusted = request.app.state.trusted_origins or {
                str(request.base_url).rstrip("/")
            }
            if request.headers.get("X-Qingjian-Request") != "1" or (
                origin is not None and origin not in trusted
            ):
                return JSONResponse(
                    status_code=403,
                    content={"detail": "请求来源校验失败，请刷新页面重试。"},
                    headers={"Cache-Control": "no-store"},
                )
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        return response
    return await call_next(request)


async def validation_error(request: Request, exc: RequestValidationError):
    labels = {
        "username": "用户名需为 3–40 位字母、数字、中文或 ._-。",
        "password": "密码需为 8–128 位。",
        "title": "标题需为 1–200 字。",
        "content": "笔记正文最多 200000 字。",
        "completed": "完成状态必须为布尔值。",
    }
    fields = {}
    for error in exc.errors():
        field = str(error["loc"][-1])
        fields[field] = labels.get(field, "输入格式不正确。")
    return JSONResponse(
        status_code=422, content={"detail": "请检查输入内容。", "fields": fields}
    )
