import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.staticfiles import StaticFiles
from sqlalchemy import create_engine

from .auth.router import router as auth_router
from .common.http import api_security, validation_error
from .database import ROOT, database_url
from .notes.router import router as notes_router
from .tasks.router import router as tasks_router
from .affairs.router import router as affairs_router
from .timetable.router import router as timetable_router
from .agent.router import router as agent_router
from .reminders.router import router as reminders_router
from .backup import router as backup_router


def create_app(url: str | None = None):
    @asynccontextmanager
    async def lifespan(app):
        yield
        app.state.engine.dispose()

    app = FastAPI(title="青笺 · Notes & Tasks", version="0.2.0", lifespan=lifespan)
    url = url or database_url()
    app.state.engine = create_engine(
        url,
        connect_args={"check_same_thread": False} if url.startswith("sqlite") else {},
        pool_pre_ping=True,
    )
    app.state.cookie_secure = os.getenv("COOKIE_SECURE", "false").lower() == "true"
    app.state.trusted_origins = {
        value.strip().rstrip("/")
        for value in os.getenv("TRUSTED_ORIGINS", "").split(",")
        if value.strip()
    }
    app.middleware("http")(api_security)
    app.add_exception_handler(RequestValidationError, validation_error)
    app.include_router(auth_router)
    app.include_router(notes_router)
    app.include_router(tasks_router)
    app.include_router(affairs_router)
    app.include_router(timetable_router)
    app.include_router(agent_router)
    app.include_router(reminders_router)
    app.include_router(backup_router)

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    dist = ROOT / "frontend" / "dist"
    if dist.is_dir():
        app.mount("/", StaticFiles(directory=dist, html=True), name="frontend")
    return app


app = create_app()
