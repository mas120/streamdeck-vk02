//! Core Audio: master volume/mute, output peak, mic, và per-app mixer.
//! Toàn bộ code ở đây được chuyển nguyên từ `lib.rs` (P2-1), không đổi hành vi.

use std::sync::atomic::Ordering;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use windows::core::Interface;
use windows::Win32::Media::Audio::Endpoints::{IAudioEndpointVolume, IAudioMeterInformation};
use windows::Win32::Media::Audio::{
    eCapture, eConsole, eRender, IAudioCaptureClient, IAudioClient, AUDCLNT_SHAREMODE_SHARED,
    IAudioSessionControl2, IAudioSessionEnumerator, IAudioSessionManager2, IMMDeviceEnumerator,
    ISimpleAudioVolume, MMDeviceEnumerator,
};
use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_ALL};

use crate::windows_info::{cached_process_name, collect_visible_windows, display_label};
use crate::with_com;

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
   DỮ LIỆU TRẢ VỀ FRONTEND
   ========================================================================= */

#[derive(serde::Serialize)]
pub(crate) struct AudioSessionInfo {
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

pub(crate) fn set_system_master_volume(level_percent: f32) -> Result<(), String> {
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
pub(crate) struct MasterVolumeInfo {
    /// 0.0 – 100.0
    volume: f32,
    muted: bool,
}

#[derive(serde::Serialize)]
pub(crate) struct MicState {
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
pub(crate) fn get_master_volume() -> Result<MasterVolumeInfo, String> {
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
pub(crate) fn get_output_peak() -> Result<f32, String> {
    with_com(|| unsafe {
        get_render_meter()?
            .GetPeakValue()
            .map(|peak| peak.clamp(0.0, 1.0))
            .map_err(|e| e.to_string())
    })
}

/// Bật/tắt mute THẬT của hệ thống (không còn giả lập bằng cách đặt volume = 0).
#[tauri::command(async)]
pub(crate) fn set_master_mute(muted: bool) -> Result<(), String> {
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
pub(crate) fn get_mic_state() -> Result<MicState, String> {
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
pub(crate) fn toggle_mic_mute() -> Result<bool, String> {
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
   COMMAND: PER-APP AUDIO MIXER
   ========================================================================= */

/// Quét toàn bộ app đang có audio session và trả về danh sách gọn.
/// `async` -> chạy trên thread pool (EnumWindows + COM không chặn thread giao diện).
#[tauri::command(async)]
pub(crate) fn get_audio_sessions() -> Result<Vec<AudioSessionInfo>, String> {
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
pub(crate) fn set_app_volume(pid: u32, volume: f32) -> Result<(), String> {
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
pub(crate) fn toggle_app_mute(pid: u32) -> Result<bool, String> {
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
