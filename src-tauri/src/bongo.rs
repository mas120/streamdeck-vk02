//! Phát sự kiện phím toàn cục cho widget Bongo Cat (chỉ khi deck có phím này).

use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Once;
use std::thread;

use tauri::Emitter;

static ENABLED: AtomicBool = AtomicBool::new(false);
static HOOK: Once = Once::new();

pub(crate) fn classify_hand(key: rdev::Key) -> Option<&'static str> {
    use rdev::Key::*;
    match key {
        KeyQ | KeyW | KeyE | KeyR | KeyT | KeyA | KeyS | KeyD | KeyF | KeyG | KeyZ | KeyX
        | KeyC | KeyV | Space | ShiftLeft | ShiftRight | ControlLeft | ControlRight | Alt => {
            Some("left")
        }
        KeyI | KeyO | KeyP | KeyJ | KeyK | KeyL | Return | SemiColon | Quote | RightBracket
        | BackSlash | Minus | Equal => Some("right"),
        _ => None,
    }
}

/// Bật/tắt phát sự kiện phím. Hook bàn phím toàn cục chỉ được cài lần đầu khi có
/// phím Bongo Cat (rdev không gỡ hook được); sau đó chỉ đổi cờ.
#[tauri::command]
pub fn set_bongo_enabled(app: tauri::AppHandle, on: bool) {
    ENABLED.store(on, Ordering::Relaxed);
    if on {
        HOOK.call_once(|| spawn_listener(app));
    }
}

fn spawn_listener(app: tauri::AppHandle) {
    thread::spawn(move || {
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            // Phím giữ sẽ lặp KeyPress liên tục: chỉ báo lần nhấn đầu tiên.
            let mut held: HashSet<rdev::Key> = HashSet::new();
            if let Err(err) = rdev::listen(move |event| {
                if !ENABLED.load(Ordering::Relaxed) {
                    held.clear();
                    return;
                }
                let (key, action) = match event.event_type {
                    rdev::EventType::KeyPress(k) => {
                        if !held.insert(k) {
                            return;
                        }
                        (k, "down")
                    }
                    rdev::EventType::KeyRelease(k) => {
                        held.remove(&k);
                        (k, "up")
                    }
                    _ => return,
                };
                if let Some(hand) = classify_hand(key) {
                    let payload = serde_json::json!({ "hand": hand, "action": action });
                    let _ = app.emit_to("main", "bongo-key-event", payload);
                }
            }) {
                eprintln!("Bongo Cat listener failed: {:?}", err);
            }
        }));
    });
}

#[cfg(test)]
mod tests {
    use super::classify_hand;
    use rdev::Key;

    #[test]
    fn classification_matches_keyboard_halves() {
        assert_eq!(classify_hand(Key::KeyQ), Some("left"));
        assert_eq!(classify_hand(Key::KeyW), Some("left"));
        assert_eq!(classify_hand(Key::Space), Some("left"));
        assert_eq!(classify_hand(Key::KeyI), Some("right"));
        assert_eq!(classify_hand(Key::KeyP), Some("right"));
        assert_eq!(classify_hand(Key::Return), Some("right"));
        assert_eq!(classify_hand(Key::Tab), None);
    }
}
