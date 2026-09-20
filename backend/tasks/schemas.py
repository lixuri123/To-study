from datetime import date
import re

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from ..common.schemas import Title


class TaskInput(BaseModel):
    title: Title
    due_date: date | None = None

    @field_validator("due_date", mode="before")
    @classmethod
    def require_iso_date(cls, value):
        if isinstance(value, date):
            return value
        if value is not None and (
            not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value)
        ):
            raise ValueError("截止日期必须使用 YYYY-MM-DD 格式")
        return value


class TaskPatch(BaseModel):
    title: Title | None = None
    completed: bool | None = None
    due_date: date | None = None

    @field_validator("due_date", mode="before")
    @classmethod
    def require_iso_date(cls, value):
        return TaskInput.require_iso_date(value)

    @model_validator(mode="after")
    def reject_null(self):
        if not self.model_fields_set or any(
            getattr(self, k) is None
            for k in self.model_fields_set
            if k != "due_date"
        ):
            raise ValueError("更新内容不能为空")
        return self


class TaskOutput(TaskInput):
    model_config = ConfigDict(from_attributes=True)
    id: str
    completed: bool
    created_at: str
