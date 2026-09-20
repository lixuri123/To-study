import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { Workspace } from "../layouts/Workspace";

afterEach(() => vi.unstubAllGlobals());

it("opens the timetable from the sidebar and protects a course draft on navigation", async () => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const body = url.endsWith("/settings") ? {week_one_monday: null, total_weeks: 20, version: 0} : [];
    return new Response(JSON.stringify(body), {status: 200});
  }));
  const user = userEvent.setup();
  render(<Workspace user={{id: "u1", username: "alice"}} onLogout={() => {}} />);
  await screen.findByRole("button", {name: /新建笔记/});
  await user.click(screen.getByRole("button", {name: /我的课表/}));
  await user.click(await screen.findByRole("button", {name: /添加课程/}));
  expect(screen.getByRole("button", {name: /待办清单/})).toBeDisabled();
  expect(screen.getByRole("button", {name: "退出登录"})).toBeDisabled();
});
