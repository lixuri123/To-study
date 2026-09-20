import { useEffect, useRef, useState } from "react";
import { BookOpen, CalendarDays, CheckCheck, Leaf, LoaderCircle, LogOut } from "lucide-react";
import { api, authApi, type User, type Note, type Task } from "../api";
import { Button, Confirm } from "../components/ui";
import { NotesPanel } from "../features/notes/NotesPanel";
import { useNotes } from "../features/notes/useNotes";
import { TasksPanel } from "../features/tasks/TasksPanel";
import { useTasks } from "../features/tasks/useTasks";
import { useWorkspaceActions } from "./useWorkspaceActions";
import { useDesktopCloseGuard } from "../desktop/useDesktopClose";
import { AffairsPanel } from "../features/affairs/AffairsPanel";
import { blankAffair, useAffairs } from "../features/affairs/useAffairs";
import { TimetablePanel } from "../features/timetable/TimetablePanel";
import { useDesktopNotifications } from "../desktop/useDesktopNotifications";
export function Workspace({ user, onLogout, active = true }: {
  user: User;
  active?: boolean;
  onLogout: () => void;
}) {
  const username=user.username;
  const [view, setView]=useState<"notes"|"tasks"|"affairs"|"timetable">("notes");
  const affairsModel = useAffairs(active);
  const notificationStatus = useDesktopNotifications(active);
  const [affairDirty, setAffairDirty] = useState(false);
  const [timetableDirty, setTimetableDirty] = useState(false);
  const [initialAffair, setInitialAffair] = useState<string | null>(null);
  const [loading, setLoading]=useState(true);
  const actions=useWorkspaceActions();
  const { busy, error, notice, confirm, setConfirm, setError, run }=actions;
  const notesModel=useNotes(actions, active);
  const tasksModel=useTasks(actions);
  const { notes, guard }=notesModel;
  const { tasks }=tasksModel;
  const navigationBusy = busy || tasksModel.hasPending || affairsModel.busy || affairDirty || timetableDirty;
  useEffect(()=>{
    const open=(event:Event)=>{
      const id=(event as CustomEvent<string>).detail;
      if(!active||navigationBusy||typeof id!=="string")return;
      guard(()=>{setInitialAffair(id);setView("affairs");void affairsModel.refresh();});
    };
    window.addEventListener("qingjian:open-affair",open);
    return()=>window.removeEventListener("qingjian:open-affair",open);
  },[active,navigationBusy,guard]);
  function createLinkedAffair() {
    guard(() => {
      const note = notesModel.selected;
      if (!note) return;
      void affairsModel.save({...blankAffair(), title: note.title, kind: "affair", status: "pending", note_ids: [note.id]}).then(item => {
        if (item) {setInitialAffair(item.id); setView("affairs");}
      });
    });
  }
  useDesktopCloseGuard(close => {
    if (navigationBusy) { actions.setNotice(timetableDirty ? "课表正在编辑或保存，请先完成或取消编辑。" : affairDirty ? "事务有未保存修改，请先保存或关闭编辑。" : "正在保存，请稍后再关闭窗口。"); return; }
    if (!active && notesModel.dirty) {
      setConfirm({title: "关闭前，保留这份草稿？", description: "登录已失效。继续编辑并重新登录后可以保存；放弃修改将关闭窗口。", label: "放弃修改", action: close});
      return;
    }
    guard(close);
  });
  const mounted=useRef(false);
  const loadGeneration=useRef(0);
  async function load() {
    const started=++loadGeneration.current;
    setLoading(true);
    setError("");
    try {
      const [n, t]=await Promise.all([api<Note[]>("/notes"), api<Task[]>("/tasks")]);
      if(mounted.current&&started===loadGeneration.current) {
        notesModel.initialize(n);
        tasksModel.setTasks(t);
      }
    }
    catch(error) {
      if(mounted.current&&started===loadGeneration.current)
        setError(error instanceof Error? error.message:"发生错误，请重试。");
    }
    finally {
      if(mounted.current&&started===loadGeneration.current)
        setLoading(false);
    }
  }
  useEffect(() => {
    mounted.current=true;
    void load();
    return () => { mounted.current=false; loadGeneration.current++; };
  }, []);
  return (<div className={view === "timetable" ? "workspace workspace-flame" : "workspace"}>
    <aside className="sidebar">
      <div className="brand">
        <Leaf />
        青笺<span>QINGJIAN</span>
      </div>
      <div className="sidebar-caption">我的空间</div>
      <nav>
        <button className={view === "timetable" ? "nav-item active" : "nav-item"} disabled={navigationBusy} onClick={() => guard(() => setView("timetable"))}><CalendarDays size={19} />我的课表</button>
        <button className={view === "affairs" ? "nav-item active" : "nav-item"} disabled={navigationBusy} onClick={() => guard(() => {setInitialAffair(null); setView("affairs");})}><CheckCheck size={19} />信息与事务<span>{affairsModel.items.filter(x => !["completed", "cancelled"].includes(x.status)).length}</span></button>
        <button className={view==="notes"? "nav-item active":"nav-item"} onClick={() => guard(() => setView("notes"))} disabled={navigationBusy}>
          <BookOpen size={19} />
          我的笔记<span>{notes.length.toString().padStart(2, "0")}</span>
        </button>
        <button className={view==="tasks"? "nav-item active":"nav-item"} onClick={() => guard(() => setView("tasks"))} disabled={navigationBusy}>
          <CheckCheck size={19} />
          待办清单
          <span>
            {tasks
              .filter((t) => !t.completed)
              .length.toString()
              .padStart(2, "0")}
          </span>
        </button>
      </nav>
      <div className="sidebar-quote">
        <span>“</span>
        <p>
          不必一次写完，
          <br />
          每一笔都算数。
        </p>
        <i>MAKE ROOM FOR IDEAS</i>
      </div>
      <div className="profile">
        <div className="avatar">{username.slice(0, 1)}</div>
        <div>
          <strong>{username}</strong>
          <small>你的私人工作台</small>
        </div>
        <button aria-label="退出登录" disabled={navigationBusy} onClick={() => guard(() => void run(async () => {
          await authApi("/auth/logout", "POST");
          onLogout();
        }))}>
          <LogOut size={17} />
        </button>
      </div>
    </aside>
    <main className="main">
      <header className="topbar">
        <span>
          个人工作台 <span className="slash">/</span>{" "}
          {view==="notes"? "笔记":view === "affairs" ? "信息与事务" : view === "timetable" ? "课表" : "待办"}
        </span>
        <span className="today">
          {new Date().toLocaleDateString("zh-CN", {
            month: "long",
            day: "numeric",
            weekday: "long",
          })}
        </span>
      </header>
      <section className="page-heading" hidden={view === "timetable"}>
        <div>
          <span className="eyebrow">
            {view==="notes"
              ? "COLLECT YOUR THOUGHTS"
              : view === "timetable" ? "A WEEK OF LEARNING" : "ONE THING AT A TIME"}
          </span>
          <h1>
            {view==="notes"? "想法，在这里生长。":view === "affairs" ? "重要的事，都有着落。" : view === "timetable" ? "每一周，学有所获。" : "一步一步，慢慢来。"}
          </h1>
          <p>
            {view==="notes"
              ? "记录灵感、日常与值得记住的小事。"
              : view === "timetable" ? "跟着教学周，安排好每一次学习。" : "把大大的计划，变成今天的小小行动。"}
          </p>
        </div>
        <span className="heading-mark" aria-hidden="true">
          {view==="notes"? <Leaf size={42} /> : view === "timetable" ? <CalendarDays size={42} /> : <CheckCheck size={42} />}
        </span>
      </section>
      {error&&(<div className="error banner" role="alert">
        {error}
        {!loading&&(<Button variant="ghost" onClick={() => guard(() => void load())}>重试</Button>)}
      </div>)}
      {notificationStatus&&<div className="notification-status" role="status">{notificationStatus}</div>}
      {notice&&(<div className="notice" role="status">
        {notice}
      </div>)}
      {!!affairsModel.due.length && <section className="affair-reminders" aria-label="到期提醒"><h3>待处理提醒 · {affairsModel.due.length}</h3>{affairsModel.due.map(({item, reminder, index}) => <div className="affair-toolbar" key={`${item.id}-${index}`}><span><strong>{item.title}</strong> · {reminder.label} · {new Date(reminder.at).toLocaleString("zh-CN")}</span><Button variant="ghost" disabled={navigationBusy} onClick={() => guard(() => {setInitialAffair(item.id); setView("affairs");})}>查看</Button><Button variant="ghost" disabled={navigationBusy} onClick={() => void affairsModel.save({...item, reminders: item.reminders.map((r, i) => i === index ? {...r, anchor: "custom" as const, at: new Date(Date.now() + 3600000).toISOString()} : r)})}>一小时后</Button><Button variant="ghost" disabled={navigationBusy} onClick={() => void affairsModel.save({...item, reminders: item.reminders.map((r, i) => i === index ? {...r, acknowledged: true} : r)})}>我已知晓</Button><Button variant="ghost" disabled={navigationBusy} onClick={() => void affairsModel.save({...item, status: "completed"})}>完成事务</Button></div>)}</section>}
      {affairsModel.error && view !== "affairs" && <div className="error" role="alert">信息与事务：{affairsModel.error}<Button variant="ghost" onClick={() => void affairsModel.refresh()}>重试</Button></div>}
      {view === "notes" && notesModel.selected && <div className="affair-backlinks">{affairsModel.items.filter(item => item.note_ids.includes(notesModel.selected!.id)).map(item => <Button variant="ghost" key={item.id} disabled={navigationBusy} onClick={() => guard(() => {setInitialAffair(item.id); setView("affairs");})}>关联{item.kind === "affair" ? "事务" : "信息"}：{item.title}</Button>)}</div>}
      {view === "notes" && notesModel.selected && <Button variant="ghost" disabled={navigationBusy} onClick={createLinkedAffair}>从这篇笔记创建关联事务</Button>}
      {loading? (<div className="empty" role="status">
        <LoaderCircle className="spin" />
        正在整理你的空间…
      </div>):view==="notes"? (<NotesPanel model={notesModel} busy={busy} />):view === "timetable" ? <TimetablePanel active={active} onDraftChange={setTimetableDirty} /> : view === "affairs" ? <AffairsPanel model={affairsModel} notes={notes} initial={initialAffair} consumeInitial={() => setInitialAffair(null)} onDraftChange={setAffairDirty} openNote={note => {notesModel.select(note); setView("notes");}} createNote={async title => {let created: Note | undefined; await run(async () => {created = await api<Note>("/notes", "POST", {title, content: ""}); notesModel.initialize([created, ...notes]);}); return created;}} /> : (<TasksPanel model={tasksModel} busy={busy} />)}
      <footer className="page-footer">
        <Leaf size={13} /> 青笺 · 给思绪一点留白
      </footer>
    </main>
    <Confirm value={confirm} onClose={() => setConfirm(null)} />
  </div>);
}


