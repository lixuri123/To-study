"""Compatibility exports; business implementations live with their modules."""

from .common.ownership import owned
from .notes.service import save_note
from .tasks.service import update_task

__all__ = ["owned", "save_note", "update_task"]
