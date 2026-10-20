//! Thời tiết hiện tại qua Open-Meteo (miễn phí, không cần API key).

use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::net::http_client;

/// Thông tin thời tiết tối giản trả về cho widget Weather trên deck.
#[derive(Serialize)]
pub struct WeatherInfo {
    /// Nhiệt độ hiện tại (°C).
    temp: f32,
    /// Mã thời tiết WMO (0-99) — frontend tự chọn icon vector theo mã này.
    weather_code: u8,
    /// Mô tả ngắn bằng tiếng Việt (nhãn dự phòng nếu frontend cần).
    condition: String,
    /// Ban ngày (true) hay ban đêm (false) -> frontend đổi icon nắng thành trăng.
    is_day: bool,
    /// Nhiệt độ cảm nhận (°C) — hiện ở ô thời tiết cỡ lớn.
    feels_like: f32,
    /// Độ ẩm tương đối (%) — hiện ở ô thời tiết cỡ lớn.
    humidity: u8,
    /// Tốc độ gió (km/h) — hiện ở ô thời tiết cỡ lớn.
    wind: f32,
}

#[derive(Deserialize)]
struct ForecastResponse {
    current: Current,
}

/// Chỉ nhiệt độ là bắt buộc; các trường phụ chỉ để "làm đẹp" nên thiếu/null vẫn chấp nhận.
#[derive(Deserialize)]
struct Current {
    temperature_2m: f64,
    weather_code: Option<f64>,
    is_day: Option<f64>,
    apparent_temperature: Option<f64>,
    relative_humidity_2m: Option<f64>,
    wind_speed_10m: Option<f64>,
}

/// Bản đồ mã thời tiết WMO -> mô tả ngắn tiếng Việt.
fn wmo_condition(code: u8) -> &'static str {
    match code {
        0 => "Trời quang",
        1 => "Ít mây",
        2 => "Có mây",
        3 => "Nhiều mây",
        45 | 48 => "Sương mù",
        51 | 53 | 55 => "Mưa phùn",
        56 | 57 => "Mưa phùn lạnh",
        61 | 63 | 65 => "Mưa",
        66 | 67 => "Mưa lạnh",
        71 | 73 | 75 | 77 => "Tuyết",
        80 | 81 | 82 => "Mưa rào",
        85 | 86 => "Mưa tuyết",
        95 => "Dông",
        96 | 99 => "Dông kèm mưa đá",
        _ => "Không xác định",
    }
}

impl From<Current> for WeatherInfo {
    fn from(c: Current) -> Self {
        let weather_code = c.weather_code.unwrap_or(0.0).clamp(0.0, 99.0) as u8;
        let temp = c.temperature_2m as f32;
        WeatherInfo {
            temp,
            weather_code,
            condition: wmo_condition(weather_code).to_string(),
            is_day: c.is_day.map_or(true, |v| v == 1.0),
            feels_like: c.apparent_temperature.map_or(temp, |v| v as f32),
            humidity: c.relative_humidity_2m.unwrap_or(0.0).clamp(0.0, 100.0) as u8,
            wind: c.wind_speed_10m.unwrap_or(0.0).max(0.0) as f32,
        }
    }
}

/// Đọc thời tiết hiện tại theo toạ độ (lat: -90..90, lon: -180..180).
/// Timeout cứng 3 giây để UI deck không bao giờ bị treo khi mất mạng.
#[tauri::command]
pub async fn get_weather_data(lat: f64, lon: f64) -> Result<WeatherInfo, String> {
    if !(-90.0..=90.0).contains(&lat) || !(-180.0..=180.0).contains(&lon) {
        return Err("Toạ độ không hợp lệ (lat: -90..90, lon: -180..180)".to_string());
    }

    let url = format!(
        "https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,weather_code,is_day,apparent_temperature,relative_humidity_2m,wind_speed_10m&timezone=auto"
    );

    let response = http_client()
        .get(&url)
        .timeout(Duration::from_secs(3))
        .send()
        .await
        .map_err(|e| format!("Không gọi được Open-Meteo: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("Open-Meteo trả về HTTP {}", response.status().as_u16()));
    }

    let body: ForecastResponse = response
        .json()
        .await
        .map_err(|e| format!("Phản hồi thời tiết không hợp lệ: {e}"))?;

    Ok(body.current.into())
}

/// Vị trí ước lượng theo IP (cấp thành phố, không cần quyền vị trí của Windows).
#[derive(Serialize)]
pub struct LocationInfo {
    lat: f64,
    lon: f64,
    city: String,
}

#[derive(Deserialize)]
struct IpLocationResponse {
    latitude: Option<f64>,
    longitude: Option<f64>,
    city: Option<String>,
    region: Option<String>,
    error: Option<bool>,
    reason: Option<String>,
}

/// Ước lượng toạ độ + tên thành phố từ IP công khai của máy.
/// Độ chính xác cấp thành phố; sai khi dùng VPN. Timeout 5 giây.
#[tauri::command]
pub async fn locate_by_ip() -> Result<LocationInfo, String> {
    let response = http_client()
        .get("https://ipapi.co/json/")
        .timeout(Duration::from_secs(5))
        .send()
        .await
        .map_err(|e| format!("Không gọi được dịch vụ định vị: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("Dịch vụ định vị trả về HTTP {}", response.status().as_u16()));
    }

    let body: IpLocationResponse = response
        .json()
        .await
        .map_err(|e| format!("Phản hồi định vị không hợp lệ: {e}"))?;

    if body.error.unwrap_or(false) {
        return Err(body.reason.unwrap_or_else(|| "Không xác định được vị trí".to_string()));
    }

    let (Some(lat), Some(lon)) = (body.latitude, body.longitude) else {
        return Err("Không xác định được vị trí".to_string());
    };
    if !(-90.0..=90.0).contains(&lat) || !(-180.0..=180.0).contains(&lon) {
        return Err("Toạ độ định vị không hợp lệ".to_string());
    }

    let city = body
        .city
        .or(body.region)
        .map(|c| c.trim().to_string())
        .filter(|c| !c.is_empty())
        .unwrap_or_else(|| "Vị trí hiện tại".to_string());

    Ok(LocationInfo { lat, lon, city })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_full_and_sparse_payloads() {
        let full: ForecastResponse = serde_json::from_str(
            r#"{"current":{"temperature_2m":31.2,"weather_code":61,"is_day":0,
                "apparent_temperature":35.0,"relative_humidity_2m":78,"wind_speed_10m":12.5}}"#,
        )
        .unwrap();
        let info = WeatherInfo::from(full.current);
        assert_eq!((info.weather_code, info.is_day, info.humidity), (61, false, 78));
        assert_eq!(info.condition, "Mưa");

        let sparse: ForecastResponse =
            serde_json::from_str(r#"{"current":{"temperature_2m":20.0,"weather_code":null}}"#).unwrap();
        let info = WeatherInfo::from(sparse.current);
        assert!(info.is_day);
        assert_eq!(info.feels_like, 20.0);
        assert_eq!(info.humidity, 0);
    }
}
