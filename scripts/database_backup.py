"""Run on the server: python scripts/database_backup.py app.db backup.db.

SQLite online backup includes a consistent snapshot of committed WAL data.
To restore, stop the service, retain the old DB and its WAL/SHM together, then
point DATABASE_URL at the verified backup file and restart. Never overwrite a live DB.
"""
import argparse
import sqlite3
from pathlib import Path


def backup(source, destination):
    source = Path(source).resolve(strict=True)
    destination = Path(destination).resolve()
    if source == destination or destination.exists():
        raise ValueError("目标必须是新的备份文件，不能覆盖现有数据库")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(source.as_uri() + "?mode=ro", uri=True) as src:
        with sqlite3.connect(destination) as dst:
            src.backup(dst)
            if dst.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise RuntimeError("备份完整性检查未通过")
    print(f"备份完成并通过完整性检查：{destination}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source")
    parser.add_argument("destination")
    args = parser.parse_args()
    backup(args.source, args.destination)
