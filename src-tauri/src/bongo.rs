//! Phát sự kiện phím toàn cục cho widget Bongo Cat (chỉ khi deck có phím này).
//!
//! Vì sao không dùng raw input: bộ gõ tiếng Việt (EVKey/Unikey) chặn/không cho
//! phím dấu (s, f, r, x, j...) đi qua raw input, nên mèo không thấy phím dấu.
//!
//! Dùng `WH_KEYBOARD_LL` và **cài lại hook mỗi giây** để luôn nằm đầu chuỗi hook
//! (SetWindowsHookEx luôn chèn hook mới lên đầu). Bộ gõ bơm bản sao phím qua
//! `SendInput` với cờ `LLKHF_INJECTED`, nên ta bỏ qua các sự kiện `injected` để
//! chỉ còn đúng phím vật lý — không nhân đôi, không dính Backspace ảo của bộ gõ.
//!
//! Luôn gọi `CallNextHookEx` để bộ gõ và các app khác vẫn hoạt động bình thường.
//! Debug: đặt biến môi trường `BONGO_DEBUG=1` để xem log phím.

use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, Once, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter};
use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, PeekMessageW, SetWindowsHookExW, TranslateMessage,
    UnhookWindowsHookEx, HC_ACTION, KBDLLHOOKSTRUCT, MSG, PM_REMOVE, WH_KEYBOARD_LL, WM_KEYDOWN,
    WM_KEYUP, WM_SYSKEYDOWN, WM_SYSKEYUP,
};

static ENABLED: AtomicBool = AtomicBool::new(false);
static HOOK: Once = Once::new();
static APP: OnceLock<AppHandle> = OnceLock::new();
static HELD: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
static DEBUG: OnceLock<bool> = OnceLock::new();

/// `LLKHF_INJECTED` trong `KBDLLHOOKSTRUCT.flags`: phím do phần mềm bơm vào.
const LLKHF_INJECTED: u32 = 0x10;

fn held() -> &'static Mutex<HashSet<String>> {
    HELD.get_or_init(|| Mutex::new(HashSet::new()))
}

fn debug_on() -> bool {
    *DEBUG.get_or_init(|| std::env::var_os("BONGO_DEBUG").is_some())
}

fn emit_key(code: &str, action: &str) {
    if debug_on() {
        eprintln!("bongo: {action:4} {code}");
    }
    let Some(app) = APP.get() else { return };
    let payload = serde_json::json!({
        "hand": classify_hand_code(code),
        "action": action,
        "code": code,
    });
    let _ = app.emit_to("main", "bongo-key-event", payload);
}

/// Bật/tắt phát sự kiện phím. Thread hook chỉ chạy lần đầu khi có phím Bongo Cat.
#[tauri::command]
pub fn set_bongo_enabled(app: tauri::AppHandle, on: bool) {
    if debug_on() {
        eprintln!("bongo: set_bongo_enabled({on})");
    }
    ENABLED.store(on, Ordering::Relaxed);
    if on {
        let _ = APP.set(app);
        HOOK.call_once(spawn_listener);
    }
}

fn spawn_listener() {
    thread::spawn(|| {
        let _ = std::panic::catch_unwind(|| unsafe {
            let mut hook = None;
            let mut next_install = Instant::now();
            let mut msg = MSG::default();

            loop {
                if Instant::now() >= next_install {
                    if let Some(old) = hook.take() {
                        let _ = UnhookWindowsHookEx(old);
                    }
                    match SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_hook), None, 0) {
                        Ok(new_hook) => hook = Some(new_hook),
                        Err(err) => eprintln!("Bongo Cat: không cài được keyboard hook: {err}"),
                    }
                    // Cài lại định kỳ để luôn đứng đầu chuỗi hook, tránh bị bộ gõ
                    // cài hook sau và "nuốt" phím dấu.
                    next_install = Instant::now() + Duration::from_secs(1);
                }

                while PeekMessageW(&mut msg, None, 0, 0, PM_REMOVE).as_bool() {
                    let _ = TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                }
                thread::sleep(Duration::from_millis(5));
            }
        });
    });
}

unsafe extern "system" fn keyboard_hook(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code == HC_ACTION as i32 && ENABLED.load(Ordering::Relaxed) {
        let info = unsafe { &*(lparam.0 as *const KBDLLHOOKSTRUCT) };
        // Chỉ nhận phím vật lý; bỏ bản sao do bộ gõ bơm vào (tránh nhân đôi).
        if info.flags.0 & LLKHF_INJECTED == 0 {
            let action = match wparam.0 as u32 {
                WM_KEYDOWN | WM_SYSKEYDOWN => Some("down"),
                WM_KEYUP | WM_SYSKEYUP => Some("up"),
                _ => None,
            };
            if let Some(action) = action {
                if let Some(key_code) = key_code_from_vk(info.vkCode) {
                    let should_emit = if action == "down" {
                        let mut set = held().lock().unwrap_or_else(|e| e.into_inner());
                        set.insert(key_code.clone())
                    } else {
                        let mut set = held().lock().unwrap_or_else(|e| e.into_inner());
                        set.remove(&key_code)
                    };
                    if should_emit {
                        emit_key(&key_code, action);
                    }
                }
            }
        }
    }
    unsafe { CallNextHookEx(None, code, wparam, lparam) }
}

fn key_code_from_vk(vk: u32) -> Option<String> {
    if (0x41..=0x5A).contains(&vk) {
        return Some(format!("Key{}", vk as u8 as char)); // A-Z
    }
    if (0x30..=0x39).contains(&vk) {
        return Some(format!("Num{}", vk - 0x30)); // 0-9
    }
    if (0x70..=0x7B).contains(&vk) {
        return Some(format!("F{}", vk - 0x6F)); // F1-F12
    }
    if (0x60..=0x69).contains(&vk) {
        return Some(format!("Kp{}", vk - 0x60)); // numpad
    }
    let code = match vk {
        0x08 => "Backspace",
        0x09 => "Tab",
        0x0D => "Return",
        0x13 => "Pause",
        0x14 => "CapsLock",
        0x1B => "Escape",
        0x20 => "Space",
        0x21 => "PageUp",
        0x22 => "PageDown",
        0x23 => "End",
        0x24 => "Home",
        0x25 => "LeftArrow",
        0x26 => "UpArrow",
        0x27 => "RightArrow",
        0x28 => "DownArrow",
        0x2C => "PrintScreen",
        0x2D => "Insert",
        0x2E => "Delete",
        0x5B => "MetaLeft",
        0x5C => "MetaRight",
        0x5D => "Function",
        0x90 => "NumLock",
        0x91 => "ScrollLock",
        0xA0 => "ShiftLeft",
        0xA1 => "ShiftRight",
        0xA2 => "ControlLeft",
        0xA3 => "ControlRight",
        0xA4 => "Alt",
        0xA5 => "AltGr",
        0xBA => "SemiColon",
        0xBB => "Equal",
        0xBC => "Comma",
        0xBD => "Minus",
        0xBE => "Dot",
        0xBF => "Slash",
        0xC0 => "BackQuote",
        0xDB => "LeftBracket",
        0xDC => "BackSlash",
        0xDD => "RightBracket",
        0xDE => "Quote",
        0xE2 => "IntlBackslash",
        _ => return None,
    };
    Some(code.to_string())
}

/// Tay trái/phải dự phòng khi phím không có trong layout của widget
/// (frontend vẫn ưu tiên `data-side` của phím).
fn classify_hand_code(code: &str) -> &'static str {
    if let Some(ch) = code.strip_prefix("Key").and_then(|rest| rest.chars().next()) {
        return match ch {
            'Q' | 'W' | 'E' | 'R' | 'T' | 'A' | 'S' | 'D' | 'F' | 'G' | 'Z' | 'X' | 'C'
            | 'V' | 'B' => "left",
            _ => "right",
        };
    }
    if let Some(num) = code.strip_prefix("Num").and_then(|rest| rest.parse::<u8>().ok()) {
        return if num <= 5 { "left" } else { "right" };
    }
    match code {
        "Space" | "ShiftLeft" | "ControlLeft" | "Alt" | "BackQuote" | "IntlBackslash" => "left",
        _ => "right",
    }
}

#[cfg(test)]
mod tests {
    use super::{classify_hand_code, key_code_from_vk};

    #[test]
    fn physical_keys_map_to_rdev_style_codes() {
        assert_eq!(key_code_from_vk(0x51).as_deref(), Some("KeyQ"));
        assert_eq!(key_code_from_vk(0x53).as_deref(), Some("KeyS"));
        assert_eq!(key_code_from_vk(0x4A).as_deref(), Some("KeyJ"));
        assert_eq!(key_code_from_vk(0x31).as_deref(), Some("Num1"));
        assert_eq!(key_code_from_vk(0x30).as_deref(), Some("Num0"));
        assert_eq!(key_code_from_vk(0x70).as_deref(), Some("F1"));
        assert_eq!(key_code_from_vk(0x7B).as_deref(), Some("F12"));
        assert_eq!(key_code_from_vk(0x0D).as_deref(), Some("Return"));
        assert_eq!(key_code_from_vk(0x20).as_deref(), Some("Space"));
        assert_eq!(key_code_from_vk(0xA1).as_deref(), Some("ShiftRight"));
        assert_eq!(key_code_from_vk(0x26).as_deref(), Some("UpArrow"));
        assert_eq!(key_code_from_vk(0xDE).as_deref(), Some("Quote"));
        assert_eq!(key_code_from_vk(0xFF), None);
    }

    #[test]
    fn hand_classification_matches_keyboard_halves() {
        assert_eq!(classify_hand_code("KeyQ"), "left");
        assert_eq!(classify_hand_code("KeyS"), "left");
        assert_eq!(classify_hand_code("KeyB"), "left");
        assert_eq!(classify_hand_code("Num5"), "left");
        assert_eq!(classify_hand_code("KeyY"), "right");
        assert_eq!(classify_hand_code("KeyN"), "right");
        assert_eq!(classify_hand_code("Num6"), "right");
        assert_eq!(classify_hand_code("ShiftRight"), "right");
        assert_eq!(classify_hand_code("Space"), "left");
    }
}
