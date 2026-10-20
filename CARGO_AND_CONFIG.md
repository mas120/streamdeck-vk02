# Thay đổi cần thêm vào `src-tauri/Cargo.toml` và `tauri.conf.json`

## Cargo.toml
```toml
[dependencies]
image  = { version = "0.25", default-features = false, features = ["png", "ico", "jpeg", "gif", "webp", "bmp"] }
base64 = "0.22"
# reqwest, serde, serde_json: đã có (dùng cho thời tiết)

[dependencies.windows]
# GIỮ các feature hiện có và THÊM:
features = ["Win32_UI_Shell", "Win32_Graphics_Gdi"]   # Win32_System_Com, Win32_Foundation đã có
```

## tauri.conf.json — cho phép WebView đọc PNG trong icon-cache
Frontend dùng `convertFileSrc` (đã có sẵn trong code) nên cần asset protocol phủ thư mục này:
```json
"app": { "security": { "assetProtocol": { "enable": true, "scope": ["$LOCALDATA/**"] } } }
```
(Nếu bạn đã bật asset protocol cho đường dẫn khác, chỉ cần thêm `$LOCALDATA/**` vào scope.)
