"""Create accounts, sessions, notes and tasks."""
import sqlalchemy as sa

from alembic import op

revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('users', sa.Column('id', sa.String(36), primary_key=True), sa.Column('username', sa.String(40), nullable=False, unique=True), sa.Column('password_hash', sa.Text(), nullable=False))
    op.create_table('sessions', sa.Column('token_hash', sa.String(64), primary_key=True), sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False), sa.Column('expires_at', sa.Integer(), nullable=False))
    op.create_table('notes', sa.Column('id', sa.String(36), primary_key=True), sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False), sa.Column('title', sa.String(200), nullable=False), sa.Column('content', sa.Text(), nullable=False), sa.Column('updated_at', sa.String(40), nullable=False))
    op.create_table('tasks', sa.Column('id', sa.String(36), primary_key=True), sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False), sa.Column('title', sa.String(200), nullable=False), sa.Column('completed', sa.Boolean(), nullable=False), sa.Column('created_at', sa.String(40), nullable=False))
    for table in ('sessions', 'notes', 'tasks'):
        op.create_index(f'ix_{table}_user_id', table, ['user_id'])


def downgrade():
    for table in ('tasks', 'notes', 'sessions', 'users'):
        op.drop_table(table)
