import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TimetablePanel } from "../features/timetable/TimetablePanel";

const request = vi.fn();
vi.mock("../api", () => ({api: (...args: unknown[]) => request(...args)}));
const settings = {week_one_monday: "2026-08-17", total_weeks: 20, version: 1};

beforeEach(() => {
  request.mockReset();
  request.mockImplementation(async (path: string) => path.endsWith("courses") ? [] : settings);
});
afterEach(() => vi.useRealTimers());

it("opens at the current teaching week after loading semester settings", async () => {
  vi.useFakeTimers({toFake: ["Date"]});
  vi.setSystemTime(new Date(2026, 8, 9, 12));
  render(<TimetablePanel active onDraftChange={() => {}} />);
  await waitFor(() => expect(screen.getByRole("combobox", {name: "教学周"})).toHaveValue("4"));
});

it("does not replace a course draft through another editor button", async () => {
  const user = userEvent.setup();
  render(<TimetablePanel active onDraftChange={() => {}} />);
  await user.click(await screen.findByRole("button", {name: "添加课程"}));
  await user.type(screen.getByRole("textbox", {name: "课程名"}), "草稿中的课程");
  expect(screen.getByRole("button", {name: "粘贴导入"})).toBeDisabled();
  expect(screen.getByRole("button", {name: "学期设置"})).toBeDisabled();
  expect(screen.getByRole("textbox", {name: "课程名"})).toHaveValue("草稿中的课程");
});

it("can retry an initial load failure", async () => {
  request.mockRejectedValueOnce(new Error("暂时离线"));
  const user = userEvent.setup();
  render(<TimetablePanel active onDraftChange={() => {}} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("暂时离线");
  await user.click(screen.getByRole("button", {name: /重试/}));
  expect(await screen.findByText(/还没有课程/)).toBeVisible();
});
