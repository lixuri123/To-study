"""Optional task windows, reminders and note references."""
import sqlalchemy as sa
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("tasks", sa.Column("start_date", sa.Date(), nullable=True))
    op.add_column("tasks", sa.Column("window_rule", sa.JSON(), nullable=True))
    op.add_column("tasks", sa.Column("reminders", sa.JSON(), nullable=False, server_default="[]"))
    op.add_column("tasks", sa.Column("note_ids", sa.JSON(), nullable=False, server_default="[]"))


def downgrade():
    with op.batch_alter_table("tasks") as batch:
        for name in ("note_ids", "reminders", "window_rule", "start_date"):
            batch.drop_column(name)
