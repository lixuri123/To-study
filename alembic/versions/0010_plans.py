"""Calendar plans and check-ins."""

import sqlalchemy as sa
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "plans",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("goal_id", sa.String(36), sa.ForeignKey("goals.id"), nullable=True),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("weekdays", sa.JSON(), nullable=False),
        sa.Column("weekly_target", sa.Integer(), nullable=True),
        sa.Column("target_amount", sa.Float(), nullable=False),
        sa.Column("unit", sa.String(20), nullable=False),
        sa.Column("archived_at", sa.String(40), nullable=True),
        sa.Column("created_at", sa.String(40), nullable=False),
        sa.Column("updated_at", sa.String(40), nullable=False),
    )
    op.create_index("ix_plans_user_id", "plans", ["user_id"])
    op.create_index("ix_plans_goal_id", "plans", ["goal_id"])
    op.create_table(
        "plan_checkins",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("plan_id", sa.String(36), sa.ForeignKey("plans.id"), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("memo", sa.Text(), nullable=False),
        sa.Column("note_id", sa.String(36), sa.ForeignKey("notes.id"), nullable=True),
        sa.Column("created_at", sa.String(40), nullable=False),
        sa.Column("updated_at", sa.String(40), nullable=False),
        sa.UniqueConstraint("plan_id", "day", name="uq_plan_checkin_day"),
    )
    op.create_index("ix_plan_checkins_plan_id", "plan_checkins", ["plan_id"])


def downgrade():
    op.drop_table("plan_checkins")
    op.drop_table("plans")
