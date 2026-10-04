from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from ..common.schemas import Title


class PlanInput(BaseModel):
    title: Title
    kind: Literal["once", "weekdays", "weekly"]
    start_date: date
    end_date: date | None = None
    weekdays: list[int] = Field(default_factory=list, max_length=7)
    weekly_target: int | None = Field(default=None, ge=1, le=7)
    target_amount: float = Field(default=1, gt=0, le=1_000_000)
    unit: str = Field(default="次", min_length=1, max_length=20)
    goal_id: str | None = None

    @model_validator(mode="after")
    def valid_schedule(self):
        if self.end_date and self.end_date < self.start_date:
            raise ValueError("结束日期不能早于开始日期")
        if len(set(self.weekdays)) != len(self.weekdays) or any(day < 0 or day > 6 for day in self.weekdays):
            raise ValueError("星期须为不重复的 0–6")
        if self.kind == "weekdays" and not self.weekdays:
            raise ValueError("固定日期计划至少选择一天")
        if self.kind != "weekdays" and self.weekdays:
            raise ValueError("只有固定日期计划可设置星期")
        if self.kind == "weekly" and self.weekly_target is None:
            raise ValueError("弹性周计划需要每周目标次数")
        if self.kind != "weekly" and self.weekly_target is not None:
            raise ValueError("只有弹性周计划可设置每周次数")
        if self.kind == "once" and self.end_date and self.end_date != self.start_date:
            raise ValueError("单次计划只使用一个计划日期")
        return self


class ArchiveInput(BaseModel):
    archived: bool


class CheckinInput(BaseModel):
    status: Literal["done", "partial", "skipped"]
    amount: float = Field(default=1, ge=0, le=1_000_000)
    memo: str = Field(default="", max_length=2000)
    note_id: str | None = None

    @model_validator(mode="after")
    def valid_amount(self):
        if self.status == "skipped" and self.amount != 0:
            raise ValueError("跳过时数量必须为 0")
        if self.status != "skipped" and self.amount <= 0:
            raise ValueError("完成和部分完成需要大于 0 的数量")
        return self
