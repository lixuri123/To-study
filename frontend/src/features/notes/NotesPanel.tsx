import { useState } from "react";
import { ArrowLeft, BookOpen, FileText, LoaderCircle, PanelLeftClose, PanelLeftOpen, Plus, RotateCcw, Save, Search, Trash2, X } from "lucide-react";
import { Button, Input } from "../../components/ui";
import { date } from "../../components/format";
import type { NotesModel } from "./useNotes";
import { MarkdownEditor } from "./MarkdownEditor";
import "./notes.css";
export function NotesPanel({ model, busy }: {
  model: NotesModel;
  busy: boolean;
}) {
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
  return (<section className={`notes-layout ${editorOpen? "show-editor":"show-library"}${libraryHidden ? " library-collapsed" : ""}`}>
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
    <article className="editor">
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
      <div className="editor-paper">
        <Input aria-label="笔记标题" className="note-title" placeholder="给想法起个名字…" value={draft.title} disabled={busy} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        <div className="note-meta">
          <span>
            {selected
              ? `最后更新于 ${date(selected.updated_at)}`
              :"新笔记 · 从一句话开始"}
          </span>
          <span>个人笔记</span>
        </div>
        <MarkdownEditor value={draft.content} disabled={busy} onChange={(content) => setDraft({ ...draft, content })} />
      </div>
      <footer className="editor-footer">
        <span>{draft.content.length} 字</span>
        <span>写下来，就有了意义。</span>
      </footer>
    </article>
  </section>);
}
