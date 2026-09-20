import time
from typing import Annotated

from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy import update
from sqlalchemy.orm import Session

from ..database import db_session
from .models import SessionToken, User
from .security import digest

COOKIE_NAME = "qingjian_session"
COOKIE_MAX_AGE = 400 * 86400


def request_token(request: Request):
    # Explicit bearer wins for older API clients; never fall back from an invalid bearer.
    authorization = request.headers.get("authorization")
    if authorization:
        scheme, _, token = authorization.partition(" ")
        return token if scheme.lower() == "bearer" else ""
    return request.cookies.get(COOKIE_NAME, "")


def set_session_cookie(request: Request, response: Response, token: str):
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        secure=request.app.state.cookie_secure,
        samesite="lax",
        path="/",
    )


def clear_session_cookie(request: Request, response: Response):
    response.delete_cookie(
        COOKIE_NAME,
        httponly=True,
        secure=request.app.state.cookie_secure,
        samesite="lax",
        path="/",
    )


def current_user(request: Request, db: Annotated[Session, Depends(db_session)]):
    token = request_token(request)
    session = db.get(SessionToken, digest(token)) if token else None
    if not session or (
        session.expires_at != 0 and session.expires_at <= int(time.time())
    ):
        raise HTTPException(401, "请重新登录")
    user = db.get(User, session.user_id)
    if user is None:
        raise HTTPException(401, "请重新登录")
    expected_user = request.headers.get("X-Qingjian-User")
    if expected_user is not None and expected_user != user.id:
        # A second tab may have changed the shared cookie since this page loaded.
        raise HTTPException(401, "账号已切换，请重新确认登录。")
    if session.expires_at:
        # UPDATE cannot recreate a session concurrently deleted by logout.
        result = db.execute(
            update(SessionToken)
            .where(SessionToken.token_hash == session.token_hash)
            .values(expires_at=0)
        )
        db.commit()
        if not result.rowcount:
            raise HTTPException(401, "请重新登录")
    return user
