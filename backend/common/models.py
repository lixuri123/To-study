from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy.orm import DeclarativeBase


def now():
    return datetime.now(UTC).isoformat()


def identifier():
    return str(uuid4())


class Base(DeclarativeBase):
    pass
