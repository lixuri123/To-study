from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from threading import Barrier

import pytest
from test_api import account

pytest_plugins = ["test_api"]


def course():
    return {"code": "001", "title": "论文写作", "class_name": "1班", "campus": "西土城",
            "meetings": [{"day": 2, "start_period": 8, "end_period": 9,
                          "start_week": 4, "end_week": 18, "parity": "even",
                          "teacher": "刘老师", "location": "3-130"}]}


def test_course_crud_and_account_isolation(client):
    assert client.get("/api/timetable/courses").status_code == 401
    a, b = account(client), account(client, "bobby")
    result = client.post("/api/timetable/courses", headers=a, json=course())
    assert result.status_code == 201
    saved = result.json()
    assert saved["meetings"] == course()["meetings"]
    assert client.get("/api/timetable/courses", headers=b).json() == []
    path = "/api/timetable/courses/" + saved["id"]
    assert client.put(path, headers=b, json=saved).status_code == 404
    assert client.delete(path, headers=b).status_code == 404
    updated = client.put(path, headers=a, json={**saved, "title": "修改后的课名"})
    assert updated.status_code == 200
    assert updated.json()["version"] == saved["version"] + 1
    assert client.put(path, headers=a, json=saved).status_code == 409
    assert client.get("/api/timetable/courses", headers=a).json()[0]["title"] == "修改后的课名"
    assert client.delete(path, headers=a).status_code == 204
    assert client.get("/api/timetable/courses", headers=a).json() == []


@pytest.mark.parametrize("changes", [
    {"day": 0}, {"day": 8}, {"start_period": 10, "end_period": 9}, {"end_period": 15},
    {"start_week": 20, "end_week": 19}, {"start_week": 0}, {"end_week": 54},
    {"start_week": 5, "end_week": 5, "parity": "even"}, {"parity": "bad"},
])
def test_invalid_meetings(client, changes):
    data = course()
    data["meetings"][0].update(changes)
    assert client.post("/api/timetable/courses", headers=account(client), json=data).status_code == 422


def test_atomic_import_and_duplicates(client):
    headers = account(client)
    alternate = {**course(), "class_name": "2班"}
    result = client.post("/api/timetable/import", headers=headers, json={"courses": [course(), course(), alternate]})
    assert result.status_code == 200
    assert len(result.json()["created"]) == 2
    assert result.json()["skipped"] == 1
    assert client.post("/api/timetable/import", headers=headers, json={"courses": [course()]}).json()["skipped"] == 1
    bad = deepcopy(course())
    bad["meetings"] = []
    assert client.post("/api/timetable/import", headers=headers, json={"courses": [{**course(), "title": "新课程"}, bad]}).status_code == 422
    assert len(client.get("/api/timetable/courses", headers=headers).json()) == 2


def test_settings_validation_and_versions(client):
    a, b = account(client), account(client, "bobby")
    defaults = client.get("/api/timetable/settings", headers=a).json()
    assert defaults == {"week_one_monday": None, "total_weeks": 20, "version": 0}
    value = {**defaults, "week_one_monday": "2026-09-07"}
    assert client.put("/api/timetable/settings", headers=a, json=value).status_code == 200
    assert client.put("/api/timetable/settings", headers=a, json=value).status_code == 409
    current = client.get("/api/timetable/settings", headers=a).json()
    assert current["week_one_monday"] == "2026-09-07"
    assert client.get("/api/timetable/settings", headers=b).json() == defaults
    for changes in ({"week_one_monday": "2026-09-08"}, {"total_weeks": 54}, {"total_weeks": 0}, {"week_one_monday": "bad"}):
        assert client.put("/api/timetable/settings", headers=a, json={**current, **changes}).status_code == 422


def test_preview_does_not_save(client):
    headers = account(client)
    raw = "学院\t001\t机器学习\t机器学习1班\t教师\t100\t\t[西土城]星期四(3-4节)[4-19周,教师:薛哲,地点:3-132]\t3-132\n错误行"
    response = client.post("/api/timetable/preview", headers=headers, json={"text": raw})
    assert response.status_code == 200
    preview = response.json()
    assert len(preview["courses"]) == 1
    assert preview["errors"][0]["line"] == 2
    assert client.get("/api/timetable/courses", headers=headers).json() == []


def test_overlapping_imports_skip_duplicates(client):
    headers = account(client)
    barrier = Barrier(2)
    candidates = [{**course(), "code": str(index)} for index in range(100)]

    def upload():
        barrier.wait(timeout=10)
        return client.post("/api/timetable/import", headers=headers, json={"courses": candidates})

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: upload(), range(2)))
    assert [r.status_code for r in results] == [200, 200]
    assert sum(len(r.json()["created"]) for r in results) == 100
    assert sum(r.json()["skipped"] for r in results) == 100
    assert len(client.get("/api/timetable/courses", headers=headers).json()) == 100
