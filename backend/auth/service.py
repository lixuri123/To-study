from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .models import SessionToken, User
from .schemas import Credentials
from .security import DUMMY_HASH, digest, issue_token, passwords


def register(db: Session, data: Credentials, previous_token: str):
    user = User(
        username=data.username.lower(), password_hash=passwords.hash(data.password)
    )
    db.add(user)
    try:
        db.flush()
        token = issue_token(db, user.id)
        if previous_token:
            db.execute(
                delete(SessionToken).where(
                    SessionToken.token_hash == digest(previous_token)
                )
            )
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "用户名已存在")
    db.refresh(user)
    return user, token


def login(db: Session, data: Credentials, previous_token: str):
    user = db.scalar(select(User).where(User.username == data.username.lower()))
    valid = passwords.verify(data.password, user.password_hash if user else DUMMY_HASH)
    if not user or not valid:
        raise HTTPException(401, "用户名或密码不正确")
    token = issue_token(db, user.id)
    if previous_token:
        db.execute(
            delete(SessionToken).where(
                SessionToken.token_hash == digest(previous_token)
            )
        )
    db.commit()
    return user, token


def logout(db: Session, token: str):
    if token:
        db.execute(delete(SessionToken).where(SessionToken.token_hash == digest(token)))
        db.commit()
