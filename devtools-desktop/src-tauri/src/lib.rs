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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // sidecar 固定路径（个人工具，不需要分发）
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

            // 启动 Node sidecar
            let mut child = Command::new("node")
                .arg(&sidecar_entry)
                .current_dir(&sidecar_dir)
                .stdout(Stdio::piped())
                .stderr(Stdio::inherit())
                .spawn()
                .expect("无法启动 Node sidecar 进程");

            // 从 stdout 读取端口号
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
        .invoke_handler(tauri::generate_handler![get_sidecar_port])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
