from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from ..auth.models import User
from ..auth.sessions import current_user
from ..database import db_session
from . import service
from .schemas import GoalStructureInput, LifecycleInput
from .templates import TEMPLATE_METADATA

router = APIRouter(prefix="/api/goals", tags=["goals"])


@router.get("")
def goals(
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(db_session)],
):
    return service.list_goals(db, user.id)


@router.post("", status_code=201)
def create_goal(
    data: GoalStructureInput,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(db_session)],
):
    return service.create_goal(db, user.id, data)


@router.get("/templates")
def templates(user: Annotated[User, Depends(current_user)]):
    return TEMPLATE_METADATA


@router.post("/from-template/{key}", status_code=201)
def create_from_template(
    key: str,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(db_session)],
):
    return service.create_from_template(db, user.id, key)


@router.get("/{goal_id}")
def goal_detail(
    goal_id: str,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(db_session)],
):
    return service.goal_detail(db, user.id, goal_id)


@router.patch("/{goal_id}/lifecycle")
def set_lifecycle(
    goal_id: str,
    data: LifecycleInput,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(db_session)],
):
    return service.set_lifecycle(db, user.id, goal_id, data)


@router.delete("/{goal_id}", status_code=204)
def delete_goal(
    goal_id: str,
    response: Response,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(db_session)],
):
    service.delete_empty_goal(db, user.id, goal_id)
    response.status_code = 204
    return response
