from pydantic import BaseModel, ConfigDict, Field

from ..common.schemas import Title


class NoteInput(BaseModel):
    title: Title
    content: str = Field(default="", max_length=200000)


class NoteOutput(NoteInput):
    model_config = ConfigDict(from_attributes=True)
    id: str
    updated_at: str
