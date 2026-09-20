from sqlalchemy import select
from sqlalchemy.orm import Session

from ..common.ownership import owned
from .models import Task
from .schemas import TaskInput, TaskPatch


def list_tasks(db: Session, user_id: str):
    return db.scalars(
        select(Task).where(Task.user_id == user_id).order_by(Task.created_at.desc())
    ).all()


def add_task(db: Session, user_id: str, data: TaskInput):
    task = Task(user_id=user_id, **data.model_dump())
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def update_task(db: Session, user_id: str, item_id: str, data: TaskPatch):
    task = owned(db, Task, item_id, user_id)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(task, key, value)
    db.commit()
    db.refresh(task)
    return task


def delete_task(db: Session, user_id: str, item_id: str):
    db.delete(owned(db, Task, item_id, user_id))
    db.commit()
