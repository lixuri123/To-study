import { useRef, useState, type PointerEvent } from "react";
import { ArrowLeft, BookOpen, FileText, LoaderCircle, PanelLeftClose, PanelLeftOpen, Plus, RotateCcw, Save, Search, Trash2, X } from "lucide-react";
import { Button, Input } from "../../components/ui";
import { date } from "../../components/format";
import type { NotesModel } from "./useNotes";
import { MarkdownEditor, MarkdownModes, type Mode } from "./MarkdownEditor";
import "./notes.css";
export function NotesPanel({ model, busy, focused = false, onToggleFocus }: {
  model: NotesModel;
  busy: boolean;
  focused?: boolean;
  onToggleFocus?: () => void;
}) {
  const [mode, setMode] = useState<Mode>("write");
  const editorRef = useRef<HTMLElement>(null);
  const [paperWidth, setPaperWidth] = useState(() => {
    try { return Number(window.localStorage.getItem("qingjian:note-paper-width")) || 820; }
    catch { return 820; }
  });
  const { notes, selected, draft, setDraft, query, setQuery, dirty, saveState, editorOpen, setEditorOpen, select, guard, save, deleteNote, visibleNotes }=model;
  const [libraryHidden, setLibraryHidden] = useState(() => {
    try { return window.localStorage.getItem("qingjian:note-library-hidden") === "1"; }
    catch { return false; }
  });
  function toggleLibrary() {
    setLibraryHidden(hidden => {
      const next = !hidden;
      try { window.localStorage.setItem("qingjian:note-library-hidden", next ? "1" : "0"); }
      catch { /* Browsers may disable local storage. */ }
      return next;
    });
  }
  function resizePaper(event: PointerEvent<HTMLButtonElement>) {
    if (!editorRef.current) return;
    event.preventDefault();
    const center = editorRef.current.getBoundingClientRect().left + editorRef.current.clientWidth / 2;
    const move = (pointer: globalThis.PointerEvent) => {
      const available = Math.max(460, editorRef.current!.clientWidth - 24);
      const width = Math.round(Math.max(460, Math.min(available, Math.abs(pointer.clientX - center) * 2)));
      setPaperWidth(width);
      try { window.localStorage.setItem("qingjian:note-paper-width", String(width)); }
      catch { /* Browsers may disable local storage. */ }
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      document.body.classList.remove("resizing-note-paper");
    };
    document.body.classList.add("resizing-note-paper");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  }
  return (<section className={`notes-layout writing-mode-${mode} ${editorOpen? "show-editor":"show-library"}${libraryHidden || focused ? " library-collapsed" : ""}`}>
    <div className="note-library">
      <div className="section-title">
        <h2>
          笔记 <span>{notes.length}</span>
        </h2>
        <Button variant="ghost" aria-label="新建笔记" disabled={busy} onClick={() => guard(() => select(null))}>
          <Plus size={20} />
        </Button>
      </div>
      <div className="search">
        <Search size={17} />
        <Input aria-label="搜索笔记" placeholder="搜索标题或正文…" value={query} onChange={(e) => setQuery(e.target.value)} />
        {query&&(<button className="search-clear" aria-label="清空搜索" onClick={() => setQuery("")}><X size={14} /></button>)}
      </div>
      <div className="note-file-list" aria-label="笔记文件">
        {visibleNotes.map((n) => (<button disabled={busy} key={n.id} className={`note-file ${selected?.id===n.id? "selected":""}`} onClick={() => {
          if(selected?.id!==n.id)
            guard(() => select(n));
          else setEditorOpen(true);
        }}>
          <FileText size={15} />
          <span>{n.title||"无标题笔记"}</span>
          <time>{date(n.updated_at)}</time>
        </button>))}
        {!visibleNotes.length&&(<div className="empty">
          <BookOpen />
          <p>{query? "没有找到相关笔记":"这里还很安静"}</p>
          <small>
            {query? "换个关键词试试。":"点击 +，写下第一份灵感。"}
          </small>
        </div>)}
      </div>
      <div className="library-foot">
        {query ? `${visibleNotes.length} 条结果` : `共 ${notes.length} 篇`}
      </div>
    </div>
    <article className="editor" ref={editorRef}>
      <div className="editor-toolbar">
        <span>
          <Button className="notes-back" variant="ghost" aria-label="返回笔记列表" onClick={() => guard(() => setEditorOpen(false))}><ArrowLeft size={16} /></Button>
          <Button className="note-library-toggle" variant="ghost" aria-label={libraryHidden ? "展开笔记列表" : "收起笔记列表"} aria-expanded={!libraryHidden} title={libraryHidden ? "展开笔记列表" : "收起笔记列表"} onClick={toggleLibrary}>
            {libraryHidden ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </Button>
          <i className={saveState==="failed"?"dot failed":dirty? "dot dirty":"dot"} />
          {saveState==="saving"?"正在保存…":saveState==="failed"?"保存失败":dirty? "有未保存的修改":selected? "已保存":"新的一页"}
        </span>
        <div>
          <MarkdownModes mode={mode} onChange={setMode} />
          <Button variant="ghost" aria-pressed={focused} onClick={onToggleFocus}>{focused ? "退出专注" : "专注"}</Button>
          {saveState==="failed"&&(<Button variant="outline" aria-label="重试保存" disabled={busy} onClick={() => void save()}><RotateCcw size={15} />重试保存</Button>)}
          {selected&&(<Button variant="ghost" aria-label="删除当前笔记" disabled={busy} onClick={deleteNote}>
            <Trash2 size={17} />
          </Button>)}
          <Button aria-label="保存笔记" disabled={busy||!dirty} onClick={() => void save()}>
            {busy? (<LoaderCircle size={16} className="spin" />):(<Save size={16} />)}
            保存笔记
          </Button>
        </div>
      </div>
      <div className="editor-paper-wrap">
      <div className="editor-paper" style={{ width: `min(100%, ${paperWidth}px)` }}>
        <Input aria-label="笔记标题" className="note-title" placeholder="给想法起个名字…" value={draft.title} disabled={busy && saveState !== "saving"} onChange={(e) => setDraft(current => ({ ...current, title: e.target.value }))} />
        <MarkdownEditor documentId={selected?.id ?? 'new'} onComposingChange={model.setComposing} mode={mode} value={draft.content} disabled={busy && saveState !== "saving"} onChange={(content) => setDraft(current => ({ ...current, content }))} />
        <button className="note-width-handle" type="button" aria-label="拖动调整写作区宽度" title="拖动调整写作区宽度" onPointerDown={resizePaper}><span /></button>
      </div>
      </div>
      <footer className="editor-footer">
        <span>{draft.content.length} 字</span>
        <span>{selected ? `更新于 ${date(selected.updated_at)}` : "停止输入后自动保存"}</span>
      </footer>
    </article>
  </section>);
}
