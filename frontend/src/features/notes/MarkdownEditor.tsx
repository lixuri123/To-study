import { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { TableKit } from '@tiptap/extension-table';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import Image from '@tiptap/extension-image';
import MarkdownView from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

export type Mode = 'write' | 'read' | 'source';
const modes: { value: Mode; label: string }[] = [
  { value: 'write', label: '写作' },
  { value: 'read', label: '阅读' },
  { value: 'source', label: '源码' },
];

export function MarkdownModes({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  return <div className="markdown-modes" role="group" aria-label="正文显示模式">
    {modes.map(item => <button type="button" key={item.value} aria-pressed={mode === item.value} onClick={() => onChange(item.value)}>{item.label}</button>)}
  </div>;
}

const extensions = [
  StarterKit.configure({ link: { openOnClick: false } }),
  TableKit.configure({ table: { resizable: true } }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Image,
  Markdown.configure({ markedOptions: { gfm: true } }),
];

// Keep constructs without reliable visual round-tripping in the source editor.
function needsSource(value: string) {
  return /<\/?[a-z][^>]*>|\[\^[^\]]+\]:|\$\$[\s\S]*?\$\$/i.test(value);
}

export function MarkdownEditor({ value, onChange, disabled, mode, documentId, onComposingChange }: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  mode: Mode;
  documentId?: string;
  onComposingChange?: (composing: boolean) => void;
}) {
  const lastEmitted = useRef<string | null>(null);
  const lastDocument = useRef(documentId);
  const onChangeRef = useRef(onChange);
  const [insertOpen, setInsertOpen] = useState(false);
  onChangeRef.current = onChange;
  const sourceOnly = needsSource(value);
  const editor = useEditor({
    extensions,
    content: value,
    contentType: 'markdown',
    editable: !disabled && mode === 'write' && !sourceOnly,
    editorProps: {
      attributes: { class: 'note-rich-content', 'aria-label': '笔记正文' },
      handleDOMEvents: {
        compositionstart: () => { onComposingChange?.(true); return false; },
        compositionend: () => { onComposingChange?.(false); return false; },
      },
    },
    onUpdate: ({ editor: current }) => {
      const markdown = current.getMarkdown();
      lastEmitted.current = markdown;
      onChangeRef.current(markdown);
    },
  });
  useEffect(() => () => onComposingChange?.(false), [onComposingChange]);
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled && mode === 'write' && !sourceOnly);
  }, [editor, disabled, mode, sourceOnly]);
  useEffect(() => {
    if (!editor) return;
    if (lastDocument.current !== documentId || (value !== lastEmitted.current && value !== editor.getMarkdown())) {
      lastDocument.current = documentId;
      editor.commands.setContent(value, { contentType: 'markdown', emitUpdate: false });
      lastEmitted.current = null;
    }
  }, [editor, documentId, value]);
  const active = useEditorState({ editor, selector: ({ editor: current }) => ({
    bold: current?.isActive('bold') ?? false,
    italic: current?.isActive('italic') ?? false,
    strike: current?.isActive('strike') ?? false,
    inlineCode: current?.isActive('code') ?? false,
    heading: current?.isActive('heading') ?? false,
    bullet: current?.isActive('bulletList') ?? false,
    ordered: current?.isActive('orderedList') ?? false,
    task: current?.isActive('taskList') ?? false,
    quote: current?.isActive('blockquote') ?? false,
    code: current?.isActive('codeBlock') ?? false,
    table: current?.isActive('table') ?? false,
  }) });
  function link() {
    if (!editor) return;
    const previous = editor.getAttributes('link').href as string | undefined;
    const address = window.prompt('输入链接地址', previous ?? 'https://');
    if (address === null) return;
    if (!address.trim()) editor.chain().focus().unsetLink().run();
    else editor.chain().focus().setLink({ href: address.trim() }).run();
  }
  const ready = !!editor && !disabled && !sourceOnly && mode === 'write';
  return <div className="markdown-editor">
    {mode === 'write' && <>
      {sourceOnly && <div className="note-source-warning">这篇笔记包含 HTML、脚注或公式。为避免内容丢失，请切换到「源码」编辑。</div>}
      <div className="note-format-bar" role="toolbar" aria-label="文字格式">
        <div className="note-format-group">
          <button type="button" title="小标题" aria-label="小标题" aria-pressed={active?.heading} disabled={!ready} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>
          <button type="button" title="加粗 Ctrl+B" aria-label="加粗" aria-pressed={active?.bold} disabled={!ready} onClick={() => editor?.chain().focus().toggleBold().run()}><strong>B</strong></button>
          <button type="button" title="斜体 Ctrl+I" aria-label="斜体" aria-pressed={active?.italic} disabled={!ready} onClick={() => editor?.chain().focus().toggleItalic().run()}><em>I</em></button>
          <button type="button" title="删除线" aria-label="删除线" aria-pressed={active?.strike} disabled={!ready} onClick={() => editor?.chain().focus().toggleStrike().run()}><s>S</s></button>
          <button type="button" title="行内代码" aria-label="行内代码" aria-pressed={active?.inlineCode} disabled={!ready} onClick={() => editor?.chain().focus().toggleCode().run()}>&lt;/&gt;</button>
          <button type="button" title="链接" disabled={!ready} onClick={link}>链接</button>
        </div>
        <span className="note-format-divider" />
        <div className="note-format-group">
          <button type="button" aria-pressed={active?.bullet} disabled={!ready} onClick={() => editor?.chain().focus().toggleBulletList().run()}>列表</button>
          <button type="button" aria-pressed={active?.ordered} disabled={!ready} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>编号</button>
          <button type="button" aria-pressed={active?.task} disabled={!ready} onClick={() => editor?.chain().focus().toggleTaskList().run()}>待办</button>
          <button type="button" aria-pressed={active?.quote} disabled={!ready} onClick={() => editor?.chain().focus().toggleBlockquote().run()}>引用</button>
        </div>
        <span className="note-format-divider" />
        <div className="note-format-group">
          <button type="button" aria-pressed={active?.code} disabled={!ready} onClick={() => editor?.chain().focus().toggleCodeBlock().run()}>代码</button>
          <button type="button" disabled={!ready} aria-expanded={insertOpen} onClick={() => setInsertOpen(open => !open)}>插入 ▾</button>
          {insertOpen && <div className="note-insert-menu">
            <button type="button" onClick={() => { editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); setInsertOpen(false); }}>表格</button>
            <button type="button" onClick={() => { editor?.chain().focus().setHorizontalRule().run(); setInsertOpen(false); }}>分隔线</button>
            <button type="button" onClick={() => { const src = window.prompt('图片链接'); if (src?.trim()) editor?.chain().focus().setImage({ src: src.trim() }).run(); setInsertOpen(false); }}>图片链接</button>
          </div>}
        </div>
        <div className="note-format-group note-history">
          <button type="button" title="撤销 Ctrl+Z" disabled={!ready || !editor?.can().undo()} onClick={() => editor?.chain().focus().undo().run()}>↶</button>
          <button type="button" title="重做 Ctrl+Shift+Z" disabled={!ready || !editor?.can().redo()} onClick={() => editor?.chain().focus().redo().run()}>↷</button>
        </div>
      </div>
      {active?.table && <div className="note-table-bar" role="toolbar" aria-label="表格编辑">
        <span>表格</span>
        <button type="button" disabled={!ready} onClick={() => editor?.chain().focus().addRowAfter().run()}>添加行</button>
        <button type="button" disabled={!ready} onClick={() => editor?.chain().focus().addColumnAfter().run()}>添加列</button>
        <button type="button" disabled={!ready} onClick={() => editor?.chain().focus().deleteRow().run()}>删除行</button>
        <button type="button" disabled={!ready} onClick={() => editor?.chain().focus().deleteColumn().run()}>删除列</button>
        <button type="button" disabled={!ready} onClick={() => editor?.chain().focus().deleteTable().run()}>删除表格</button>
      </div>}
    </>}
    {mode === 'source' ? <textarea className="note-source-input" aria-label="Markdown 源码" placeholder="用 Markdown 开始记录…" value={value} disabled={disabled}
      onCompositionStart={() => onComposingChange?.(true)} onCompositionEnd={() => onComposingChange?.(false)} onChange={event => onChange(event.target.value)} />
      : mode === 'read' ? <section className="markdown-preview" aria-label="笔记阅读视图">
        {value.trim() ? <MarkdownView remarkPlugins={[remarkGfm, remarkBreaks]} components={{
          a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
          table: ({ children }) => <div className="markdown-table-scroll"><table>{children}</table></div>,
        }}>{value}</MarkdownView> : <p className="markdown-empty">还没有正文，切换到写作开始记录。</p>}
      </section> : <div className={`note-rich-editor${sourceOnly ? ' is-protected' : ''}`}>
        <EditorContent editor={editor} />
        {!value.trim() && <span className="note-rich-placeholder" aria-hidden="true">从这里开始写。输入 ## 创建标题，- 创建列表…</span>}
      </div>}
  </div>;
}
