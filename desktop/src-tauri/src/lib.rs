use serde::{Deserialize, Serialize};
use std::{
    fs,
    net::{SocketAddr, TcpStream, ToSocketAddrs},
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::Duration,
};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri::{menu::{Menu, MenuItem}, tray::TrayIconBuilder};
use tauri_plugin_notification::NotificationExt;
use url::Url;

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(default)]
pub struct DesktopConfig {
    pub server_url: Option<String>,
    pub window: Option<WindowPlacement>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct WindowPlacement {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub maximized: bool,
}

pub fn normalize_server_url(input: &str) -> Result<Url, String> {
    let mut url = Url::parse(input.trim()).map_err(|_| "Enter a valid server URL.".to_string())?;
    let host = url
        .host_str()
        .ok_or_else(|| "The server URL must include a host.".to_string())?;
    let loopback = host.eq_ignore_ascii_case("localhost")
        || host.parse::<std::net::IpAddr>().is_ok_and(|ip| ip.is_loopback());
    if url.scheme() != "https" && !(url.scheme() == "http" && loopback) {
        return Err("Use HTTPS (HTTP is allowed only for local development).".into());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("Credentials are not allowed in the server URL.".into());
    }
    if url.path() != "/" || url.query().is_some() || url.fragment().is_some() {
        return Err("Enter the server origin without a path, query, or fragment.".into());
    }
    url.set_path("/");
    Ok(url)
}

pub fn same_origin(configured: &Url, candidate: &Url) -> bool {
    configured.scheme() == candidate.scheme()
        && configured.host_str() == candidate.host_str()
        && configured.port_or_known_default() == candidate.port_or_known_default()
}

pub fn close_bridge_script(origin: &Url) -> String {
    let origin = origin.origin().ascii_serialization();
    format!(
        r#"(() => {{
  if (window.location.origin === {origin:?} && !window.__QINGJIAN_DESKTOP__) {{
    const signal = (action) => {{
      const frame = document.createElement('iframe');
      frame.hidden = true;
      window.location.href = `qingjian-desktop://${{action}}`;
      return Promise.resolve();
    }};
    Object.defineProperty(window, '__QINGJIAN_DESKTOP__', {{
      configurable: false,
      writable: false,
      value: Object.freeze({{
        registerCloseGuard: () => signal('register-close-guard'),
        confirmClose: () => signal('confirm-close'),
        notify: (message) => new Promise((resolve, reject) => {{
          const receive = (event) => {{
            if (event.detail.id !== message.id) return;
            window.removeEventListener('qingjian:notification-result', receive);
            clearTimeout(timer);
            event.detail.success ? resolve() : reject(new Error('系统通知发送失败'));
          }};
          const timer = setTimeout(() => {{ window.removeEventListener('qingjian:notification-result', receive); reject(new Error('系统通知响应超时')); }}, 10000);
          window.addEventListener('qingjian:notification-result', receive);
          signal('notify?payload=' + encodeURIComponent(JSON.stringify(message)));
        }})
      }})
    }});
  }}
  if (window.location.origin === {origin:?}) {{
    window.dispatchEvent(new CustomEvent('qingjian:desktop-ready'));
  }}
}})();"#
    )
}

fn load_config(path: &Path) -> DesktopConfig {
    fs::read_to_string(path)
        .ok()
        .and_then(|value| serde_json::from_str(&value).ok())
        .unwrap_or_default()
}

fn save_config(path: &Path, config: &DesktopConfig) -> Result<(), String> {
    let parent = path.parent().ok_or("Invalid configuration path.")?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let value = serde_json::to_vec_pretty(config).map_err(|error| error.to_string())?;
    fs::write(path, value).map_err(|error| error.to_string())
}

struct DesktopState {
    config_path: std::path::PathBuf,
    config: Mutex<DesktopConfig>,
    close_guard: AtomicBool,
    allow_close: AtomicBool,
    exit_requested: AtomicBool,
}

#[derive(Deserialize)]
struct NotificationMessage {
    id: String,
    #[serde(default)]
    affair_id: String,
    title: String,
    body: String,
}

#[tauri::command]
fn get_server_url(state: tauri::State<'_, DesktopState>) -> Option<String> {
    state.config.lock().ok()?.server_url.clone()
}

#[tauri::command]
async fn connect_server(
    value: String,
    window: tauri::WebviewWindow,
    state: tauri::State<'_, DesktopState>,
) -> Result<(), String> {
    let url = normalize_server_url(&value)?;
    let host = url.host_str().ok_or("The server URL has no host.")?.to_owned();
    let port = url.port_or_known_default().ok_or("The server URL has no port.")?;
    tauri::async_runtime::spawn_blocking(move || check_tcp(&host, port))
        .await
        .map_err(|error| error.to_string())??;

    {
        let mut config = state.config.lock().map_err(|_| "Configuration lock failed.")?;
        config.server_url = Some(url.as_str().to_owned());
        save_config(&state.config_path, &config)?;
    }
    window.navigate(url).map_err(|error| error.to_string())
}

fn check_tcp(host: &str, port: u16) -> Result<(), String> {
    let addresses: Vec<SocketAddr> = (host, port)
        .to_socket_addrs()
        .map_err(|_| "Could not resolve the server address.".to_string())?
        .collect();
    if addresses.is_empty() {
        return Err("Could not resolve the server address.".into());
    }
    if addresses
        .iter()
        .any(|address| TcpStream::connect_timeout(address, Duration::from_secs(4)).is_ok())
    {
        Ok(())
    } else {
        Err("The server is unavailable. Check the address and try again.".into())
    }
}

fn current_configured_origin(state: &DesktopState) -> Option<Url> {
    let value = state.config.lock().ok()?.server_url.clone()?;
    normalize_server_url(&value).ok()
}

fn persist_window(window: &tauri::Window, state: &DesktopState) {
    let (Ok(position), Ok(size), Ok(maximized), Ok(scale)) = (
        window.outer_position(),
        window.inner_size(),
        window.is_maximized(),
        window.scale_factor(),
    ) else {
        return;
    };
    if let Ok(mut config) = state.config.lock() {
        config.window = Some(WindowPlacement {
            x: (position.x as f64 / scale).round() as i32,
            y: (position.y as f64 / scale).round() as i32,
            width: (size.width as f64 / scale).round() as u32,
            height: (size.height as f64 / scale).round() as u32,
            maximized,
        });
        let _ = save_config(&state.config_path, &config);
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let config_path = app.path().app_config_dir()?.join("desktop.json");
            let config = load_config(&config_path);
            let placement = config.window.clone();
            app.manage(DesktopState {
                config_path,
                config: Mutex::new(config),
                close_guard: AtomicBool::new(false),
                allow_close: AtomicBool::new(false),
                exit_requested: AtomicBool::new(false),
            });

            let handle = app.handle().clone();
            let builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("青笺")
                .inner_size(1180.0, 760.0)
                .min_inner_size(760.0, 560.0)
                .on_navigation(move |candidate| {
                    if candidate.scheme() == "tauri" || candidate.scheme() == "http" && candidate.host_str() == Some("tauri.localhost") {
                        return true;
                    }
                    let state = handle.state::<DesktopState>();
                    if candidate.scheme() == "qingjian-desktop" {
                        let on_configured_origin = handle
                            .get_webview_window("main")
                            .and_then(|window| window.url().ok())
                            .zip(current_configured_origin(&state))
                            .is_some_and(|(current, configured)| same_origin(&configured, &current));
                        match candidate.host_str() {
                            Some("notify") if on_configured_origin => {
                                if let Some(payload) = candidate.query_pairs().find(|(key, _)| key == "payload").map(|(_, value)| value.into_owned()) {
                                    if let Ok(message) = serde_json::from_str::<NotificationMessage>(&payload) {
                                        if message.id.len() <= 100 && message.title.len() <= 800 && message.body.len() <= 3000 {
                                            #[cfg(windows)]
                                            let success = {
                                                let target = message.affair_id.clone();
                                                let notify_handle = handle.clone();
                                                tauri_winrt_notification::Toast::new(&handle.config().identifier)
                                                    .title(&message.title).text1(&message.body)
                                                    .on_activated(move |_| {
                                                        if target.len() == 36 && target.chars().all(|c| c.is_ascii_hexdigit() || c == '-') {
                                                            if let Some(window) = notify_handle.get_webview_window("main") {
                                                                let state = notify_handle.state::<DesktopState>();
                                                                if window.url().ok().zip(current_configured_origin(&state)).is_some_and(|(current, configured)| same_origin(&configured, &current)) {
                                                                    let _ = window.show(); let _ = window.unminimize(); let _ = window.set_focus();
                                                                    let detail = serde_json::to_string(&target).unwrap_or_default();
                                                                    let _ = window.eval(format!("window.dispatchEvent(new CustomEvent('qingjian:open-affair', {{detail:{detail}}}));"));
                                                                }
                                                            }
                                                        }
                                                        Ok(())
                                                    }).show().is_ok()
                                            };
                                            #[cfg(not(windows))]
                                            let success = handle.notification().builder().title(&message.title).body(&message.body).show().is_ok();
                                            let detail = serde_json::json!({"id": message.id, "success": success});
                                            if let Some(window) = handle.get_webview_window("main") {
                                                let _ = window.eval(format!("window.dispatchEvent(new CustomEvent('qingjian:notification-result', {{detail:{detail}}}));"));
                                            }
                                        }
                                    }
                                }
                            }
                            Some("register-close-guard") if on_configured_origin => {
                                state.close_guard.store(true, Ordering::SeqCst);
                            }
                            Some("confirm-close") if on_configured_origin && state.close_guard.load(Ordering::SeqCst) => {
                                state.allow_close.store(true, Ordering::SeqCst);
                                state.exit_requested.store(true, Ordering::SeqCst);
                                let close_handle = handle.clone();
                                tauri::async_runtime::spawn(async move {
                                    if let Some(window) = close_handle.get_webview_window("main") {
                                        let _ = window.close();
                                    }
                                });
                            }
                            _ => {}
                        }
                        return false;
                    }
                    let allowed = current_configured_origin(&state)
                        .is_some_and(|configured| same_origin(&configured, candidate));
                    if allowed {
                        state.close_guard.store(false, Ordering::SeqCst);
                    }
                    allowed
                })
                .on_page_load(|webview, payload| {
                    if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
                      if let Some(origin) = current_configured_origin(&webview.state::<DesktopState>()) {
                        if same_origin(&origin, payload.url()) {
                            let _ = webview.eval(close_bridge_script(&origin));
                        }
                      }
                    }
                });
            let window = if let Some(saved) = placement {
                builder
                    .position(saved.x as f64, saved.y as f64)
                    .inner_size(saved.width.max(760) as f64, saved.height.max(560) as f64)
                    .maximized(saved.maximized)
                    .build()?
            } else {
                builder.center().build()?
            };
            window.show()?;
            let show = MenuItem::with_id(app, "show", "打开青笺", true, None::<&str>)?;
            let test = MenuItem::with_id(app, "test-notification", "发送测试通知", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出青笺（停止提醒）", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &test, &quit])?;
            let mut tray = TrayIconBuilder::new().tooltip("青笺 · 后台提醒运行中").menu(&menu).on_menu_event(|app, event| {
                if let Some(window) = app.get_webview_window("main") {
                    match event.id.as_ref() {
                        "show" => { let _ = window.show(); let _ = window.unminimize(); let _ = window.set_focus(); }
                        "test-notification" => { let _ = app.notification().builder().title("青笺通知测试").body("收到这条通知表示 Windows 通知通道可用。关闭窗口后青笺留在托盘运行。").show(); }
                        "quit" => { let state = app.state::<DesktopState>(); state.exit_requested.store(true, Ordering::SeqCst); let _ = window.show(); let _ = window.set_focus(); let _ = window.close(); }
                        _ => {}
                    }
                }
            });
            if let Some(icon) = app.default_window_icon() { tray = tray.icon(icon.clone()); }
            tray.build(app)?;
            let ticker = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_secs(15));
                if let Some(window) = ticker.get_webview_window("main") {
                    if window.url().ok().zip(current_configured_origin(&ticker.state::<DesktopState>())).is_some_and(|(current, configured)| same_origin(&configured, &current)) {
                        let _ = window.eval("window.dispatchEvent(new CustomEvent('qingjian:notification-tick'));");
                    }
                } else { break; }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_server_url, connect_server])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<DesktopState>();
                persist_window(window, &state);
                if !state.exit_requested.load(Ordering::SeqCst) {
                    api.prevent_close();
                    let _ = window.hide();
                    return;
                }
                if state.close_guard.load(Ordering::SeqCst)
                    && !state.allow_close.swap(false, Ordering::SeqCst)
                {
                    api.prevent_close();
                    if let Some(webview) = window.get_webview_window("main") {
                        let _ = webview.eval(
                            "window.dispatchEvent(new CustomEvent('qingjian:request-close'));",
                        );
                    }
                    // A cancelled draft dialog must not make the next window close exit.
                    state.exit_requested.store(false, Ordering::SeqCst);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to run Qingjian desktop");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_https_origin_and_discards_trailing_slash() {
        assert_eq!(
            normalize_server_url(" https://notes.example.com/ ")
                .unwrap()
                .as_str(),
            "https://notes.example.com/"
        );
    }

    #[test]
    fn allows_http_only_for_loopback_development() {
        assert!(normalize_server_url("http://127.0.0.1:8000").is_ok());
        assert!(normalize_server_url("http://localhost:8000").is_ok());
        assert!(normalize_server_url("http://notes.example.com").is_err());
    }

    #[test]
    fn rejects_non_origin_urls_and_credentials() {
        for value in [
            "file:///tmp/app",
            "https://user:secret@notes.example.com",
            "https://notes.example.com/path",
            "https://notes.example.com/?debug=1",
            "https://notes.example.com/#fragment",
        ] {
            assert!(normalize_server_url(value).is_err(), "accepted {value}");
        }
    }

    #[test]
    fn configured_origin_allows_only_same_origin_navigation() {
        let configured = normalize_server_url("https://notes.example.com").unwrap();
        assert!(same_origin(
            &configured,
            &Url::parse("https://notes.example.com/tasks?filter=today").unwrap()
        ));
        assert!(!same_origin(
            &configured,
            &Url::parse("https://evil.example.com/").unwrap()
        ));
        assert!(!same_origin(
            &configured,
            &Url::parse("http://notes.example.com/").unwrap()
        ));
    }

    #[test]
    fn close_bridge_script_is_scoped_to_configured_origin() {
        let origin = normalize_server_url("https://notes.example.com").unwrap();
        let script = close_bridge_script(&origin);
        assert!(script.contains("window.location.origin === \"https://notes.example.com\""));
        assert!(script.contains("registerCloseGuard"));
        assert!(script.contains("confirmClose"));
    }

    #[test]
    fn desktop_config_json_round_trip_preserves_window_and_server() {
        let config = DesktopConfig {
            server_url: Some("https://notes.example.com/".into()),
            window: Some(WindowPlacement {
                x: 100,
                y: 120,
                width: 1180,
                height: 760,
                maximized: true,
            }),
        };
        let json = serde_json::to_string(&config).unwrap();
        assert_eq!(serde_json::from_str::<DesktopConfig>(&json).unwrap(), config);
    }
}
