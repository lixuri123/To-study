# 青笺与 Codex MCP 工作流

## 已实现的连接方式

Codex → 本地 stdio MCP 进程 → 青笺 HTTP API → 数据库。MCP 进程不访问数据库、不调用模型 API；账号、原文、笔记、事务与资料都由青笺保存。

工具包括 get_profile、search_records、read_record、capture_information、create_affair、update_affair、create_note、link_note、set_reminder、update_profile。搜索返回分页摘要，读取返回正文及附件名称；写入回执包含 request_id、记录 ID 和版本。

## 安装与启动

在项目目录执行：

```powershell
uv sync
uv run python main.py
```

启动自动应用 0006 迁移，保留原数据。服务保持运行。另开本地终端授权：

```powershell
uv run python integrations/qingjian_mcp/setup.py login
uv run python integrations/qingjian_mcp/setup.py status
```

输入现有青笺用户名和密码（密码不回显、不保存）。这会创建独立登录会话；Windows 凭据通过 DPAPI 加密存入忽略的 data/mcp-credentials.json，仅同一 Windows 用户能解密。不要复制凭据到聊天、版本库或共享配置。其他平台文件权限为 0600。

服务不在默认端口时：`uv run python integrations/qingjian_mcp/setup.py login --url http://127.0.0.1:8001`。非回环地址必须 HTTPS。

## 注册到 Codex

本项目路径对应的命令：

```powershell
codex mcp add qingjian -- D:\agent\To_study\.venv\Scripts\python.exe D:\agent\To_study\integrations\qingjian_mcp\run.py
```

也可运行 `uv run python integrations/qingjian_mcp/setup.py config`，把输出的非敏感配置加入 Codex MCP 设置。已有 qingjian 配置时先检查，避免重复或覆盖其他配置。

重新打开/刷新连接后，在新任务中检查 MCP 工具。先问“查询我的青笺个人资料与未完成事务”，再尝试写入。CLI 和桌面使用方式以 [Codex 官方 MCP 文档](https://developers.openai.com/codex/mcp/) 为准。

工作流 Skill 位于 `skills/qingjian-workflow/SKILL.md`。可以显式请 Codex 阅读此文件，也可以复制整个 qingjian-workflow 文件夹到自己的 `$CODEX_HOME/skills/` 后在新任务使用。它定义查询、整理和重试方法，MCP 工具负责执行。

## 验收示例

1. 告诉 Codex 专业、年级和校区，并明确要求保存个人资料。
2. 提交选课通知，要求保留原文，关联备选课程笔记，创建“确认本人批次”的事务。
3. 明确给出一个跟进提醒时间；核对工具回执与青笺页面。
4. 新建对话查询该事务，验证跨对话读取。
5. 同 request_id、同参数重试不会重复创建；同 ID 改参数返回冲突；旧版本更新返回冲突。

## 撤销

```powershell
uv run python integrations/qingjian_mcp/setup.py logout
```

它撤销专用服务端会话并删除本地凭据，不注销网页自己的会话。仅删除 MCP 配置并不撤销后端凭据。

## 范围与限制

- 一次命令的数据变更与幂等回执在同一数据库事务中提交。多次工具调用并非整体事务，部分失败应按回执继续处理。
- 未知日期不由 MCP 推测。正文的智能理解由 Codex 完成；这里没有自动读取链接或监控网站。
- 网页版提供应用内提醒；Windows 0.2.0 桌面版登录且驻留托盘、后端服务运行时，支持系统通知。退出或关机后停止，恢复运行后补查；未部署邮件服务。
- MCP 写入后，事务列表每 15 秒及窗口重新获得焦点时自动刷新；本地未保存草稿不会被覆盖。
- 凭据拥有对应账号现有接口的权限，尚未细分只读/只写权限；MCP 工具不提供删除记录。
- 普通待办可查询；写入新安排使用事务。课表保持现有功能，暂不开放工具。
- 信息可以被多个事务引用。原文由信息保留，事务关联笔记；删除原始记录后引用可能失效，需要用户整理。
- 搜索当前面向个人规模，服务端遍历本人记录；大规模监控前需改成数据库分页和全文索引。

协议实现采用 [官方 MCP Python SDK](https://github.com/modelcontextprotocol/python-sdk/tree/v1.x)，不自行实现 JSON-RPC。

## 本次交付状态

已注册本机 Codex 的 qingjian MCP 服务，并安装个人工作流 Skill。已用临时账号验证真实 stdio 握手、10 个工具发现、保存通知、创建事务、笔记关联、提醒写入及重复请求去重；10 项关键检查通过。

正式账号尚需用户执行 login 授权。未读取用户密码、未给真实账号写入演示数据。新建 Codex 任务或重新加载 MCP 连接后使用。
