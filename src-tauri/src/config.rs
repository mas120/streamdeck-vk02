//! Cài đặt hệ thống `app_data_dir/config.json`: ghi nguyên tử (tmp -> rename), giữ bản `.bak`.

use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

use tauri::Manager;

static WRITE_LOCK: Mutex<()> = Mutex::new(());
const MAX_CONFIG_BYTES: usize = 256 * 1024;

fn config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Không lấy được thư mục dữ liệu: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("Không tạo được thư mục dữ liệu: {e}"))?;
    Ok(dir.join("config.json"))
}

fn is_config_object(raw: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(raw).map_or(false, |v| v.is_object())
}

/// Trả về nội dung config hợp lệ (file chính, rồi bản .bak) hoặc None nếu chưa có.
#[tauri::command]
pub fn load_app_config(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = config_path(&app)?;
    let bak = path.with_extension("json.bak");
    for candidate in [&path, &bak] {
        if let Ok(raw) = fs::read_to_string(candidate) {
            if is_config_object(&raw) {
                return Ok(Some(raw));
            }
        }
    }
    Ok(None)
}

#[tauri::command]
pub fn save_app_config(app: tauri::AppHandle, json: String) -> Result<(), String> {
    if json.len() > MAX_CONFIG_BYTES || !is_config_object(&json) {
        return Err("Config không hợp lệ".into());
    }
    let path = config_path(&app)?;
    let tmp = path.with_extension("json.tmp");
    let bak = path.with_extension("json.bak");

    let _guard = WRITE_LOCK.lock().map_err(|_| "Khóa ghi config bị lỗi".to_string())?;
    let write_tmp = || -> std::io::Result<()> {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(json.as_bytes())?;
        f.sync_all()
    };
    write_tmp().map_err(|e| format!("Không ghi được config: {e}"))?;
    if let Ok(current) = fs::read_to_string(&path) {
        if is_config_object(&current) {
            let _ = fs::write(&bak, current);
        }
    }
    fs::rename(&tmp, &path).map_err(|e| format!("Không thay được config.json: {e}"))
}
