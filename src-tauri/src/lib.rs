use std::collections::HashMap;
use std::os::windows::process::CommandExt;
use std::process::Command;
use std::sync::{Mutex, OnceLock};
use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;

mod app_icons;
mod bongo;
mod config;
mod diagnostics;
mod layout;
mod media;
mod net;
mod weather;

#[cfg(test)]
mod tests {
    #[test]
    fn strip_browser_suffix_is_unicode_safe() {
        assert_eq!(super::strip_browser_suffix("YouTube - Brave"), "YouTube");
        assert_eq!(super::strip_browser_suffix("İstanbul — Nhạc - Google Chrome"), "İstanbul — Nhạc");
        assert_eq!(super::strip_browser_suffix("İİİ"), "İİİ");
    }
}

use windows::core::{BOOL, Interface};
use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM};
use windows::Win32::Media::Audio::Endpoints::{IAudioEndpointVolume, IAudioMeterInformation};
use windows::Win32::Media::Audio::{
    eCapture, eConsole, eRender, IAudioCaptureClient, IAudioClient, AUDCLNT_SHAREMODE_SHARED, IAudioSessionControl2, IAudioSessionEnumerator,
    IAudioSessionManager2, IMMDeviceEnumerator, ISimpleAudioVolume, MMDeviceEnumerator,
};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, COINIT_MULTITHREADED,
};
use windows::Win32::System::ProcessStatus::GetProcessImageFileNameW;
use windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible,
};

/* =========================================================================
   1. TIỆN ÍCH COM (Windows Core Audio)
   ========================================================================= */

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

/// Lấy IAudioSessionManager2 từ default audio render endpoint.
unsafe fn get_session_manager() -> Result<IAudioSessionManager2, String> {
    let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
        .map_err(|e| format!("Không tạo được MMDeviceEnumerator: {e}"))?;

    let device = enumerator
        .GetDefaultAudioEndpoint(eRender, eConsole)
        .map_err(|e| format!("Không lấy được thiết bị âm thanh mặc định: {e}"))?;

    let manager: IAudioSessionManager2 = device
        .Activate(CLSCTX_ALL, None)
        .map_err(|e| format!("Không kích hoạt được IAudioSessionManager2: {e}"))?;

    Ok(manager)
}

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

fn cached_process_name(pid: u32) -> String {
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
   1b. LẤY NHÃN "THÂN THIỆN" (tên web / app đang phát) TỪ TIÊU ĐỀ CỬA SỔ
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

struct WindowInfo {
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
fn collect_visible_windows() -> Vec<WindowInfo> {
    let mut collector = WindowCollector { items: Vec::new() };
    unsafe {
        let _ = EnumWindows(
            Some(collect_windows_cb),
            LPARAM(&mut collector as *mut WindowCollector as isize),
        );
    }
    collector.items
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
fn display_label(windows: &[WindowInfo], pid: u32, exe: &str) -> String {
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

/// Tìm giao diện ISimpleAudioVolume của MỌI session thuộc PID.
/// Một tiến trình (nhất là trình duyệt) có thể sở hữu nhiều audio session;
/// chỉ chỉnh session đầu tiên có thể trúng cái không phát tiếng.
unsafe fn find_session_volumes(
    manager: &IAudioSessionManager2,
    pid: u32,
) -> Result<Vec<ISimpleAudioVolume>, String> {
    let enumerator: IAudioSessionEnumerator = manager
        .GetSessionEnumerator()
        .map_err(|e| format!("GetSessionEnumerator lỗi: {e}"))?;

    let count = enumerator
        .GetCount()
        .map_err(|e| format!("GetCount lỗi: {e}"))?;

    let mut found: Vec<ISimpleAudioVolume> = Vec::new();

    for i in 0..count {
        let control = match enumerator.GetSession(i) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let control2: IAudioSessionControl2 = match control.cast() {
            Ok(c) => c,
            Err(_) => continue,
        };

        let session_pid = match control2.GetProcessId() {
            Ok(p) => p,
            Err(_) => continue,
        };

        if session_pid != pid {
            continue;
        }

        if let Ok(volume) = control.cast::<ISimpleAudioVolume>() {
            found.push(volume);
        }
    }

    if found.is_empty() {
        Err(format!("Không tìm thấy audio session cho PID {pid}"))
    } else {
        Ok(found)
    }
}

/* =========================================================================
   2. DỮ LIỆU TRẢ VỀ FRONTEND
   ========================================================================= */

#[derive(serde::Serialize)]
struct AudioSessionInfo {
    pid: u32,
    /// Tên exe (vd "brave.exe") — dùng làm KHOÁ ổn định để lưu/chọn app.
    name: String,
    /// Nhãn thân thiện để hiển thị (vd "YouTube") — suy ra từ tiêu đề cửa sổ.
    label: String,
    volume: f32,
    muted: bool,
}

/// Lấy IAudioEndpointVolume của thiết bị phát mặc định (âm lượng master + mute THẬT).
unsafe fn get_endpoint_volume() -> Result<IAudioEndpointVolume, String> {
    let enumerator: IMMDeviceEnumerator =
        CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).map_err(|e| e.to_string())?;
    let device = enumerator
        .GetDefaultAudioEndpoint(eRender, eConsole)
        .map_err(|e| e.to_string())?;
    device
        .Activate(CLSCTX_ALL, None)
        .map_err(|e| e.to_string())
}

unsafe fn get_render_meter() -> Result<IAudioMeterInformation, String> {
    let enumerator: IMMDeviceEnumerator =
        CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).map_err(|e| e.to_string())?;
    let device = enumerator
        .GetDefaultAudioEndpoint(eRender, eConsole)
        .map_err(|e| e.to_string())?;
    device
        .Activate(CLSCTX_ALL, None)
        .map_err(|e| e.to_string())
}

fn set_system_master_volume(level_percent: f32) -> Result<(), String> {
    with_com(|| unsafe {
        let endpoint_volume = get_endpoint_volume()?;
        let scalar = (level_percent / 100.0).clamp(0.0, 1.0);
        endpoint_volume
            .SetMasterVolumeLevelScalar(scalar, std::ptr::null())
            .map_err(|e| e.to_string())
    })
}

/// Âm lượng master + trạng thái mute THẬT của hệ thống, để deck luôn khớp với
/// thực tế (đổi bằng phím cứng, Volume Mixer, app khác...).
#[derive(serde::Serialize)]
struct MasterVolumeInfo {
    /// 0.0 – 100.0
    volume: f32,
    muted: bool,
}

#[derive(serde::Serialize)]
struct MicState {
    muted: bool,
    peak: f32,
    error: Option<String>,
}

static MIC_STREAM_ERROR: Mutex<Option<String>> = Mutex::new(None);
static MIC_PEAK: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);

/// Lấy IAudioEndpointVolume của thiết bị thu mặc định (microphone).
unsafe fn get_capture_endpoint_volume() -> Result<IAudioEndpointVolume, String> {
    let enumerator: IMMDeviceEnumerator =
        CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).map_err(|e| e.to_string())?;
    let device = enumerator
        .GetDefaultAudioEndpoint(eCapture, eConsole)
        .map_err(|e| e.to_string())?;
    device
        .Activate(CLSCTX_ALL, None)
        .map_err(|e| e.to_string())
}

unsafe fn get_capture_meter() -> Result<IAudioMeterInformation, String> {
    let enumerator: IMMDeviceEnumerator =
        CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).map_err(|e| e.to_string())?;
    let device = enumerator
        .GetDefaultAudioEndpoint(eCapture, eConsole)
        .map_err(|e| e.to_string())?;
    device
        .Activate(CLSCTX_ALL, None)
        .map_err(|e| e.to_string())
}

/// `async` -> chạy trên thread pool thay vì thread chính, để vòng quét nền
/// không làm giật giao diện.
#[tauri::command(async)]
fn get_master_volume() -> Result<MasterVolumeInfo, String> {
    with_com(|| unsafe {
        let endpoint_volume = get_endpoint_volume()?;
        let scalar = endpoint_volume
            .GetMasterVolumeLevelScalar()
            .map_err(|e| e.to_string())?;
        let muted = endpoint_volume
            .GetMute()
            .map_err(|e| e.to_string())?
            .as_bool();
        Ok(MasterVolumeInfo {
            volume: (scalar * 100.0).clamp(0.0, 100.0),
            muted,
        })
    })
}

#[tauri::command(async)]
fn get_output_peak() -> Result<f32, String> {
    with_com(|| unsafe {
        get_render_meter()?
            .GetPeakValue()
            .map(|peak| peak.clamp(0.0, 1.0))
            .map_err(|e| e.to_string())
    })
}

/// Bật/tắt mute THẬT của hệ thống (không còn giả lập bằng cách đặt volume = 0).
#[tauri::command(async)]
fn set_master_mute(muted: bool) -> Result<(), String> {
    with_com(|| unsafe {
        let endpoint_volume = get_endpoint_volume()?;
        endpoint_volume
            .SetMute(muted, std::ptr::null())
            .map_err(|e| e.to_string())
    })
}

/// Meter của endpoint thu chỉ có dữ liệu khi có stream thu đang mở; giữ một stream nền.
fn ensure_capture_stream() {
    static STARTED: OnceLock<()> = OnceLock::new();
    STARTED.get_or_init(|| {
        std::thread::spawn(|| loop {
            let res = with_com(|| unsafe {
                let enumerator: IMMDeviceEnumerator =
                    CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                        .map_err(|e| e.to_string())?;
                let device = enumerator
                    .GetDefaultAudioEndpoint(eCapture, eConsole)
                    .map_err(|e| e.to_string())?;
                let client: IAudioClient = device
                    .Activate(CLSCTX_ALL, None)
                    .map_err(|e| e.to_string())?;
                let fmt = client.GetMixFormat().map_err(|e| e.to_string())?;
                client
                    .Initialize(AUDCLNT_SHAREMODE_SHARED, 0, 10_000_000, 0, fmt, None)
                    .map_err(|e| e.to_string())?;
                let capture: IAudioCaptureClient =
                    client.GetService().map_err(|e| e.to_string())?;
                client.Start().map_err(|e| e.to_string())?;
                *MIC_STREAM_ERROR.lock().unwrap() = None;
                let f = std::ptr::read_unaligned(fmt);
                let bits = f.wBitsPerSample;
                let ch = f.nChannels.max(1) as usize;
                loop {
                    std::thread::sleep(Duration::from_millis(20));
                    let mut peak = 0f32;
                    while capture.GetNextPacketSize().map_err(|e| e.to_string())? > 0 {
                        let mut data: *mut u8 = std::ptr::null_mut();
                        let mut frames = 0u32;
                        let mut flags = 0u32;
                        capture
                            .GetBuffer(&mut data, &mut frames, &mut flags, None, None)
                            .map_err(|e| e.to_string())?;
                        let n = frames as usize * ch;
                        if flags & 2 == 0 && !data.is_null() {
                            if bits == 32 {
                                let s = std::slice::from_raw_parts(data as *const f32, n);
                                for v in s {
                                    peak = peak.max(v.abs());
                                }
                            } else if bits == 16 {
                                let s = std::slice::from_raw_parts(data as *const i16, n);
                                for v in s {
                                    peak = peak.max((*v as f32).abs() / 32768.0);
                                }
                            }
                        }
                        capture.ReleaseBuffer(frames).map_err(|e| e.to_string())?;
                    }
                    let prev = f32::from_bits(MIC_PEAK.load(Ordering::Relaxed));
                    let next = if peak > prev { peak } else { prev * 0.85 };
                    MIC_PEAK.store(next.to_bits(), Ordering::Relaxed);
                }
                #[allow(unreachable_code)]
                Ok::<(), String>(())
            });
            if let Err(e) = res {
                *MIC_STREAM_ERROR.lock().unwrap() = Some(e);
            }
            MIC_PEAK.store(0, Ordering::Relaxed);
            std::thread::sleep(Duration::from_secs(1));
        });
    });
}

#[tauri::command(async)]
fn get_mic_state() -> Result<MicState, String> {
    ensure_capture_stream();
    with_com(|| unsafe {
        let (endpoint, meter) = match (get_capture_endpoint_volume(), get_capture_meter()) {
            (Ok(e), Ok(m)) => (e, m),
            (Err(e), _) | (_, Err(e)) => {
                return Ok(MicState { muted: true, peak: 0.0, error: Some(e) });
            }
        };
        let scalar = endpoint.GetMasterVolumeLevelScalar().unwrap_or(1.0);
        let muted = endpoint
            .GetMute()
            .map_err(|e| e.to_string())?
            .as_bool()
            || scalar <= 0.0;
        let peak = f32::from_bits(MIC_PEAK.load(Ordering::Relaxed))
            .max(meter.GetPeakValue().unwrap_or(0.0))
            .clamp(0.0, 1.0);
        let error = MIC_STREAM_ERROR.lock().unwrap().clone();
        Ok(MicState { muted, peak, error })
    })
}

#[tauri::command(async)]
fn toggle_mic_mute() -> Result<bool, String> {
    with_com(|| unsafe {
        let endpoint = get_capture_endpoint_volume()?;
        let current = endpoint
            .GetMute()
            .map_err(|e| e.to_string())?
            .as_bool();
        let next = !current;
        endpoint
            .SetMute(next, std::ptr::null())
            .map_err(|e| e.to_string())?;
        Ok(next)
    })
}

/* =========================================================================
   3. COMMAND: PER-APP AUDIO MIXER
   ========================================================================= */

/// Quét toàn bộ app đang có audio session và trả về danh sách gọn.
/// `async` -> chạy trên thread pool (EnumWindows + COM không chặn thread giao diện).
#[tauri::command(async)]
fn get_audio_sessions() -> Result<Vec<AudioSessionInfo>, String> {
    with_com(|| unsafe {
        let manager = get_session_manager()?;
        let enumerator: IAudioSessionEnumerator = manager
            .GetSessionEnumerator()
            .map_err(|e| format!("GetSessionEnumerator lỗi: {e}"))?;
        let count = enumerator
            .GetCount()
            .map_err(|e| format!("GetCount lỗi: {e}"))?;

        // Quét cửa sổ 1 lần để suy ra nhãn thân thiện (tên web/app đang phát).
        if count == 0 {
            return Ok(Vec::new());
        }
        let windows = collect_visible_windows();

        let mut sessions: Vec<AudioSessionInfo> = Vec::new();

        for i in 0..count {
            let control = match enumerator.GetSession(i) {
                Ok(c) => c,
                Err(_) => continue,
            };

            let control2: IAudioSessionControl2 = match control.cast() {
                Ok(c) => c,
                Err(_) => continue,
            };

            let pid = match control2.GetProcessId() {
                Ok(p) => p,
                Err(_) => continue,
            };

            // Bỏ qua "System Sounds" (PID 0) để danh sách sạch.
            if pid == 0 {
                continue;
            }

            let volume_iface: ISimpleAudioVolume = match control.cast() {
                Ok(v) => v,
                Err(_) => continue,
            };

            let volume = volume_iface.GetMasterVolume().unwrap_or(1.0);
            let muted = volume_iface
                .GetMute()
                .map(|b| b.as_bool())
                .unwrap_or(false);

            // Gộp trùng PID: lấy mức âm lượng CAO NHẤT; chỉ coi là tắt tiếng
            // khi MỌI session của PID đều đang mute.
            if let Some(existing) = sessions.iter_mut().find(|s| s.pid == pid) {
                existing.volume = existing.volume.max(volume);
                existing.muted = existing.muted && muted;
                continue;
            }

            let name = cached_process_name(pid);
            sessions.push(AudioSessionInfo {
                pid,
                label: display_label(&windows, pid, &name),
                name,
                volume,
                muted,
            });
        }

        Ok(sessions)
    })
}

/// Đặt âm lượng cho MỌI session thuộc PID (volume: 0.0 - 1.0).
#[tauri::command(async)]
fn set_app_volume(pid: u32, volume: f32) -> Result<(), String> {
    with_com(|| unsafe {
        let manager = get_session_manager()?;
        let sessions = find_session_volumes(&manager, pid)?;
        let scalar = volume.clamp(0.0, 1.0);
        for session in &sessions {
            session
                .SetMasterVolume(scalar, std::ptr::null())
                .map_err(|e| format!("SetMasterVolume lỗi: {e}"))?;
        }
        Ok(())
    })
}

/// Đảo trạng thái mute của app (áp dụng cho MỌI session của PID),
/// trả về trạng thái muted mới.
#[tauri::command(async)]
fn toggle_app_mute(pid: u32) -> Result<bool, String> {
    with_com(|| unsafe {
        let manager = get_session_manager()?;
        let sessions = find_session_volumes(&manager, pid)?;
        // "Đang tắt" chỉ khi MỌI session đều mute (khớp cách get_audio_sessions gộp).
        let all_muted = sessions
            .iter()
            .all(|s| s.GetMute().map(|b| b.as_bool()).unwrap_or(false));
        let new_state = !all_muted;
        for session in &sessions {
            session
                .SetMute(new_state, std::ptr::null())
                .map_err(|e| format!("SetMute lỗi: {e}"))?;
        }
        Ok(new_state)
    })
}

/* =========================================================================
   4. THỜI TIẾT, MẠNG VÀ BONGO CAT đã tách ra weather.rs / net.rs / bongo.rs
   ========================================================================= */

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
fn trigger_action(
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
            if let Err(e) = set_system_master_volume(vol_level) {
                eprintln!("Lỗi chỉnh âm lượng: {:?}", e);
                return Err(e.to_string());
            }
        }
        _ => return Err("Action không hợp lệ".into()),
    }
    Ok(())
}

/// Mở (hoặc đưa lên trước) cửa sổ soạn To-do trên MÀN HÌNH PC — không phải panel VK02.
/// `async`: tạo cửa sổ từ command đồng bộ trên Windows có thể deadlock.
#[tauri::command(async)]
fn open_todo_window(app: tauri::AppHandle) -> Result<(), String> {
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
fn close_todo_window(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("todo") {
        let _ = w.close();
    }
}

#[tauri::command]
fn close_app(app_handle: tauri::AppHandle) {
    app_handle.exit(0);
}

#[tauri::command]
fn shutdown_computer() -> Result<(), String> {
        Command::new("shutdown.exe")
                .args(["/s", "/t", "0"])
                .creation_flags(0x08000000)
                .spawn()
                .map(|_| ())
                .map_err(|error| format!("Không thể gửi lệnh tắt máy: {error}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            trigger_action,
            close_app,
            shutdown_computer,
            bongo::set_bongo_enabled,
            layout::load_layout,
            layout::save_layout,
            config::load_app_config,
            config::save_app_config,
            diagnostics::save_diagnostics,
            get_audio_sessions,
            set_app_volume,
            toggle_app_mute,
            get_master_volume,
            get_output_peak,
            set_master_mute,
            get_mic_state,
            toggle_mic_mute,
            weather::get_weather_data,
            weather::locate_by_ip,
            media::get_media_state,
            media::get_media_thumbnail,
            media::media_control,
            app_icons::get_app_icon,
            app_icons::get_favicon,
            app_icons::save_icon_pair,
            open_todo_window,
            close_todo_window
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
                            let rect = windows::Win32::Foundation::RECT {
                                left: p.x,
                                top: p.y,
                                right: p.x + s.width as i32,
                                bottom: p.y + s.height as i32,
                            };
                            // Lặp lại vì Windows có thể gỡ giới hạn khi đổi focus/hiển thị.
                            std::thread::spawn(move || loop {
                                unsafe {
                                    let _ = windows::Win32::UI::WindowsAndMessaging::ClipCursor(
                                        Some(&rect),
                                    );
                                }
                                std::thread::sleep(Duration::from_secs(1));
                            });
                        }
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
