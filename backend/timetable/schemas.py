from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

Text = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]
Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Week = Annotated[int, Field(strict=True, ge=1, le=53)]
Period = Annotated[int, Field(strict=True, ge=1, le=14)]


class Meeting(BaseModel):
    day: Annotated[int, Field(strict=True, ge=1, le=7)]
    start_period: Period
    end_period: Period
    start_week: Week
    end_week: Week
    parity: Literal["all", "odd", "even"] = "all"
    teacher: Text = ""
    location: Text = ""

    @model_validator(mode="after")
    def valid_ranges(self):
        if self.start_period > self.end_period:
            raise ValueError("开始节次不能晚于结束节次")
        if self.start_week > self.end_week:
            raise ValueError("开始周不能晚于结束周")
        if self.start_week == self.end_week and (
            self.parity == "odd" and self.start_week % 2 == 0
            or self.parity == "even" and self.start_week % 2 == 1
        ):
            raise ValueError("所选周次与单双周设置不符，没有上课周")
        return self


class CourseInput(BaseModel):
    code: Text = ""
    title: Title
    class_name: Text = ""
    campus: Text = ""
    meetings: Annotated[list[Meeting], Field(min_length=1, max_length=100)]


class CourseUpdate(CourseInput):
    version: Annotated[int, Field(strict=True, ge=1)]


class CourseOutput(CourseInput):
    id: str
    version: int


class SettingsInput(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    week_one_monday: date | None = None
    total_weeks: Week = 20
    version: Annotated[int, Field(strict=True, ge=0)] = 0

    @model_validator(mode="after")
    def monday(self):
        if self.week_one_monday and self.week_one_monday.weekday() != 0:
            raise ValueError("请选择学期第一周的周一日期")
        return self


class PreviewInput(BaseModel):
    text: Annotated[str, Field(min_length=1, max_length=100000)]


class ImportInput(BaseModel):
    courses: Annotated[list[CourseInput], Field(min_length=1, max_length=100)]
