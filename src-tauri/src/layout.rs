//! Lưu layout deck vào `app_data_dir/layout.json`: ghi nguyên tử (tmp -> rename), giữ bản `.bak`.

use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

use tauri::Manager;

static WRITE_LOCK: Mutex<()> = Mutex::new(());
const MAX_LAYOUT_BYTES: usize = 8 * 1024 * 1024;

fn layout_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Không lấy được thư mục dữ liệu: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("Không tạo được thư mục dữ liệu: {e}"))?;
    Ok(dir.join("layout.json"))
}

fn is_valid_layout(raw: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(raw).map_or(false, |value| {
        value.is_array()
            || (value.get("schemaVersion").and_then(serde_json::Value::as_u64) == Some(1)
                && value.get("widgets").is_some_and(serde_json::Value::is_array))
    })
}

/// Trả về nội dung layout hợp lệ (file chính, rồi bản .bak) hoặc None nếu chưa có.
#[tauri::command]
pub fn load_layout(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = layout_path(&app)?;
    let bak = path.with_extension("json.bak");
    for candidate in [&path, &bak] {
        if let Ok(raw) = fs::read_to_string(candidate) {
            if is_valid_layout(&raw) {
                return Ok(Some(raw));
            }
        }
    }
    Ok(None)
}

#[tauri::command]
pub fn save_layout(app: tauri::AppHandle, json: String) -> Result<(), String> {
    if json.len() > MAX_LAYOUT_BYTES || !is_valid_layout(&json) {
        return Err("Layout không hợp lệ".into());
    }
    let path = layout_path(&app)?;
    let tmp = path.with_extension("json.tmp");
    let bak = path.with_extension("json.bak");

    let _guard = WRITE_LOCK.lock().map_err(|_| "Khóa ghi layout bị lỗi".to_string())?;
    let write_tmp = || -> std::io::Result<()> {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(json.as_bytes())?;
        f.sync_all()
    };
    write_tmp().map_err(|e| format!("Không ghi được layout: {e}"))?;
    // Chỉ sao lưu khi file hiện tại còn hợp lệ, tránh ghi đè .bak tốt bằng file hỏng.
    if let Ok(current) = fs::read_to_string(&path) {
        if is_valid_layout(&current) {
            let _ = fs::write(&bak, current);
        }
    }
    fs::rename(&tmp, &path).map_err(|e| format!("Không thay được layout.json: {e}"))
}

#[cfg(test)]
mod tests {
    use super::is_valid_layout;

    #[test]
    fn accepts_legacy_and_current_layout_formats() {
        assert!(is_valid_layout("[]"));
        assert!(is_valid_layout(r#"{"schemaVersion":1,"widgets":[]}"#));
    }

    #[test]
    fn rejects_unknown_or_malformed_layout_formats() {
        assert!(!is_valid_layout(r#"{"schemaVersion":2,"widgets":[]}"#));
        assert!(!is_valid_layout(r#"{"schemaVersion":1,"widgets":{}}"#));
        assert!(!is_valid_layout("null"));
    }
}
