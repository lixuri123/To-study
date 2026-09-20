from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import select
from .models import Receipt
from ..affairs.models import Affair
from ..common.ownership import owned

from ..auth.models import User
from ..auth.sessions import current_user
from ..database import db_session
from . import service
from .schemas import Command
from pydantic import BaseModel, Field
from .undo import undo


class UndoRequest(BaseModel):
    request_ids: list[str] = Field(min_length=1, max_length=50)
    preview: bool = True

router = APIRouter(prefix="/api/agent", tags=["agent"])
DB = Annotated[Session, Depends(db_session)]
Account = Annotated[User, Depends(current_user)]


@router.get("/profile")
def profile(db: DB, user: Account):
    return service.profile(db, user)


@router.get("/receipts")
def receipts(db: DB, user: Account, record_id: str = "", limit: int = Query(20, ge=1, le=50), offset: int = Query(0, ge=0)):
    ids = set()
    if record_id:
        root = owned(db, Affair, record_id, user.id)
        ids.add(root.id)
        ids.update(root.payload.get("note_ids", []))
        if root.payload.get("kind") == "information":
            for child in db.scalars(select(Affair).where(Affair.user_id == user.id)):
                if child.payload.get("source_information_id") == root.id:
                    ids.add(child.id)
                    ids.update(child.payload.get("note_ids", []))
    rows = db.scalars(select(Receipt).where(Receipt.user_id == user.id).order_by(Receipt.created_at.desc(), Receipt.request_id.desc())).all()
    matching = [row for row in rows if not record_id or row.result.get("record", {}).get("id") in ids]
    return {"items": [{"request_id": row.request_id, "created_at": row.created_at, "operation": row.result.get("operation"), "undoable": bool(row.result.get("_undo")) and not row.result.get("undone", False), "undone": row.result.get("undone", False), "record": {key: value for key, value in row.result.get("record", {}).items() if key in {"id", "title", "record_type", "version"}}} for row in matching[offset:offset + limit]], "next_offset": offset + limit if offset + limit < len(matching) else None}


@router.get("/records")
def search(
    db: DB,
    user: Account,
    query: str = "",
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
):
    return service.search(db, user, query, limit, offset)


@router.get("/records/{kind}/{record_id}")
def read(
    kind: Literal["note", "task", "affair"], record_id: str, db: DB, user: Account
):
    return service.read(db, user, kind, record_id)


@router.post("/commands")
def execute(command: Command, db: DB, user: Account):
    return service.execute(db, user, command)


@router.post("/undo")
def undo_commands(data: UndoRequest, db: DB, user: Account):
    return undo(db, user, data.request_ids, data.preview)

