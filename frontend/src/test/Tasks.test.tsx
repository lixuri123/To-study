import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import type { Task } from "../api";
import { TasksPanel } from "../features/tasks/TasksPanel";
import { useTasks } from "../features/tasks/useTasks";

const apiMock = vi.fn();
vi.mock("../api", async (load) => ({
  ...(await load<typeof import("../api")>()),
  api: (...args: unknown[]) => apiMock(...args),
}));

const today = new Date().toLocaleDateString("sv-SE");
const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString("sv-SE");
const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString("sv-SE");
const task = (id: string, title: string, due_date: string | null, completed = false): Task => ({
  id, title, due_date, completed, created_at: `2026-09-0${id.slice(-1)}T10:00:00Z`,
});

function Harness({ initial, busy = false }: { initial: Task[]; busy?: boolean }) {
  const [, rerender] = useState(0);
  const model = useTasks({
    busy,
    error: "",
    notice: "",
    confirm: null,
    setError: vi.fn(),
    setNotice: vi.fn(),
    setConfirm: vi.fn((value) => value?.action()),
    run: vi.fn(),
  });
  if (!model.tasks.length && initial.length) {
    model.tasks.push(...initial);
    queueMicrotask(() => rerender((n) => n + 1));
  }
  return <TasksPanel model={model} busy={busy} />;
}

beforeEach(() => apiMock.mockReset());

it("creates a task with an optional date", async () => {
  apiMock.mockResolvedValue(task("t1", "交报告", tomorrow));
  const user = userEvent.setup();
  render(<Harness initial={[]} />);
  await user.type(screen.getByLabelText("新待办"), "交报告");
  await user.type(screen.getByLabelText("新待办截止日期"), tomorrow);
  await user.click(screen.getByRole("button", { name: "添加待办" }));
  await waitFor(() => expect(apiMock).toHaveBeenCalledWith("/tasks", "POST", {
    title: "交报告", due_date: tomorrow,
  }));
});

it("edits title with Enter, cancels with Escape, and clears the date", async () => {
  apiMock.mockImplementation(async (_path, _method, body) => ({
    ...task("t1", "原标题", tomorrow), ...body,
  }));
  const user = userEvent.setup();
  render(<Harness initial={[task("t1", "原标题", tomorrow)]} />);
  await user.dblClick(await screen.findByText("原标题"));
  const title = screen.getByLabelText("编辑待办标题");
  await user.clear(title);
  await user.type(title, "取消标题{Escape}");
  expect(screen.getByText("原标题")).toBeVisible();
  await user.dblClick(screen.getByText("原标题"));
  await user.clear(screen.getByLabelText("编辑待办标题"));
  await user.type(screen.getByLabelText("编辑待办标题"), "新标题{Enter}");
  await waitFor(() => expect(apiMock).toHaveBeenCalledWith("/tasks/t1", "PATCH", { title: "新标题" }));
  await user.clear(screen.getByLabelText("新标题的截止日期"));
  await waitFor(() => expect(apiMock).toHaveBeenCalledWith("/tasks/t1", "PATCH", { due_date: null }));
});

it("filters today and overdue while excluding completed tasks", async () => {
  const user = userEvent.setup();
  render(<Harness initial={[
    task("t1", "今天", today), task("t2", "逾期", yesterday),
    task("t3", "已完成今天", today, true), task("t4", "未来", tomorrow),
  ]} />);
  await user.click(screen.getAllByRole("button", { name: "今天" }).find(button => button.hasAttribute("aria-pressed"))!);
  expect(screen.getByRole("checkbox", { name: "今天" })).toBeVisible();
  expect(screen.queryByText("已完成今天")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "已逾期" }));
  expect(screen.getByText("逾期")).toBeVisible();
  expect(screen.queryByRole("checkbox", { name: "今天" })).not.toBeInTheDocument();
});

it("sorts incomplete dated tasks first and keeps other rows usable during a pending request", async () => {
  let release!: (value: Task) => void;
  apiMock.mockImplementation((path, _method, body) => {
    if (path === "/tasks/t1") return new Promise<Task>((resolve) => { release = resolve; });
    return Promise.resolve({ ...task("t2", "第二项", tomorrow), ...body });
  });
  const user = userEvent.setup();
  render(<Harness initial={[
    task("t3", "已完成", yesterday, true), task("t4", "无日期", null),
    task("t2", "较晚", tomorrow), task("t1", "较早", today),
  ]} />);
  const rows = await screen.findAllByRole("checkbox");
  expect(rows.map((item) => item.getAttribute("aria-label"))).toEqual(["较早", "较晚", "无日期", "已完成"]);
  await user.click(screen.getByRole("checkbox", { name: "较早" }));
  expect(screen.getByRole("checkbox", { name: "较早" })).toBeDisabled();
  expect(screen.getByRole("checkbox", { name: "较晚" })).toBeEnabled();
  await user.click(screen.getByRole("checkbox", { name: "较晚" }));
  await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(2));
  release(task("t1", "较早", today, true));
});

it("shows a row error and retries the original operation", async () => {
  apiMock.mockRejectedValueOnce(new Error("连接失败")).mockResolvedValueOnce(task("t1", "重试项", today, true));
  const user = userEvent.setup();
  render(<Harness initial={[task("t1", "重试项", today)]} />);
  await user.click(await screen.findByRole("checkbox", { name: "重试项" }));
  await user.click(await screen.findByRole("button", { name: "重试待办操作：重试项" }));
  await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(2));
  expect(apiMock.mock.calls[1]).toEqual(apiMock.mock.calls[0]);
});
