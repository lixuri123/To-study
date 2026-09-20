# Markdown 笔记实施计划

用户已选择 Markdown 编辑 + 预览。

目标：在现有笔记正文中支持编辑、预览和分屏，保存原始 Markdown 字符串。

设计：独立 MarkdownEditor 组件接收 value、onChange 和 disabled；NotesPanel 保留标题、保存、草稿保护和列表逻辑。使用 react-markdown、remark-gfm 和 remark-breaks，保留普通文本换行，不执行原始 HTML。预览任务复选框只读；窄屏分屏上下排列。沿用绿色纸张主题，补充标题层级、表格滚动和代码块样式。

- [x] 阅读现有笔记和保存逻辑，确认没有修改后端数据格式的需要。
- [x] 添加 MarkdownEditor.test.tsx，覆盖草稿预览、模式切换、GFM、安全和换行。
- [x] 运行测试确认缺少组件导致失败。
- [x] 实现 MarkdownEditor.tsx 并接入 NotesPanel.tsx，更新 notes.css。
- [x] 运行新增测试、前端完整测试和 npm run build。
- [x] 检查最终代码并更新 README。

验证结果：Markdown 新增 3 项测试通过；生产构建通过。完整测试 27 项通过、17 项失败（2 个测试文件）。App 测试的 affairs mock 返回对象而不是数组，导致 useAffairs 中 items.flatMap 报错；完整回归未通过。尚未进行浏览器视觉验证。

验证命令（frontend 目录）：npm test -- src/test/MarkdownEditor.test.tsx；npm test；npm run build。
