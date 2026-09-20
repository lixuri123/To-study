import type { CSSProperties } from "react";
import { coursesForWeek } from "./calendar";
import type { Course } from "./types";

export function WeekGrid({ courses, week, onOpenCourse, disabled = false }: {
  courses: Course[]; week: number; onOpenCourse?: (course: Course) => void; disabled?: boolean;
}) {
  const items = coursesForWeek(courses, week);
  const periods = Array.from({ length: 14 }, (_, i) => i + 1);
  return <div className="tt-scroll" role="region" aria-label={`第 ${week} 周课表`} tabIndex={0}>
    <div className="tt-grid">
      <div className="tt-periods"><span className="tt-day-heading">节次</span><div className="tt-period-track">
        {periods.map(period => <span key={period}>{period}</span>)}
      </div></div>
      {[1, 2, 3, 4, 5, 6, 7].map(day => {
        const meetings = items.filter(item => item.meeting.day === day)
          .sort((a, b) => a.meeting.start_period - b.meeting.start_period || a.meeting.end_period - b.meeting.end_period);
        // Assign a separate lane to every overlap; adjacent meetings can reuse a lane.
        const laneEnds: number[] = [];
        const placed = meetings.map(item => {
          let lane = laneEnds.findIndex(end => end < item.meeting.start_period);
          if (lane < 0) lane = laneEnds.length;
          laneEnds[lane] = item.meeting.end_period;
          const conflict = meetings.some(other => other !== item && other.meeting.start_period <= item.meeting.end_period && other.meeting.end_period >= item.meeting.start_period);
          return { ...item, lane, conflict };
        });
        return <div className="tt-day" key={day}>
          <strong className="tt-day-heading">周{"一二三四五六日"[day - 1]}<small>{day > 5 ? "WEEKEND" : `0${day}`}</small></strong>
          <div className="tt-day-track" style={{ gridTemplateColumns: `repeat(${Math.max(1, laneEnds.length)}, minmax(0, 1fr))` }}>
            {placed.map(({ course, meeting, lane, conflict }) => {
              const description = `${course.title} · 第 ${meeting.start_period}–${meeting.end_period} 节 · ${meeting.teacher} · ${meeting.location} · ${meeting.start_week}–${meeting.end_week}周${meeting.parity === "odd" ? " 单周" : meeting.parity === "even" ? " 双周" : ""}${conflict ? " · 时间冲突" : ""}`;
              const style = { gridRow: `${meeting.start_period} / ${meeting.end_period + 1}`, gridColumn: lane + 1, "--course-accent": ["#ecab6b", "#c2b18b", "#cb927a"][courses.indexOf(course) % 3] } as CSSProperties;
              return <button type="button" className={`tt-course${conflict ? " has-conflict" : ""}${meeting.start_period === meeting.end_period ? " is-single" : ""}`}
                style={style} key={`${course.id}-${course.meetings.indexOf(meeting)}`} title={description} aria-label={description}
                disabled={disabled} onClick={() => onOpenCourse?.(course)}>
                <strong>{course.title}</strong>
                {conflict && <em>冲突</em>}
                <span>{meeting.teacher} · {meeting.location}</span>
                <small>{meeting.start_period}–{meeting.end_period} 节 · {meeting.start_week}–{meeting.end_week}周</small>
              </button>;
            })}
          </div>
        </div>;
      })}
    </div>
  </div>;
}
