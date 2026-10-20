//! Tiện ích mạng dùng chung: kiểm tra URL, chặn host nội bộ, HTTP client chung.

use std::net::IpAddr;
use std::sync::OnceLock;
use std::time::Duration;

/// Chỉ cho phép http/https và không chứa ký tự điều khiển.
pub(crate) fn is_safe_web_url(target: &str) -> bool {
    let lower = target.to_ascii_lowercase();
    (lower.starts_with("http://") || lower.starts_with("https://"))
        && !target.chars().any(|c| c.is_control())
}

fn is_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            let o = v4.octets();
            !(v4.is_loopback()
                || v4.is_private()
                || v4.is_link_local()
                || v4.is_unspecified()
                || v4.is_broadcast()
                || (o[0] == 100 && o[1] & 0xC0 == 64))
        }
        IpAddr::V6(v6) => {
            if let Some(v4) = v6.to_ipv4_mapped() {
                return is_public_ip(IpAddr::V4(v4));
            }
            let s = v6.segments()[0];
            !(v6.is_loopback() || v6.is_unspecified() || s & 0xfe00 == 0xfc00 || s & 0xffc0 == 0xfe80)
        }
    }
}

/// false cho localhost / IP nội bộ để favicon không biến app thành công cụ quét mạng LAN.
/// Không chống được DNS trỏ tên miền công khai về IP nội bộ.
pub(crate) fn is_public_url(url: &reqwest::Url) -> bool {
    let Some(host) = url.host_str() else { return false };
    let host = host.trim_matches(['[', ']']).trim_end_matches('.').to_ascii_lowercase();
    if let Ok(ip) = host.parse::<IpAddr>() {
        return is_public_ip(ip);
    }
    !(host == "localhost" || host.ends_with(".localhost") || host.ends_with(".local") || !host.contains('.'))
}

/// Client HTTP dùng chung (pool kết nối + TLS khởi tạo 1 lần); không theo redirect tới host nội bộ.
pub(crate) fn http_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(4))
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) StreamDeckVK02")
            .redirect(reqwest::redirect::Policy::custom(|attempt| {
                if attempt.previous().len() >= 3 || !is_public_url(attempt.url()) {
                    attempt.stop()
                } else {
                    attempt.follow()
                }
            }))
            .build()
            .expect("không tạo được HTTP client")
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_public_url_rejects_internal_hosts() {
        let p = |s: &str| is_public_url(&reqwest::Url::parse(s).unwrap());
        assert!(p("https://example.com/"));
        assert!(p("http://8.8.8.8/"));
        assert!(!p("http://localhost:8080/"));
        assert!(!p("http://127.0.0.1/"));
        assert!(!p("http://192.168.1.10/"));
        assert!(!p("http://10.0.0.1/"));
        assert!(!p("http://169.254.169.254/"));
        assert!(!p("http://[::1]/"));
        assert!(!p("http://[::ffff:127.0.0.1]/"));
        assert!(!p("http://nas/"));
    }

    #[test]
    fn is_safe_web_url_requires_http_scheme() {
        assert!(is_safe_web_url("https://a.com/?x=1&y=2"));
        assert!(!is_safe_web_url("file:///c:/windows"));
        assert!(!is_safe_web_url("https://a.com/\n"));
    }
}
