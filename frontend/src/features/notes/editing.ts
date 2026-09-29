export type SelectionEdit = { value: string; start: number; end: number };
export type Format = "bold" | "italic" | "strike" | "code" | "link" | "heading" | "bullet" | "number" | "task" | "quote" | "fence" | "table";

export function replaceSelection(value: string, start: number, end: number, text: string, selectStart = text.length, selectEnd = selectStart): SelectionEdit {
  return { value: value.slice(0, start) + text + value.slice(end), start: start + selectStart, end: start + selectEnd };
}

export function lineRange(value: string, start: number, end: number) {
  const from = start === 0 ? 0 : value.lastIndexOf("\n", start - 1) + 1;
  const last = end > start && value[end - 1] === "\n" ? end - 1 : end;
  const next = value.indexOf("\n", last);
  return { from, to: next < 0 ? value.length : next };
}

export function formatSelection(value: string, start: number, end: number, format: Format): SelectionEdit {
  const selected = value.slice(start, end);
  const marks = { bold: "**", italic: "*", strike: "~~", code: "`" };
  if (format in marks) {
    const mark = marks[format as keyof typeof marks];
    if (start >= mark.length && value.slice(start - mark.length, start) === mark && value.slice(end, end + mark.length) === mark)
      return replaceSelection(value, start - mark.length, end + mark.length, selected, 0, selected.length);
    const text = selected || "文字";
    return replaceSelection(value, start, end, mark + text + mark, mark.length, mark.length + text.length);
  }
  if (format === "link") {
    const text = selected || "链接文字";
    return replaceSelection(value, start, end, `[${text}](https://)`, text.length + 3, text.length + 11);
  }
  if (format === "fence" || format === "table") {
    const text = format === "fence" ? `\`\`\`\n${selected || "代码"}\n\`\`\`` : "| 列一 | 列二 |\n| --- | --- |\n| 内容 | 内容 |";
    const before = start > 0 && value[start - 1] !== "\n" ? "\n" : "";
    const after = end < value.length && value[end] !== "\n" ? "\n" : "";
    return replaceSelection(value, start, end, before + text + after, before.length + (format === "fence" ? 4 : 2), before.length + (format === "fence" ? 4 + (selected || "代码").length : 4));
  }
  const { from, to } = lineRange(value, start, end);
  const lines = value.slice(from, to).split("\n");
  const prefix = format === "heading" ? "## " : format === "bullet" ? "- " : format === "task" ? "- [ ] " : format === "quote" ? "> " : "";
  const pattern = format === "heading" ? /^#{1,6} / : format === "bullet" ? /^[-+*] / : format === "task" ? /^[-+*] \[[ xX]\] / : format === "quote" ? /^> / : /^\d+[.)] /;
  const remove = lines.every(line => pattern.test(line.trimStart()));
  const text = lines.map((line, index) => {
    const indent = line.match(/^\s*/)?.[0] ?? "";
    const body = line.slice(indent.length);
    return indent + (remove ? body.replace(pattern, "") : (format === "number" ? `${index + 1}. ` : prefix) + body.replace(pattern, ""));
  }).join("\n");
  return replaceSelection(value, from, to, text, start === end ? text.length : 0, text.length);
}

export function indentSelection(value: string, start: number, end: number, outdent: boolean): SelectionEdit {
  if (!outdent && start === end) return replaceSelection(value, start, end, "  ");
  const { from, to } = lineRange(value, start, end);
  const lines = value.slice(from, to).split("\n");
  const changed = lines.map(line => outdent ? line.replace(/^( {1,2}|\t)/, "") : "  " + line);
  const text = changed.join("\n");
  const shift = changed[0].length - lines[0].length;
  return replaceSelection(value, from, to, text, Math.max(0, start - from + shift), Math.max(0, end - from + text.length - (to - from)));
}

export function continueLine(value: string, start: number, end: number): SelectionEdit | null {
  if (start !== end) return null;
  const from = start === 0 ? 0 : value.lastIndexOf("\n", start - 1) + 1;
  const line = value.slice(from, start);
  // Do not continue Markdown lists inside fenced code blocks.
  const fences = value.slice(0, from).match(/^\s*(`{3,}|~{3,}).*$/gm) ?? [];
  if (fences.length % 2) {
    const indent = line.match(/^\s*/)?.[0] ?? "";
    return indent ? replaceSelection(value, start, end, "\n" + indent) : null;
  }
  if (/^\s*```[^`]*$/.test(line))
    return replaceSelection(value, start, end, "\n\n```", 1);
  const match = line.match(/^(\s*)(?:(\d+)([.)]) |([-+*]) (?:\[([ xX])\] )?|(>) )(.*)$/);
  if (match) {
    const [, indent, number, punctuation, bullet, task, quote, body] = match;
    if (!body.trim()) return replaceSelection(value, from, start, "");
    const prefix = number ? `${Number(number) + 1}${punctuation} ` : bullet ? `${bullet} ${task !== undefined ? "[ ] " : ""}` : `${quote} `;
    return replaceSelection(value, start, end, "\n" + indent + prefix);
  }
  const indent = line.match(/^[ \t]+/)?.[0];
  return indent ? replaceSelection(value, start, end, "\n" + indent) : null;
}

const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}", "（": "）", "【": "】", "《": "》" };
export function pairEdit(value: string, start: number, end: number, key: string): SelectionEdit | null {
  if (pairs[key]) {
    if (start === end && value[end] && !/[\s\])}）】》]/.test(value[end])) return null;
    return replaceSelection(value, start, end, key + value.slice(start, end) + pairs[key], 1, 1 + end - start);
  }
  if (start === end && Object.values(pairs).includes(key) && value[start] === key)
    return { value, start: start + 1, end: end + 1 };
  if (key === "Backspace" && start > 0 && start === end && pairs[value[start - 1]] && pairs[value[start - 1]] === value[start])
    return replaceSelection(value, start - 1, end + 1, "");
  return null;
}
