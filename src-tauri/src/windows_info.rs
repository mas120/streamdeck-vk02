//! Lấy tên tiến trình, cửa sổ đang hiển thị và nhãn "thân thiện" cho app.
//! Toàn bộ code ở đây được chuyển nguyên từ `lib.rs` (P2-2), không đổi hành vi.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use windows::core::BOOL;
use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM};
use windows::Win32::System::ProcessStatus::GetProcessImageFileNameW;
use windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetForegroundWindow, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId,
    IsWindowVisible,
};

/// Lấy tên tiến trình sạch (vd "chrome.exe") từ PID.
/// Ưu tiên OpenProcess + GetProcessImageFileNameW (chỉ cần QUERY_LIMITED).
unsafe fn process_name_from_pid(pid: u32) -> String {
    if pid == 0 {
        return "System".to_string();
    }

    let handle = match OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
        Ok(h) => h,
        Err(_) => return format!("PID {pid}"),
    };

    let mut buffer = [0u16; 1024];
    let len = GetProcessImageFileNameW(handle, &mut buffer);
    let _ = CloseHandle(handle);

    if len == 0 {
        return format!("PID {pid}");
    }

    let full_path = String::from_utf16_lossy(&buffer[..len as usize]);
    full_path
        .rsplit(['\\', '/'])
        .next()
        .filter(|s| !s.is_empty())
        .unwrap_or(&full_path)
        .to_string()
}

/// Cache tên exe theo PID (sống 30 giây).
/// Vòng quét nền gọi get_audio_sessions mỗi 2 giây; không có cache thì mỗi lượt
/// phải OpenProcess + GetProcessImageFileNameW cho TỪNG cửa sổ đang hiển thị.
const NAME_CACHE_TTL: Duration = Duration::from_secs(30);
static NAME_CACHE: OnceLock<Mutex<HashMap<u32, (String, Instant)>>> = OnceLock::new();

pub(crate) fn cached_process_name(pid: u32) -> String {
    let cache = NAME_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    if let Ok(map) = cache.lock() {
        if let Some((name, at)) = map.get(&pid) {
            if at.elapsed() < NAME_CACHE_TTL {
                return name.clone();
            }
        }
    }
    // Syscall nằm NGOÀI khóa để không chặn các lệnh khác.
    let name = unsafe { process_name_from_pid(pid) };
    if let Ok(mut map) = cache.lock() {
        map.insert(pid, (name.clone(), Instant::now()));
        if map.len() > 512 {
            map.retain(|_, (_, at)| at.elapsed() < NAME_CACHE_TTL);
        }
    }
    name
}

/* -------------------------------------------------------------------------
   LẤY NHÃN "THÂN THIỆN" (tên web / app đang phát) TỪ TIÊU ĐỀ CỬA SỔ
   -------------------------------------------------------------------------
   LƯU Ý QUAN TRỌNG: Windows Core Audio (WASAPI) CHỈ cho biết tiến trình sở hữu
   audio session (vd "brave.exe"), KHÔNG hề cung cấp URL/tên website. Kể cả
   Volume Mixer của Windows cũng chỉ hiển thị tên trình duyệt.
   => Cách khả thi duy nhất (không cần bật remote-debugging) là đọc TIÊU ĐỀ CỬA
      SỔ của tiến trình đó. Với 1 tab đang phát (vd YouTube), tiêu đề trình duyệt
      thường là "YouTube - Brave" -> ta cắt hậu tố tên trình duyệt để còn "YouTube".
   Đánh đổi: tiêu đề cửa sổ phản ánh TAB ĐANG XEM (không phải tab phát ngầm),
   nên nhãn có thể lệch. Khi không tìm được cửa sổ nào, ta rơi về tên exe.
   ------------------------------------------------------------------------- */

pub(crate) struct WindowInfo {
    pid: u32,
    exe: String,
    title: String,
}

struct WindowCollector {
    items: Vec<WindowInfo>,
}

/// Callback EnumWindows: gom mọi cửa sổ đang hiển thị (pid + tên exe + tiêu đề).
unsafe extern "system" fn collect_windows_cb(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let collector = &mut *(lparam.0 as *mut WindowCollector);

    if IsWindowVisible(hwnd).as_bool() {
        let len = GetWindowTextLengthW(hwnd);
        if len > 0 {
            let mut pid: u32 = 0;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            if pid != 0 {
                let mut buffer = [0u16; 512];
                let copied = GetWindowTextW(hwnd, &mut buffer);
                if copied > 0 {
                    let title = String::from_utf16_lossy(&buffer[..copied as usize]);
                    let title = title.trim().to_string();
                    if !title.is_empty() {
                        collector.items.push(WindowInfo {
                            pid,
                            exe: cached_process_name(pid),
                            title,
                        });
                    }
                }
            }
        }
    }

    BOOL(1) // TRUE -> tiếp tục duyệt cửa sổ tiếp theo
}

/// Quét 1 LƯỢT toàn bộ cửa sổ đang hiển thị (tối ưu: chỉ 1 lần EnumWindows).
pub(crate) fn collect_visible_windows() -> Vec<WindowInfo> {
    let mut collector = WindowCollector { items: Vec::new() };
    unsafe {
        let _ = EnumWindows(
            Some(collect_windows_cb),
            LPARAM(&mut collector as *mut WindowCollector as isize),
        );
    }
    collector.items
}

/// Tên exe của cửa sổ đang focus (vd "chrome.exe") cho profile theo ứng dụng.
/// Trả None khi không có cửa sổ foreground hoặc không đọc được tiến trình.
#[tauri::command]
pub fn get_foreground_process() -> Option<String> {
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() {
            return None;
        }
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == 0 {
            return None;
        }
        Some(cached_process_name(pid))
    }
}

/// Cắt hậu tố tên trình duyệt khỏi tiêu đề cửa sổ:
/// "YouTube - Brave" -> "YouTube"; "Nhạc - YouTube - Brave" -> "Nhạc - YouTube".
fn strip_browser_suffix(title: &str) -> String {
    const BROWSERS: [&str; 12] = [
        "brave",
        "brave browser",
        "google chrome",
        "chrome",
        "microsoft edge",
        "microsoft edge beta",
        "mozilla firefox",
        "firefox",
        "opera",
        "vivaldi",
        "chromium",
        "yandex",
    ];

    let mut result = title.trim().to_string();
    loop {
        // ASCII-lowercase giữ nguyên độ dài byte nên chỉ số `pos` dùng được trên `result`.
        let lower = result.to_ascii_lowercase();
        let mut stripped = false;
        for sep in [" - ", " — ", " – ", " | "] {
            if let Some(pos) = lower.rfind(sep) {
                let tail = lower[pos + sep.len()..].trim();
                if BROWSERS.contains(&tail) {
                    result = result[..pos].trim().to_string();
                    stripped = true;
                    break;
                }
            }
        }
        if !stripped {
            break;
        }
    }
    result
}

/// Nhãn thân thiện cho 1 app: ưu tiên tiêu đề cửa sổ (đã lọc hậu tố trình duyệt);
/// nếu không tìm được thì dùng tên exe. Ưu tiên tiêu đề DÀI NHẤT (cụ thể nhất).
pub(crate) fn display_label(windows: &[WindowInfo], pid: u32, exe: &str) -> String {
    let best = windows
        .iter()
        .filter(|w| w.pid == pid || (!exe.is_empty() && w.exe.eq_ignore_ascii_case(exe)))
        .map(|w| &w.title)
        .max_by_key(|t| t.chars().count());

    if let Some(title) = best {
        let cleaned = strip_browser_suffix(title);
        if !cleaned.is_empty() {
            return cleaned;
        }
    }
    exe.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strip_browser_suffix_is_unicode_safe() {
        assert_eq!(strip_browser_suffix("YouTube - Brave"), "YouTube");
        assert_eq!(strip_browser_suffix("İstanbul — Nhạc - Google Chrome"), "İstanbul — Nhạc");
        assert_eq!(strip_browser_suffix("İİİ"), "İİİ");
    }

    #[test]
    fn display_label_prefers_window_title_then_exe() {
        let windows = vec![
            WindowInfo {
                pid: 10,
                exe: "brave.exe".into(),
                title: "YouTube - Brave".into(),
            },
            WindowInfo {
                pid: 10,
                exe: "brave.exe".into(),
                title: "Video dài hơn - YouTube - Brave".into(),
            },
            WindowInfo {
                pid: 20,
                exe: "notepad.exe".into(),
                title: "Ghi chú".into(),
            },
        ];

        // Tiêu đề dài nhất của đúng PID, đã cắt hậu tố trình duyệt.
        assert_eq!(display_label(&windows, 10, "brave.exe"), "Video dài hơn - YouTube");
        // Không khớp PID nhưng khớp exe -> vẫn dùng tiêu đề của cửa sổ đó.
        assert_eq!(display_label(&windows, 99, "notepad.exe"), "Ghi chú");
        // Không có cửa sổ nào -> rơi về tên exe.
        assert_eq!(display_label(&windows, 99, "unknown.exe"), "unknown.exe");
        assert_eq!(display_label(&[], 1, ""), "");
    }
}
