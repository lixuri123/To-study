"""Model registry for Alembic and backwards-compatible imports."""

from .auth.models import AuthRateLimit, SessionToken, User
from .common.models import Base, identifier, now
from .notes.models import Note
from .tasks.models import Task
from .affairs.models import Affair
from .timetable.models import Course, TimetableSettings
from .agent.models import Profile, Receipt
from .reminders.models import Delivery

__all__ = [
    "Delivery",
    "Profile",
    "Receipt",
    "Course",
    "TimetableSettings",
    "Affair",
    "AuthRateLimit",
    "Base",
    "Note",
    "SessionToken",
    "Task",
    "User",
    "identifier",
    "now",
]
