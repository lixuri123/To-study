import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { MarkdownEditor } from '../features/notes/MarkdownEditor';

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <MarkdownEditor value={value} onChange={setValue} disabled={false} />;
}

it('previews the current unsaved draft and preserves source across modes', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  const source = '## 学习重点\n\n**概念**\n\n- [x] 已复习\n\n| 项目 | 说明 |\n| --- | --- |\n| A | B |\n\n```js\nconst x = 1;\n```';
  fireEvent.change(screen.getByLabelText('笔记正文'), { target: { value: source } });
  await user.click(screen.getByRole('button', { name: '预览' }));
  const preview = screen.getByRole('region', { name: 'Markdown 预览' });
  expect(within(preview).getByRole('heading', { name: '学习重点' })).toBeVisible();
  expect(within(preview).getByText('概念').tagName).toBe('STRONG');
  expect(within(preview).getByRole('checkbox')).toBeChecked();
  expect(within(preview).getByRole('checkbox')).toBeDisabled();
  expect(within(preview).getByRole('table')).toBeVisible();
  expect(within(preview).getByText('const x = 1;').tagName).toBe('CODE');
  await user.click(screen.getByRole('button', { name: '分屏' }));
  expect(screen.getByLabelText('笔记正文')).toHaveValue(source);
  fireEvent.change(screen.getByLabelText('笔记正文'), { target: { value: '# 新内容' } });
  expect(within(preview).getByRole('heading', { name: '新内容' })).toBeVisible();
});

it('does not render executable HTML or unsafe links, and keeps plain text line breaks', async () => {
  const user = userEvent.setup();
  render(<Harness initial={'第一行\n第二行\n\n<script>alert(1)</script>\n\n[危险](javascript:alert%281%29)'} />);
  await user.click(screen.getByRole('button', { name: '预览' }));
  const preview = screen.getByRole('region', { name: 'Markdown 预览' });
  expect(preview.querySelector('script')).toBeNull();
  expect(preview.querySelector('a')).not.toHaveAttribute('href', expect.stringContaining('javascript:'));
  expect(preview.querySelector('br')).not.toBeNull();
});

it('provides an empty preview and disables editing while saving', async () => {
  const user = userEvent.setup();
  render(<MarkdownEditor value="" onChange={() => {}} disabled />);
  expect(screen.getByLabelText('笔记正文')).toBeDisabled();
  await user.click(screen.getByRole('button', { name: '预览' }));
  expect(screen.getByText('还没有正文，切换到编辑开始记录。')).toBeVisible();
});
