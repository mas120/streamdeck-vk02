//! Xuất báo cáo chẩn đoán frontend ra `app_data_dir/logs/`.
//!
//! Frontend gửi text đã ghép sẵn (thông tin môi trường + ring buffer lỗi);
//! Rust chỉ thêm phiên bản app, đặt tên file theo mốc thời gian và ghi.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::Manager;

const MAX_DIAGNOSTICS_BYTES: usize = 2 * 1024 * 1024;

fn write_report(dir: &Path, text: &str, stamp_ms: u128) -> Result<PathBuf, String> {
    fs::create_dir_all(dir).map_err(|e| format!("Không tạo được thư mục log: {e}"))?;
    let path = dir.join(format!("diagnostics-{stamp_ms}.txt"));
    fs::write(&path, text).map_err(|e| format!("Không ghi được file chẩn đoán: {e}"))?;
    Ok(path)
}

/// Ghi báo cáo chẩn đoán và trả về đường dẫn tuyệt đối của file.
#[tauri::command]
pub fn save_diagnostics(app: tauri::AppHandle, text: String) -> Result<String, String> {
    if text.len() > MAX_DIAGNOSTICS_BYTES {
        return Err("Nội dung chẩn đoán quá lớn".into());
    }
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Không lấy được thư mục dữ liệu: {e}"))?
        .join("logs");
    let stamp_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let body = format!(
        "Stream Deck VK02 — chẩn đoán\nPhiên bản: {}\n\n{text}",
        app.package_info().version
    );
    let path = write_report(&dir, &body, stamp_ms)?;
    Ok(path.display().to_string())
}

#[cfg(test)]
mod tests {
    use super::write_report;
    use std::fs;

    #[test]
    fn writes_report_with_timestamp_name() {
        let dir = std::env::temp_dir().join(format!("vk02-diag-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);

        let path = write_report(&dir, "nội dung", 123).expect("phải ghi được");

        assert_eq!(path.file_name().unwrap(), "diagnostics-123.txt");
        assert_eq!(fs::read_to_string(&path).unwrap(), "nội dung");
        let _ = fs::remove_dir_all(&dir);
    }
}
