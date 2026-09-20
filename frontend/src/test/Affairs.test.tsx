import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { AffairsPanel } from "../features/affairs/AffairsPanel";
import { blankAffair, useAffairs } from "../features/affairs/useAffairs";
import { AffairDetail } from "../features/affairs/AffairDetail";

const apiMock = vi.fn();
vi.mock("../api", () => ({api: (...args: unknown[]) => apiMock(...args)}));
function Harness() {
  const model = useAffairs(true);
  return <AffairsPanel model={model} notes={[{id: "note-1", title: "备选课程", content: "分布式系统", updated_at: "2026-09-08"}]} openNote={vi.fn()} initial={null} consumeInitial={vi.fn()} onDraftChange={vi.fn()} createNote={vi.fn()} />;
}
it("collects a notice, turns it into an affair and saves its note link", async () => {
  apiMock.mockImplementation(async (_path, method, body) => method === "POST" || method === "PUT" ? {...blankAffair(), ...body, id: "affair-1", version: (body?.version ?? 0) + 1} : []);
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("button", {name: /快速记录/}));
  expect(screen.queryByLabelText("标题")).not.toBeInTheDocument();
  await user.type(screen.getByLabelText("记录内容"), "秋季选课\n下周开放选课，请提前准备。");
  await user.click(screen.getByRole("button", {name:"收下"}));
  await screen.findByRole("button",{name:"需要办理"});
  expect(screen.queryByLabelText("通知原文")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button",{name:"编辑全部信息"}));
  await user.selectOptions(screen.getByLabelText("记录类型"), "affair");
  await user.click(screen.getByLabelText("备选课程"));
  await user.click(screen.getByRole("button", {name: "保存"}));
  await waitFor(() => expect(apiMock).toHaveBeenCalledWith("/affairs/affair-1", "PUT", expect.objectContaining({title: "秋季选课", kind: "affair", status: "pending", note_ids: ["note-1"]})));
  expect(await screen.findByRole("button", {name: /备选课程/})).toBeEnabled();
});

it("groups child affairs, shared notes and actual reminders under the notice", async () => {
  const notice={...blankAffair(),id:"notice",title:"报到通知"};
  const child={...blankAffair(),id:"child",title:"现场报到",kind:"affair" as const,source_information_id:"notice",note_ids:["prep"],reminders:[{at:"2026-09-15T15:00:00+08:00",label:"检查证件",acknowledged:false}]};
  const select=vi.fn();
  render(<AffairDetail item={notice} items={[notice,child]} select={select} notes={[{id:"prep",title:"准备清单",content:"带证件",updated_at:"2026-09-13"}]} clock={Date.now()} busy={false} edit={vi.fn()} save={vi.fn()} openNote={vi.fn()}/>);
  expect(screen.getByText("0 / 1 项已完成")).toBeInTheDocument();
  expect(screen.getByText(/检查证件/)).toBeInTheDocument();
  expect(screen.getByRole("button",{name:/准备清单/})).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button",{name:/现场报到/}));
  expect(select).toHaveBeenCalledWith(child);
});
