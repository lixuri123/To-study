from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from ..auth.models import User
from ..auth.sessions import current_user
from ..common.ownership import owned
from ..database import db_session
from . import service
from .models import Affair
from .schemas import AffairInput, AffairUpdate

router = APIRouter(prefix="/api/affairs", tags=["affairs"])
DB = Annotated[Session, Depends(db_session)]
Account = Annotated[User, Depends(current_user)]
output = service.output


@router.get("")
def listing(db: DB, user: Account):
    return service.listing(db, user)


@router.get("/{item_id}")
def read(item_id: str, db: DB, user: Account):
    return output(owned(db, Affair, item_id, user.id))


@router.post("", status_code=201)
def create(data: AffairInput, db: DB, user: Account):
    return service.create(data, db, user)


@router.put("/{item_id}")
def edit(item_id: str, data: AffairUpdate, db: DB, user: Account):
    return service.edit(item_id, data, db, user)


@router.delete("/{item_id}", status_code=204)
def delete(item_id: str, db: DB, user: Account):
    db.delete(owned(db, Affair, item_id, user.id))
    db.commit()
    return Response(status_code=204)
