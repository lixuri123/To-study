from sqlalchemy import select
from sqlalchemy.orm import Session
from fastapi import HTTPException
from pydantic import ValidationError

from ..common.ownership import owned
from .models import Task
from .schemas import TaskInput, TaskPatch
from ..notes.models import Note


def values(data):
    result = data.model_dump()
    serialized = data.model_dump(mode="json")
    for key in ("window_rule", "reminders"):
        result[key] = serialized[key]
    return result


def check_notes(db, user_id, note_ids, previous=()):
    for note_id in set(note_ids) - set(previous):
        owned(db, Note, note_id, user_id)


def list_tasks(db: Session, user_id: str):
    return db.scalars(
        select(Task).where(Task.user_id == user_id).order_by(Task.created_at.desc())
    ).all()


def add_task(db: Session, user_id: str, data: TaskInput):
    check_notes(db, user_id, data.note_ids)
    task = Task(user_id=user_id, **values(data))
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def update_task(db: Session, user_id: str, item_id: str, data: TaskPatch):
    task = owned(db, Task, item_id, user_id)
    fields = {key: getattr(task, key) for key in TaskInput.model_fields}
    try:
        merged = TaskInput.model_validate({**fields, **data.model_dump(exclude_unset=True, exclude={"completed"})})
    except ValidationError as error:
        raise HTTPException(422, error.errors()[0]["msg"]) from None
    check_notes(db, user_id, merged.note_ids, task.note_ids)
    for key, value in values(merged).items():
        setattr(task, key, value)
    if "completed" in data.model_fields_set:
        task.completed = data.completed
    db.commit()
    db.refresh(task)
    return task


def delete_task(db: Session, user_id: str, item_id: str):
    db.delete(owned(db, Task, item_id, user_id))
    db.commit()
