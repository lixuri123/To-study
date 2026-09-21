from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

from alembic import command


def test_migration_upgrade_downgrade(tmp_path):
    config = Config("alembic.ini")
    url = f"sqlite:///{tmp_path / 'migration.db'}"
    config.attributes["database_url"] = url
    command.upgrade(config, "head")
    engine = create_engine(url)
    assert {
        "users",
        "sessions",
        "notes",
        "tasks",
        "auth_rate_limits",
        "timetable_courses",
        "timetable_settings",
        "goals",
        "goal_blocks",
        "goal_checklist_items",
        "goal_categories",
        "goal_activity_suggestions",
        "goal_progress_entries",
    } <= set(
        inspect(engine).get_table_names()
    )
    command.check(config)
    command.downgrade(config, "base")
    assert set(inspect(engine).get_table_names()) == {"alembic_version"}
    command.upgrade(config, "head")
    assert "notes" in inspect(engine).get_table_names()
    engine.dispose()


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


def test_timetable_migration_preserves_affairs(tmp_path):
    config = Config("alembic.ini")
    url = f"sqlite:///{tmp_path / 'existing-affair.db'}"
    config.attributes["database_url"] = url
    command.upgrade(config, "0004")
    engine = create_engine(url)
    with engine.begin() as db:
        db.execute(text("INSERT INTO users VALUES ('user-1', 'alice', 'hash')"))
        db.execute(text("INSERT INTO affairs VALUES ('affair-1', 'user-1', :payload, 3, '2026-09-08', '2026-09-08')"),
                   {"payload": '{"title":"existing affair","note_ids":[]}'} )
    command.upgrade(config, "head")
    with engine.connect() as db:
        assert db.execute(text("SELECT payload, version FROM affairs")).one() == (
            '{"title":"existing affair","note_ids":[]}', 3)
        assert db.execute(text("SELECT count(*) FROM timetable_courses")).scalar_one() == 0
    engine.dispose()


def test_auth_migration_preserves_existing_accounts_and_notes(tmp_path):
    config = Config("alembic.ini")
    url = f"sqlite:///{tmp_path / 'existing.db'}"
    config.attributes["database_url"] = url
    command.upgrade(config, "0001")
    engine = create_engine(url)
    with engine.begin() as db:
        db.execute(
            text("INSERT INTO users VALUES ('user-1', 'alice', 'existing-hash')")
        )
        db.execute(
            text(
                "INSERT INTO sessions VALUES ('existing-token-hash', 'user-1', 123456)"
            )
        )
        db.execute(
            text(
                "INSERT INTO notes VALUES ('note-1', 'user-1', 'existing title', 'existing content', '2026-09-06')"
            )
        )
    command.upgrade(config, "head")
    with engine.connect() as db:
        assert db.execute(text("SELECT username, password_hash FROM users")).one() == (
            "alice",
            "existing-hash",
        )
        assert (
            db.execute(text("SELECT expires_at FROM sessions")).scalar_one() == 123456
        )
        assert (
            db.execute(text("SELECT content FROM notes")).scalar_one()
            == "existing content"
        )
    engine.dispose()


def test_task_due_date_migration_preserves_existing_tasks(tmp_path):
    config = Config("alembic.ini")
    url = f"sqlite:///{tmp_path / 'existing-task.db'}"
    config.attributes["database_url"] = url
    command.upgrade(config, "0002")
    engine = create_engine(url)
    with engine.begin() as db:
        db.execute(text("INSERT INTO users VALUES ('user-1', 'alice', 'hash')"))
        db.execute(
            text(
                "INSERT INTO tasks VALUES ('task-1', 'user-1', 'existing task', 0, '2026-09-06')"
            )
        )

    command.upgrade(config, "head")

    with engine.connect() as db:
        assert db.execute(
            text("SELECT title, completed, due_date FROM tasks WHERE id = 'task-1'")
        ).one() == ("existing task", 0, None)
    engine.dispose()
