"""Normalized goal tracking persistence."""

import sqlalchemy as sa

from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "goals",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("archived_at", sa.String(40), nullable=True),
        sa.Column("created_at", sa.String(40), nullable=False),
        sa.Column("updated_at", sa.String(40), nullable=False),
    )
    op.create_index("ix_goals_user_id", "goals", ["user_id"])
    op.create_table(
        "goal_blocks",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("goal_id", sa.String(36), sa.ForeignKey("goals.id"), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("unit_label", sa.String(20), nullable=False),
        sa.Column("minimum_total", sa.Float(), nullable=True),
        sa.Column("minimum_distinct_categories", sa.Integer(), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False),
    )
    op.create_index("ix_goal_blocks_goal_id", "goal_blocks", ["goal_id"])
    op.create_table(
        "goal_checklist_items",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("block_id", sa.String(36), sa.ForeignKey("goal_blocks.id"), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("completed_on", sa.Date(), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False),
    )
    op.create_index("ix_goal_checklist_items_block_id", "goal_checklist_items", ["block_id"])
    op.create_table(
        "goal_categories",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("block_id", sa.String(36), sa.ForeignKey("goal_blocks.id"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("minimum_amount", sa.Float(), nullable=False),
        sa.Column("is_required", sa.Boolean(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
    )
    op.create_index("ix_goal_categories_block_id", "goal_categories", ["block_id"])
    op.create_table(
        "goal_activity_suggestions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("category_id", sa.String(36), sa.ForeignKey("goal_categories.id"), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
    )
    op.create_index(
        "ix_goal_activity_suggestions_category_id",
        "goal_activity_suggestions",
        ["category_id"],
    )
    op.create_table(
        "goal_progress_entries",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("block_id", sa.String(36), sa.ForeignKey("goal_blocks.id"), nullable=False),
        sa.Column("category_id", sa.String(36), sa.ForeignKey("goal_categories.id"), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("completed_on", sa.Date(), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("created_at", sa.String(40), nullable=False),
        sa.Column("updated_at", sa.String(40), nullable=False),
    )
    op.create_index("ix_goal_progress_entries_block_id", "goal_progress_entries", ["block_id"])
    op.create_index("ix_goal_progress_entries_category_id", "goal_progress_entries", ["category_id"])


def downgrade():
    op.drop_table("goal_activity_suggestions")
    op.drop_table("goal_progress_entries")
    op.drop_table("goal_checklist_items")
    op.drop_table("goal_categories")
    op.drop_table("goal_blocks")
    op.drop_table("goals")
