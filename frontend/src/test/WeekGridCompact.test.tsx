import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { WeekGrid } from "../features/timetable/WeekGrid";
import { blankMeeting, type Course } from "../features/timetable/types";

it("renders a continuous meeting once and keeps overlapping meetings in separate lanes", () => {
  const course: Course = {id:"c1", version:1, code:"CS", title:"程序设计", class_name:"1班", campus:"东区", meetings:[
    {...blankMeeting(), start_period:1, end_period:4, teacher:"陈老师", location:"A101"},
    {...blankMeeting(), start_period:3, end_period:5, teacher:"周老师", location:"B202"},
  ]};
  const { container } = render(<WeekGrid courses={[course]} week={1} />);
  expect(screen.getAllByText("程序设计")).toHaveLength(2);
  const cards = [...container.querySelectorAll<HTMLElement>(".tt-course")];
  expect(cards).toHaveLength(2);
  expect(cards[0].style.gridRow).toBe("1 / 5");
  expect(cards[1].style.gridRow).toBe("3 / 6");
  expect(cards[0].style.gridColumn).not.toBe(cards[1].style.gridColumn);
  expect(screen.getAllByText("冲突")).toHaveLength(2);
  expect(screen.getByText("14")).toBeVisible();
});

it("keeps single-period and late-evening classes, filtering out other teaching weeks", () => {
  const make = (id:string, start:number, end:number, startWeek=1): Course => ({
    id, version:1, title:id, code:"", class_name:"", campus:"",
    meetings:[{...blankMeeting(), day:7, start_period:start, end_period:end, start_week:startWeek}],
  });
  render(<WeekGrid courses={[make("晚课",13,14),make("单节课",7,7),make("下周课",1,2,2)]} week={1}/>);
  expect(screen.getByText("晚课")).toBeVisible();
  expect(screen.getByText("单节课")).toBeVisible();
  expect(screen.queryByText("下周课")).not.toBeInTheDocument();
});
