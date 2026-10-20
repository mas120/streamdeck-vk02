# Stream Deck VK02

Ứng dụng desktop kiểu Stream Deck cho Windows, dựng bằng **Tauri 2 + Vite + JavaScript thuần**. Deck lưới 8x5 (GridStack) hiển thị các phím widget trên màn hình cảm ứng phụ VK02 (1280x800): Pomodoro, đồng hồ, thời tiết, todo, mic, volume, media, Bongo Cat và các phím mở app/link.

Giao diện theo phong cách **Stream Deck LCD tràn mặt** (`body.sd-look`): vỏ phím tối bo góc, nội dung widget phủ kín mặt LCD, accent cyan.

## Tính năng

- Widget: Pomodoro (cây Forest), Mini Clock (digital / analog / flip), Weather, Todo, Mic, Volume, App Slider (mixer từng app), Media, Music Wave, Bongo Cat, Shutdown, `open_url`, `launch_app`.
- Run Mode: chạm để thực thi, lưới bị khóa. Edit Mode: nhấn giữ 1.5s trên ô trống; kéo bằng `.drag-handle`, chạm tile để sửa, ✕ để xóa (có hoàn tác 5s).
- Layout và cấu hình lưu trong `app_data_dir` (`layout.json`, `config.json`); chạy trên trình duyệt thì dùng `localStorage`.
- Cửa sổ Todo riêng, mở trên màn chính.

## Màn hình phụ VK02 (1280x800)

Khi `setup()` trong [src-tauri/src/lib.rs](src-tauri/src/lib.rs) tìm thấy panel (ưu tiên màn 1280x800, nếu không có thì lấy màn không phải màn chính):

- Cửa sổ `main` được ghim fullscreen lên panel, luôn nổi trên cùng, ẩn khỏi taskbar.
- Chuột bị giới hạn trong màn chính bằng `ClipCursor` (áp dụng lại mỗi giây); cảm ứng trên panel vẫn hoạt động.
- Windows phải gán cảm ứng đúng cho panel: `tabletpc.cpl` → Display → Setup.

Khi chỉ có một màn hình, app chạy như cửa sổ thường (có viền, đổi kích thước được, không fullscreen, không giới hạn chuột).

## Kiến trúc

```
index.html, todo.html     Hai trang Vite (cửa sổ main và todo)
src/main.js               Entry: import styles, gọi bootstrapApp()
src/core/                 app.js (composition), grid, renderer, registry,
                          layout/config store, tile-factory, layout helpers/persistence,
                          deck-audio, settings-panel, modal editor, Tauri IPC
src/widgets/              Mỗi widget một module
src/styles/               index.css import tokens, khung deck, keycap, widgets/*, overrides.css
src-tauri/src/            Rust: audio/mic (WASAPI), media (GSMTC), weather, layout, config, bongo
.devtmp/                  File sinh ra khi xem trước (không commit)
scripts/                  Script kiểm tra/build phụ trợ (xem bên dưới)
_archive/, ai-handoff-package/   Tài liệu/mã cũ, chỉ để tham khảo; không sửa thay cho source
```

## Yêu cầu

- Node.js và npm
- Rust toolchain (stable) và các thành phần build của Tauri 2 trên Windows (WebView2, MSVC build tools)

## Chạy và build

Trong PowerShell, nếu `npm.ps1` bị Execution Policy chặn thì dùng `npm.cmd`.

```powershell
npm.cmd install
npm.cmd run tauri dev     # chạy app desktop đầy đủ (IPC native: mic, volume, media...)
npm.cmd run dev           # chỉ giao diện web tại http://localhost:1420 (không có IPC)
npm.cmd run build         # build frontend vào dist/
npm.cmd run tauri build   # đóng gói bản phát hành
npm.cmd run build:icons   # sinh lại dữ liệu icon từ scripts/build-icons.mjs
npm.cmd run preview       # dựng .devtmp/preview.html để xem nhanh widget
npm.cmd run format        # Prettier (format:check để chỉ kiểm tra)
```

## Kiểm tra

```powershell
npm.cmd run check        # gate nhanh: unit test + build + flip clock
npm.cmd run check:full   # check + capsule (markup/CSS/capabilities) + cargo test
```

`check` chạy lần lượt: Node unit test (`layout-store`, `widget-renderer`, `volume`), `vite build`, rồi `scripts/check-flip.mjs` (hành vi thẻ lật của flip clock).

`check:full` thêm `scripts/check-capsule.mjs` (75 assertion: token, class markup có CSS, quyền cửa sổ, dist 2 trang) và `cargo test`. Đây là gate nên chạy trước khi kết thúc session lớn.

Các suite chưa nằm trong gate vì assertion còn theo thiết kế cũ: `check:smoke` (đọc `renderPomodoro`/markup weather cũ) và `check:preview` (2 assertion pomodoro). `check:format` hiện fail trên 56 file — repo chưa format toàn bộ, hãy chạy `npm run format` ở một session riêng. `check:rust` chạy riêng `cargo test`.

## Tài liệu liên quan

- [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md): tổng quan dự án
- [AI_HANDOFF.md](AI_HANDOFF.md): bối cảnh chi tiết, quy tắc phát triển, widget và lưu trữ
- [CARGO_AND_CONFIG.md](CARGO_AND_CONFIG.md): cấu hình Cargo/Tauri
- [OPTIMIZATION_STAGE1.md](OPTIMIZATION_STAGE1.md): ghi chú tối ưu build

## IDE khuyến nghị

[VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
