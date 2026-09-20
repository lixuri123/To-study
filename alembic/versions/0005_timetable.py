"""Personal course timetables and semester settings."""
from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("timetable_courses",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False))
    op.create_index("ix_timetable_courses_user_id", "timetable_courses", ["user_id"])
    op.create_table("timetable_settings",
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("week_one_monday", sa.Date(), nullable=True),
        sa.Column("total_weeks", sa.Integer(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False))


def downgrade():
    op.drop_table("timetable_settings")
    op.drop_table("timetable_courses")
