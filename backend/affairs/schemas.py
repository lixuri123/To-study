from datetime import date, datetime, time, timedelta, timezone
import base64
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from ..common.schemas import Title


class Attachment(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    data: str = Field(max_length=2800000)

    @field_validator("data")
    @classmethod
    def valid_file(cls, value):
        header, separator, encoded = value.partition(",")
        if not separator or header not in {"data:image/png;base64", "data:image/jpeg;base64", "data:application/pdf;base64", "data:text/plain;base64"}:
            raise ValueError("附件仅支持 PNG、JPEG、PDF 或文本")
        decoded = base64.b64decode(encoded, validate=True)
        if len(decoded) > 2 * 1024 * 1024:
            raise ValueError("单个附件不能超过 2 MB")
        return value


class Reminder(BaseModel):
    at: datetime
    label: str = Field(default="提醒", max_length=100)
    acknowledged: bool = False
    repeat_minutes: int = Field(default=0, ge=0, le=10080)
    repeat_limit: int = Field(default=3, ge=1, le=10)
    anchor: Literal["custom", "starts_at", "ends_at"] = "custom"
    offset_minutes: int = Field(default=0, ge=0, le=525600)
    timezone_offset: int = Field(default=-480, ge=-840, le=840)

    @field_validator("at")
    @classmethod
    def timezone_required(cls, value):
        if value.tzinfo is None:
            raise ValueError("提醒需要明确时区")
        return value


class CaptureAttempt(BaseModel):
    state: Literal["success", "partial", "failed"]
    method: str = Field(default="", max_length=100)
    error_kind: Literal["", "timeout", "verification", "network", "extraction", "unknown"] = ""
    detail: str = Field(default="", max_length=2000)
    missing: list[str] = Field(default_factory=list, max_length=20)

    @field_validator("missing")
    @classmethod
    def bounded_missing(cls, value):
        if any(len(item) > 300 for item in value):
            raise ValueError("缺失项过长")
        return value


class PendingQuestion(BaseModel):
    question: str = Field(min_length=1, max_length=300)
    answer: str = Field(default="", max_length=1000)


class MonitorStatus(BaseModel):
    enabled: bool = True
    schedule: Literal["09:00,18:00 Asia/Shanghai"] = "09:00,18:00 Asia/Shanghai"
    state: Literal["pending", "success", "partial", "failed"] = "pending"
    checked_at: str = Field(default="", max_length=40)
    last_success_at: str = Field(default="", max_length=40)
    detail: str = Field(default="", max_length=2000)
    seen_links: list[str] = Field(default_factory=list, max_length=500)

    @field_validator("seen_links")
    @classmethod
    def valid_links(cls, values):
        if any(len(x) > 2000 or not x.startswith(("https://", "http://")) for x in values):
            raise ValueError("监控链接无效")
        return values


class AffairInput(BaseModel):
    title: Title
    source_information_id: str | None = None
    kind: Literal["information", "affair"] = "information"
    status: Literal["inbox", "pending", "doing", "completed", "cancelled"] = "inbox"
    original: str = Field(default="", max_length=100000)
    summary: str = Field(default="", max_length=10000)
    source_name: str = Field(default="", max_length=200)
    source_url: str = Field(default="", max_length=2000)
    published_at: str = ""
    starts_at: str = ""
    ends_at: str = ""
    time_uncertain: bool = False
    pending_questions: list[PendingQuestion] = Field(default_factory=list, max_length=30)
    source_reviewed_version: int = Field(default=0, ge=0)
    monitor: MonitorStatus | None = None
    note_ids: list[str] = Field(default_factory=list, max_length=100)
    reminders: list[Reminder] = Field(default_factory=list, max_length=50)
    completion_criteria: str = Field(default="", max_length=2000)
    proof: str = Field(default="", max_length=10000)
    attachments: list[Attachment] = Field(default_factory=list, max_length=3)

    @field_validator("source_url")
    @classmethod
    def safe_url(cls, value):
        if value and not value.startswith(("https://", "http://")):
            raise ValueError("来源链接必须以 http:// 或 https:// 开头")
        return value

    @field_validator("published_at", "starts_at", "ends_at")
    @classmethod
    def valid_time(cls, value):
        if not value:
            return value
        if len(value) == 10:
            date.fromisoformat(value)
        else:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                raise ValueError("具体时间需要时区")
        return value

    @model_validator(mode="after")
    def ordered_times(self):
        if self.starts_at and self.ends_at:
            if len(self.starts_at) > 10 and len(self.ends_at) > 10:
                invalid = datetime.fromisoformat(self.starts_at.replace("Z", "+00:00")) > datetime.fromisoformat(self.ends_at.replace("Z", "+00:00"))
            else:
                invalid = self.starts_at[:10] > self.ends_at[:10]
            if invalid:
                raise ValueError("开始时间不能晚于截止时间")
        for reminder in self.reminders:
            if reminder.anchor == "custom":
                continue
            value = getattr(self, reminder.anchor)
            if not value:
                raise ValueError("相对提醒需要对应的开始或截止时间，请先移除关联提醒")
            if len(value) == 10:
                base = datetime.combine(date.fromisoformat(value), time(23, 59) if reminder.anchor == "ends_at" else time(), tzinfo=timezone(timedelta(minutes=-reminder.timezone_offset)))
            else:
                base = datetime.fromisoformat(value.replace("Z", "+00:00"))
            reminder.at = base - timedelta(minutes=reminder.offset_minutes)
        return self


class AffairUpdate(AffairInput):
    version: int
