use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::Manager;

struct SidecarState {
    _child: Mutex<Option<Child>>,
    port: Mutex<u16>,
}

#[tauri::command]
fn get_sidecar_port(state: tauri::State<SidecarState>) -> u16 {
    *state.port.lock().unwrap()
}

#[tauri::command]
fn pick_folder() -> Option<String> {
    use std::process::Command;
    // 使用 osascript 调用 macOS 原生文件夹选择器
    let output = Command::new("osascript")
        .arg("-e")
        .arg("set theFolder to POSIX path of (choose folder with prompt \"选择项目文件夹\")")
        .output();

    match output {
        Ok(out) => {
            if out.status.success() {
                let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if path.is_empty() { None } else { Some(path.trim_end_matches('/').to_string()) }
            } else {
                None // 用户取消了选择
            }
        }
        Err(_) => None,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let sidecar_dir = std::path::PathBuf::from("/Users/ldy/personalTools/devtools-desktop/sidecar");
            let sidecar_entry = sidecar_dir.join("index.js");

            println!("[Tauri] Sidecar 入口: {:?}", sidecar_entry);

            if !sidecar_entry.exists() {
                eprintln!("[Tauri] 错误：sidecar/index.js 不存在");
                app.manage(SidecarState {
                    _child: Mutex::new(None),
                    port: Mutex::new(0),
                });
                return Ok(());
            }

            // 尝试多个 node 路径（打包后 PATH 可能不包含 node）
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
                    Err(e) => {
                        eprintln!("[Tauri] 尝试 {} 失败: {}", node_path, e);
                    }
                }
            }

            let mut child = match child_opt {
                Some(c) => c,
                None => {
                    eprintln!("[Tauri] 错误：无法启动 Node sidecar（所有 node 路径均失败）");
                    app.manage(SidecarState {
                        _child: Mutex::new(None),
                        port: Mutex::new(0),
                    });
                    return Ok(());
                }
            };

            let stdout = child.stdout.take().expect("无法获取 sidecar stdout");
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

            if port == 0 {
                eprintln!("[Tauri] 错误：无法获取 sidecar 端口号");
            } else {
                println!("[Tauri] Sidecar 已启动，端口: {}", port);
            }

            app.manage(SidecarState {
                _child: Mutex::new(Some(child)),
                port: Mutex::new(port),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_sidecar_port, pick_folder])
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| eprintln!("Tauri 运行错误: {:?}", e));
}
