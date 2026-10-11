from datetime import date

from sqlalchemy import Boolean, Date, ForeignKey, String, JSON
from sqlalchemy.orm import Mapped, mapped_column

from ..common.models import Base, identifier, now


class Task(Base):
    __tablename__ = "tasks"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=identifier)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    window_rule: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    reminders: Mapped[list[dict]] = mapped_column(JSON, default=list)
    note_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    created_at: Mapped[str] = mapped_column(String(40), default=now)
