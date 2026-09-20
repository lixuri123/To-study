# Generic Goal Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Add one reusable “我的目标” capability that supports checklist conditions, quota/category conditions, progress records, and a full-time postgraduate comprehensive-quality template.

**Architecture:** Store goals, condition blocks, checklist items, quota categories, activity suggestions, and progress entries in normalized SQLAlchemy tables. Keep attainment calculation in a pure backend rule service, expose aggregate goal responses through FastAPI, and implement a table-first React feature that consumes server-calculated summaries.

**Tech Stack:** Python 3.13+, FastAPI 0.115+, SQLAlchemy 2.x, Alembic 1.14+, Pydantic 2, pytest 8+; React 19, TypeScript 5.7, Vite 6, Vitest 3, Testing Library, existing CSS component system.

## Global Constraints

- A goal’s lifecycle is only “active” or “archived”; “unattained” and “attained” are calculated results, never user-set lifecycle values.
- An empty goal or empty condition block is never attained. A goal is attained only when every condition block is attained.
- Checklist blocks require every checklist item. Quota blocks may combine minimum total amount, required category minimums, and minimum distinct satisfied categories.
- Do not add arbitrary formulas, weights, or a synthetic overall percentage. Show exact current/required values and gaps.
- Progress records describe completed facts, not plans. Their completion date cannot be later than the application’s current date and their amount must be greater than zero.
- Activity suggestions are copied from templates, provide input hints only, never restrict free text, and never affect attainment.
- Do not add hard links to notes, information, affairs, tasks, reminders, attachments, or approvals.
- The full-time postgraduate template must enforce all four core categories at least once plus at least eight total core occurrences, and at least three distinct quality categories plus at least three total quality occurrences.
- Treat “志愿服务满 10 小时” and “鸿雁讲堂参加 3 场及以上” as one qualifying progress record only after the internal threshold is met.
- All reads and mutations must prove ownership through the parent Goal; never authorize a child object using its ID alone.
- Preserve unsaved frontend drafts on failures and participate in the workspace navigation/close guard.
- Use the existing dependency versions; add no backend or frontend package.
- Preserve existing account, note, task, affair, timetable, agent, and reminder data through migration 0009.

---

## File Map

### Backend files to create

- backend/goals/__init__.py — package marker.
- backend/goals/models.py — normalized goal persistence models and relationships.
- backend/goals/schemas.py — request/response contracts and cross-field validation.
- backend/goals/rules.py — pure attainment calculation.
- backend/goals/templates.py — versioned built-in template registry.
- backend/goals/service.py — ownership-aware aggregate loading and transactional mutations.
- backend/goals/router.py — authenticated HTTP routes only.
- alembic/versions/0009_goal_tracking.py — create and remove the six goal tables.
- tests/test_goals_rules.py — rule-engine unit coverage.
- tests/test_goals_api.py — API, validation, lifecycle, mutation, template, and isolation coverage.

### Frontend files to create

- frontend/src/features/goals/types.ts — API types and editor draft types.
- frontend/src/features/goals/useGoals.ts — loading, mutations, retry state, and draft-neutral data state.
- frontend/src/features/goals/GoalList.tsx — active/archived target list and template entry point.
- frontend/src/features/goals/GoalDetail.tsx — condition summary, checklist, and progress tables.
- frontend/src/features/goals/GoalEditor.tsx — aggregate structure editor and preview confirmation.
- frontend/src/features/goals/GoalsPanel.tsx — feature-level navigation and edit-mode orchestration.
- frontend/src/features/goals/goals.css — responsive table/card styles.
- frontend/src/test/GoalsState.test.tsx — hook request and failure behavior.
- frontend/src/test/GoalsPanel.test.tsx — user-facing feature behavior.
- frontend/src/test/WorkspaceGoals.test.tsx — workspace navigation and dirty-draft guard.

### Existing files to modify

- backend/models.py — register goal models with Alembic metadata.
- backend/main.py — include the goal router.
- tests/test_migrations.py — assert migration 0009 tables and round-trip behavior.
- frontend/src/layouts/Workspace.tsx — add the single “我的目标” view and navigation guard integration.
- frontend/src/styles.css — only shared workspace breakpoint adjustments if the feature stylesheet cannot own them.
- README.md — document the generic goal capability and migration number.

---

### Task 1: Goal Persistence and Migration

**Files:**
- Create: backend/goals/__init__.py
- Create: backend/goals/models.py
- Create: alembic/versions/0009_goal_tracking.py
- Modify: backend/models.py
- Modify: tests/test_migrations.py

**Interfaces:**
- Produces SQLAlchemy models Goal, GoalBlock, GoalChecklistItem, GoalCategory, GoalActivitySuggestion, and GoalProgressEntry.
- Later tasks rely on relationship names blocks, checklist_items, categories, suggestions, and entries.
- Goal timestamps remain ISO strings through backend.common.models.now; completion fields use datetime.date.

- [ ] **Step 1: Write the failing migration test**

Add this test to tests/test_migrations.py:

~~~python
def test_goal_tracking_migration_creates_normalized_tables(tmp_path):
    config = Config("alembic.ini")
    url = f"sqlite:///{tmp_path / 'goals.db'}"
    config.attributes["database_url"] = url
    command.upgrade(config, "head")
    engine = create_engine(url)
    inspector = inspect(engine)
    expected = {
        "goals",
        "goal_blocks",
        "goal_checklist_items",
        "goal_categories",
        "goal_activity_suggestions",
        "goal_progress_entries",
    }
    assert expected <= set(inspector.get_table_names())
    assert {"user_id", "title", "description", "archived_at"} <= {
        column["name"] for column in inspector.get_columns("goals")
    }
    assert {"kind", "minimum_total", "minimum_distinct_categories"} <= {
        column["name"] for column in inspector.get_columns("goal_blocks")
    }
    command.downgrade(config, "0008")
    assert expected.isdisjoint(inspect(engine).get_table_names())
    engine.dispose()
~~~

Also extend test_migration_upgrade_downgrade so its required table set includes all six goal tables.

- [ ] **Step 2: Run the migration test and verify the expected failure**

Run:

~~~powershell
uv run python -m pytest tests/test_migrations.py::test_goal_tracking_migration_creates_normalized_tables -q
~~~

Expected: FAIL because revision 0009 and the goal tables do not exist.

- [ ] **Step 3: Add the normalized SQLAlchemy models**

Create backend/goals/models.py with these fields and relationship names:

~~~python
from datetime import date

from sqlalchemy import Date, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..common.models import Base, identifier, now


class Goal(Base):
    __tablename__ = "goals"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=identifier)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    archived_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    created_at: Mapped[str] = mapped_column(String(40), default=now)
    updated_at: Mapped[str] = mapped_column(String(40), default=now)
    blocks: Mapped[list["GoalBlock"]] = relationship(
        cascade="all, delete-orphan", order_by="GoalBlock.position"
    )


class GoalBlock(Base):
    __tablename__ = "goal_blocks"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=identifier)
    goal_id: Mapped[str] = mapped_column(ForeignKey("goals.id"), index=True)
    kind: Mapped[str] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(String(200))
    unit_label: Mapped[str] = mapped_column(String(20), default="次")
    minimum_total: Mapped[float | None] = mapped_column(Float, nullable=True)
    minimum_distinct_categories: Mapped[int | None] = mapped_column(Integer, nullable=True)
    position: Mapped[int] = mapped_column(Integer)
    checklist_items: Mapped[list["GoalChecklistItem"]] = relationship(
        cascade="all, delete-orphan", order_by="GoalChecklistItem.position"
    )
    categories: Mapped[list["GoalCategory"]] = relationship(
        cascade="all, delete-orphan", order_by="GoalCategory.position"
    )
    entries: Mapped[list["GoalProgressEntry"]] = relationship(
        cascade="all, delete-orphan", order_by="GoalProgressEntry.completed_on"
    )


class GoalChecklistItem(Base):
    __tablename__ = "goal_checklist_items"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=identifier)
    block_id: Mapped[str] = mapped_column(ForeignKey("goal_blocks.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    completed_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    position: Mapped[int] = mapped_column(Integer)


class GoalCategory(Base):
    __tablename__ = "goal_categories"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=identifier)
    block_id: Mapped[str] = mapped_column(ForeignKey("goal_blocks.id"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    minimum_amount: Mapped[float] = mapped_column(Float, default=1)
    is_required: Mapped[bool] = mapped_column(default=False)
    position: Mapped[int] = mapped_column(Integer)
    suggestions: Mapped[list["GoalActivitySuggestion"]] = relationship(
        cascade="all, delete-orphan", order_by="GoalActivitySuggestion.position"
    )


class GoalActivitySuggestion(Base):
    __tablename__ = "goal_activity_suggestions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=identifier)
    category_id: Mapped[str] = mapped_column(ForeignKey("goal_categories.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    position: Mapped[int] = mapped_column(Integer)


class GoalProgressEntry(Base):
    __tablename__ = "goal_progress_entries"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=identifier)
    block_id: Mapped[str] = mapped_column(ForeignKey("goal_blocks.id"), index=True)
    category_id: Mapped[str] = mapped_column(ForeignKey("goal_categories.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    completed_on: Mapped[date] = mapped_column(Date)
    amount: Mapped[float] = mapped_column(Float, default=1)
    created_at: Mapped[str] = mapped_column(String(40), default=now)
    updated_at: Mapped[str] = mapped_column(String(40), default=now)
~~~

Create backend/goals/__init__.py as an empty package marker. Import all six models in backend/models.py and include their names in __all__.

- [ ] **Step 4: Create migration 0009**

Create alembic/versions/0009_goal_tracking.py with down_revision = "0008". Create the six tables in parent-to-child order and indexes on every foreign key listed in the model. Use Float for amount fields, Date for completion fields, Text for description, Boolean for is_required, and nullable values exactly as the model declares.

The downgrade must drop tables in this order:

~~~python
def downgrade():
    op.drop_table("goal_activity_suggestions")
    op.drop_table("goal_progress_entries")
    op.drop_table("goal_checklist_items")
    op.drop_table("goal_categories")
    op.drop_table("goal_blocks")
    op.drop_table("goals")
~~~

- [ ] **Step 5: Run migration tests and metadata checks**

Run:

~~~powershell
uv run python -m pytest tests/test_migrations.py -q
~~~

Expected: all migration tests PASS, including upgrade to head, downgrade to base, and preservation of existing records.

- [ ] **Step 6: Commit the persistence slice**

~~~powershell
git add backend/goals/__init__.py backend/goals/models.py backend/models.py alembic/versions/0009_goal_tracking.py tests/test_migrations.py
git commit -m "feat: add goal tracking persistence"
~~~

---

### Task 2: Validation Contracts and Pure Attainment Rules

**Files:**
- Create: backend/goals/schemas.py
- Create: backend/goals/rules.py
- Create: tests/test_goals_rules.py

**Interfaces:**
- Produces GoalStructureInput, BlockInput, ChecklistItemInput, CategoryInput, SuggestionInput, ProgressInput, ChecklistCompletionInput, LifecycleInput, RuleOutput, BlockSummaryOutput, GoalSummaryOutput, and GoalPreviewOutput.
- Produces summarize_blocks(blocks) -> GoalSummaryOutput.
- A quota block is valid only when it has at least one category and at least one configured constraint.
- A checklist block rejects quota fields and categories; a quota block rejects checklist items.

- [ ] **Step 1: Write failing rule tests**

Create tests/test_goals_rules.py with builders using backend.goals.models and these assertions:

~~~python
from datetime import date

from backend.goals.models import (
    GoalBlock,
    GoalCategory,
    GoalChecklistItem,
    GoalProgressEntry,
)
from backend.goals.rules import summarize_blocks


def quota_block(required_total=8, required_distinct=4):
    block = GoalBlock(
        id="core",
        kind="quota",
        title="核心素质",
        unit_label="次",
        minimum_total=required_total,
        minimum_distinct_categories=required_distinct,
        position=0,
    )
    block.categories = [
        GoalCategory(
            id=f"c{index}",
            name=name,
            minimum_amount=1,
            is_required=True,
            position=index,
        )
        for index, name in enumerate(["理想信念", "科学道德", "爱校荣校", "安全法纪"])
    ]
    block.entries = []
    return block


def add(block, category_index, amount=1):
    block.entries.append(
        GoalProgressEntry(
            id=f"e{len(block.entries)}",
            block_id=block.id,
            category_id=block.categories[category_index].id,
            title="完成活动",
            completed_on=date(2026, 9, 20),
            amount=amount,
        )
    )


def test_quota_requires_total_and_every_required_category():
    block = quota_block()
    for index in range(4):
        add(block, index)
    add(block, 0, 3)
    assert summarize_blocks([block]).attained is False
    add(block, 1)
    assert summarize_blocks([block]).attained is True


def test_distinct_categories_ignore_repeated_entries_in_one_category():
    block = quota_block(required_total=3, required_distinct=3)
    for category in block.categories:
        category.is_required = False
    add(block, 0, 3)
    summary = summarize_blocks([block])
    distinct = next(rule for rule in summary.blocks[0].rules if rule.key == "distinct")
    assert distinct.current == 1
    assert summary.attained is False


def test_checklist_and_quota_must_both_pass():
    checklist = GoalBlock(
        id="list",
        kind="checklist",
        title="毕业手续",
        unit_label="项",
        minimum_total=None,
        minimum_distinct_categories=None,
        position=0,
    )
    checklist.checklist_items = [
        GoalChecklistItem(id="i1", title="提交论文", completed_on=date(2026, 9, 20), position=0),
        GoalChecklistItem(id="i2", title="完成答辩", completed_on=None, position=1),
    ]
    checklist.categories = []
    checklist.entries = []
    quota = quota_block(required_total=1, required_distinct=1)
    for category in quota.categories:
        category.is_required = False
    add(quota, 0)
    assert summarize_blocks([checklist, quota]).attained is False
    checklist.checklist_items[1].completed_on = date(2026, 9, 20)
    assert summarize_blocks([checklist, quota]).attained is True


def test_empty_and_unconfigured_blocks_never_attain():
    empty = GoalBlock(
        id="empty",
        kind="checklist",
        title="空清单",
        unit_label="项",
        minimum_total=None,
        minimum_distinct_categories=None,
        position=0,
    )
    empty.checklist_items = []
    empty.categories = []
    empty.entries = []
    assert summarize_blocks([]).attained is False
    assert summarize_blocks([empty]).attained is False
~~~

- [ ] **Step 2: Run the rule tests and verify the expected import failure**

Run:

~~~powershell
uv run python -m pytest tests/test_goals_rules.py -q
~~~

Expected: collection FAIL because backend.goals.rules does not exist.

- [ ] **Step 3: Implement strict input schemas**

In backend/goals/schemas.py, define the following exact public fields:

~~~python
from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints, field_validator, model_validator

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
        if value > date.today():
            raise ValueError("完成日期不能晚于今天")
        return value


class ChecklistCompletionInput(BaseModel):
    completed_on: date | None

    @field_validator("completed_on")
    @classmethod
    def not_future(cls, value):
        if value is not None and value > date.today():
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
~~~

- [ ] **Step 4: Implement the pure rule engine**

Create backend/goals/rules.py:

~~~python
from .schemas import BlockSummaryOutput, GoalSummaryOutput, RuleOutput


def summarize_blocks(blocks) -> GoalSummaryOutput:
    summaries = []
    for block in blocks:
        if block.kind == "checklist":
            items = list(block.checklist_items)
            completed = sum(item.completed_on is not None for item in items)
            rules = [
                RuleOutput(
                    key="checklist",
                    label="完成清单",
                    current=completed,
                    required=len(items),
                    unit="项",
                    satisfied=bool(items) and completed == len(items),
                )
            ]
        else:
            categories = list(block.categories)
            amounts = {category.id: 0.0 for category in categories}
            for entry in block.entries:
                if entry.category_id in amounts:
                    amounts[entry.category_id] += entry.amount
            rules = []
            if block.minimum_total is not None:
                total = sum(amounts.values())
                rules.append(RuleOutput(
                    key="total",
                    label="累计数量",
                    current=total,
                    required=block.minimum_total,
                    unit=block.unit_label,
                    satisfied=total >= block.minimum_total,
                ))
            for category in categories:
                if category.is_required:
                    current = amounts[category.id]
                    rules.append(RuleOutput(
                        key="required_category",
                        label=category.name,
                        current=current,
                        required=category.minimum_amount,
                        unit=block.unit_label,
                        satisfied=current >= category.minimum_amount,
                    ))
            if block.minimum_distinct_categories is not None:
                distinct = sum(
                    amounts[category.id] >= category.minimum_amount
                    for category in categories
                )
                rules.append(RuleOutput(
                    key="distinct",
                    label="覆盖分类",
                    current=distinct,
                    required=block.minimum_distinct_categories,
                    unit="类",
                    satisfied=distinct >= block.minimum_distinct_categories,
                ))
        summaries.append(BlockSummaryOutput(
            block_id=block.id,
            title=block.title,
            kind=block.kind,
            attained=bool(rules) and all(rule.satisfied for rule in rules),
            rules=rules,
        ))
    return GoalSummaryOutput(
        attained=bool(summaries) and all(block.attained for block in summaries),
        blocks=summaries,
    )
~~~

- [ ] **Step 5: Run rule and schema tests**

Add schema cases to tests/test_goals_rules.py for a checklist block carrying categories, a quota block carrying checklist items, distinct count greater than category count, future completion dates, and non-positive progress amount.

Run:

~~~powershell
uv run python -m pytest tests/test_goals_rules.py -q
~~~

Expected: all rule and schema tests PASS.

- [ ] **Step 6: Commit the domain rules slice**

~~~powershell
git add backend/goals/schemas.py backend/goals/rules.py tests/test_goals_rules.py
git commit -m "feat: calculate goal attainment rules"
~~~

---

### Task 3: Goal CRUD, Aggregate Reads, and Built-in Template

**Files:**
- Create: backend/goals/templates.py
- Create: backend/goals/service.py
- Create: backend/goals/router.py
- Create: tests/test_goals_api.py
- Modify: backend/main.py

**Interfaces:**
- GET /api/goals returns lightweight goal cards with summary.
- POST /api/goals accepts GoalStructureInput and returns a complete goal aggregate.
- GET /api/goals/{goal_id} returns the complete aggregate.
- PATCH /api/goals/{goal_id}/lifecycle accepts LifecycleInput.
- DELETE /api/goals/{goal_id} succeeds only when no checklist completion or progress exists.
- GET /api/goals/templates returns template metadata.
- POST /api/goals/from-template/full-time-postgraduate-quality creates an independent copy.
- Produces service functions list_goals, goal_detail, create_goal, set_lifecycle, delete_empty_goal, and create_from_template.

- [ ] **Step 1: Write failing API tests for creation, reads, lifecycle, and isolation**

Create tests/test_goals_api.py with an independent application fixture, then add the goal tests:

~~~python
import pytest
from fastapi.testclient import TestClient

from backend.main import create_app


@pytest.fixture
def client(tmp_path):
    from backend.models import Base

    app = create_app(f"sqlite:///{tmp_path / 'goals.db'}")
    Base.metadata.create_all(app.state.engine)
    with TestClient(app, headers={"X-Qingjian-Request": "1"}) as value:
        yield value
    app.state.engine.dispose()


def account(client, name="alice"):
    client.cookies.clear()
    response = client.post(
        "/api/auth/register",
        json={"username": name, "password": "test-password"},
    )
    assert response.status_code == 201
    token = client.cookies.get("qingjian_session")
    client.cookies.clear()
    return {"Cookie": "qingjian_session=" + token}


def simple_goal():
    return {
        "title": "准备毕业",
        "description": "完成毕业所需事项",
        "blocks": [{
            "kind": "checklist",
            "title": "毕业手续",
            "unit_label": "项",
            "position": 0,
            "checklist_items": [
                {"title": "提交论文初稿", "position": 0},
                {"title": "完成预答辩", "position": 1},
            ],
            "categories": [],
        }],
    }


def test_goal_crud_lifecycle_and_account_isolation(client):
    alice = account(client)
    bob = account(client, "bobby")
    created = client.post("/api/goals", headers=alice, json=simple_goal())
    assert created.status_code == 201
    goal = created.json()
    assert goal["summary"]["attained"] is False
    assert client.get("/api/goals", headers=bob).json() == []
    assert client.get(f"/api/goals/{goal['id']}", headers=bob).status_code == 404
    archived = client.patch(
        f"/api/goals/{goal['id']}/lifecycle",
        headers=alice,
        json={"archived": True},
    )
    assert archived.status_code == 200
    assert archived.json()["archived_at"] is not None
    assert client.delete(f"/api/goals/{goal['id']}", headers=alice).status_code == 204


def test_full_time_template_is_copied_and_rule_complete(client):
    headers = account(client)
    templates = client.get("/api/goals/templates", headers=headers).json()
    assert templates == [{
        "key": "full-time-postgraduate-quality",
        "title": "完成研究生综合素质要求",
        "description": "全日制研究生：核心素质 4 类各至少 1 次且总计至少 8 次；素质提升至少覆盖 3 类且总计至少 3 次。",
    }]
    response = client.post(
        "/api/goals/from-template/full-time-postgraduate-quality",
        headers=headers,
    )
    assert response.status_code == 201
    goal = response.json()
    core, quality = goal["blocks"]
    assert core["minimum_total"] == 8
    assert core["minimum_distinct_categories"] == 4
    assert len(core["categories"]) == 4
    assert all(category["is_required"] for category in core["categories"])
    assert quality["minimum_total"] == 3
    assert quality["minimum_distinct_categories"] == 3
    assert len(quality["categories"]) == 8
    volunteer = next(category for category in quality["categories"] if category["name"] == "志愿服务")
    assert "“志愿北京”平台累计志愿服务满 10 小时" in [
        suggestion["title"] for suggestion in volunteer["suggestions"]
    ]
~~~

Add tests for unauthenticated access, empty blocks, and deleting a non-empty goal after manually completing a checklist item in Task 5.

- [ ] **Step 2: Run API tests and verify the expected route failure**

Run:

~~~powershell
uv run python -m pytest tests/test_goals_api.py -q
~~~

Expected: FAIL with 404 responses for /api/goals routes.

- [ ] **Step 3: Define the template registry**

Create backend/goals/templates.py. Export TEMPLATE_METADATA and template_structure(key). The registry must contain exactly one key, full-time-postgraduate-quality, with two quota blocks.

Use these category-to-suggestion mappings:

~~~python
CORE = {
    "理想信念": ["新生引航工程系列活动", "爱国主义教育", "主题党、团日活动", "青年大学习"],
    "科学道德": ["研究生科学道德与学风建设主题教育", "学术论坛系列讲座"],
    "爱校荣校": ["“知校史、明校情、铸校魂”校园行", "导学文化建设活动", "学校成就展参观活动"],
    "安全法纪": ["入学教育", "日常安全教育"],
}

QUALITY = {
    "学术科创": ["研究生创新创业展", "挑战杯校内赛等双创赛事", "科技创新沙龙", "研究生学科竞赛"],
    "生涯规划": ["研究生就业指导讲座、沙龙", "模拟面试大赛等实践活动"],
    "强身健体": ["研究生体育竞技赛事", "群众性体育活动"],
    "心理健康": ["心理健康节系列活动"],
    "文化艺术": ["艺馨杯文艺汇演", "研究生迎新、毕业晚会", "五月鲜花合唱比赛", "高雅艺术进校园活动", "歌手大赛"],
    "志愿服务": ["“志愿北京”平台累计志愿服务满 10 小时"],
    "社会实践": ["假期社会实践专项", "研究生挂职锻炼", "大学生实习“扬帆计划”", "考核合格的助教助管工作"],
    "理论精进": ["研究生党员骨干培训班", "研究生宣讲团", "鸿雁讲堂累计参加 3 场及以上"],
}
~~~

Build CategoryInput values in insertion order. Core categories use is_required=True, minimum_amount=1; quality categories use is_required=False, minimum_amount=1. Copy every suggestion into SuggestionInput with deterministic position.

- [ ] **Step 4: Implement aggregate serialization and creation**

In backend/goals/service.py, implement parent-owned loading:

~~~python
def owned_goal(db: Session, user_id: str, goal_id: str) -> Goal:
    goal = db.scalar(
        select(Goal)
        .where(Goal.id == goal_id, Goal.user_id == user_id)
        .options(
            selectinload(Goal.blocks).selectinload(GoalBlock.checklist_items),
            selectinload(Goal.blocks).selectinload(GoalBlock.categories)
                .selectinload(GoalCategory.suggestions),
            selectinload(Goal.blocks).selectinload(GoalBlock.entries),
        )
    )
    if goal is None:
        raise HTTPException(404, "目标不存在")
    return goal
~~~

Implement a create_graph(db, user_id, data) helper that creates Goal, then ordered blocks, checklist items or categories, and suggestions. Call db.flush() before constructing the response, commit once, reload through owned_goal, and return detail(goal).

The detail(goal) result must contain:

~~~python
{
    "id": goal.id,
    "title": goal.title,
    "description": goal.description,
    "archived_at": goal.archived_at,
    "created_at": goal.created_at,
    "updated_at": goal.updated_at,
    "blocks": block_outputs,
    "entries": entry_outputs_sorted_newest_first,
    "summary": summarize_blocks(goal.blocks).model_dump(),
}
~~~

List results contain id, title, description, archived_at, updated_at, and summary. Do not trust a child user_id because child tables intentionally do not duplicate it.

- [ ] **Step 5: Add authenticated routes**

Create backend/goals/router.py with prefix /api/goals and the endpoints listed in Interfaces. In backend/main.py import goals.router and include it after timetable_router.

DELETE must return 409 with “目标已有完成记录，请归档而不是删除” when any checklist item has completed_on or any block has entries. It may delete a configured but untouched goal because no completed facts are lost.

- [ ] **Step 6: Run API and regression tests**

Run:

~~~powershell
uv run python -m pytest tests/test_goals_api.py tests/test_api.py -q
~~~

Expected: all selected tests PASS.

- [ ] **Step 7: Commit aggregate CRUD and template**

~~~powershell
git add backend/goals/templates.py backend/goals/service.py backend/goals/router.py backend/main.py tests/test_goals_api.py
git commit -m "feat: expose goals and quality template"
~~~

---

### Task 4: Atomic Structure Preview and Save

**Files:**
- Modify: backend/goals/schemas.py
- Modify: backend/goals/rules.py
- Modify: backend/goals/service.py
- Modify: backend/goals/router.py
- Modify: tests/test_goals_api.py

**Interfaces:**
- POST /api/goals/{goal_id}/structure/preview accepts GoalStructureInput and returns current_summary, proposed_summary, and warnings.
- PUT /api/goals/{goal_id}/structure accepts the same input, applies one transaction, and returns Goal detail.
- Existing block, checklist, category, and suggestion IDs may be reused only under their current parent.
- Omitting a category with entries or an already-completed checklist item returns 409.

- [ ] **Step 1: Write failing preview and atomic-save tests**

Add tests that:

1. Create a goal, keep existing IDs in a structure payload, rename the goal and one category, and assert PUT preserves IDs.
2. Post preview with a stricter total and assert current_summary.attained differs from proposed_summary.attained without changing GET output.
3. Seed a completed checklist date through a SQLAlchemy Session, omit that item from a structure PUT, and expect 409.
4. Seed a GoalProgressEntry through a SQLAlchemy Session, omit its category, and expect 409.
5. Pass a block ID from Alice’s goal while updating Bob’s goal and expect 404 without changing either goal.

Use this preview assertion shape:

~~~python
preview = client.post(
    f"/api/goals/{goal['id']}/structure/preview",
    headers=headers,
    json=stricter,
)
assert preview.status_code == 200
assert preview.json()["current_summary"] == goal["summary"]
assert preview.json()["proposed_summary"]["attained"] is False
assert client.get(f"/api/goals/{goal['id']}", headers=headers).json()["title"] == goal["title"]
~~~

Seed protected history without depending on the later mutation routes:

~~~python
from datetime import date

from sqlalchemy.orm import Session

from backend.goals.models import GoalChecklistItem, GoalProgressEntry

with Session(client.app.state.engine) as db:
    item = db.get(GoalChecklistItem, checklist_item_id)
    item.completed_on = date(2026, 9, 20)
    db.add(GoalProgressEntry(
        block_id=quota_block_id,
        category_id=category_id,
        title="已有活动",
        completed_on=date(2026, 9, 20),
        amount=1,
    ))
    db.commit()
~~~

- [ ] **Step 2: Run the focused tests and verify 404 failures**

Run:

~~~powershell
uv run python -m pytest tests/test_goals_api.py -k "preview or structure" -q
~~~

Expected: FAIL because the structure routes do not exist.

- [ ] **Step 3: Add draft projection for preview**

Add a non-persistent projection type in backend/goals/rules.py:

~~~python
from types import SimpleNamespace


def project_structure(data, existing_entries, completed_items):
    blocks = []
    for block_data in sorted(data.blocks, key=lambda item: item.position):
        block_id = block_data.id or f"preview-block-{block_data.position}"
        block = SimpleNamespace(
            id=block_id,
            kind=block_data.kind,
            title=block_data.title,
            unit_label=block_data.unit_label,
            minimum_total=block_data.minimum_total,
            minimum_distinct_categories=block_data.minimum_distinct_categories,
            checklist_items=[],
            categories=[],
            entries=[],
        )
        if block_data.kind == "checklist":
            block.checklist_items = [
                SimpleNamespace(
                    id=item.id or f"preview-item-{item.position}",
                    title=item.title,
                    completed_on=completed_items.get(item.id),
                )
                for item in sorted(block_data.checklist_items, key=lambda value: value.position)
            ]
        else:
            block.categories = [
                SimpleNamespace(
                    id=category.id or f"preview-category-{category.position}",
                    name=category.name,
                    minimum_amount=category.minimum_amount,
                    is_required=category.is_required,
                )
                for category in sorted(block_data.categories, key=lambda value: value.position)
            ]
            category_ids = {category.id for category in block.categories}
            block.entries = [
                entry for entry in existing_entries
                if entry.block_id == block_data.id and entry.category_id in category_ids
            ]
        blocks.append(block)
    return blocks
~~~

Preview warnings must identify omitted completed checklist items and categories that still have entries. Preview remains read-only and returns the projected summary even when warnings exist.

- [ ] **Step 4: Implement ownership-safe nested synchronization**

Implement save_structure using these rules:

- Load the aggregate through owned_goal.
- Build maps of the goal’s existing block, item, category, and suggestion IDs.
- Reject every supplied ID absent from its expected parent with HTTP 404 “目标内容不存在”.
- Before deleting omitted children, reject completed checklist items and categories with entries using HTTP 409 and a concrete Chinese message naming the item or category.
- Create objects for missing IDs, update supplied objects, delete only safe omitted objects, and normalize position from the submitted order.
- Set goal.updated_at = now().
- Flush and calculate the result before commit; if any exception occurs, rollback.
- Commit exactly once and reload the aggregate for the response.

Do not issue multiple commits while walking the graph.

- [ ] **Step 5: Add preview and save routes**

Add:

~~~python
@router.post("/{goal_id}/structure/preview")
def preview_structure(goal_id: str, data: GoalStructureInput, db: DB, user: Account):
    return service.preview_structure(db, user.id, goal_id, data)


@router.put("/{goal_id}/structure")
def save_structure(goal_id: str, data: GoalStructureInput, db: DB, user: Account):
    return service.save_structure(db, user.id, goal_id, data)
~~~

- [ ] **Step 6: Run structure, rule, and migration tests**

Run:

~~~powershell
uv run python -m pytest tests/test_goals_api.py tests/test_goals_rules.py tests/test_migrations.py -q
~~~

Expected: all selected tests PASS and preview tests prove no write occurred.

- [ ] **Step 7: Commit atomic structure editing**

~~~powershell
git add backend/goals/schemas.py backend/goals/rules.py backend/goals/service.py backend/goals/router.py tests/test_goals_api.py
git commit -m "feat: edit goal structures atomically"
~~~

---

### Task 5: Checklist and Progress Mutations

**Files:**
- Modify: backend/goals/service.py
- Modify: backend/goals/router.py
- Modify: tests/test_goals_api.py

**Interfaces:**
- PUT /api/goals/{goal_id}/checklist/{item_id} accepts ChecklistCompletionInput and returns Goal detail.
- POST /api/goals/{goal_id}/entries accepts ProgressInput and returns Goal detail.
- PUT /api/goals/{goal_id}/entries/{entry_id} accepts ProgressInput and returns Goal detail.
- DELETE /api/goals/{goal_id}/entries/{entry_id} returns Goal detail, not an empty 204, because the client needs the recalculated summary.

- [ ] **Step 1: Write failing completion and progress tests**

Add a test that creates the full-time template, locates category IDs by name, creates four core entries plus four additional core entries, and creates three quality entries in three categories. Assert:

~~~python
assert completed["summary"]["attained"] is True
deleted = client.delete(
    f"/api/goals/{goal_id}/entries/{quality_entry_id}",
    headers=headers,
)
assert deleted.status_code == 200
assert deleted.json()["summary"]["attained"] is False
~~~

Add tests for:

- Completing and uncompleting a checklist item updates its date and summary.
- A future completed_on returns 422.
- amount = 0 returns 422.
- A category from another block returns 422.
- A child item or entry owned by another account returns 404.
- Editing an entry to a different category in the same block succeeds.
- DELETE of a progress record recalculates totals and distinct coverage.

- [ ] **Step 2: Run the focused tests and verify route failures**

Run:

~~~powershell
uv run python -m pytest tests/test_goals_api.py -k "checklist or progress or entry" -q
~~~

Expected: FAIL because mutation routes do not exist.

- [ ] **Step 3: Implement parent-scoped child lookup helpers**

Add service helpers that always begin from owned_goal:

~~~python
def checklist_item_in_goal(goal, item_id):
    for block in goal.blocks:
        if block.kind == "checklist":
            for item in block.checklist_items:
                if item.id == item_id:
                    return item
    raise HTTPException(404, "清单项不存在")


def entry_in_goal(goal, entry_id):
    for block in goal.blocks:
        for entry in block.entries:
            if entry.id == entry_id:
                return block, entry
    raise HTTPException(404, "进展记录不存在")


def quota_category(goal, category_id):
    for block in goal.blocks:
        if block.kind == "quota":
            for category in block.categories:
                if category.id == category_id:
                    return block, category
    raise HTTPException(422, "统计分类不属于该目标的计数型条件")
~~~

For entry edits, verify the selected category belongs to the entry’s existing block; do not silently move an entry between blocks.

- [ ] **Step 4: Implement mutations with one commit each**

Checklist update sets completed_on from the request. Progress creation sets block_id from the resolved category, never from client input. Progress edit updates title, date, amount, category_id, and updated_at. Progress delete removes the entry. Every operation updates Goal.updated_at, commits once, reloads with owned_goal, and returns detail.

- [ ] **Step 5: Add the four routes**

Add the exact paths and methods from Interfaces. Keep route order such that /templates and /from-template are declared before /{goal_id}; FastAPI must not treat fixed path segments as IDs.

- [ ] **Step 6: Run goal API and complete backend regression**

Run:

~~~powershell
uv run python -m pytest tests/test_goals_api.py tests/test_goals_rules.py tests/test_migrations.py -q
uv run python -m pytest -q
~~~

Expected: all focused and full backend tests PASS.

- [ ] **Step 7: Commit completion tracking**

~~~powershell
git add backend/goals/service.py backend/goals/router.py tests/test_goals_api.py
git commit -m "feat: record goal progress"
~~~

---

### Task 6: Frontend Types and Goal State Hook

**Files:**
- Create: frontend/src/features/goals/types.ts
- Create: frontend/src/features/goals/useGoals.ts
- Create: frontend/src/test/GoalsState.test.tsx

**Interfaces:**
- useGoals(active: boolean) returns goals, selected, templates, loading, busy, error, retry, selectGoal, createGoal, createFromTemplate, saveStructure, previewStructure, setArchived, setChecklistCompletion, createEntry, updateEntry, deleteEntry, and refresh.
- Successful mutation responses replace both selected detail and the corresponding list card.
- Failed mutations keep selected and editor data unchanged and expose a retry action.

- [ ] **Step 1: Define API and draft types**

Create frontend/src/features/goals/types.ts with these unions and interfaces:

~~~typescript
export type GoalBlockKind = "checklist" | "quota";
export type RuleKey = "checklist" | "total" | "required_category" | "distinct";

export interface GoalRule {
  key: RuleKey;
  label: string;
  current: number;
  required: number;
  unit: string;
  satisfied: boolean;
}

export interface GoalBlockSummary {
  block_id: string;
  title: string;
  kind: GoalBlockKind;
  attained: boolean;
  rules: GoalRule[];
}

export interface GoalSummary {
  attained: boolean;
  blocks: GoalBlockSummary[];
}

export interface GoalSuggestion { id: string; title: string; position: number; }
export interface GoalChecklistItem { id: string; title: string; completed_on: string | null; position: number; }
export interface GoalCategory {
  id: string;
  name: string;
  minimum_amount: number;
  is_required: boolean;
  position: number;
  suggestions: GoalSuggestion[];
}
export interface GoalBlock {
  id: string;
  kind: GoalBlockKind;
  title: string;
  unit_label: string;
  minimum_total: number | null;
  minimum_distinct_categories: number | null;
  position: number;
  checklist_items: GoalChecklistItem[];
  categories: GoalCategory[];
}
export interface GoalEntry {
  id: string;
  block_id: string;
  category_id: string;
  title: string;
  completed_on: string;
  amount: number;
  created_at: string;
  updated_at: string;
}
export interface GoalCard {
  id: string;
  title: string;
  description: string;
  archived_at: string | null;
  updated_at: string;
  summary: GoalSummary;
}
export interface GoalDetail extends GoalCard {
  created_at: string;
  blocks: GoalBlock[];
  entries: GoalEntry[];
}
export interface GoalTemplate { key: string; title: string; description: string; }
export interface GoalPreview {
  current_summary: GoalSummary;
  proposed_summary: GoalSummary;
  warnings: string[];
}
export interface GoalDraft {
  title: string;
  description: string;
  blocks: Array<{
    id?: string;
    kind: GoalBlockKind;
    title: string;
    unit_label: string;
    minimum_total: number | null;
    minimum_distinct_categories: number | null;
    position: number;
    checklist_items: Array<{id?: string; title: string; position: number}>;
    categories: Array<{
      id?: string;
      name: string;
      minimum_amount: number;
      is_required: boolean;
      position: number;
      suggestions: Array<{id?: string; title: string; position: number}>;
    }>;
  }>;
}
~~~

- [ ] **Step 2: Write failing hook tests**

Create frontend/src/test/GoalsState.test.tsx using renderHook and act. Mock api and verify:

~~~typescript
it("loads cards and templates once when activated", async () => {
  apiMock.mockImplementation((path: string) => Promise.resolve(
    path === "/goals/templates" ? [template] : [card],
  ));
  const {result, rerender} = renderHook(
    ({active}) => useGoals(active),
    {initialProps: {active: false}},
  );
  expect(apiMock).not.toHaveBeenCalled();
  rerender({active: true});
  await waitFor(() => expect(result.current.goals).toEqual([card]));
  expect(apiMock).toHaveBeenCalledWith("/goals");
  expect(apiMock).toHaveBeenCalledWith("/goals/templates");
});

it("keeps selected data and exposes retry after a failed mutation", async () => {
  apiMock
    .mockResolvedValueOnce([card])
    .mockResolvedValueOnce([template])
    .mockResolvedValueOnce(detail)
    .mockRejectedValueOnce(new Error("连接失败"))
    .mockResolvedValueOnce(updatedDetail);
  const {result} = renderHook(() => useGoals(true));
  await waitFor(() => expect(result.current.goals).toHaveLength(1));
  await act(() => result.current.selectGoal(card.id));
  await act(() => result.current.setChecklistCompletion("i1", "2026-09-20"));
  expect(result.current.selected).toEqual(detail);
  expect(result.current.error).toBe("连接失败");
  await act(() => result.current.retry?.());
  expect(result.current.selected).toEqual(updatedDetail);
});
~~~

Use complete fixture objects conforming to the interfaces; do not cast partial objects with as GoalDetail.

- [ ] **Step 3: Run hook tests and verify the import failure**

Run from frontend:

~~~powershell
npm test -- src/test/GoalsState.test.tsx
~~~

Expected: FAIL because useGoals and types do not exist.

- [ ] **Step 4: Implement useGoals**

Use api from ../../api and these request shapes:

~~~typescript
api<GoalCard[]>("/goals")
api<GoalTemplate[]>("/goals/templates")
api<GoalDetail>("/goals/" + id)
api<GoalDetail>("/goals/from-template/" + key, "POST")
api<GoalDetail>("/goals", "POST", draft)
api<GoalDetail>("/goals/" + id + "/structure", "PUT", draft)
api<GoalPreview>("/goals/" + id + "/structure/preview", "POST", draft)
api<GoalDetail>("/goals/" + id + "/lifecycle", "PATCH", {archived})
api<GoalDetail>("/goals/" + id + "/checklist/" + itemId, "PUT", {completed_on})
api<GoalDetail>("/goals/" + id + "/entries", "POST", input)
api<GoalDetail>("/goals/" + id + "/entries/" + entryId, "PUT", input)
api<GoalDetail>("/goals/" + id + "/entries/" + entryId, "DELETE")
~~~

Implement one operation wrapper that sets busy, captures the exact failed closure in retry, and does not clear selected on failure. Implement mergeDetail(detail) so card summary, title, description, archive timestamp, and updated timestamp always reflect the latest aggregate.

- [ ] **Step 5: Run hook tests and TypeScript build**

Run:

~~~powershell
npm test -- src/test/GoalsState.test.tsx
npm run build
~~~

Expected: hook tests PASS and the production TypeScript build succeeds.

- [ ] **Step 6: Commit the frontend state layer**

~~~powershell
git add frontend/src/features/goals/types.ts frontend/src/features/goals/useGoals.ts frontend/src/test/GoalsState.test.tsx
git commit -m "feat: add goal tracking client state"
~~~

---

### Task 7: Table-first Goal List, Detail, and Daily Progress UI

**Files:**
- Create: frontend/src/features/goals/GoalList.tsx
- Create: frontend/src/features/goals/GoalDetail.tsx
- Create: frontend/src/features/goals/GoalsPanel.tsx
- Create: frontend/src/features/goals/goals.css
- Create: frontend/src/test/GoalsPanel.test.tsx

**Interfaces:**
- GoalsPanel receives model: GoalsModel and onDraftChange(dirty: boolean).
- GoalList filters active/archived targets without changing backend data.
- GoalDetail renders exact rule rows, checklist controls, progress records, free-text activity entry, suggestions through datalist, and archive controls.
- Ordinary “次” blocks hide amount unless the user expands advanced fields; non-“次” blocks show amount immediately.

- [ ] **Step 1: Write failing panel tests**

Create frontend/src/test/GoalsPanel.test.tsx with a mock GoalsModel and tests that verify:

- Empty state offers “从综合素质模板创建” and “新建目标”.
- Goal cards display “已达成” separately from “已归档”.
- Opening a goal renders “累计 6/8 次” and “覆盖分类 2/3 类”, not an overall percentage.
- Clicking an unchecked checklist item sends today’s local YYYY-MM-DD date.
- Selecting block and category, typing a custom activity name not present in suggestions, and submitting calls createEntry.
- Deleting an entry opens Confirm and calls deleteEntry only after confirmation.
- A failed model error remains visible with a “重试” button.
- A 360-pixel viewport preserves labels through data-label attributes.

Use this core assertion:

~~~typescript
expect(screen.getByText("累计数量")).toBeVisible();
expect(screen.getByText("6 / 8 次")).toBeVisible();
expect(screen.getByText("覆盖分类")).toBeVisible();
expect(screen.getByText("2 / 3 类")).toBeVisible();
expect(screen.queryByText(/%/)).not.toBeInTheDocument();
~~~

- [ ] **Step 2: Run panel tests and verify missing-component failures**

Run:

~~~powershell
npm test -- src/test/GoalsPanel.test.tsx
~~~

Expected: FAIL because the panel components do not exist.

- [ ] **Step 3: Implement GoalList**

Render a two-state filter using aria-pressed buttons “进行中” and “已归档”. Each row/card must expose:

- Title.
- Description when non-empty.
- Calculated badge from summary.attained.
- Separate archive badge when archived_at is non-null.
- One short progress line per block, built from unsatisfied rules first.
- Updated date.

Use a real button to select the goal and keep the list usable while a different row operation is pending.

- [ ] **Step 4: Implement GoalDetail**

Render condition rows from selected.summary.blocks.flatMap(block => block.rules). Each row carries data-label attributes for responsive conversion.

For checklist items, use:

~~~tsx
<input
  type="checkbox"
  aria-label={item.title}
  checked={item.completed_on !== null}
  disabled={model.busy}
  onChange={() => void model.setChecklistCompletion(
    item.id,
    item.completed_on ? null : localDate(),
  )}
/>
~~~

For the progress form:

- First choose a quota block.
- Then choose one of that block’s categories.
- Bind a datalist to the selected category’s suggestions while keeping the input free text.
- Default completed_on to localDate() and amount to 1.
- On success, clear only title and reset amount to 1; retain date, block, and category for rapid entry.

Progress rows display completion date, title, block title, category name, amount plus unit, and edit/delete buttons. Delete uses the shared Confirm component and says that totals and attainment may change.

- [ ] **Step 5: Implement GoalsPanel orchestration**

GoalsPanel owns only feature UI mode: list, detail, or editor. It delegates server state to useGoals. Back navigation from detail returns to the list. Archive/unarchive remains available in detail. Import goals.css from GoalsPanel.tsx.

- [ ] **Step 6: Add responsive feature CSS**

Use class prefix goal-. Desktop tables use semantic table markup. At max-width 700px:

~~~css
.goal-table thead { display: none; }
.goal-table,
.goal-table tbody,
.goal-table tr,
.goal-table td { display: block; width: 100%; }
.goal-table tr {
  margin-bottom: 12px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 7px;
}
.goal-table td {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  gap: 10px;
  border: 0;
}
.goal-table td::before {
  content: attr(data-label);
  color: var(--muted);
  font-size: 10px;
}
~~~

Ensure buttons remain at least 40 pixels high and the form works at 320 pixels without horizontal page scrolling.

- [ ] **Step 7: Run panel tests and frontend build**

Run:

~~~powershell
npm test -- src/test/GoalsPanel.test.tsx
npm run build
~~~

Expected: panel tests PASS and CSS/TypeScript production build succeeds.

- [ ] **Step 8: Commit the daily-use interface**

~~~powershell
git add frontend/src/features/goals/GoalList.tsx frontend/src/features/goals/GoalDetail.tsx frontend/src/features/goals/GoalsPanel.tsx frontend/src/features/goals/goals.css frontend/src/test/GoalsPanel.test.tsx
git commit -m "feat: add goal progress tables"
~~~

---

### Task 8: Structure Editor, Preview, Workspace Integration, and Documentation

**Files:**
- Create: frontend/src/features/goals/GoalEditor.tsx
- Create: frontend/src/test/WorkspaceGoals.test.tsx
- Modify: frontend/src/features/goals/GoalsPanel.tsx
- Modify: frontend/src/test/GoalsPanel.test.tsx
- Modify: frontend/src/layouts/Workspace.tsx
- Modify: frontend/src/styles.css
- Modify: README.md

**Interfaces:**
- GoalEditor receives initial: GoalDraft, busy, onPreview, onSave, onCancel, and onDirtyChange.
- The editor can add/remove/reorder checklist and quota blocks, items, categories, and suggestions without a formula language.
- Existing goal save always previews first; if current and proposed attainment differ or warnings are non-empty, shared Confirm requires explicit confirmation.
- Workspace adds exactly one navigation destination named “我的目标”.

- [ ] **Step 1: Write failing editor and workspace tests**

Extend GoalsPanel.test.tsx to verify:

- New goal editor starts with one checklist block and one empty item row.
- Switching block kind resets incompatible fields only after confirmation when entered content would be lost.
- A quota block cannot save with no category or no rule.
- Adding a custom category and suggestion produces the exact GoalDraft structure.
- Existing goal save calls previewStructure before saveStructure.
- A preview warning appears in Confirm and cancel leaves the editor dirty.
- Save failure preserves all typed draft values and exposes retry.

Create WorkspaceGoals.test.tsx:

~~~typescript
it("opens one generic goals destination and protects a dirty goal draft", async () => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const data = url.endsWith("/goals/templates") ? [] :
      url.endsWith("/goals") ? [] :
      url.endsWith("/notes") || url.endsWith("/tasks") ? [] :
      url.endsWith("/affairs") ? [] :
      {};
    return new Response(JSON.stringify(data), {status: 200});
  }));
  const user = userEvent.setup();
  render(<Workspace user={{id: "u1", username: "alice"}} onLogout={() => {}} />);
  await user.click(await screen.findByRole("button", {name: /我的目标/}));
  await user.click(screen.getByRole("button", {name: "新建目标"}));
  await user.type(screen.getByLabelText("目标名称"), "准备毕业");
  expect(screen.getByRole("button", {name: /待办清单/})).toBeDisabled();
  expect(screen.getByRole("button", {name: "退出登录"})).toBeDisabled();
});
~~~

- [ ] **Step 2: Run the new tests and verify failures**

Run:

~~~powershell
npm test -- src/test/GoalsPanel.test.tsx src/test/WorkspaceGoals.test.tsx
~~~

Expected: FAIL because GoalEditor and workspace navigation are not implemented.

- [ ] **Step 3: Implement GoalEditor with local immutable draft state**

Use stable client-only keys for unsaved rows, but remove those keys when building GoalDraft. Render:

- Goal name and description.
- “添加清单条件” and “添加计数条件”.
- Checklist block title plus ordered item inputs.
- Quota block title, unit, optional minimum total, optional minimum distinct categories, category rows with minimum amount and required checkbox, and expandable suggestion inputs.
- Move up/down and remove actions with accessible labels.
- Inline validation messages matching backend constraints.

Call onDirtyChange(true) on the first semantic change and false after a successful save or explicit cancel. Keep the draft unchanged when preview or save rejects.

- [ ] **Step 4: Wire preview-before-save**

For existing goals:

1. Call previewStructure(draft).
2. Compare current_summary.attained and proposed_summary.attained.
3. Combine any server warnings with an attainment-change message.
4. When there is an impact, open shared Confirm with “仍然保存”.
5. Only the confirm action calls saveStructure(draft).
6. When no warning or attainment change exists, save immediately.

For a new goal, call createGoal(draft) directly because there is no prior result to compare.

- [ ] **Step 5: Integrate one goals destination into Workspace**

Modify Workspace.tsx:

- Add Target from lucide-react.
- Extend the view union with "goals".
- Instantiate const goalsModel = useGoals(active) so the sidebar’s active-unattained count is accurate before the first visit.
- Add goalsDirty and include goalsModel.busy || goalsDirty in navigationBusy.
- Add exactly one sidebar button named “我的目标”; show the count of active unattained goals.
- Map the topbar name to “目标”.
- Use copy “想做成的事，一步步抵达。” and “把长期结果拆成清楚、可验证的条件。”
- Render GoalsPanel only for view === "goals".
- Pass onDraftChange={setGoalsDirty}.
- In close-guard messaging, prefer “目标有未保存修改，请先保存或取消编辑。” when goalsDirty is true.

Do not add any “综合素质” navigation destination.

- [ ] **Step 6: Update responsive workspace navigation**

At the existing max-width 580px breakpoint, change the sidebar navigation grid so five destinations wrap without clipped labels:

~~~css
.sidebar nav { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.sidebar nav .nav-item:last-child { grid-column: 1 / -1; }
~~~

If visual order makes the last item inappropriate for full width, add a goal-specific class and target that class instead.

- [ ] **Step 7: Update README**

Add a “通用目标与进展” section that states:

- A goal can combine checklist and quota conditions.
- Progress records are completed facts and remain separate from tasks and affairs.
- The included full-time postgraduate template implements the source document’s two aggregate rules while allowing custom activity names.
- Restarting uv run python main.py applies migration 0009 and preserves existing data.

- [ ] **Step 8: Run feature tests, full regressions, lint, and production build**

Run backend:

~~~powershell
uv run python -m pytest tests/test_goals_rules.py tests/test_goals_api.py tests/test_migrations.py -q
uv run ruff check backend/goals tests/test_goals_rules.py tests/test_goals_api.py alembic/versions/0009_goal_tracking.py
uv run python -m pytest -q
~~~

Run frontend:

~~~powershell
npm test -- src/test/GoalsState.test.tsx src/test/GoalsPanel.test.tsx src/test/WorkspaceGoals.test.tsx
npm test
npm run build
~~~

Expected: all backend tests, Ruff checks, frontend tests, and the production build PASS.

- [ ] **Step 9: Manually verify the approved acceptance flow**

Start the app with uv run python main.py and verify:

1. “我的目标” is the only new navigation item.
2. Create the full-time postgraduate template.
3. Record eight core entries spanning all four core categories.
4. Record three quality entries spanning three categories.
5. Confirm the goal becomes attained and no percentage is shown.
6. Delete one quality entry and confirm the goal returns to unattained.
7. Create a mixed “准备毕业” goal with a checklist block and quota block.
8. Enter an activity name absent from suggestions and confirm it saves.
9. Resize to 320 pixels and confirm tables become readable cards without page-level horizontal scrolling.
10. Begin editing goal structure and confirm navigation and window close are guarded until save or cancel.

- [ ] **Step 10: Commit the completed feature**

~~~powershell
git add frontend/src/features/goals/GoalEditor.tsx frontend/src/features/goals/GoalsPanel.tsx frontend/src/test/GoalsPanel.test.tsx frontend/src/test/WorkspaceGoals.test.tsx frontend/src/layouts/Workspace.tsx frontend/src/styles.css README.md
git commit -m "feat: integrate generic goal tracking"
~~~

---

## Completion Gate

Before declaring implementation complete:

- Confirm every requirement in docs/superpowers/specs/2026-09-20-goal-tracking-design.md maps to a completed task above.
- Confirm git diff --check reports no whitespace errors.
- Confirm migration upgrade to head, downgrade to base, and re-upgrade pass.
- Confirm the complete pytest and Vitest suites pass, Ruff passes for changed Python files, and npm run build succeeds.
- Review the final branch diff for accidental changes outside the listed files.
- Use superpowers:verification-before-completion before claiming success.
- Use superpowers:requesting-code-review before integration.
