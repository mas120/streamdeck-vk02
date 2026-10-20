# AI Handoff – Stream Deck VK02

## 1. Dự án này là gì
Đây là ứng dụng desktop kiểu Stream Deck, chạy bằng Tauri 2, Vite và JavaScript thuần. GridStack quản lý deck 8x5; logic hiện được chia giữa `src/core/` và `src/widgets/` thay vì tập trung trong một file lớn.

## 2. Tình trạng hiện tại
Phong cách đang được chuẩn hóa theo **Stream Deck LCD tràn mặt**: vỏ phím đen bo góc, nội dung widget phủ mặt LCD; không lồng thêm card kính vào bên trong.

Trạng thái giao diện hiện tại:
- Vỏ dùng token bán kính `--radius-key` (16px); shortcut `open_url` đặt artwork ở vùng giữa, giữ nguyên hình logo.
- Accent tương tác là cyan `#06b6d4`; mute/lỗi và trạng thái thành công vẫn dùng màu ngữ nghĩa riêng.
- Weather dùng nền LCD tối trung tính, giữ màu minh họa thời tiết.
- Pomodoro Forest giữ cây, bỏ nền xanh/đĩa nổi trong `sd-look`; vòng tiến trình nhẹ hơn.
- Flip clock giữ font mono nhưng bỏ đường gập và mặt thẻ cơ khí trong `sd-look`.

Các thay đổi giao diện gần nhất nằm trong `src/styles/overrides.css`. `npm.cmd run build` đã chạy thành công trên Windows. Preview Vite ở `http://127.0.0.1:1420` không có Tauri IPC và có thể dùng layout lưu riêng với cửa sổ desktop.

## 3. Kiến trúc cơ bản
### Frontend
- Entry là `src/main.js`; file này import `src/styles/index.css` và gọi `bootstrapApp()` trong `src/core/app.js`.
- `src/core/` quản lý composition, GridStack, mode, layout/config, renderer và Tauri IPC. `app.js` chỉ còn vai trò lắp ghép; phần tạo/xóa tile nằm ở `tile-factory.js`, helper layout ở `layout-helpers.js`, lưu layout ở `layout-persistence.js`, đồng bộ audio ở `deck-audio.js`, modal cài đặt ở `settings-panel.js`.
- Mỗi widget có module riêng trong `src/widgets/`; render DOM trực tiếp cho cập nhật thường xuyên.
- `src/core/widget-renderer.js` dispatch qua `widgetDefinitions`; `destroyWidgetContent()` dọn widget trước khi render lại/đổi loại và khi GridStack xóa tile.

### Desktop shell
- Tauri v2
- Dùng để đóng gói app desktop và chạy ở môi trường native

### Layout
- GridStack quản lý vị trí và kích thước widget
- Các widget có thể ở size như 1x2, 2x2, 3x1, tùy mục đích hiển thị
- Khi resize thì class trạng thái kích thước và layout CSS phải được đồng bộ lại

### Styling
- CSS được import qua `src/styles/index.css`: tokens, khung deck, keycap, từng widget và `overrides.css`.
- `body.sd-look` là phong cách đang dùng: vỏ phím tối, màn LCD tràn mặt, artwork/widget riêng trong cùng một hệ màu.
- Khi chỉnh style, phân biệt vỏ vật lý của tile với nội dung LCD; không thêm bán kính/viền card thứ hai vào mặt LCD.

## 4. File quan trọng cần đọc trước
Nếu AI mới vào dự án, đọc theo thứ tự này:
1. `index.html` và `src/main.js` – entry HTML/JavaScript.
2. `src/core/app.js` – bootstrap và nối các dịch vụ/widget.
3. `src/core/widget-renderer.js`, `src/core/widget-types.js`, `src/core/widget-defs.js` – render, loại và kích thước mặc định.
4. `src/widgets/` – logic từng widget.
5. `src/styles/index.css`, `src/styles/tokens.css`, `src/styles/overrides.css` – thứ tự CSS, token và style `sd-look`.
6. `src/styles/widgets/` – stylesheet theo widget; `src/forest-tree-svgs.js` chứa artwork cây.
7. `src-tauri/src/` và `src-tauri/tauri.conf.json` – backend và cấu hình Tauri.

## 5. Widget chính đang hoạt động
### Pomodoro
- Logic ở `src/widgets/pomodoro.js`; style ở `src/styles/widgets/pomodoro.css` và `src/styles/overrides.css`.
- Forest tree vẫn là nội dung LCD; trong `sd-look`, nền/đĩa được làm phẳng và màu vòng phân biệt work/break.
- Cẩn thận với layout 1x2 và cập nhật timer; tránh render lại toàn widget mỗi nhịp.

### Weather
- Logic ở `src/widgets/weather.js`, style ở `src/styles/widgets/weather.css`.
- Giữ layout theo kích thước và minh họa theo thời tiết; nền `sd-look` trung tính, tránh khôi phục panel tím bão hòa.
- Tôn trọng cache/refresh và trạng thái lỗi.

### Flip Clock
- Logic digital/analog/flip nằm trong `src/widgets/clock.js`.
- `sd-look` làm phẳng flip cards và ẩn fold visual; giữ font mono/tabular và không phá event animation nếu sửa CSS.
- Chỉ cập nhật chữ số cần đổi; kiểm tra cả face `flip` lẫn `digital`/`analog`.

### Mini Clock (digital / analog / flip)
- Có các face digital, analog và flip; cấu hình face/timezone/label được lưu trong widget config.
- Bắt đầu ở `src/widgets/clock.js`, `src/core/widget-renderer.js` và `src/styles/widgets/clock.css`.

### Volume Slider
- Logic ở `src/widgets/volume.js`; kiểu kéo và hướng slider phụ thuộc kích thước tile.
- Khi đổi UI kéo, kiểm tra touch/pointer capture, giá trị flush cuối cùng và trạng thái mute.
- Thanh slider có ARIA value/orientation và điều khiển bằng phím mũi tên, Page Up/Down, Home/End; Shift + mũi tên đổi 5%.

### App Slider
- Logic ở `src/widgets/app-slider.js`; backend audio session nằm trong `src-tauri/src/`.
- Khi sửa, kiểm tra các trạng thái `muted`, `active`, `idle`, `off` và đồng bộ khi đổi kích thước.

### Bongo Cat
- Logic ở `src/widgets/bongo-cat.js`, SVG/cấu hình tách riêng.
- Giữ xử lý pointer/keyboard và giới hạn animation; tránh gộp vào scheduler timer khác.

### Todo List
- Logic ở `src/widgets/todo.js`, lưu trữ ở `src/todo-store.js`; CSS ở `src/styles/widgets/todo.css`.
- Cửa sổ Todo riêng mở bằng command `open_todo_window` (`src-tauri/src/lib.rs`), đặt giữa màn chính, bỏ qua panel 1280x800.

### Mic
- Logic ở `src/widgets/mic.js`, gọi `get_mic_state` / `toggle_mic_mute` (`src-tauri/src/lib.rs`).
- Khi không có thiết bị thu, `get_mic_state` trả `{ muted: true, peak: 0, error }` thay vì ném lỗi; widget hiển thị `error` qua tooltip.

### Panel phụ VK02 (màn cảm ứng)
- `setup()` trong `src-tauri/src/lib.rs` tìm panel: ưu tiên màn 1280x800, nếu không có thì lấy màn không phải màn chính.
- Có panel: cửa sổ `main` always-on-top, ẩn taskbar, fullscreen trên panel, và `ClipCursor` giữ chuột trong màn chính (áp dụng lại mỗi giây); cảm ứng vẫn hoạt động.
- Không có panel (dev 1 màn): cửa sổ thường, có viền, không fullscreen, không giới hạn chuột.
- Windows phải gán cảm ứng đúng cho panel (Tablet PC Settings → Setup), nếu không chạm sẽ lệch sang màn chính.

### Vào Edit Mode & cài đặt
- Không còn phím ⚙️ 1x1. Vào Edit Mode bằng nhấn giữ 1.5s trên ô trống (`src/core/long-press-entry.js`)
- Vòng SVG tiến trình hiện sau 250ms, rung nhẹ khi vào Edit; nhấn giữ trên tile không kích hoạt
- Trong Edit Mode có thanh công cụ nổi `#editToolbar`: nút "Cài đặt" (mở settings modal) và "Xong" (commit + ghi `layout.json` + khóa lưới)
- Kéo đổi chỗ chỉ qua `.drag-handle`; chạm thân tile mở modal sửa; ✕ xóa kèm toast hoàn tác 5s

## Lưu trữ dữ liệu (Tauri)
Thư mục cấu hình native nằm trong `app_data_dir` của Tauri. Frontend lưu/truy xuất qua `src/core/layout-store.js` và `src/core/config-store.js`; Rust command tương ứng nằm trong `src-tauri/src/layout.rs` và `src-tauri/src/config.rs`.

| File | Nội dung | Command Rust |
|---|---|---|
| `layout.json` | `{ "schemaVersion": 1, "widgets": [{ type, x, y, w, h, ...cfg }] }` (x, y số hữu hạn bắt buộc) | `load_layout`, `save_layout` (`layout.rs`) |
| `config.json` | `{ "version": 1, "brightness": 30-130, "idleMs": >=0 }` | `load_app_config`, `save_app_config` (`config.rs`) |

- Trình duyệt Vite không có `window.__TAURI__` sẽ dùng fallback `localStorage`.
- Layout dạng mảng cũ vẫn được đọc; frontend ghi format version 1 và migrate localStorage cũ sang file Tauri khi load.
- Todo và cache thời tiết vẫn có lưu trữ phía frontend; kiểm tra module widget/store trước khi đổi nơi lưu.

### Bongo Cat và quyền riêng tư
- Hook bàn phím Rust chỉ được bật khi deck có widget Bongo Cat; sau khi cài lần đầu, hook nền không gỡ được nhưng cờ enable tắt phát sự kiện khi widget không còn.
- Backend chỉ phân loại một số phím thành tay trái/phải và down/up; không gửi hoặc lưu ký tự phím thô.

### Utility widgets
- `open_url`: mở link/website
- `launch_app`: mở app hệ thống như Notepad, Task Manager, Resmon
- Đây là widget “quick action”, logic thường ít phức tạp
- Khi thêm widget mới, cập nhật renderer/registry/type sizing ở `src/core/` và CSS phù hợp.

### Todo / Other widgets
- Nên vẫn tuân theo cùng visual language với keycap chung
- Không nên tạo style quá riêng lẻ nếu không cần thiết

## 6. Quy tắc phát triển quan trọng
### Quy tắc 1: State và render phải tách rõ
- State: dữ liệu đang có
- Render: cập nhật lên DOM
- Không nên render lại cả widget nếu chỉ cần cập nhật một phần nhỏ

### Quy tắc 2: Không phá layout khi resize
- GridStack có thể thay đổi kích thước widget
- Nếu có class trạng thái theo size, cần refresh đúng thời điểm
- Một lỗi cỡ layout thường là cả CSS + logic cùng lúc cần sửa

### Quy tắc 3: Style nên được chia rõ theo mục đích
- `src/styles/tokens.css` cho token; `src/styles/grid-deck.css` và `keycap-base.css` cho khung chung.
- `src/styles/widgets/*.css` cho từng widget; `src/styles/overrides.css` cho quy tắc `body.sd-look` cần áp dụng sau cùng.
- Không chỉnh các bản sao trong `ai-handoff-package/` thay cho source trong workspace.

### Quy tắc 4: Không tối ưu sai hướng
- Dự án kiểu Stream Deck cần performance ổn và render mượt
- Không nên thay đổi toàn bộ kiến trúc UI chỉ để “gọn code” nếu nó làm chậm app

## 7. Cấu trúc thư mục
- `src/core/` – bootstrap, grid, renderer, state/config/layout và IPC
- `src/widgets/` – logic widget
- `src/styles/` – tokens và CSS theo hệ thống/widget
- `src/` – entry frontend và assets dùng chung
- `src-tauri/` – Rust + Tauri config
- `public/` – asset công khai
- `index.html` – file entry
- `README.md` – hướng dẫn cơ bản
- `PROJECT_OVERVIEW.md` – tóm tắt dự án
- `AI_HANDOFF.md` – file này, dùng để AI hoặc người mới làm việc biết nhanh bối cảnh

## 8. Build và chạy
### Build frontend
```bash
npm run build
```
Trong PowerShell nếu `npm.ps1` bị Execution Policy chặn, dùng `npm.cmd run build`.

### Kiểm tra
`npm.cmd run check` chạy Node unit tests cho layout migration, widget teardown và keyboard volume, production build, rồi kiểm tra hành vi flip clock. Một số smoke/preview script cũ trong `.devtmp/` vẫn đọc theo cấu trúc monolithic trước đây (`src/main.js`, CSS gộp); chúng chưa thuộc gate hiện hành và cần được port riêng nếu tiếp tục dùng.

### Chạy dev
```bash
npm run dev
```

### Chạy app desktop
```bash
npm run tauri dev
```
Trong PowerShell dùng `npm.cmd run tauri dev` nếu `npm.ps1` bị chặn.

## 9. Mục tiêu hiện tại và kế hoạch tiếp theo
### Mục tiêu current
- Giữ ngôn ngữ Stream Deck LCD tràn mặt nhất quán giữa tile và widget.
- Kiểm tra style mới trên layout thật trong Tauri, nhất là shortcut `open_url`, Weather, Pomodoro Forest và flip clock.
- Giữ màu trạng thái có ý nghĩa và không làm giảm độ đọc ở tile nhỏ.
- Không đổi logic widget khi yêu cầu chỉ là chỉnh giao diện.

### Kế hoạch tiếp theo
- Xác nhận CSS trên các kích thước 1x1, 2x1, 1x2, 3x1 trong cửa sổ desktop.
- Thử media/mic với Tauri IPC thật; browser preview không xác nhận được trạng thái Windows.
- Đồng bộ `ai-handoff-package/` chỉ khi cần tạo gói chia sẻ mới.

## 10. Prompt chuẩn cho AI tiếp theo
Dùng prompt này nếu cần tiếp tục làm: 

"Đây là Stream Deck desktop app dùng Tauri 2 + Vite + Vanilla JS. Entry là src/main.js, composition ở src/core/app.js, logic widget ở src/widgets/, CSS ở src/styles/. Giữ phong cách đang chọn: vỏ tối và nội dung LCD tràn mặt; shortcut giữ logo trong vùng trung tâm, widget dùng bề mặt tối và accent theo ngữ nghĩa. Đọc đúng module/CSS sở hữu hành vi trước khi sửa; không sửa bản snapshot ai-handoff-package thay cho source workspace. Ưu tiên cập nhật DOM cục bộ cho timer và dữ liệu thường xuyên."

## 11. Nên nhớ khi tiếp tục code
AI mới vào dự án cần hiểu 3 điều này trước khi sửa:
1. Đây là app Stream Deck, không phải web app thông thường
2. UI đang rất chú trọng vào “độ đẹp + tốc độ render” cùng lúc
3. Logic chính nằm trong `src/core/` và `src/widgets/`, css nằm trong `src/styles/`

Nếu chỉ có thời gian đọc vài file, bắt đầu với `src/main.js`, `src/core/app.js`, `src/styles/index.css` và stylesheet widget cần sửa.

## 12. Kết luận ngắn
Source workspace là bản chuẩn. Bản trong `ai-handoff-package/` chỉ là gói snapshot; xác nhận nội dung trước khi dùng làm căn cứ chỉnh code.
