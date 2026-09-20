"""Pure parser for tab-delimited school timetable exports."""

from __future__ import annotations

import re
from dataclasses import dataclass

_DAY_NUMBERS = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "日": 7, "天": 7}
_DAY_RE = re.compile(r"^星期([一二三四五六日天])\(([^()]*)\)(\[[^\[\]]*\])?$")
_PERIOD_RE = re.compile(r"^(\d+)(?:-(\d+))?节(?:[,，](.*))?$")
_WEEK_RE = re.compile(r"^(\d+)(?:-(\d+))?(周|单周|双周)$")


class _ParseError(ValueError):
    pass


@dataclass(frozen=True)
class _Range:
    start_week: int
    end_week: int
    parity: str


def _split_attributes(value: str) -> tuple[_Range | None, dict[str, str]]:
    value = value.strip()
    if value.startswith("[") and value.endswith("]"):
        value = value[1:-1]
    if not value:
        raise _ParseError

    week_range: _Range | None = None
    attributes: dict[str, str] = {}
    for token in re.split(r"[,，]", value):
        token = token.strip()
        week_match = _WEEK_RE.fullmatch(token)
        if week_match:
            if week_range is not None:
                raise _ParseError
            start = int(week_match.group(1))
            end = int(week_match.group(2) or start)
            parity = {"周": "all", "单周": "odd", "双周": "even"}[week_match.group(3)]
            if not (1 <= start <= end <= 53):
                raise _ParseError
            if parity == "odd" and not any(week % 2 for week in range(start, end + 1)):
                raise _ParseError
            if parity == "even" and not any(week % 2 == 0 for week in range(start, end + 1)):
                raise _ParseError
            week_range = _Range(start, end, parity)
            continue

        attribute_match = re.fullmatch(r"(教师|地点):(.*)", token)
        if not attribute_match or not attribute_match.group(2).strip():
            raise _ParseError
        key = {"教师": "teacher", "地点": "location"}[attribute_match.group(1)]
        if key in attributes:
            raise _ParseError
        attributes[key] = attribute_match.group(2).strip()
    return week_range, attributes


def _meeting(day: int, periods: tuple[int, int], weeks: _Range, attributes: dict[str, str]) -> dict:
    teacher = attributes.get("teacher")
    location = attributes.get("location")
    if teacher is None or location is None:
        raise _ParseError
    return {
        "day": day,
        "start_period": periods[0],
        "end_period": periods[1],
        "start_week": weeks.start_week,
        "end_week": weeks.end_week,
        "parity": weeks.parity,
        "teacher": teacher,
        "location": location,
    }


def _parse_day_group(value: str) -> tuple[int, tuple[int, int], list[dict] | None, tuple[_Range | None, dict[str, str]] | None]:
    match = _DAY_RE.fullmatch(value.strip())
    if not match:
        raise _ParseError
    day = _DAY_NUMBERS[match.group(1)]
    period_match = _PERIOD_RE.fullmatch(match.group(2).strip())
    if not period_match:
        raise _ParseError
    start_period = int(period_match.group(1))
    end_period = int(period_match.group(2) or start_period)
    if not (1 <= start_period <= end_period <= 14):
        raise _ParseError
    periods = (start_period, end_period)

    suffix = _split_attributes(match.group(3)) if match.group(3) else None
    segment_text = period_match.group(3)
    if segment_text is None:
        if suffix is None or suffix[0] is None:
            return day, periods, None, suffix
        return day, periods, [_meeting(day, periods, suffix[0], suffix[1])], suffix

    shared_attributes = suffix[1] if suffix else {}
    if suffix and suffix[0] is not None:
        raise _ParseError
    meetings: list[dict] = []
    for segment in segment_text.split("、"):
        segment_match = re.fullmatch(r"([^\[\]]+)(\[[^\[\]]*\])", segment.strip())
        if not segment_match:
            raise _ParseError
        weeks, local_attributes = _split_attributes(segment_match.group(1))
        if weeks is None:
            raise _ParseError
        bracket_weeks, bracket_attributes = _split_attributes(segment_match.group(2))
        if bracket_weeks is not None:
            raise _ParseError
        overlap = set(local_attributes) & set(bracket_attributes)
        if overlap:
            raise _ParseError
        attributes = {**shared_attributes, **local_attributes, **bracket_attributes}
        meetings.append(_meeting(day, periods, weeks, attributes))
    return day, periods, meetings, suffix


def _parse_schedule(value: str) -> tuple[str, list[dict]]:
    campus_match = re.fullmatch(r"\[([^\[\]]+)\](.+)", value.strip())
    if not campus_match:
        raise _ParseError
    campus = campus_match.group(1).strip()
    if not campus:
        raise _ParseError

    raw_groups = re.split(r"[;；]", campus_match.group(2))
    if any(not group.strip() for group in raw_groups):
        raise _ParseError
    parsed_groups = [_parse_day_group(group) for group in raw_groups]
    meetings: list[dict] = []
    bare_groups = [group for group in parsed_groups if group[2] is None]
    explicit_groups = [group for group in parsed_groups if group[2] is not None]
    if bare_groups:
        if len(raw_groups) < 2 or len(explicit_groups) != 1:
            raise _ParseError
        shared = explicit_groups[0][3]
        if shared is None or shared[0] is None:
            raise _ParseError
        if any(group[3] is not None for group in bare_groups):
            raise _ParseError
        # In this export style the final bracket applies to every listed day.
        if explicit_groups[0] != parsed_groups[-1]:
            raise _ParseError
        for day, periods, _, _ in parsed_groups:
            meetings.append(_meeting(day, periods, shared[0], shared[1]))
    else:
        for _, _, group_meetings, _ in parsed_groups:
            meetings.extend(group_meetings or [])
    if not meetings:
        raise _ParseError
    return campus, meetings


def parse_timetable(text: str) -> dict:
    """Parse exported school timetable text without persisting any data."""

    courses: list[dict] = []
    errors: list[dict] = []
    for line_number, raw_line in enumerate(text.splitlines(), start=1):
        if not raw_line.strip():
            continue
        columns = raw_line.split("\t")
        if len(columns) < 8:
            errors.append({"line": line_number, "text": raw_line, "message": "课程行列数不足"})
            continue
        code, title, class_name = (columns[index].strip() for index in (1, 2, 3))
        if not code or not title or not class_name:
            errors.append({"line": line_number, "text": raw_line, "message": "课程基本信息不完整"})
            continue
        if any(len(value) > 200 for value in (code, title, class_name)):
            errors.append({"line": line_number, "text": raw_line, "message": "课程字段超过 200 字符"})
            continue
        try:
            campus, meetings = _parse_schedule(columns[7])
        except _ParseError:
            errors.append({"line": line_number, "text": raw_line, "message": "无法解析课程安排"})
            continue
        if len(campus) > 200 or any(
            len(meeting["teacher"]) > 200 or len(meeting["location"]) > 200 for meeting in meetings
        ):
            errors.append({"line": line_number, "text": raw_line, "message": "课程字段超过 200 字符"})
            continue
        if len(meetings) > 100:
            errors.append({"line": line_number, "text": raw_line, "message": "课程安排超过 100 条"})
            continue
        courses.append(
            {
                "code": code,
                "title": title,
                "class_name": class_name,
                "campus": campus,
                "meetings": meetings,
            }
        )
    return {"courses": courses, "errors": errors}
