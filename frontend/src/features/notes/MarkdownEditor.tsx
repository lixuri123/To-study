import { useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

type Mode = 'edit' | 'preview' | 'split';
const modes: { value: Mode; label: string }[] = [
  { value: 'edit', label: '编辑' },
  { value: 'preview', label: '预览' },
  { value: 'split', label: '分屏' },
];

export function MarkdownEditor({ value, onChange, disabled }: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const [mode, setMode] = useState<Mode>('edit');
  return <div className="markdown-editor">
    <div className="markdown-toolbar">
      <div className="markdown-modes" role="group" aria-label="正文显示模式">
        {modes.map(item => <button type="button" key={item.value}
          aria-pressed={mode === item.value} onClick={() => setMode(item.value)}>
          {item.label}
        </button>)}
      </div>
      <span className="markdown-label">Markdown</span>
    </div>
    <details className="markdown-help">
      <summary>格式速查</summary>
      <p><code>## 小标题</code><code>**重点**</code><code>- 列表</code><code>1. 步骤</code><code>- [ ] 待办</code><code>&gt; 引用</code><code>[文字](https://…)</code><code>`行内代码`</code></p>
      <p>代码块用三枚反引号包围；空一行开始新段落。预览中的任务勾选状态请在原文中修改。</p>
    </details>
    <div className={`markdown-panes mode-${mode}`}>
      {mode !== 'preview' && <textarea aria-label="笔记正文"
        placeholder={'用 Markdown 整理你的想法…\n\n## 今日记录\n\n- 写下一个要点\n- 用 **加粗** 标记重点'}
        value={value} disabled={disabled} onChange={event => onChange(event.target.value)} />}
      {mode !== 'edit' && <section className="markdown-preview" aria-label="Markdown 预览">
        {value.trim() ? <Markdown remarkPlugins={[remarkGfm, remarkBreaks]}
          components={{
            a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
            table: ({ children }) => <div className="markdown-table-scroll"><table>{children}</table></div>,
          }}>{value}</Markdown> : <p className="markdown-empty">还没有正文，切换到编辑开始记录。</p>}
      </section>}
    </div>
  </div>;
}
