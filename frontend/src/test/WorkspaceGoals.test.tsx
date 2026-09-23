import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { Workspace } from "../layouts/Workspace";

it("opens one generic goals destination and protects a dirty goal draft", async () => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const data = url.endsWith("/goals/templates") ? [] : url.endsWith("/goals") ? [{ id: "g1", title: "准备毕业", description: "", updated_at: "2026-09-20T08:00:00Z", archived_at: null, summary: { attained: false, blocks: [] } }, { id: "g2", title: "已完成", description: "", updated_at: "2026-09-20T08:00:00Z", archived_at: null, summary: { attained: true, blocks: [] } }] : url.endsWith("/notes") || url.endsWith("/tasks") || url.endsWith("/affairs") ? [] : {};
    return new Response(JSON.stringify(data), { status: 200 });
  }));
  const user = userEvent.setup();
  render(<Workspace user={{ id: "u1", username: "alice" }} onLogout={() => {}} />);
  await waitFor(() => expect(screen.getByRole("button", { name: /我的目标/ })).toHaveTextContent("1"));
  expect(within(screen.getByRole("navigation")).getAllByRole("button")).toHaveLength(5);
  expect(screen.queryByRole("button", { name: /^综合素质/ })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /我的目标/ }));
  await user.click(await screen.findByRole("button", { name: "新建目标" }));
  await user.type(screen.getByLabelText("目标名称"), "准备毕业");
  expect(screen.getByRole("button", { name: /待办清单/ })).toBeDisabled();
  expect(screen.getByRole("button", { name: "退出登录" })).toBeDisabled();
  const close = vi.fn();
  act(() => { window.dispatchEvent(new CustomEvent("qingjian:before-close", { cancelable: true, detail: close })); });
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByText("目标有未保存修改，请先保存或取消编辑。")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "取消编辑" }));
  expect(screen.getByRole("button", { name: /待办清单/ })).toBeEnabled();
  expect(screen.getByRole("button", { name: "退出登录" })).toBeEnabled();
});
