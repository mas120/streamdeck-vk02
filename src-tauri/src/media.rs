//! Điều khiển phiên media của Windows (GSMTC): đọc bài đang phát + play/pause, next, prev, tua.

use serde::Serialize;
use base64::Engine;
use std::time::{SystemTime, UNIX_EPOCH};
use windows::Storage::Streams::DataReader;
use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSession as Session,
    GlobalSystemMediaTransportControlsSessionManager as Manager,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status,
};
use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED};

/// FILETIME epoch (1601) -> Unix epoch (1970), đơn vị 100ns.
const EPOCH_DIFF_100NS: i64 = 116_444_736_000_000_000;

#[derive(Serialize, Default)]
pub struct MediaState {
    active: bool,
    source: String,
    title: String,
    artist: String,
    status: String,
    position_secs: f64,
    duration_secs: f64,
    can_play_pause: bool,
    can_next: bool,
    can_prev: bool,
    can_seek: bool,
}

fn werr(err: windows::core::Error) -> String {
    format!("GSMTC lỗi: {err}")
}

/// Ưu tiên phiên đang Playing; không có thì lấy phiên hiện hành của hệ thống.
fn pick_session() -> Result<Option<Session>, String> {
    let manager = Manager::RequestAsync().map_err(werr)?.join().map_err(werr)?;
    for s in manager.GetSessions().map_err(werr)? {
        let playing = s.GetPlaybackInfo().and_then(|i| i.PlaybackStatus()).map_or(false, |st| st == Status::Playing);
        if playing {
            return Ok(Some(s));
        }
    }
    Ok(manager.GetCurrentSession().ok())
}

/// Vị trí hiện tại (giây): Chromium chỉ cập nhật mốc khi có thay đổi nên cộng thêm thời gian trôi qua nếu đang phát.
fn position_secs(session: &Session, playing: bool) -> (f64, f64) {
    let Ok(t) = session.GetTimelineProperties() else { return (0.0, 0.0) };
    let duration = t.EndTime().map_or(0.0, |d| d.Duration as f64 / 1e7);
    let mut pos = t.Position().map_or(0.0, |d| d.Duration as f64 / 1e7);
    if playing {
        if let (Ok(updated), Ok(now)) = (t.LastUpdatedTime(), SystemTime::now().duration_since(UNIX_EPOCH)) {
            let now_100ns = now.as_nanos() as i64 / 100 + EPOCH_DIFF_100NS;
            let elapsed = (now_100ns - updated.UniversalTime) as f64 / 1e7;
            if elapsed > 0.0 && elapsed < 86_400.0 {
                pos += elapsed;
            }
        }
    }
    if duration > 0.0 {
        pos = pos.min(duration);
    }
    (pos.max(0.0), duration)
}

fn status_name(s: Status) -> &'static str {
    match s {
        Status::Playing => "playing",
        Status::Paused => "paused",
        Status::Stopped => "stopped",
        Status::Opened => "opened",
        Status::Changing => "changing",
        _ => "closed",
    }
}

fn read_state() -> Result<MediaState, String> {
    let Some(session) = pick_session()? else { return Ok(MediaState::default()) };
    let mut st = MediaState { active: true, ..Default::default() };
    st.source = session.SourceAppUserModelId().map(|s| s.to_string()).unwrap_or_default();
    if let Ok(props) = session.TryGetMediaPropertiesAsync().and_then(|op| op.join()) {
        st.title = props.Title().map(|s| s.to_string()).unwrap_or_default();
        st.artist = props.Artist().map(|s| s.to_string()).unwrap_or_default();
    }
    let mut playing = false;
    if let Ok(info) = session.GetPlaybackInfo() {
        if let Ok(status) = info.PlaybackStatus() {
            playing = status == Status::Playing;
            st.status = status_name(status).to_string();
        }
        if let Ok(c) = info.Controls() {
            st.can_play_pause = c.IsPlayPauseToggleEnabled().unwrap_or(false);
            st.can_next = c.IsNextEnabled().unwrap_or(false);
            st.can_prev = c.IsPreviousEnabled().unwrap_or(false);
            st.can_seek = c.IsPlaybackPositionEnabled().unwrap_or(false);
        }
    }
    (st.position_secs, st.duration_secs) = position_secs(&session, playing);
    Ok(st)
}

fn control(action: &str, value: Option<f64>) -> Result<bool, String> {
    let Some(session) = pick_session()? else { return Ok(false) };
    let ok = match action {
        "play_pause" => session.TryTogglePlayPauseAsync().map_err(werr)?.join().map_err(werr)?,
        "next" => session.TrySkipNextAsync().map_err(werr)?.join().map_err(werr)?,
        "prev" => session.TrySkipPreviousAsync().map_err(werr)?.join().map_err(werr)?,
        "seek_by" | "seek_to" => {
            let playing = session.GetPlaybackInfo().and_then(|i| i.PlaybackStatus()).map_or(false, |s| s == Status::Playing);
            let (pos, duration) = position_secs(&session, playing);
            let v = value.filter(|v| v.is_finite()).ok_or("Thiếu giá trị tua")?;
            let mut target = if action == "seek_by" { pos + v } else { v };
            target = target.max(0.0);
            if duration > 0.0 {
                target = target.min(duration);
            }
            session.TryChangePlaybackPositionAsync((target * 1e7) as i64).map_err(werr)?.join().map_err(werr)?
        }
        _ => return Err(format!("Hành động không hợp lệ: {action}")),
    };
    Ok(ok)
}

/// Chạy việc WinRT trên luồng blocking đã khởi tạo COM (MTA).
async fn run_winrt<T: Send + 'static>(job: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let inited = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }.is_ok();
        let result = job();
        if inited {
            unsafe { CoUninitialize() };
        }
        result
    })
    .await
    .map_err(|err| format!("media lỗi: {err}"))?
}

#[tauri::command]
pub async fn get_media_state() -> Result<MediaState, String> {
    run_winrt(read_state).await
}

const MAX_THUMB_BYTES: u64 = 2 * 1024 * 1024;

/// Ảnh bìa của phiên hiện tại dưới dạng data URL; chuỗi rỗng nếu không có.
fn read_thumbnail() -> Result<String, String> {
    let Some(session) = pick_session()? else { return Ok(String::new()) };
    let props = session.TryGetMediaPropertiesAsync().map_err(werr)?.join().map_err(werr)?;
    let Ok(thumb) = props.Thumbnail() else { return Ok(String::new()) };
    let stream = thumb.OpenReadAsync().map_err(werr)?.join().map_err(werr)?;
    let size = stream.Size().map_err(werr)?;
    if size == 0 || size > MAX_THUMB_BYTES {
        return Ok(String::new());
    }
    let mime = stream.ContentType().map(|s| s.to_string()).unwrap_or_default();
    let reader = DataReader::CreateDataReader(&stream.GetInputStreamAt(0).map_err(werr)?).map_err(werr)?;
    reader.LoadAsync(size as u32).map_err(werr)?.join().map_err(werr)?;
    let mut buf = vec![0u8; size as usize];
    reader.ReadBytes(&mut buf).map_err(werr)?;
    let mime = if mime.starts_with("image/") { mime } else { "image/jpeg".to_string() };
    Ok(format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(buf)))
}

#[tauri::command]
pub async fn get_media_thumbnail() -> Result<String, String> {
    run_winrt(read_thumbnail).await
}

/// action: play_pause | next | prev | seek_by (giây, có dấu) | seek_to (giây)
#[tauri::command]
pub async fn media_control(action: String, value: Option<f64>) -> Result<bool, String> {
    run_winrt(move || control(&action, value)).await
}
