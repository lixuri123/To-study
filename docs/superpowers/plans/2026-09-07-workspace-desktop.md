# 笔记、待办与 Windows 桌面实施计划

> 执行方式：使用 superpowers:subagent-driven-development 分任务实施，逐项验证。

> 2026-09-08 用户调整：减少测试，优先实现功能，后续问题再迭代。收尾仅执行必要构建，不再扩大自动化或人工验收。

**Goal:** 完成已获用户批准的笔记保存体验、带截止日期的待办和联网 Windows 桌面版。

**Architecture:** React 继续复用模块结构；FastAPI 和 Alembic 扩展待办日期。桌面使用 Tauri，优先验证现有同源 Cookie 认证兼容性。

**Tech Stack:** React / TypeScript / Vitest / FastAPI / SQLAlchemy / Alembic / pytest / Tauri。

## 已批准范围
- 笔记手动保存，Ctrl+S，保存状态与失败重试，三选项离开保护，搜索清空及数量，窄屏列表与编辑切换。
- 待办标题编辑、可空截止日期、今天/逾期筛选、未完成及日期排序、条目级请求状态。
- Windows 桌面联网版，窗口尺寸位置记忆、未保存关闭保护、服务异常重试、安装包与说明。
- 服务端仍统一部署；本机仅用于联调。保护现有账号、笔记、待办及认证设计。

## Task 1：笔记体验
- [ ] 在 frontend/src/test 中补保存失败重试、快捷键、保存后导航测试并确认初始失败。
- [x] 修改 features/notes/useNotes.ts、NotesPanel.tsx、components/ui.tsx 及相关样式，实现保存结果驱动的导航与失败保留草稿。
- [x] 检查布局、搜索结果、窄屏返回和关闭保护接口。
- [x] 运行笔记相关 Vitest 和 TypeScript 构建（用户调整前完成）。

## Task 2：待办
- [ ] tests/test_api.py 验证创建日期、清除日期、非法日期、账号隔离；迁移测试确认旧待办保留。
- [x] 扩展 backend/tasks 的模型、输入输出与服务，新增 0003 迁移。
- [x] 修改 frontend/src/api.ts 的 Task 类型及 features/tasks；实现编辑、日期筛选、排序与并发操作隔离。
- [ ] 运行相关 pytest、Vitest 和构建。

## Task 3：桌面
- [x] 检查 Tauri 官方配置与本机构建工具，采用加载服务端页面维持同源认证。
- [x] 增加独立 desktop 目录及 Rust/Tauri 配置、服务地址配置、连接重试、窗口持久化与关闭保护。
- [x] 前端生产构建及 Tauri 发布构建通过，生成 `desktop/src-tauri/target/release/bundle/nsis/青笺_0.1.0_x64-setup.exe`；真实桌面交互联调按用户要求不扩展。
- [x] README 和 docs/desktop.md 记录启动、安装、服务部署及验证限制。

## 整体验证
- [ ] 前后端完整测试、生产构建、迁移检查。
- [ ] 检查新增功能的账号隔离、失败恢复和跨模块导航。
- [x] 已记录真实安装包产物及未执行安装/卸载验收的限制。
