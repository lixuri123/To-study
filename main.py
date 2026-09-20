def main():
    from pathlib import Path
    from alembic import command
    from alembic.config import Config
    import uvicorn

    root = Path(__file__).resolve().parent
    (root / 'data').mkdir(exist_ok=True)
    command.upgrade(Config(str(root / 'alembic.ini')), 'head')
    uvicorn.run('backend.main:app', host='127.0.0.1', port=8000)


if __name__ == "__main__":
    main()
