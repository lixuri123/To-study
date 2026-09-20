from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from ..database import db_session
from . import service
from .models import User
from .rate_limit import throttle
from .schemas import Credentials, UserOutput
from .sessions import (
    clear_session_cookie,
    current_user,
    request_token,
    set_session_cookie,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", status_code=201, response_model=UserOutput)
def register(
    data: Credentials,
    request: Request,
    response: Response,
    db: Annotated[Session, Depends(db_session)],
):
    throttle(db, request, "register", data.username)
    user, token = service.register(db, data, request_token(request))
    set_session_cookie(request, response, token)
    return user


@router.post("/login", response_model=UserOutput)
def login(
    data: Credentials,
    request: Request,
    response: Response,
    db: Annotated[Session, Depends(db_session)],
):
    throttle(db, request, "login", data.username)
    user, token = service.login(db, data, request_token(request))
    set_session_cookie(request, response, token)
    return user


@router.get("/me", response_model=UserOutput)
def me(
    request: Request, response: Response, user: Annotated[User, Depends(current_user)]
):
    # Only serialized auth requests renew cookies, never delayed business responses.
    set_session_cookie(request, response, request_token(request))
    return user


@router.post("/logout", status_code=204)
def logout(request: Request, db: Annotated[Session, Depends(db_session)]):
    service.logout(db, request_token(request))
    response = Response(status_code=204)
    clear_session_cookie(request, response)
    return response
