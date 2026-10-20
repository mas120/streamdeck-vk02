//! Bật/tắt "khởi động cùng Windows" bằng khoá Run của HKCU (không cần quyền admin,
//! không cần thêm crate). Dùng `reg.exe` với CREATE_NO_WINDOW để không nháy cửa sổ console.

use std::os::windows::process::CommandExt;
use std::process::Command;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const RUN_KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
const VALUE_NAME: &str = "StreamDeckVK02";

fn reg(args: &[&str]) -> Result<std::process::Output, String> {
    Command::new("reg")
        .args(args)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|err| format!("Không chạy được reg.exe: {err}"))
}

/// Đường dẫn exe hiện tại, bọc ngoặc kép để chịu được dấu cách.
fn quoted_exe() -> Result<String, String> {
    let path = std::env::current_exe().map_err(|err| format!("Không lấy được đường dẫn exe: {err}"))?;
    Ok(format!("\"{}\"", path.display()))
}

/// Windows có đang đăng ký app khởi động cùng máy không.
#[tauri::command]
pub fn get_autostart() -> Result<bool, String> {
    let output = reg(&["query", RUN_KEY, "/v", VALUE_NAME])?;
    Ok(output.status.success())
}

/// Bật: ghi giá trị Run trỏ tới exe hiện tại. Tắt: xoá giá trị (bỏ qua nếu chưa có).
#[tauri::command]
pub fn set_autostart(enabled: bool) -> Result<bool, String> {
    if enabled {
        let exe = quoted_exe()?;
        let output = reg(&[
            "add", RUN_KEY, "/v", VALUE_NAME, "/t", "REG_SZ", "/d", &exe, "/f",
        ])?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
        }
    } else {
        let output = reg(&["delete", RUN_KEY, "/v", VALUE_NAME, "/f"])?;
        // Chưa từng bật -> reg báo lỗi "unable to find"; coi như đã tắt.
        if !output.status.success() && get_autostart()? {
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
        }
    }
    get_autostart()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn run_key_is_hkcu() {
        assert!(RUN_KEY.starts_with("HKCU\\"));
        assert!(RUN_KEY.ends_with("\\Run"));
        assert_eq!(VALUE_NAME, "StreamDeckVK02");
    }

    #[test]
    fn quoted_exe_has_quotes_when_available() {
        if let Ok(value) = quoted_exe() {
            assert!(value.starts_with('"') && value.ends_with('"'));
        }
    }
}
