//! Icon thật của ứng dụng (launch_app), favicon (open_url) và lưu icon tải lên.
//! Mọi icon được chuẩn hoá về PNG vuông 1:1, 144px + 288px (quy tắc Elgato) và
//! lưu cache trong `<app_local_data_dir>/icon-cache/`. Tên file:
//!   <stem>_144.png  /  <stem>_288.png
//! Frontend lưu đường dẫn bản 144 vào `icon`, bản 288 vào `icon2x` (srcset 2x).

use std::collections::HashMap;
use std::io::Cursor;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, UNIX_EPOCH};

use base64::Engine as _;
use image::{imageops, DynamicImage, ImageFormat, RgbaImage};
use serde::Serialize;
use tauri::Manager;

use windows::core::HSTRING;
use windows::Win32::Foundation::SIZE;
use windows::Win32::Graphics::Gdi::{
    DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO, BITMAPINFOHEADER,
    BI_RGB, DIB_RGB_COLORS, HBITMAP, HGDIOBJ,
};
use windows::Win32::System::Com::IBindCtx;
use windows::Win32::UI::Shell::{IShellItemImageFactory, SHCreateItemFromParsingName, SIIGBF_ICONONLY};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const MAX_ICON_BYTES: usize = 2 * 1024 * 1024;
const MAX_HTML_BYTES: usize = 256 * 1024;
const MAX_FAVICON_CANDIDATES: usize = 4;
const FAVICON_BUDGET: Duration = Duration::from_secs(8);

#[derive(Serialize)]
pub struct IconPair {
    pub path144: String,
    pub path288: String,
}

/* ------------------------------- tiện ích ------------------------------- */

fn fnv1a(bytes: &[u8]) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in bytes {
        h ^= *b as u64;
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    h
}

fn icon_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Không xác định được thư mục dữ liệu: {e}"))?
        .join("icon-cache");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Không tạo được thư mục icon-cache: {e}"))?;
    Ok(dir)
}

fn pair_paths(dir: &Path, stem: &str) -> (PathBuf, PathBuf) {
    (dir.join(format!("{stem}_144.png")), dir.join(format!("{stem}_288.png")))
}

fn cached_pair(dir: &Path, stem: &str) -> Option<IconPair> {
    let (a, b) = pair_paths(dir, stem);
    (a.exists() && b.exists()).then(|| IconPair {
        path144: a.to_string_lossy().into_owned(),
        path288: b.to_string_lossy().into_owned(),
    })
}

/// Ảnh bất kỳ -> PNG vuông `size`px: đặt VỪA khung vào canvas trong suốt (không cắt).
fn encode_square(img: &DynamicImage, size: u32) -> Result<Vec<u8>, String> {
    let scaled = img.resize(size, size, imageops::FilterType::Lanczos3).to_rgba8();
    let mut canvas = RgbaImage::new(size, size);
    let ox = (size.saturating_sub(scaled.width())) / 2;
    let oy = (size.saturating_sub(scaled.height())) / 2;
    imageops::overlay(&mut canvas, &scaled, ox as i64, oy as i64);
    let mut out = Vec::new();
    DynamicImage::ImageRgba8(canvas)
        .write_to(&mut Cursor::new(&mut out), ImageFormat::Png)
        .map_err(|e| format!("Mã hoá PNG lỗi: {e}"))?;
    Ok(out)
}

/// Ghi ra file tạm rồi đổi tên: crash giữa chừng không để lại PNG dở được `cached_pair` coi là hợp lệ.
fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    static SEQ: AtomicU64 = AtomicU64::new(0);
    let tmp = path.with_extension(format!("{}.tmp", SEQ.fetch_add(1, Ordering::Relaxed)));
    std::fs::write(&tmp, bytes).map_err(|e| format!("Ghi icon lỗi: {e}"))?;
    std::fs::rename(&tmp, path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("Ghi icon lỗi: {e}")
    })
}

fn write_pair(dir: &Path, stem: &str, img: &DynamicImage) -> Result<IconPair, String> {
    let (p144, p288) = pair_paths(dir, stem);
    write_atomic(&p144, &encode_square(img, 144)?)?;
    write_atomic(&p288, &encode_square(img, 288)?)?;
    Ok(IconPair {
        path144: p144.to_string_lossy().into_owned(),
        path288: p288.to_string_lossy().into_owned(),
    })
}

/* ---------------------- 1. ICON ỨNG DỤNG (launch_app) ---------------------- */

/// "notepad" / "\"C:\\...\\app.exe\" --x" / đường dẫn đầy đủ -> file thật trên đĩa.
fn resolve_target(target: &str) -> Result<PathBuf, String> {
    let (exe, _args) = crate::split_launch_target(target);
    let direct = PathBuf::from(&exe);
    if direct.exists() {
        return Ok(direct);
    }
    if exe.contains(['\\', '/', ':']) {
        return Err(format!("Không tìm thấy file '{exe}'"));
    }
    // Tên trần (vd "notepad", "taskmgr"): tra PATH bằng `where` (spawn tiến trình nên có cache).
    static RESOLVED: OnceLock<Mutex<HashMap<String, PathBuf>>> = OnceLock::new();
    let resolved = RESOLVED.get_or_init(|| Mutex::new(HashMap::new()));
    let key = exe.to_ascii_lowercase();
    if let Some(hit) = resolved.lock().ok().and_then(|m| m.get(&key).cloned()) {
        if hit.exists() {
            return Ok(hit);
        }
    }
    let out = Command::new("where")
        .arg(&exe)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("Không chạy được 'where': {e}"))?;
    if out.status.success() {
        for line in String::from_utf8_lossy(&out.stdout).lines() {
            let p = PathBuf::from(line.trim());
            if p.exists() {
                if let Ok(mut m) = resolved.lock() {
                    m.insert(key, p.clone());
                }
                return Ok(p);
            }
        }
    }
    Err(format!("Không tìm thấy '{exe}' trong PATH — hãy dán đường dẫn đầy đủ tới file .exe/.lnk"))
}

/// HBITMAP 32bpp -> RGBA. Bitmap của Shell mang alpha ĐÃ NHÂN TRƯỚC (premultiplied)
/// nên phải chia ngược; bitmap cũ không có alpha (toàn 0) thì coi là đục.
unsafe fn hbitmap_to_rgba(hbmp: HBITMAP) -> Result<RgbaImage, String> {
    let mut bm = BITMAP::default();
    let got = GetObjectW(
        HGDIOBJ(hbmp.0),
        std::mem::size_of::<BITMAP>() as i32,
        Some(&mut bm as *mut _ as *mut std::ffi::c_void),
    );
    if got == 0 || bm.bmWidth <= 0 || bm.bmHeight <= 0 {
        return Err("Không đọc được kích thước bitmap icon".into());
    }
    let (w, h) = (bm.bmWidth, bm.bmHeight);

    let mut bmi = BITMAPINFO::default();
    bmi.bmiHeader = BITMAPINFOHEADER {
        biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
        biWidth: w,
        biHeight: -h, // top-down
        biPlanes: 1,
        biBitCount: 32,
        biCompression: BI_RGB.0,
        ..Default::default()
    };
    let mut buf = vec![0u8; (w as usize) * (h as usize) * 4];
    let hdc = GetDC(None);
    let lines = GetDIBits(
        hdc,
        hbmp,
        0,
        h as u32,
        Some(buf.as_mut_ptr() as *mut std::ffi::c_void),
        &mut bmi,
        DIB_RGB_COLORS,
    );
    ReleaseDC(None, hdc);
    if lines == 0 {
        return Err("GetDIBits thất bại".into());
    }

    let has_alpha = buf.chunks_exact(4).any(|p| p[3] != 0);
    for p in buf.chunks_exact_mut(4) {
        let (b, g, r, a) = (p[0], p[1], p[2], p[3]);
        let (r, g, b, a) = if !has_alpha {
            (r, g, b, 255)
        } else if a == 0 || a == 255 {
            (r, g, b, a)
        } else {
            let un = |c: u8| ((c as u32 * 255 + a as u32 / 2) / a as u32).min(255) as u8;
            (un(r), un(g), un(b), a)
        };
        p.copy_from_slice(&[r, g, b, a]);
    }
    RgbaImage::from_raw(w as u32, h as u32, buf).ok_or_else(|| "Buffer icon sai kích thước".to_string())
}

/// Dùng IShellItemImageFactory: cùng cơ chế File Explorer, hiểu .exe/.lnk/.ico,
/// trả icon lớn (tới 256px) có alpha.
fn shell_icon(path: &Path, size: i32) -> Result<RgbaImage, String> {
    crate::with_com(|| unsafe {
        let wide = HSTRING::from(&*path.to_string_lossy());
        let factory: IShellItemImageFactory = SHCreateItemFromParsingName(&wide, None::<&IBindCtx>)
            .map_err(|e| format!("Shell không mở được '{}': {e}", path.display()))?;
        let hbmp = factory
            .GetImage(SIZE { cx: size, cy: size }, SIIGBF_ICONONLY)
            .map_err(|e| format!("Shell không trả icon: {e}"))?;
        let result = hbitmap_to_rgba(hbmp);
        let _ = DeleteObject(HGDIOBJ(hbmp.0));
        result
    })
}

#[tauri::command]
pub async fn get_app_icon(app: tauri::AppHandle, target: String) -> Result<IconPair, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = resolve_target(target.trim())?;
        let dir = icon_dir(&app)?;
        // Khoá cache = đường dẫn + thời điểm sửa file -> app cập nhật thì icon làm mới.
        let mtime = std::fs::metadata(&path)
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let key = format!("{}|{}", path.to_string_lossy().to_lowercase(), mtime);
        let stem = format!("app_{:016x}", fnv1a(key.as_bytes()));
        if let Some(hit) = cached_pair(&dir, &stem) {
            return Ok(hit);
        }
        let rgba = shell_icon(&path, 288)?;
        write_pair(&dir, &stem, &DynamicImage::ImageRgba8(rgba))
    })
    .await
    .map_err(|e| format!("Tác vụ trích icon lỗi: {e}"))?
}

/* ----------------------- 2. FAVICON (open_url) ----------------------- */

/// Giá trị thuộc tính `name` trong một thẻ (đã tách sẵn), có hoặc không có dấu nháy.
fn tag_attr(tag: &str, name: &str) -> Option<String> {
    let lower = tag.to_ascii_lowercase(); // ASCII-lowercase giữ nguyên độ dài byte
    let mut from = 0;
    while let Some(i) = lower[from..].find(name) {
        let at = from + i;
        let before_ok = at == 0 || lower.as_bytes()[at - 1].is_ascii_whitespace();
        let rest = tag[at + name.len()..].trim_start();
        if before_ok && rest.starts_with('=') {
            let v = rest[1..].trim_start();
            return Some(match v.chars().next() {
                Some(q @ ('"' | '\'')) => v[1..].split(q).next().unwrap_or("").to_string(),
                _ => v.split(|c: char| c.is_whitespace() || c == '>').next().unwrap_or("").to_string(),
            });
        }
        from = at + name.len();
    }
    None
}

/// Các ứng viên (điểm, URL) từ thẻ <link rel="...icon...">. Bỏ SVG vì crate `image` không giải mã.
fn parse_icon_links(html: &str, base: &reqwest::Url) -> Vec<(u32, String)> {
    let lower = html.to_ascii_lowercase();
    let mut out = Vec::new();
    let mut pos = 0;
    while let Some(i) = lower[pos..].find("<link") {
        let start = pos + i;
        let end = match lower[start..].find('>') {
            Some(e) => start + e,
            None => break,
        };
        let tag = &html[start..end];
        pos = end;
        let rel = tag_attr(tag, "rel").unwrap_or_default().to_ascii_lowercase();
        if !rel.contains("icon") || rel.contains("mask-icon") {
            continue;
        }
        let href = match tag_attr(tag, "href") {
            Some(h) if !h.is_empty() => h,
            _ => continue,
        };
        let url = match base.join(&href) {
            Ok(u) if u.scheme() == "http" || u.scheme() == "https" => u,
            _ => continue,
        };
        if url.path().to_ascii_lowercase().ends_with(".svg") {
            continue;
        }
        let declared = tag_attr(tag, "sizes").and_then(|s| {
            s.to_ascii_lowercase()
                .split_whitespace()
                .filter_map(|p| p.split('x').next().and_then(|n| n.parse::<u32>().ok()))
                .max()
        });
        let score = declared.unwrap_or(if rel.contains("apple-touch") { 180 } else { 32 });
        out.push((score, url.to_string()));
    }
    out
}

#[tauri::command]
pub async fn get_favicon(app: tauri::AppHandle, url: String) -> Result<IconPair, String> {
    let url = url.trim().to_string();
    if !crate::net::is_safe_web_url(&url) {
        return Err("Chỉ hỗ trợ địa chỉ http:// hoặc https://".into());
    }
    let base = reqwest::Url::parse(&url).map_err(|e| format!("URL không hợp lệ: {e}"))?;
    let host = base.host_str().ok_or("URL thiếu tên miền")?.to_ascii_lowercase();

    let dir = icon_dir(&app)?;
    let stem = format!("fav_{:016x}", fnv1a(host.as_bytes()));
    if let Some(hit) = cached_pair(&dir, &stem) {
        return Ok(hit);
    }
    if !crate::net::is_public_url(&base) {
        return Err("Không lấy favicon từ địa chỉ nội bộ/localhost".into());
    }

    let client = crate::net::http_client();
    let deadline = Instant::now() + FAVICON_BUDGET;
    let left = || deadline.saturating_duration_since(Instant::now());

    // 1) đọc <link rel=icon / apple-touch-icon> trong trang chủ (không gửi tên miền cho bên thứ 3)
    let mut candidates: Vec<(u32, String)> = Vec::new();
    if let Ok(resp) = client.get(base.as_str()).timeout(left()).send().await {
        if resp.status().is_success() {
            let final_url = resp.url().clone();
            if let Some(bytes) = read_capped(resp, MAX_HTML_BYTES, true).await {
                candidates = parse_icon_links(&String::from_utf8_lossy(&bytes), &final_url);
            }
        }
    }
    // 2) dự phòng: /favicon.ico
    if let Ok(root) = base.join("/favicon.ico") {
        candidates.push((1, root.to_string()));
    }
    candidates.sort_by(|a, b| b.0.cmp(&a.0));
    candidates.dedup_by(|a, b| a.1 == b.1);
    candidates.truncate(MAX_FAVICON_CANDIDATES);

    for (_, href) in candidates {
        if left().is_zero() {
            break;
        }
        let allowed = reqwest::Url::parse(&href).map_or(false, |u| crate::net::is_public_url(&u));
        if !allowed {
            continue;
        }
        let resp = match client.get(&href).timeout(left()).send().await {
            Ok(r) if r.status().is_success() => r,
            _ => continue,
        };
        let bytes = match read_capped(resp, MAX_ICON_BYTES, false).await {
            Some(b) if !b.is_empty() => b,
            _ => continue,
        };
        if let Ok(img) = image::load_from_memory(&bytes) {
            return write_pair(&dir, &stem, &img);
        }
    }
    Err("Không lấy được favicon của trang này (có thể dùng SVG hoặc chặn truy cập)".into())
}

/// Đọc body theo từng chunk, dừng khi vượt `max`. `truncate` = true: trả phần đã đọc
/// (HTML chỉ cần phần đầu); false: vượt giới hạn là bỏ (ảnh phải trọn vẹn).
async fn read_capped(mut resp: reqwest::Response, max: usize, truncate: bool) -> Option<Vec<u8>> {
    if !truncate && resp.content_length().map_or(false, |n| n as usize > max) {
        return None;
    }
    let mut buf = Vec::new();
    while let Ok(Some(chunk)) = resp.chunk().await {
        if buf.len() + chunk.len() > max {
            if truncate {
                buf.extend_from_slice(&chunk[..max - buf.len()]);
                return Some(buf);
            }
            return None;
        }
        buf.extend_from_slice(&chunk);
    }
    Some(buf)
}

/* -------------- 3. LƯU ICON TẢI LÊN (đã chuẩn hoá ở frontend) -------------- */

#[tauri::command]
pub fn save_icon_pair(app: tauri::AppHandle, png144: String, png288: String) -> Result<IconPair, String> {
    let eng = base64::engine::general_purpose::STANDARD;
    let a = eng.decode(png144.trim()).map_err(|e| format!("png144 không phải base64: {e}"))?;
    let b = eng.decode(png288.trim()).map_err(|e| format!("png288 không phải base64: {e}"))?;

    // Chỉ nhận đúng PNG vuông 144/288 — đường dẫn ghi do backend tự đặt tên.
    for (buf, want) in [(&a, 144u32), (&b, 288u32)] {
        if buf.len() > MAX_ICON_BYTES {
            return Err("Icon quá lớn".into());
        }
        let img = image::load_from_memory_with_format(buf, ImageFormat::Png)
            .map_err(|e| format!("Không phải PNG hợp lệ: {e}"))?;
        if img.width() != want || img.height() != want {
            return Err(format!("Icon phải là {want}x{want}px"));
        }
    }

    let dir = icon_dir(&app)?;
    let stem = format!("up_{:016x}", fnv1a(&a) ^ fnv1a(&b).rotate_left(1));
    if let Some(hit) = cached_pair(&dir, &stem) {
        return Ok(hit);
    }
    let (p144, p288) = pair_paths(&dir, &stem);
    write_atomic(&p144, &a)?;
    write_atomic(&p288, &b)?;
    Ok(IconPair {
        path144: p144.to_string_lossy().into_owned(),
        path288: p288.to_string_lossy().into_owned(),
    })
}
