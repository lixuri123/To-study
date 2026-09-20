from sqlalchemy import select
from sqlalchemy.orm import Session

from ..common.models import now
from ..common.ownership import owned
from .models import Note
from .schemas import NoteInput


def list_notes(db: Session, user_id: str):
    return db.scalars(
        select(Note).where(Note.user_id == user_id).order_by(Note.updated_at.desc())
    ).all()


def save_note(db: Session, user_id: str, data: NoteInput, item_id: str | None = None):
    note = owned(db, Note, item_id, user_id) if item_id else Note(user_id=user_id)
    note.title, note.content, note.updated_at = data.title, data.content, now()
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


def delete_note(db: Session, user_id: str, item_id: str):
    db.delete(owned(db, Note, item_id, user_id))
    db.commit()
