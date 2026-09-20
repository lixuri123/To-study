from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints


class Credentials(BaseModel):
    username: Annotated[
        str,
        StringConstraints(
            strip_whitespace=True, min_length=3, max_length=40, pattern=r"^[\w.-]+$"
        ),
    ]
    password: str = Field(min_length=8, max_length=128)


class UserOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    username: str
