# Phát hành & tự cập nhật

App dùng `tauri-plugin-updater` + GitHub Releases của repo
`mas120/streamdeck-vk02`. Bản đã cài sẽ đọc:

```
https://github.com/mas120/streamdeck-vk02/releases/latest/download/latest.json
```

`latest.json` do CI tạo ra khi build, kèm file cài NSIS đã ký (`.exe` + `.exe.sig`).

## 1. Build thử trên máy

```powershell
cd streandeck-vk02
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content "$env:USERPROFILE\.tauri\streandeck-vk02.key" -Raw
npm.cmd run tauri build
```

Kết quả:

- `src-tauri\target\release\bundle\nsis\streandeck-vk02_<version>_x64-setup.exe`
- `..._setup.exe.sig` (chữ ký cho updater)

Cài bằng file `setup.exe` (cài cho user hiện tại, không cần quyền admin). App cài xong
sẽ tự kiểm tra bản mới sau ~5 giây kể từ lúc mở, và có nút
**Cài đặt Deck → Kiểm tra cập nhật**.

> Bản chạy `tauri dev` hoặc exe copy tay trong `target\release` **không** tự cập nhật —
> chỉ bản cài bằng installer mới có đủ metadata.

## 2. Phát hành bản mới lên GitHub

1. Tăng version ở **cả hai** file (phải khớp nhau):
   - `src-tauri/tauri.conf.json` → `version`
   - `src-tauri/Cargo.toml` → `[package] version`
   - (tuỳ chọn) `package.json` → `version`
2. Commit rồi tạo tag trùng version và push:

   ```powershell
   git add -A
   git commit -m "release v0.2.0"
   git tag v0.2.0
   git push origin master --tags
   ```

3. GitHub Actions (`.github/workflows/release.yml`) tự build trên `windows-latest`,
   ký bằng khoá trong Secrets và tạo Release kèm `latest.json`.

## 3. Secrets cần có trong repo

`Settings → Secrets and variables → Actions`:

| Secret                               | Giá trị                                                   |
| ------------------------------------ | --------------------------------------------------------- |
| `TAURI_SIGNING_PRIVATE_KEY`          | Nội dung file `C:\Users\<ban>\.tauri\streandeck-vk02.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Để trống nếu khoá không đặt mật khẩu                      |

> **Mất khoá = không thể phát hành bản cập nhật cho các máy đã cài.** Hãy sao lưu
> file `.key` ở nơi an toàn. Khoá công khai đã nằm trong `tauri.conf.json` (`plugins.updater.pubkey`).

## 4. Đổi repo phát hành

Nếu chuyển sang repo khác, sửa 2 chỗ:

- `src-tauri/tauri.conf.json` → `plugins.updater.endpoints`
- `.github/workflows/release.yml` → không cần sửa (dùng repo hiện tại), chỉ cần push tag.

## 5. Lưu ý

- Repo phải **public** để app tải `latest.json` không cần token.
- Release phải là bản **latest** (không phải draft/prerelease) thì endpoint
  `releases/latest/download` mới trỏ đúng.
- Không đổi `identifier` trong `tauri.conf.json` sau khi đã phát hành, nếu không
  installer sẽ cài như app khác và mất dữ liệu/layout cũ.
