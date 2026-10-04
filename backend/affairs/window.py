"""Generate optional window reminders without changing legacy reminders."""
from datetime import date, datetime, time, timedelta, timezone

from pydantic import BaseModel, Field


class WindowRule(BaseModel):
    clock: str = Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    timezone_offset: int = Field(default=-480, ge=-840, le=840)
    on_start: bool = True
    before_days: list[int] = Field(default_factory=lambda: [3, 1], max_length=10)
    every_days: int | None = Field(default=None, ge=1, le=30)


def generate_window(rule, starts_at, ends_at, reminders, reminder_type):
    if not starts_at or not ends_at:
        raise ValueError("区间提醒需要开始和截止日期")
    if len(set(rule.before_days)) != len(rule.before_days) or any(day < 0 or day > 365 for day in rule.before_days):
        raise ValueError("截止前天数需为0至365，且不能重复")
    tz = timezone(timedelta(minutes=-rule.timezone_offset))
    def boundary(value, end=False):
        if len(value) == 10:
            return datetime.combine(date.fromisoformat(value), time.max if end else time.min, tzinfo=tz)
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(tz)
    start, end = boundary(starts_at), boundary(ends_at, True)
    if start > end:
        raise ValueError("开始时间不能晚于截止时间")
    clock = time.fromisoformat(rule.clock)
    previous = {row.window_key: row for row in reminders if row.window_key}
    result = [row for row in reminders if not row.window_key]
    def add(key, at, label, expires):
        if any(row.window_key and row.at == at for row in result):
            return
        old = previous.get(key)
        result.append(reminder_type(at=at, label=label, window_key=key, expires_at=expires,
                                   acknowledged=bool(old and old.at == at and old.acknowledged)))
    if rule.on_start:
        at = max(start, datetime.combine(start.date(), clock, tzinfo=tz))
        if at <= end:
            add("start", at, "办理已开放", end)
    for days in sorted(rule.before_days, reverse=True):
        at = min(end, datetime.combine(end.date() - timedelta(days=days), clock, tzinfo=tz))
        add(f"before-{days}", at, "截止当天" if days == 0 else f"截止前{days}天", end)
    if rule.every_days:
        if (end.date() - start.date()).days >= 366:
            raise ValueError("期间重复提醒最多支持366天，请缩短日期范围")
        day = start.date()
        while day <= end.date():
            at = max(start, datetime.combine(day, clock, tzinfo=tz))
            expires = min(end, datetime.combine(day, time.max, tzinfo=tz))
            if at <= expires:
                add(f"during-{day.isoformat()}", at, "办理期间，请及时完成", expires)
            day += timedelta(days=rule.every_days)
    if len(result) > 416:
        raise ValueError("提醒数量过多，请减少自定义提醒或期间频率")
    return result
