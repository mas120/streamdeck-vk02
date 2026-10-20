# Stream Deck VK02 - Project Overview

## 1. Tổng quan
Dự án này là một ứng dụng Stream Deck kiểu desktop chạy bằng Tauri + Vite + Vanilla JS, dùng để hiển thị các key widget như Pomodoro, đồng hồ, thời tiết, todo, bongo cat, v.v.

## 2. Công nghệ chính
- Frontend: Vite + JavaScript thuần
- Desktop shell: Tauri v2
- Styling: CSS custom, GridStack layout
- State lưu: `layout.json` + `config.json` trong `app_data_dir` (Tauri); fallback localStorage trên trình duyệt

## 3. Cấu trúc thư mục chính
- `src/` : source frontend (`main.js` entry, `core/` bootstrap/grid/renderer/IPC và các module tile/layout/audio/settings, `widgets/` mỗi widget một module, `styles/` CSS theo hệ thống và widget)
- `src-tauri/` : Rust/Tauri backend và cấu hình app
- `public/` : tài nguyên công khai
- `index.html`, `todo.html` : hai trang Vite (cửa sổ chính và cửa sổ Todo)
- `scripts/` : script kiểm tra/build phụ trợ; gate hiện hành: `npm.cmd run check` (nhanh) và `npm.cmd run check:full` (đầy đủ)
- `.devtmp/` : file sinh ra khi xem trước, không commit
- `README.md` : hướng dẫn chạy/build/kiểm tra
- `OPTIMIZATION_STAGE1.md` : ghi chú tối ưu build và trạng thái module hóa

## 4. Các widget chính
- Pomodoro
- Mini Clock
- Weather Widget
- To-do list
- Bongo Cat
- Mic (mute + mức âm)
- Volume / App Slider
- Media, Shutdown, Music Wave
- Các key chức năng ứng dụng (`open_url`, `launch_app`)

## 4c. Màn hình phụ VK02
- Khi phát hiện panel cảm ứng (1280x800 hoặc màn không phải màn chính), deck được ghim fullscreen lên panel, always-on-top, và chuột bị giữ trong màn chính.
- Khi chỉ có một màn hình, app chạy như cửa sổ thường.
- Chi tiết ở `AI_HANDOFF.md`.

## 4b. Chế độ Run / Edit
- Run Mode: chạm vào tile để thực thi, lưới bị khóa
- Vào Edit Mode: nhấn giữ 1.5s trên ô trống (vòng SVG hiện sau 250ms, rung nhẹ); nhấn giữ trên tile không kích hoạt
- Edit Mode có thanh công cụ nổi ("Cài đặt", "Xong"); kéo bằng `.drag-handle`, ✕ xóa kèm hoàn tác 5s
- Không còn phím ⚙️ 1x1

## 5. Mục tiêu hiện tại
- Giữ ngôn ngữ **Stream Deck LCD tràn mặt** (`body.sd-look`) nhất quán giữa tile và widget
- Kiểm tra style trên layout thật trong Tauri (1x1, 2x1, 1x2, 3x1), nhất là `open_url`, Weather, Pomodoro Forest, flip clock
- Thử media/mic với Tauri IPC thật trên panel VK02
- Fix bug render và cập nhật DOM trực tiếp theo timer

## 6. Quy trình phát triển
- Sửa logic trong `src/core/` và `src/widgets/`
- Tinh chỉnh style trong `src/styles/`
- Build bằng Vite (`npm.cmd run build`) để kiểm tra app
- Chạy app Tauri (`npm.cmd run tauri dev`) để kiểm tra trực quan

## 7. Ghi chú quan trọng
- Nhiều widget cập nhật trực tiếp DOM thay vì re-render toàn bộ node
- UI theo phong cách Stream Deck LCD tràn mặt (`body.sd-look`): vỏ phím tối bo góc `--radius-key` 16px, nội dung widget phủ mặt LCD, accent cyan; không dùng keycap 3D hay card kính lồng nhau
- Style `sd-look` nằm chủ yếu trong `src/styles/overrides.css`, áp dụng sau cùng
- GridStack chịu trách nhiệm layout và resize widget

## 8. Nguồn tham khảo nội bộ
- `src/main.js`, `src/core/app.js`
- `src/styles/index.css`
- `src/widgets/`
- `src/forest-tree-svgs.js`
- `src-tauri/src/lib.rs`
- `README.md`, `AI_HANDOFF.md`

## 9. Mục tiêu tiếp theo
- Hoàn thiện polish UI cho từng widget theo `sd-look`
- Kiểm tra lại toàn bộ widget trên các kích thước deck khác nhau
- Port các script `scripts/smoke.mjs` và `check-preview.mjs` còn assertion theo thiết kế cũ (xem `README.md`)
