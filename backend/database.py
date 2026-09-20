import os
from pathlib import Path

from fastapi import Request
from sqlalchemy.orm import Session

ROOT = Path(__file__).resolve().parents[1]


def database_url():
    return os.getenv(
        "DATABASE_URL", "sqlite:///" + (ROOT / "data" / "app.db").as_posix()
    )


def db_session(request: Request):
    with Session(request.app.state.engine) as db:
        yield db
