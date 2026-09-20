from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ProfileData(BaseModel):
    model_config = ConfigDict(extra="forbid")
    major: str = Field(default="", max_length=100)
    degree: str = Field(default="", max_length=100)
    year: str = Field(default="", max_length=100)
    campus: str = Field(default="", max_length=100)
    research_direction: str = Field(default="", max_length=500)
    preferences: str = Field(default="", max_length=2000)


class Command(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_id: str = Field(min_length=8, max_length=100, pattern=r"^[A-Za-z0-9_.:-]+$")
    operation: Literal[
        "capture_information",
        "create_affair",
        "update_affair",
        "create_note",
        "link_note",
        "set_reminder",
        "update_profile",
        "record_capture_attempt",
    ]
    arguments: dict
