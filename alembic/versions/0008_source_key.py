"""Unique normalized source links for new information records."""
from alembic import op
import sqlalchemy as sa
import hashlib
import json
from backend.affairs.sources import canonical_url

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("affairs") as batch:
        batch.add_column(sa.Column("source_key", sa.String(64), nullable=True))
        batch.create_unique_constraint("uq_affair_source", ["user_id", "source_key"])
    seen = set()
    connection = op.get_bind()
    for row in connection.execute(sa.text("SELECT id, user_id, payload FROM affairs ORDER BY created_at, id")).mappings():
        payload = json.loads(row["payload"]) if isinstance(row["payload"], str) else row["payload"]
        if payload.get("kind") != "information" or not payload.get("source_url"):
            continue
        key = hashlib.sha256(canonical_url(payload["source_url"]).encode()).hexdigest()
        if (row["user_id"], key) in seen:
            continue  # Preserve legacy duplicate data; don't merge user content.
        seen.add((row["user_id"], key))
        connection.execute(sa.text("UPDATE affairs SET source_key=:key WHERE id=:id"), {"key": key, "id": row["id"]})


def downgrade():
    with op.batch_alter_table("affairs") as batch:
        batch.drop_constraint("uq_affair_source", type_="unique")
        batch.drop_column("source_key")
