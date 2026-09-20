# Timetable Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for the isolated parser and final review; integrate persistence and UI in this session.

**Goal:** Add a persistent personal timetable with school-text import and accurate weekly occurrences.

**Architecture:** FastAPI timetable router persists validated course JSON and per-account settings. A pure parser emits CourseInput candidates and line errors. React composes a weekly grid, import preview, settings, and course editor.

**Tech Stack:** Existing Python/FastAPI/SQLAlchemy/Alembic and React/TypeScript/Vitest; no new dependencies.

## Global Constraints
- Preserve existing account, notes, tasks and affairs data.
- Week ranges inclusive; parity is absolute teaching week parity.
- Keep separate class names and every meeting; never silently discard invalid import lines.
- Keep existing paper/green visual language and account authentication.
- Existing repository has no commits and all source is untracked; do not stage or commit unrelated files.

## Task 1: Parser
- [ ] Add `backend/timetable/parser.py`, `tests/test_timetable_parser.py` and sample fixture.
- [ ] Define `parse_timetable(text: str) -> dict` with `courses` and `errors` (line, text, message).
- [ ] Course shape: code, title, class_name, campus, meetings. Meeting: day (1–7), start_period/end_period (1–14), start_week/end_week (1–53), parity ('all'/'odd'/'even'), teacher, location.
- [ ] Test supplied text, mixed week-local and trailing attributes, multi-day schedules, parity and invalid lines before implementation. Run `.venv/Scripts/python.exe -m pytest tests/test_timetable_parser.py -q`.

## Task 2: Persistence
- [ ] Add `backend/timetable/{models,schemas,router}.py`, register models/router and create `alembic/versions/0005_timetable.py`.
- [ ] Test authenticated GET/PUT `/api/timetable/settings`, GET/POST `/courses`, PUT/DELETE `/courses/{id}`, POST `/preview` and POST `/import` under `/api/timetable`.
- [ ] Settings: week_one_monday (nullable ISO date, Monday), total_weeks (1–53), version. Course update: complete CourseInput plus version. Import body: courses, 1–100 entries. Preview: text, up to 100000 characters.
- [ ] Reject reversed ranges, no occurring parity week, bad Monday, empty meetings/title, unauthorized IDs. Atomic version check with HTTP 409. Exact duplicate imports skip.
- [ ] Run `.venv/Scripts/python.exe -m pytest tests/test_timetable.py -q` and migration regression.

## Task 3: UI
- [ ] Add `frontend/src/features/timetable/{types,calendar,useTimetable,TimetablePanel,CourseEditor,ImportPanel,WeekGrid,timetable.css}` with proper file extensions.
- [ ] Add tests to `frontend/src/test/Timetable.test.tsx` and `timetable-calendar.test.ts` before components/helpers.
- [ ] Integrate sidebar and draft/busy guard in Workspace. Load only on visiting timetable. Week selector and prev/next/current; local calendar date arithmetic; explicit term-outside state.
- [ ] Import preview with checkbox selection (none preselected), per-row errors, selected count, retry retaining input, duplicate feedback. Manual form edits all meeting fields, allows multiple meetings and deletion.
- [ ] Week grid keeps overlapping courses in side-by-side lanes, marks conflicts and shows week ranges/teacher/location. Add full-course management so courses outside current week remain editable.
- [ ] Save errors keep draft; discard via existing Confirm; beforeunload and desktop guard cover draft/pending state.
- [ ] Run `npm test -- --run` and `npm run build` in frontend.

## Task 4: Review and delivery
- [ ] Review requirements and implementation, fix significant findings with regression tests.
- [ ] Run backend suite, frontend suite and build; document usage in README.
