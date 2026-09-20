from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from ..auth.models import User
from ..auth.sessions import current_user
from ..database import db_session
from . import service
from .schemas import TaskInput, TaskOutput, TaskPatch

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


@router.get("", response_model=list[TaskOutput])
def tasks(
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(db_session)],
):
    return service.list_tasks(db, user.id)


@router.post("", response_model=TaskOutput, status_code=201)
def add_task(
    data: TaskInput,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(db_session)],
):
    return service.add_task(db, user.id, data)


@router.patch("/{item_id}", response_model=TaskOutput)
def edit_task(
    item_id: str,
    data: TaskPatch,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(db_session)],
):
    return service.update_task(db, user.id, item_id, data)


@router.delete("/{item_id}", status_code=204)
def delete_task(
    item_id: str,
    response: Response,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(db_session)],
):
    service.delete_task(db, user.id, item_id)
    response.status_code = 204
    return response
