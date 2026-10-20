//! Thực thi action của phím: mở URL, mở app, đổi âm lượng.
//! Toàn bộ code ở đây được chuyển nguyên từ `lib.rs` (P2-3), không đổi hành vi.

use std::os::windows::process::CommandExt;
use std::process::Command;
use tauri_plugin_opener::OpenerExt;

use crate::audio;
use crate::net;

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
pub(crate) fn trigger_action(
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
