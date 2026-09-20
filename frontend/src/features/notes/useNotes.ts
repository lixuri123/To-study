import { useCallback, useEffect, useState } from "react";
import { api, type Note } from "../../api";
import type { WorkspaceActions } from "../../layouts/useWorkspaceActions";
const blank={ title: "", content: "" };
export function useNotes(actions: WorkspaceActions, enabled=true) {
  const [notes, setNotes]=useState<Note[]>([]);
  const [selected, setSelected]=useState<Note|null>(null);
  const [draft, setDraft]=useState(blank);
  const [query, setQuery]=useState("");
  const [saveState, setSaveState]=useState<"idle"|"saving"|"saved"|"failed">("idle");
  const [editorOpen, setEditorOpen]=useState(false);
  const dirty=draft.title!==(selected?.title??"")||draft.content!==(selected?.content??"");
  function select(note: Note|null) {
    setSelected(note);
    setDraft(note? { title: note.title, content: note.content }:blank);
    actions.setNotice("");
    setSaveState(note? "saved":"idle");
    setEditorOpen(true);
  }
  function initialize(items: Note[]) {
    setNotes(items);
    const first=items[0]??null;
    setSelected(first);
    setDraft(first? { title: first.title, content: first.content }:blank);
    setSaveState(first? "saved":"idle");
    setEditorOpen(false);
  }
  useEffect(() => {
    const handler=(event: BeforeUnloadEvent) => {
      if(dirty) {
        event.preventDefault();
        event.returnValue="";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  const save=useCallback(async (): Promise<boolean> => {
    if(!enabled||actions.busy)
      return false;
    if(!draft.title.trim()) {
      actions.setError("请先给笔记写一个标题。");
      setSaveState("failed");
      return false;
    }
    setSaveState("saving");
    let savedNote: Note|undefined;
    const succeeded=await actions.run(async () => {
      savedNote=await api<Note>(selected? `/notes/${selected.id}`:"/notes", selected? "PUT":"POST", draft);
    });
    if(!succeeded||!savedNote) {
      setSaveState("failed");
      return false;
    }
    const saved=savedNote;
    setNotes(previous => [saved, ...previous.filter(note => note.id!==saved.id)]);
    setSelected(saved);
    setDraft({ title: saved.title, content: saved.content });
    setSaveState("saved");
    actions.setNotice("已保存，灵感不会走丢。");
    return true;
  }, [actions, draft, enabled, selected]);
  function guard(action: () => void) {
    if(actions.busy)
      return;
    if(!dirty) {
      action();
      return;
    }
    actions.setConfirm({
      title: "离开前，保存这份灵感？",
      description: "你有尚未保存的修改。可以保存后继续，也可以放弃这次修改。",
      label: "保存并继续",
      variant: "primary",
      cancelLabel: "继续编辑",
      secondaryLabel: "放弃修改",
      secondaryAction: () => {
        setDraft(selected? { title: selected.title, content: selected.content }:blank);
        action();
      },
      action: async () => {
        if(await save()) action();
      },
    });
  }
  useEffect(() => {
    const keydown=(event: KeyboardEvent) => {
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="s") {
        event.preventDefault();
        if(enabled&&dirty&&!actions.busy) void save();
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [actions.busy, dirty, enabled, save]);
  function deleteNote() {
    if(!selected)
      return;
    const id=selected.id;
    actions.setConfirm({
      title: "删除这篇笔记？",
      description: "笔记及未保存的修改将被永久删除，此操作无法撤销。",
      label: "删除笔记",
      action: () => void actions.run(async () => {
        await api(`/notes/${id}`, "DELETE");
        const rest=notes.filter(note => note.id!==id);
        setNotes(rest);
        select(rest[0]??null);
        actions.setNotice("笔记已删除。");
      }),
    });
  }
  const visibleNotes=notes.filter(note => `${note.title} ${note.content}`.toLowerCase().includes(query.toLowerCase()));
  return { notes, selected, draft, setDraft, query, setQuery, dirty, saveState, editorOpen, setEditorOpen, select, initialize, guard, save, deleteNote, visibleNotes };
}
export type NotesModel=ReturnType<typeof useNotes>;
