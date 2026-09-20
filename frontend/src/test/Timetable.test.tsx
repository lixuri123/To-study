import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { TimetablePanel } from "../features/timetable/TimetablePanel";

const apiMock = vi.fn();
vi.mock("../api", () => ({api: (...args: unknown[]) => apiMock(...args)}));
const existing = {id:"c1",version:2,code:"CS101",title:"程序设计",class_name:"计科1班",campus:"东区",meetings:[{day:1,start_period:1,end_period:2,start_week:1,end_week:20,parity:"all",teacher:"陈老师",location:"A101"},{day:1,start_period:2,end_period:3,start_week:1,end_week:20,parity:"all",teacher:"周老师",location:"A102"}]};

beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockImplementation(async (path:string) => path.endsWith("/courses") ? [existing] : {week_one_monday:null,total_weeks:20,version:0});
});

it("loads only while active and renders every overlapping course meeting", async () => {
  const {rerender}=render(<TimetablePanel active={false} onDraftChange={()=>{}}/>);
  expect(apiMock).not.toHaveBeenCalled();
  rerender(<TimetablePanel active onDraftChange={()=>{}}/>);
  const grid = screen.getByRole("region", {name:"第 1 周课表"});
  expect(await within(grid).findAllByText("程序设计")).toHaveLength(2);
  expect(within(grid).getAllByText("冲突")).toHaveLength(2);
  expect(screen.getByText(/陈老师 · A101/)).toBeVisible();
  expect(apiMock).toHaveBeenCalledWith("/timetable/courses");
});

it("previews imports unchecked, retains row errors, and imports selected candidates", async () => {
  apiMock.mockImplementation(async (path:string, method="GET", body?:unknown) => {
    if(path.endsWith("/courses")&&method==="GET") return [];
    if(path.endsWith("/settings")) return {week_one_monday:null,total_weeks:20,version:0};
    if(path.endsWith("/preview")) return {courses:[{...existing,id:undefined,version:undefined}],errors:[{line:3,text:"坏数据",message:"无法识别"}]};
    if(path.endsWith("/import")) return {created:[existing],skipped:0};
    throw new Error(String(body));
  });
  const user=userEvent.setup(); render(<TimetablePanel active onDraftChange={()=>{}}/>);
  await user.click(await screen.findByRole("button",{name:"粘贴导入"}));
  await user.type(screen.getByLabelText("课程表原文"),"原始课程表");
  await user.click(screen.getByRole("button",{name:"预览"}));
  const candidate=await screen.findByRole("checkbox",{name:/程序设计/});
  expect(candidate).not.toBeChecked();
  expect(screen.getByText(/第 3 行/)).toHaveTextContent("坏数据");
  await user.click(screen.getByRole("button",{name:/全选/}));
  expect(screen.getByText("已选择 1 / 1 门")).toBeVisible();
  await user.click(screen.getByRole("button",{name:"导入所选"}));
  expect(await screen.findByText("已导入 1 门，跳过 0 门重复课程。" )).toBeVisible();
});

it("edits complete course metadata and multiple meetings while preserving a failed draft", async () => {
  apiMock.mockImplementation(async (path:string, method="GET") => {
    if(path.endsWith("/courses")&&method==="GET") return [existing];
    if(path.endsWith("/settings")) return {week_one_monday:null,total_weeks:20,version:0};
    if(method==="PUT") throw new Error("离线");
  });
  const dirty=vi.fn(); const user=userEvent.setup(); render(<TimetablePanel active onDraftChange={dirty}/>);
  await user.click(await screen.findByText("全部课程", {exact:false, selector:"summary"}));
  await user.click(await screen.findByRole("button",{name:/编辑 程序设计/}));
  const title=screen.getByLabelText("课程名"); await user.clear(title); await user.type(title,"高级程序设计");
  expect(screen.getAllByRole("group",{name:/安排/})).toHaveLength(2);
  await user.click(screen.getByRole("button",{name:"添加安排"}));
  expect(screen.getAllByRole("group",{name:/安排/})).toHaveLength(3);
  await user.click(screen.getByRole("button",{name:"保存课程"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("离线");
  expect(title).toHaveValue("高级程序设计");
  await waitFor(()=>expect(dirty).toHaveBeenLastCalledWith(true));
});

it("saves Monday term settings and reports an unset start date", async () => {
  apiMock.mockImplementation(async (path:string, method="GET", body:any) => {
    if(path.endsWith("/courses")) return [];
    if(method==="PUT") return {...body,version:1};
    return {week_one_monday:null,total_weeks:20,version:0};
  });
  const user=userEvent.setup(); render(<TimetablePanel active onDraftChange={()=>{}}/>);
  expect(await screen.findByText("尚未设置第一周周一日期")).toBeVisible();
  await user.click(screen.getByRole("button",{name:"学期设置"}));
  await user.type(screen.getByLabelText("第一周周一"),"2026-09-07");
  await user.click(screen.getByRole("button",{name:"保存设置"}));
  await waitFor(()=>expect(apiMock).toHaveBeenCalledWith("/timetable/settings","PUT",{week_one_monday:"2026-09-07",total_weeks:20,version:0}));
});
