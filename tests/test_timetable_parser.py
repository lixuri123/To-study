from pathlib import Path

from backend.timetable.parser import parse_timetable

FIXTURE = Path(__file__).parent / "fixtures" / "timetable.txt"


def _row(code: str, title: str, class_name: str, schedule: str) -> str:
    return f"学院\t{code}\t{title}\t{class_name}\t教师列\t60\t\t{schedule}\t地点列"


def test_parses_all_supplied_rows_without_dropping_data():
    result = parse_timetable(FIXTURE.read_text(encoding="utf-8"))

    assert result["errors"] == []
    assert len(result["courses"]) == 46
    assert sum(len(course["meetings"]) for course in result["courses"]) == 76
    assert all(
        set(course) == {"code", "title", "class_name", "campus", "meetings"}
        for course in result["courses"]
    )
    assert all(
        set(meeting)
        == {
            "day",
            "start_period",
            "end_period",
            "start_week",
            "end_week",
            "parity",
            "teacher",
            "location",
        }
        for course in result["courses"]
        for meeting in course["meetings"]
    )


def test_preserves_class_distinction_for_same_course_code():
    result = parse_timetable(FIXTURE.read_text(encoding="utf-8"))
    machine_learning = [course for course in result["courses"] if course["code"] == "3131100006"]

    assert [course["class_name"] for course in machine_learning] == ["机器学习1班", "机器学习2班"]
    assert [course["meetings"][0]["teacher"] for course in machine_learning] == ["薛哲", "叶冠华"]


def test_parses_trailing_week_teacher_and_location_attributes():
    text = _row("C1", "课程", "课程1班", "[西土城]星期四(3-4节)[4-19周,教师:薛哲,地点:3-132]")

    result = parse_timetable(text)

    assert result == {
        "courses": [
            {
                "code": "C1",
                "title": "课程",
                "class_name": "课程1班",
                "campus": "西土城",
                "meetings": [
                    {
                        "day": 4,
                        "start_period": 3,
                        "end_period": 4,
                        "start_week": 4,
                        "end_week": 19,
                        "parity": "all",
                        "teacher": "薛哲",
                        "location": "3-132",
                    }
                ],
            }
        ],
        "errors": [],
    }


def test_expands_segmented_locations_with_shared_teacher():
    text = _row(
        "C2",
        "课程",
        "课程",
        "[西土城]星期四(8-9节,4-9周[地点:3-337]、10-17周[地点:线上授课]、18-19周[地点:3-337])[教师:王颖]",
    )

    meetings = parse_timetable(text)["courses"][0]["meetings"]

    assert [(m["start_week"], m["end_week"], m["teacher"], m["location"]) for m in meetings] == [
        (4, 9, "王颖", "3-337"),
        (10, 17, "王颖", "线上授课"),
        (18, 19, "王颖", "3-337"),
    ]


def test_expands_segmented_teachers_with_shared_location_and_single_week():
    text = _row(
        "C3",
        "讲座",
        "讲座",
        "[西土城]星期二(12-13节,4-7周[教师:甲]、8周[教师:乙]、9-10周[教师:甲])[地点:3-132]",
    )

    meetings = parse_timetable(text)["courses"][0]["meetings"]

    assert [(m["start_week"], m["end_week"], m["teacher"], m["location"]) for m in meetings] == [
        (4, 7, "甲", "3-132"),
        (8, 8, "乙", "3-132"),
        (9, 10, "甲", "3-132"),
    ]


def test_applies_trailing_attributes_to_each_day_in_multi_day_schedule():
    text = _row(
        "C4",
        "移动计算",
        "移动计算",
        "[西土城]星期二(6-7节);星期四(8-9节)[4-11周,教师:赵方,地点:未来学习大楼-419]",
    )

    meetings = parse_timetable(text)["courses"][0]["meetings"]

    assert [(m["day"], m["start_period"], m["end_period"]) for m in meetings] == [(2, 6, 7), (4, 8, 9)]
    assert all((m["start_week"], m["end_week"], m["teacher"], m["location"]) == (4, 11, "赵方", "未来学习大楼-419") for m in meetings)


def test_parses_even_week_range():
    text = _row("C5", "论文写作", "论文写作", "[西土城]星期二(1-2节)[4-18双周,教师:刘亮,地点:3-130]")

    meeting = parse_timetable(text)["courses"][0]["meetings"][0]

    assert (meeting["start_week"], meeting["end_week"], meeting["parity"]) == (4, 18, "even")


def test_reports_bad_row_and_continues_with_later_rows():
    bad = _row("BAD", "坏课程", "坏课程", "[西土城]星期八(1-2节)[4-5周,教师:甲,地点:A]")
    good = _row("GOOD", "好课程", "好课程", "[沙河]星期一(1-2节)[1周,教师:乙,地点:B]")

    result = parse_timetable(f"{bad}\n{good}")

    assert [course["code"] for course in result["courses"]] == ["GOOD"]
    assert result["errors"] == [{"line": 1, "text": bad, "message": "无法解析课程安排"}]


def test_rejects_whole_row_when_any_segment_is_invalid():
    bad = _row(
        "BAD",
        "坏课程",
        "坏课程",
        "[西土城]星期四(8-9节,4-9周[地点:A]、未知安排)[教师:甲]",
    )

    result = parse_timetable(bad)

    assert result["courses"] == []
    assert result["errors"] == [{"line": 1, "text": bad, "message": "无法解析课程安排"}]


def test_reports_non_tabular_nonblank_lines_but_ignores_blank_lines():
    result = parse_timetable("\nnot a timetable row\n\n")

    assert result == {
        "courses": [],
        "errors": [{"line": 2, "text": "not a timetable row", "message": "课程行列数不足"}],
    }


def test_reports_oversize_row_without_hiding_valid_rows():
    bad = _row("C" * 201, "坏课程", "坏课程", "[西土城]星期一(1-2节)[1周,教师:甲,地点:A]")
    good = _row("GOOD", "好课程", "好课程", "[沙河]星期一(1-2节)[1周,教师:乙,地点:B]")

    result = parse_timetable(f"{bad}\n{good}")

    assert [course["code"] for course in result["courses"]] == ["GOOD"]
    assert result["errors"] == [{"line": 1, "text": bad, "message": "课程字段超过 200 字符"}]


def test_rejects_attributes_on_bare_day_in_shared_multi_day_form():
    bad = _row(
        "BAD",
        "坏课程",
        "坏课程",
        "[西土城]星期二(6-7节)[教师:甲];星期四(8-9节)[4-11周,教师:乙,地点:B]",
    )

    result = parse_timetable(bad)

    assert result["courses"] == []
    assert result["errors"] == [{"line": 1, "text": bad, "message": "无法解析课程安排"}]


def test_rejects_conflicting_week_range_inside_segment_brackets():
    bad = _row(
        "BAD",
        "坏课程",
        "坏课程",
        "[西土城]星期一(1-2节,4-9周[10周,教师:甲,地点:A])",
    )

    result = parse_timetable(bad)

    assert result["courses"] == []
    assert result["errors"] == [{"line": 1, "text": bad, "message": "无法解析课程安排"}]
