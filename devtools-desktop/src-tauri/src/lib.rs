use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{TrayIconBuilder, TrayIconId},
    Manager, WindowEvent,
};

struct SidecarState {
    _child: Mutex<Option<Child>>,
    port: Mutex<u16>,
}

fn cleanup_sidecar(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<SidecarState>() {
        if let Some(mut child) = state._child.lock().unwrap().take() {
            let pid = child.id();
            println!("[Tauri Exit] Sending SIGTERM to Sidecar PID: {}", pid);
            #[cfg(unix)]
            {
                let _ = std::process::Command::new("kill")
                    .arg("-TERM")
                    .arg(pid.to_string())
                    .status();
            }
            std::thread::sleep(std::time::Duration::from_millis(600));
            let _ = child.kill();
            println!("[Tauri Exit] Sidecar child process killed.");
        }
    }
}

#[tauri::command]
fn get_sidecar_port(state: tauri::State<SidecarState>) -> u16 {
    *state.port.lock().unwrap()
}

/// 启动一个 sidecar 子进程，读取其 stdout 里的 __PORT__ 行，返回 (子进程, 端口)
fn spawn_sidecar() -> (Option<Child>, u16) {
    let sidecar_dir = std::path::PathBuf::from("/Users/ldy/personalTools/devtools-desktop/sidecar");
    let sidecar_entry = sidecar_dir.join("index.js");
    if !sidecar_entry.exists() {
        eprintln!("[Tauri] 错误：sidecar/index.js 不存在");
        return (None, 0);
    }

    let node_paths = [
        "/usr/local/bin/node",
        "/opt/homebrew/bin/node",
        "/Users/ldy/.nvm/current/bin/node",
        "node",
    ];

    let mut child_opt: Option<Child> = None;
    for node_path in &node_paths {
        match Command::new(node_path)
            .arg(&sidecar_entry)
            .current_dir(&sidecar_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
        {
            Ok(c) => {
                println!("[Tauri] 使用 node: {}", node_path);
                child_opt = Some(c);
                break;
            }
            Err(e) => eprintln!("[Tauri] 尝试 {} 失败: {}", node_path, e),
        }
    }

    let mut child = match child_opt {
        Some(c) => c,
        None => {
            eprintln!("[Tauri] 错误：无法启动 Node sidecar（所有 node 路径均失败）");
            return (None, 0);
        }
    };

    let stdout = match child.stdout.take() {
        Some(s) => s,
        None => return (Some(child), 0),
    };
    let reader = BufReader::new(stdout);
    let mut port: u16 = 0;
    for line in reader.lines() {
        if let Ok(line) = line {
            println!("[Sidecar] {}", line);
            if line.starts_with("__PORT__:") {
                if let Ok(p) = line[9..].parse::<u16>() {
                    port = p;
                    break;
                }
            }
        }
    }
    (Some(child), port)
}

/// 重启 sidecar：杀掉当前子进程，重新拉起一个，并更新端口。返回新端口供前端重连。
#[tauri::command]
fn restart_sidecar(app: tauri::AppHandle) -> Result<u16, String> {
    // 1. 结束当前 sidecar
    if let Some(state) = app.try_state::<SidecarState>() {
        if let Some(mut child) = state._child.lock().unwrap().take() {
            let pid = child.id();
            println!("[Tauri] 重启 sidecar：结束旧进程 PID {}", pid);
            #[cfg(unix)]
            {
                let _ = std::process::Command::new("kill")
                    .arg("-TERM")
                    .arg(pid.to_string())
                    .status();
            }
            std::thread::sleep(std::time::Duration::from_millis(400));
            let _ = child.kill();
        }
    }

    // 2. 重新拉起
    let (child_opt, port) = spawn_sidecar();
    match child_opt {
        Some(child) => {
            if let Some(state) = app.try_state::<SidecarState>() {
                *state._child.lock().unwrap() = Some(child);
                *state.port.lock().unwrap() = port;
            }
            if port == 0 {
                Err("sidecar 已启动但未获取到端口".into())
            } else {
                println!("[Tauri] sidecar 已重启，新端口: {}", port);
                Ok(port)
            }
        }
        None => Err("无法启动 sidecar".into()),
    }
}

fn posix_path_from_osascript(script: &str) -> Option<String> {
    use std::process::Command;
    let output = Command::new("osascript").arg("-e").arg(script).output();
    match output {
        Ok(out) if out.status.success() => {
            let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if path.is_empty() {
                None
            } else {
                Some(path.trim_end_matches('/').to_string())
            }
        }
        _ => None,
    }
}

#[tauri::command]
fn pick_folder() -> Option<String> {
    posix_path_from_osascript("set theFolder to POSIX path of (choose folder with prompt \"选择项目文件夹\")")
}

#[tauri::command]
fn pick_app_bundle() -> Option<String> {
    posix_path_from_osascript(
        "set theApp to POSIX path of (choose file of type {\"com.apple.application-bundle\"} with prompt \"选择要修复的应用\")",
    )
}

#[derive(serde::Deserialize, Clone)]
struct RunningProject {
    name: String,
    status: String, // "running" | "starting" | "error"
}

#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    let normalized = url.trim();
    if normalized.chars().any(char::is_control)
        || !(normalized.starts_with("http://") || normalized.starts_with("https://"))
    {
        return Err("只允许打开 HTTP 或 HTTPS 链接".into());
    }

    #[cfg(target_os = "macos")]
    {
        let status = Command::new("open")
            .arg(normalized)
            .status()
            .map_err(|error| format!("无法调用系统浏览器: {error}"))?;
        if !status.success() {
            return Err("系统浏览器未能打开链接".into());
        }
        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = normalized;
        Err("当前系统暂不支持外部链接打开".into())
    }
}

#[tauri::command]
fn update_tray_menu(app: tauri::AppHandle, projects: Vec<RunningProject>) {
    let tray = match app.tray_by_id(&TrayIconId::new("main-tray")) {
        Some(t) => t,
        None => return,
    };

    let menu = MenuBuilder::new(&app);

    // 动态添加运行中的项目
    let has_projects = !projects.is_empty();
    let menu = if has_projects {
        let mut m = menu;
        for proj in &projects {
            let icon = match proj.status.as_str() {
                "running" => "●",
                "starting" => "○",
                _ => "✖",
            };
            let label = format!("{} {} — {}", icon, proj.name, match proj.status.as_str() {
                "running" => "运行中",
                "starting" => "启动中",
                _ => "异常",
            });
            if let Ok(item) = MenuItemBuilder::with_id(
                format!("proj_{}", proj.name),
                &label,
            ).build(&app) {
                m = m.item(&item);
            }
        }
        m.separator()
    } else {
        let no_run = MenuItemBuilder::with_id("no_run", "暂无运行中的项目")
            .enabled(false)
            .build(&app);
        match no_run {
            Ok(item) => menu.item(&item).separator(),
            Err(_) => menu,
        }
    };

    // 固定菜单项
    let show_item = MenuItemBuilder::with_id("show", "显示窗口").build(&app);
    let run_item = MenuItemBuilder::with_id("open_run", "本地运行").build(&app);
    let quit_item = MenuItemBuilder::with_id("quit", "退出").build(&app);

    let final_menu = match (show_item, run_item, quit_item) {
        (Ok(s), Ok(r), Ok(q)) => {
            menu.item(&s).item(&r).separator().item(&q).build()
        }
        _ => return,
    };

    if let Ok(built_menu) = final_menu {
        let _ = tray.set_menu(Some(built_menu));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            // ========== System Tray ==========
            let no_run_item = MenuItemBuilder::with_id("no_run", "暂无运行中的项目")
                .enabled(false)
                .build(app)?;
            let show_item = MenuItemBuilder::with_id("show", "显示窗口").build(app)?;
            let run_item = MenuItemBuilder::with_id("open_run", "本地运行").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "退出").build(app)?;
            let menu = MenuBuilder::new(app)
                .item(&no_run_item)
                .separator()
                .item(&show_item)
                .item(&run_item)
                .separator()
                .item(&quit_item)
                .build()?;

            let tray_icon = Image::from_bytes(include_bytes!("../icons/tray-icon-44.png"))
                .expect("无法加载托盘图标");

            TrayIconBuilder::with_id("main-tray")
                .icon(tray_icon)
                .icon_as_template(true)
                .menu(&menu)
                .tooltip("DevTools")
                .on_menu_event(|app, event| {
                    let id = event.id().as_ref();
                    match id {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            }
                        }
                        "open_run" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                                // 通知前端切换到本地运行页面
                                let _ = window.eval("window.location.hash = '#/run'");
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {
                            // 点击项目名 → 打开窗口跳转到本地运行
                            if id.starts_with("proj_") {
                                if let Some(window) = app.get_webview_window("main") {
                                    let _ = window.show();
                                    let _ = window.unminimize();
                                    let _ = window.set_focus();
                                    let _ = window.eval("window.location.hash = '#/run'");
                                }
                            }
                        }
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click { button: tauri::tray::MouseButton::Left, .. } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            // ========== 窗口关闭事件：隐藏到托盘而非退出 ==========
            let app_handle = app.handle().clone();
            let main_window = app.get_webview_window("main").unwrap();
            main_window.on_window_event(move |event| {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    if let Some(win) = app_handle.get_webview_window("main") {
                        let _ = win.hide();
                    }
                }
            });

            // ========== Sidecar ==========
            let (child_opt, port) = spawn_sidecar();
            if port == 0 {
                eprintln!("[Tauri] 错误：无法获取 sidecar 端口号");
            } else {
                println!("[Tauri] Sidecar 已启动，端口: {}", port);
            }
            app.manage(SidecarState {
                _child: Mutex::new(child_opt),
                port: Mutex::new(port),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_sidecar_port,
            pick_folder,
            pick_app_bundle,
            restart_sidecar,
            update_tray_menu,
            exit_app,
            open_external_url
        ])
        .build(tauri::generate_context!())
        .unwrap_or_else(|e| panic!("Tauri 构建错误: {:?}", e))
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                cleanup_sidecar(app_handle);
            }
        });
}
