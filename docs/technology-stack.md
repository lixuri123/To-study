# 记事本与待办应用：技术选型

记录日期：2026-09-05

状态：已确定总体方向；本文记录选型，不代表各端已实现。

## 产品目标

开发支持 Web、桌面、Android 和 iOS 的记事本与待办应用，各端通过统一后端共享数据。第一阶段先实现联网版本，再扩展桌面端和移动端。

基础功能为笔记的新建、编辑、删除，以及待办的添加、完成和删除。

## 技术栈与职责

| 部分 | 技术 | 职责 |
| --- | --- | --- |
| 前端界面 | React + TypeScript | 共享界面组件、交互逻辑和类型定义 |
| 前端开发与构建 | Vite | 开发服务器、构建 Web 静态资源 |
| 样式与组件 | Tailwind CSS + shadcn/ui | 统一布局、样式和基础交互组件 |
| Web 端 | 部署前端构建产物 | 通过浏览器访问应用 |
| 桌面端 | Tauri | 包装前端界面，提供窗口、托盘等本机能力 |
| Android / iOS | Capacitor | 包装前端界面，通过插件访问移动设备能力 |
| 服务端 | Python + FastAPI | 提供 HTTP API，处理账号、权限、笔记、待办及后续同步业务 |
| 服务端数据库 | PostgreSQL | 持久保存各端共享的数据 |
| 数据访问 | SQLAlchemy | 数据模型、查询和事务 |
| 数据库迁移 | Alembic | 管理数据库结构升级 |
| Python 环境管理 | uv | 管理 Python 环境、依赖和锁文件 |
| 前端测试 | Vitest | 前端逻辑测试；按需配合组件测试工具 |
| 后端测试 | pytest | Python 业务及 API 测试，并按需增加数据库集成测试 |

前端需要独立的 Node.js 工具链；具体包管理器及各依赖版本在初始化时确定。Tauri 使用 Rust 工具链；如编写本机 Rust 逻辑，则补充相应 Rust 测试。

## 架构与通信

```text
Web：React ──────────────────┐
桌面：React + Tauri ─────────┤
Android：React + Capacitor ──┼── HTTPS API ── FastAPI / Python ── PostgreSQL
iOS：React + Capacitor ──────┘
```

- Python 运行在统一服务器上，负责核心服务端业务，不随每个客户端打包。
- Tauri 主要承担桌面外壳和本机集成，Rust 不作为核心服务端业务语言。
- 各客户端调用 API，不直接连接服务端数据库。
- 前端将 API 调用集中封装，利用 FastAPI 的 OpenAPI 描述生成 TypeScript 客户端可作为后续实现方案。
- 各端尽量复用 React 代码，但移动布局、导航、通知和平台权限需要单独适配。
- Python 后端分离 API 接口、业务逻辑和数据访问，避免把业务规则直接堆在路由中。

## 开发顺序

1. 搭建 React + FastAPI 项目，完成联网版本的笔记、待办及数据持久化；支持个人数据访问时实现账号与权限隔离。
2. 使用 Tauri 接入桌面外壳，适配必要的桌面功能。
3. 使用 Capacitor 接入 Android 和 iOS，适配移动交互及平台功能。
4. 根据确认的需求增加搜索、标签、提醒和更完整的同步能力。

## 边界与待确认事项

- 第一阶段以联网访问服务端为基线。
- 离线编辑是否属于第一版必需功能尚未确定；如需要，应在数据模型定稿前设计本地存储、待同步操作、版本与冲突处理。
- 共享服务端数据不等于自动实时同步；刷新策略、实时推送和离线同步需分别实现。
- 客户端本地数据库、认证方案、部署环境和具体版本尚未确定。
- 移动构建需要对应平台工具链；iOS 构建需要 macOS / Xcode 环境或相应构建服务。
- Tauri 2 同时覆盖桌面和移动是备选方案；当前记录以桌面 Tauri、移动 Capacitor 为主，不并行实现两套移动外壳。
- 不采用此前仅面向本地桌面的 pywebview + Python + SQLite 方案作为多端总体架构。

## 官方参考

- [Tauri](https://v2.tauri.app/)
- [Tauri 环境要求](https://v2.tauri.app/start/prerequisites/)
- [Capacitor](https://capacitorjs.com/docs)
- [FastAPI 客户端生成](https://fastapi.tiangolo.com/advanced/generate-clients/)
