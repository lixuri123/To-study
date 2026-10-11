from datetime import date
import re

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from ..common.schemas import Title
from ..affairs.schemas import Reminder
from ..affairs.window import WindowRule, generate_window


class TaskInput(BaseModel):
    title: Title
    due_date: date | None = None
    start_date: date | None = None
    window_rule: WindowRule | None = None
    reminders: list[Reminder] = Field(default_factory=list, max_length=416)
    note_ids: list[str] = Field(default_factory=list, max_length=100)

    @field_validator("due_date", "start_date", mode="before")
    @classmethod
    def require_iso_date(cls, value):
        if isinstance(value, date):
            return value
        if value is not None and (
            not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value)
        ):
            raise ValueError("截止日期必须使用 YYYY-MM-DD 格式")
        return value

    @model_validator(mode="after")
    def window(self):
        if self.start_date and self.due_date and self.start_date > self.due_date:
            raise ValueError("开始日期不能晚于截止日期")
        if self.window_rule:
            self.reminders = generate_window(self.window_rule,
                self.start_date.isoformat() if self.start_date else "",
                self.due_date.isoformat() if self.due_date else "", self.reminders, Reminder)
        else:
            self.reminders = [row for row in self.reminders if not row.window_key]
        return self


class TaskPatch(BaseModel):
    title: Title | None = None
    completed: bool | None = None
    due_date: date | None = None
    start_date: date | None = None
    window_rule: WindowRule | None = None
    reminders: list[Reminder] | None = Field(default=None, max_length=416)
    note_ids: list[str] | None = Field(default=None, max_length=100)

    @field_validator("due_date", "start_date", mode="before")
    @classmethod
    def require_iso_date(cls, value):
        return TaskInput.require_iso_date(value)

    @model_validator(mode="after")
    def reject_null(self):
        if not self.model_fields_set or any(
            getattr(self, k) is None
            for k in self.model_fields_set
            if k not in {"due_date", "start_date", "window_rule"}
        ):
            raise ValueError("更新内容不能为空")
        return self


class TaskOutput(TaskInput):
    model_config = ConfigDict(from_attributes=True)
    id: str
    completed: bool
    created_at: str
