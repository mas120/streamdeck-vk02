//! Cửa sổ phụ (To-do) và các lệnh điều khiển app/máy.
//! Toàn bộ code ở đây được chuyển nguyên từ `lib.rs` (P2-4), không đổi hành vi.

use std::os::windows::process::CommandExt;
use std::process::Command;
use tauri::Manager;

/// Mở (hoặc đưa lên trước) cửa sổ soạn To-do trên MÀN HÌNH PC — không phải panel VK02.
/// `async`: tạo cửa sổ từ command đồng bộ trên Windows có thể deadlock.
#[tauri::command(async)]
pub(crate) fn open_todo_window(app: tauri::AppHandle) -> Result<(), String> {
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
pub(crate) fn close_todo_window(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("todo") {
        let _ = w.close();
    }
}

#[tauri::command]
pub(crate) fn close_app(app_handle: tauri::AppHandle) {
    app_handle.exit(0);
}

#[tauri::command]
pub(crate) fn shutdown_computer() -> Result<(), String> {
        Command::new("shutdown.exe")
                .args(["/s", "/t", "0"])
                .creation_flags(0x08000000)
                .spawn()
                .map(|_| ())
                .map_err(|error| format!("Không thể gửi lệnh tắt máy: {error}"))
}
