from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from ..auth.models import User
from ..auth.sessions import current_user
from ..database import db_session
from . import service
from .schemas import NoteInput, NoteOutput

router = APIRouter(prefix="/api/notes", tags=["notes"])


@router.get("", response_model=list[NoteOutput])
def notes(
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(db_session)],
):
    return service.list_notes(db, user.id)


@router.post("", response_model=NoteOutput, status_code=201)
def add_note(
    data: NoteInput,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(db_session)],
):
    return service.save_note(db, user.id, data)


@router.put("/{item_id}", response_model=NoteOutput)
def edit_note(
    item_id: str,
    data: NoteInput,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(db_session)],
):
    return service.save_note(db, user.id, data, item_id)


@router.delete("/{item_id}", status_code=204)
def delete_note(
    item_id: str,
    response: Response,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(db_session)],
):
    service.delete_note(db, user.id, item_id)
    response.status_code = 204
    return response
