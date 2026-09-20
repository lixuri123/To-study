# 青笺 Windows 桌面版

0.2.0 增加轻量录入和 Windows 托盘提醒。完整操作见 [验收说明](acceptance-0.2.0.md)。

桌面版是现有统一服务的 Windows 客户端，不会在电脑上另建一套后端或数据库。它直接打开所配置的服务地址，因此登录 Cookie、账号隔离、笔记和待办数据都与网页版一致。

## 安装和连接

运行 `青笺_0.2.0_x64-setup.exe`，然后从开始菜单打开“青笺”。首次启动会显示连接页：

1. 输入青笺服务的完整来源地址，例如 `https://notes.example.com`。
2. 点击“连接”。如果地址暂时无法访问，页面会保留输入并显示“重试连接”。
3. 使用原有账号登录。后续重新打开应用时，连接页会带回上次保存的地址。

正式服务必须使用 HTTPS。只有本机联调可以使用 `http://localhost:端口` 或 `http://127.0.0.1:端口`。地址不能包含路径、查询参数、片段或用户名密码。

安装包按当前用户安装，无需管理员权限。当前开发构建未做 Windows 代码签名，因此 Windows 可能显示未知发布者；正式分发前应使用组织的代码签名证书签名。

## 行为和安全边界

- 窗口关闭时保存尺寸、位置和最大化状态，下次启动恢复。状态保存在 Windows 的应用配置目录。
- WebView 只允许导航到配置地址的同一来源；协议、主机或端口不同的跳转会被拦截。
- 远程页面不会获得通用 Tauri API。桌面壳只注入关闭保护和系统通知所需的窄接口。
- 关闭窗口会隐藏到托盘，继续检查提醒。托盘菜单退出时，网页监听器处理未保存草稿，确认后真正退出。
- 连接页目前在导航前检查域名解析和 TCP 端口可达性。它不能在导航前验证 HTTPS 证书或应用返回的 HTTP 状态；证书错误和服务端错误会由系统 WebView 显示。

网页需要实现以下接口约定：

```ts
declare global {
  interface Window {
    __QINGJIAN_DESKTOP__?: {
      registerCloseGuard(): Promise<void>
      confirmClose(): Promise<void>
    }
  }
}
```

网页先注册 `qingjian:request-close` 监听器，再调用 `registerCloseGuard()`。因为桌面桥在远程页面加载完成后注入，网页还应监听 `qingjian:desktop-ready` 并再次调用注册方法。收到关闭请求后，无未保存内容时直接调用 `confirmClose()`；有草稿时先走现有的保存、放弃或取消流程，只有保存或放弃成功后才调用它。

## 本地构建

需要 Node.js、Rust MSVC 工具链、Visual Studio C++ 构建工具和 WebView2。进入 `desktop` 目录后运行：

```powershell
npm install
npm run tauri build
```

本项目将安装包目标限定为 NSIS。构建产物位于 `desktop/src-tauri/target/release/bundle/nsis/`。Tauri 默认的小型安装包会在安装时获取 WebView2 引导程序；Windows 10 和 11 通常已经包含 WebView2。

开发时可运行 `npm run tauri dev` 打开桌面窗口。服务地址使用本地 FastAPI/前端统一来源，例如 `http://localhost:8000`，不要配置独立前端开发服务器地址，否则相对 `/api` 请求不会到达统一后端。

## 验证命令

```powershell
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --lib
npm run tauri build
```

Rust 单元测试覆盖服务来源规范化、HTTP 本机例外、危险地址拒绝、同源导航和关闭桥来源限制。最终的 `tauri build` 同时编译发布版可执行文件并生成 Windows 安装包。

