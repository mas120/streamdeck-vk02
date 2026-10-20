use std::os::windows::process::CommandExt;
use std::process::Command;
use std::time::Duration;
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;

mod app_icons;
mod audio;
mod bongo;
mod config;
mod diagnostics;
mod layout;
mod media;
mod net;
mod weather;
mod windows_info;

use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED};

/* =========================================================================
   1. TIỆN ÍCH COM (Windows Core Audio)
   ========================================================================= */

/// Khởi tạo COM (multithreaded) MỘT LẦN cho mỗi thread (giải phóng khi thread kết thúc) rồi
/// chạy closure. Không init/uninit mỗi lần gọi vì slider gọi lệnh này ~50 lần/giây.
/// Closure phải tự giải phóng mọi interface COM trước khi trả về.
struct ComGuard(bool);

impl ComGuard {
    fn init() -> Self {
        // CoInitializeEx trả S_FALSE nếu đã init (vẫn phải cân bằng bằng CoUninitialize);
        // RPC_E_CHANGED_MODE (thread đang STA) là lỗi -> không được uninit.
        Self(unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }.is_ok())
    }
}

impl Drop for ComGuard {
    fn drop(&mut self) {
        if self.0 {
            unsafe { CoUninitialize() };
        }
    }
}

thread_local! {
    static COM_GUARD: ComGuard = ComGuard::init();
}

pub(crate) fn with_com<T, F>(f: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String>,
{
    COM_GUARD.with(|_| ());
    f()
}

/* =========================================================================
   2. THỜI TIẾT, MẠNG VÀ BONGO CAT đã tách ra weather.rs / net.rs / bongo.rs
   ========================================================================= */

/// Tách "chương trình" và "tham số" từ chuỗi người dùng nhập:
///  - `"C:\Program Files\App\app.exe" --flag` -> (đường dẫn trong ngoặc, "--flag")
///  - đường dẫn tồn tại nguyên chuỗi (kể cả có dấu cách)  -> (cả chuỗi, "")
///  - `notepad C:\a.txt`                                  -> ("notepad", "C:\a.txt")
pub(crate) fn split_launch_target(target: &str) -> (String, String) {
    let t = target.trim();
    if let Some(rest) = t.strip_prefix('"') {
        if let Some(end) = rest.find('"') {
            return (rest[..end].to_string(), rest[end + 1..].trim().to_string());
        }
    }
    if std::path::Path::new(t).exists() {
        return (t.to_string(), String::new());
    }
    match t.split_once(char::is_whitespace) {
        Some((exe, args)) => (exe.to_string(), args.trim().to_string()),
        None => (t.to_string(), String::new()),
    }
}

#[tauri::command(async)]
fn trigger_action(
    app: tauri::AppHandle,
    action_type: String,
    target: String,
) -> Result<(), String> {
    match action_type.as_str() {
        "open_url" => {
            // KHÔNG đi qua `cmd /C start`: cmd hiểu `&` là "chạy lệnh tiếp theo", nên
            // URL kiểu ...watch?v=abc&t=30 bị cắt cụt và phần sau bị thực thi như lệnh.
            let url = target.trim();
            if !net::is_safe_web_url(url) {
                return Err("Chỉ cho phép địa chỉ http:// hoặc https://".into());
            }
            app.opener()
                .open_url(url, None::<&str>)
                .map_err(|e| e.to_string())?;
        }
        "launch_app" => {
            let target = target.trim();
            if target.is_empty() || target.chars().any(|c| c.is_control()) {
                return Err("Đường dẫn ứng dụng không hợp lệ".into());
            }
            let (exe, args) = split_launch_target(target);
            if args.is_empty() {
                // ShellExecute: hiểu "notepad", "taskmgr", .lnk, thư mục, ms-settings:...
                // giống hộp thoại Win+R nhưng KHÔNG qua cmd. Nếu không mở được thì
                // thử CreateProcess trực tiếp.
                if let Err(e) = app.opener().open_path(exe.clone(), None::<&str>) {
                    Command::new(&exe)
                        .spawn()
                        .map_err(|e2| format!("{e}; {e2}"))?;
                }
            } else {
                // Có tham số: CreateProcess trực tiếp, `raw_arg` giữ nguyên chuỗi tham số
                // và không có cmd nào diễn giải & | > ^ ...
                Command::new(&exe)
                    .raw_arg(&args)
                    .spawn()
                    .map_err(|e| e.to_string())?;
            }
        }
        "set_volume" => {
            let vol_level: f32 = target
                .trim()
                .parse()
                .ok()
                .filter(|v: &f32| v.is_finite())
                .ok_or_else(|| "Mức âm lượng không hợp lệ".to_string())?;
            if let Err(e) = audio::set_system_master_volume(vol_level) {
                eprintln!("Lỗi chỉnh âm lượng: {:?}", e);
                return Err(e.to_string());
            }
        }
        _ => return Err("Action không hợp lệ".into()),
    }
    Ok(())
}

/// Mở (hoặc đưa lên trước) cửa sổ soạn To-do trên MÀN HÌNH PC — không phải panel VK02.
/// `async`: tạo cửa sổ từ command đồng bộ trên Windows có thể deadlock.
#[tauri::command(async)]
fn open_todo_window(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::{WebviewUrl, WebviewWindowBuilder};
    if let Some(w) = app.get_webview_window("todo") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(());
    }
    let win = WebviewWindowBuilder::new(&app, "todo", WebviewUrl::App("todo.html".into()))
        .title("Việc cần làm")
        .inner_size(460.0, 640.0)
        .min_inner_size(340.0, 420.0)
        .resizable(true)
        .build()
        .map_err(|e| e.to_string())?;

    // Chọn màn hình PC: ưu tiên màn chính; bỏ qua panel 1280x800.
    let is_panel = |m: &tauri::Monitor| m.size().width == 1280 && m.size().height == 800;
    let primary = win.primary_monitor().ok().flatten();
    let target = primary
        .filter(|m| !is_panel(m))
        .or_else(|| win.available_monitors().unwrap_or_default().into_iter().find(|m| !is_panel(m)));
    match (target, win.outer_size()) {
        (Some(m), Ok(sz)) => {
            let (p, s) = (m.position(), m.size());
            let x = p.x + (s.width as i32 - sz.width as i32) / 2;
            let y = p.y + (s.height as i32 - sz.height as i32) / 2;
            let _ = win.set_position(tauri::PhysicalPosition::new(x, y));
        }
        _ => {
            let _ = win.center();
        }
    }
    let _ = win.set_focus();
    Ok(())
}

#[tauri::command]
fn close_todo_window(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("todo") {
        let _ = w.close();
    }
}

#[tauri::command]
fn close_app(app_handle: tauri::AppHandle) {
    app_handle.exit(0);
}

#[tauri::command]
fn shutdown_computer() -> Result<(), String> {
        Command::new("shutdown.exe")
                .args(["/s", "/t", "0"])
                .creation_flags(0x08000000)
                .spawn()
                .map(|_| ())
                .map_err(|error| format!("Không thể gửi lệnh tắt máy: {error}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            trigger_action,
            close_app,
            shutdown_computer,
            bongo::set_bongo_enabled,
            layout::load_layout,
            layout::save_layout,
            config::load_app_config,
            config::save_app_config,
            diagnostics::save_diagnostics,
            audio::get_audio_sessions,
            audio::set_app_volume,
            audio::toggle_app_mute,
            audio::get_master_volume,
            audio::get_output_peak,
            audio::set_master_mute,
            audio::get_mic_state,
            audio::toggle_mic_mute,
            weather::get_weather_data,
            weather::locate_by_ip,
            media::get_media_state,
            media::get_media_thumbnail,
            media::media_control,
            app_icons::get_app_icon,
            app_icons::get_favicon,
            app_icons::save_icon_pair,
            open_todo_window,
            close_todo_window
        ])
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let monitors = window.available_monitors().unwrap_or_default();
                let primary_pos = window.primary_monitor().ok().flatten().map(|m| *m.position());

                // Tìm panel VK02: ưu tiên màn có độ phân giải vật lý 1280x800,
                // nếu không có thì lấy màn hình KHÔNG phải màn chính (màn phụ).
                let panel = monitors
                    .iter()
                    .find(|m| m.size().width == 1280 && m.size().height == 800)
                    .or_else(|| {
                        monitors
                            .iter()
                            .find(|m| primary_pos.map_or(false, |p| *m.position() != p))
                    });

                match panel {
                    Some(monitor) => {
                        // Đã có panel VK02 -> "ghim" deck lên đó: luôn nổi trên cùng,
                        // ẩn khỏi taskbar và fullscreen đúng panel theo vị trí vật lý.
                        let _ = window.set_always_on_top(true);
                        let _ = window.set_skip_taskbar(true);
                        let pos = monitor.position();
                        let _ = window.set_fullscreen_on_monitor(tauri::PhysicalPosition::new(
                            pos.x as f64,
                            pos.y as f64,
                        ));

                        // Giữ chuột trong màn chính để không trượt sang panel cảm ứng.
                        if let Some(main) = window.primary_monitor().ok().flatten() {
                            let (p, s) = (main.position(), main.size());
                            let rect = windows::Win32::Foundation::RECT {
                                left: p.x,
                                top: p.y,
                                right: p.x + s.width as i32,
                                bottom: p.y + s.height as i32,
                            };
                            // Lặp lại vì Windows có thể gỡ giới hạn khi đổi focus/hiển thị.
                            std::thread::spawn(move || loop {
                                unsafe {
                                    let _ = windows::Win32::UI::WindowsAndMessaging::ClipCursor(
                                        Some(&rect),
                                    );
                                }
                                std::thread::sleep(Duration::from_secs(1));
                            });
                        }
                    }
                    None => {
                        // CHƯA có panel VK02 (đang phát triển trên 1 màn hình): giữ cửa sổ
                        // bình thường (có viền, kéo/đổi kích thước được), KHÔNG luôn-nổi và
                        // KHÔNG fullscreen để không đè lên các phần mềm khác.
                        let _ = window.set_always_on_top(false);
                        let _ = window.set_skip_taskbar(false);
                        let _ = window.set_decorations(true);
                        let _ = window.set_resizable(true);
                        let _ = window.set_fullscreen(false);
                        let _ = window.center();
                    }
                }

                let _ = window.set_focus();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
