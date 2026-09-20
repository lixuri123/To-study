import { describe, expect, it } from "vitest";
import { coursesForWeek, maxBrowsableWeek, teachingWeek } from "../features/timetable/calendar";
import type { Course } from "../features/timetable/types";

const course: Course = {id:"c1",version:1,code:"CS1",title:"算法",class_name:"一班",campus:"东区",meetings:[{day:1,start_period:1,end_period:2,start_week:1,end_week:8,parity:"odd",teacher:"林老师",location:"A101"}]};

describe("timetable calendar", () => {
  it("filters occurrences using inclusive absolute teaching-week parity", () => {
    expect(coursesForWeek([course], 1)).toHaveLength(1);
    expect(coursesForWeek([course], 2)).toHaveLength(0);
    expect(coursesForWeek([course], 9)).toHaveLength(0);
  });

  it("keeps imported weeks browsable beyond the configured term", () => {
    expect(maxBrowsableWeek(20, [{...course, meetings:[{...course.meetings[0], end_week:24}]}])).toBe(24);
  });

  it("computes current week with local calendar days and reports outside term", () => {
    expect(teachingWeek("2026-09-07", 20, new Date(2026, 8, 7, 23))).toEqual({week:1,position:"inside"});
    expect(teachingWeek("2026-09-07", 20, new Date(2026, 8, 6, 23))).toEqual({week:1,position:"before"});
    expect(teachingWeek("2026-09-07", 2, new Date(2026, 8, 21))).toEqual({week:2,position:"after"});
    expect(teachingWeek(null, 20, new Date())).toBeNull();
  });
});
