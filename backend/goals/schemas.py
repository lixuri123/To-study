from datetime import date
from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from ..common.schemas import Title

CategoryName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)
]
UnitLabel = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20)
]


class SuggestionInput(BaseModel):
    id: str | None = None
    title: Title
    position: int = Field(ge=0)


class ChecklistItemInput(BaseModel):
    id: str | None = None
    title: Title
    position: int = Field(ge=0)


class CategoryInput(BaseModel):
    id: str | None = None
    name: CategoryName
    minimum_amount: float = Field(default=1, gt=0, le=1_000_000)
    is_required: bool = False
    position: int = Field(ge=0)
    suggestions: list[SuggestionInput] = Field(default_factory=list, max_length=100)


class BlockInput(BaseModel):
    id: str | None = None
    kind: Literal["checklist", "quota"]
    title: Title
    unit_label: UnitLabel = "次"
    minimum_total: float | None = Field(default=None, gt=0, le=1_000_000)
    minimum_distinct_categories: int | None = Field(default=None, ge=1, le=100)
    position: int = Field(ge=0)
    checklist_items: list[ChecklistItemInput] = Field(default_factory=list, max_length=200)
    categories: list[CategoryInput] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def valid_shape(self):
        if self.kind == "checklist":
            if self.categories or self.minimum_total is not None or self.minimum_distinct_categories is not None:
                raise ValueError("清单型条件不能设置统计分类或计数规则")
            if not self.checklist_items:
                raise ValueError("清单型条件至少需要一个清单项")
        else:
            if self.checklist_items:
                raise ValueError("计数型条件不能包含清单项")
            if not self.categories:
                raise ValueError("计数型条件至少需要一个统计分类")
            configured = (
                self.minimum_total is not None
                or self.minimum_distinct_categories is not None
                or any(category.is_required for category in self.categories)
            )
            if not configured:
                raise ValueError("计数型条件至少需要一项达标规则")
            if (
                self.minimum_distinct_categories is not None
                and self.minimum_distinct_categories > len(self.categories)
            ):
                raise ValueError("最少覆盖分类数不能超过分类总数")
        return self


class GoalStructureInput(BaseModel):
    title: Title
    description: str = Field(default="", max_length=5000)
    blocks: list[BlockInput] = Field(min_length=1, max_length=50)


class ProgressInput(BaseModel):
    title: Title
    completed_on: date
    category_id: str
    amount: float = Field(default=1, gt=0, le=1_000_000)

    @field_validator("completed_on")
    @classmethod
    def not_future(cls, value):
        if value > date.today():  # noqa: DTZ011 - completed_on uses the user's local date
            raise ValueError("完成日期不能晚于今天")
        return value


class ChecklistCompletionInput(BaseModel):
    completed_on: date | None

    @field_validator("completed_on")
    @classmethod
    def not_future(cls, value):
        if value is not None and value > date.today():  # noqa: DTZ011 - local calendar date
            raise ValueError("完成日期不能晚于今天")
        return value


class LifecycleInput(BaseModel):
    archived: bool


class RuleOutput(BaseModel):
    key: Literal["checklist", "total", "required_category", "distinct"]
    label: str
    current: float
    required: float
    unit: str
    satisfied: bool


class BlockSummaryOutput(BaseModel):
    block_id: str
    title: str
    kind: Literal["checklist", "quota"]
    attained: bool
    rules: list[RuleOutput]


class GoalSummaryOutput(BaseModel):
    attained: bool
    blocks: list[BlockSummaryOutput]


class GoalPreviewOutput(BaseModel):
    current_summary: GoalSummaryOutput
    proposed_summary: GoalSummaryOutput
    warnings: list[str]
