use std::time::Duration;
use ::windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED};
use tauri::{Emitter, Manager};

mod actions;
mod app_icons;
mod audio;
mod autostart;
mod bongo;
mod config;
mod diagnostics;
mod layout;
mod media;
mod net;
mod weather;
mod windows;
mod windows_info;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            actions::trigger_action,
            windows::close_app,
            windows::shutdown_computer,
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
            windows::open_todo_window,
            windows::close_todo_window,
            windows_info::get_foreground_process,
            autostart::get_autostart,
            autostart::set_autostart
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
                            let rect = ::windows::Win32::Foundation::RECT {
                                left: p.x,
                                top: p.y,
                                right: p.x + s.width as i32,
                                bottom: p.y + s.height as i32,
                            };
                            // Lặp lại vì Windows có thể gỡ giới hạn khi đổi focus/hiển thị.
                            std::thread::spawn(move || loop {
                                unsafe {
                                    let _ = ::windows::Win32::UI::WindowsAndMessaging::ClipCursor(
                                        Some(&rect),
                                    );
                                }
                                std::thread::sleep(Duration::from_secs(1));
                            });
                        }

                        // Vì chuột bị giữ ở màn chính nên `pointermove` trên widget không bao
                        // giờ chạy. Phát vị trí con trỏ (chuẩn hoá theo màn chính) để mèo liếc
                        // mắt và tai lắc theo hướng di chuyển chuột.
                        let cursor_win = window.clone();
                        std::thread::spawn(move || {
                            let primary = cursor_win.primary_monitor().ok().flatten();
                            let (px, py, pw, ph) = match primary {
                                Some(m) => {
                                    let p = m.position();
                                    let s = m.size();
                                    (
                                        p.x as f64,
                                        p.y as f64,
                                        s.width.max(1) as f64,
                                        s.height.max(1) as f64,
                                    )
                                }
                                None => (0.0, 0.0, 1.0, 1.0),
                            };
                            loop {
                                let mut pt =
                                    ::windows::Win32::Foundation::POINT { x: 0, y: 0 };
                                let ok = unsafe {
                                    ::windows::Win32::UI::WindowsAndMessaging::GetCursorPos(
                                        &mut pt,
                                    )
                                    .is_ok()
                                };
                                if ok {
                                    let nx = ((pt.x as f64 - px) / pw).clamp(0.0, 1.0);
                                    let ny = ((pt.y as f64 - py) / ph).clamp(0.0, 1.0);
                                    let _ = cursor_win.emit(
                                        "bongo-cursor",
                                        serde_json::json!({ "x": nx, "y": ny }),
                                    );
                                }
                                std::thread::sleep(Duration::from_millis(45));
                            }
                        });
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
