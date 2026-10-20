# Kế hoạch giai đoạn 2 — chia thành các session nhỏ

> Mục tiêu: mỗi bước dưới đây làm gọn trong **một session** (khoảng 8–35k token),
> chỉ mở 2–5 file, kết thúc bằng commit. Không bước nào phụ thuộc vào việc đọc lại
> toàn bộ source.

## Trạng thái hiện tại (cập nhật cuối: P1-3)

- **Đã xong**: P0-1, P0-2, P0-3, P0-4, P1-1, P1-2, P1-3, P2-1, P2-2, P2-3, P2-4.
- **Commit gần nhất**: xem `git log --oneline -1` (working tree sạch).
- **Gate dùng từ giờ**: `npm.cmd run check` (nhanh) và `npm.cmd run check:full` (thêm capsule + `cargo test`).
- **Bước tiếp theo đề xuất**: **P0-2b** (đưa smoke/preview vào gate) hoặc **P3-1** (lõi widget registry).
- **Đang treo, làm bất cứ lúc nào**: P0-2b (sửa `smoke`/`preview`) và P0-2c (format toàn bộ).
- **Lưu ý cho P2**: `scripts/check-capsule.mjs` đọc cả `lib.rs` + `windows.rs`; `scripts/smoke.mjs`
  vẫn đọc `lib.rs` cho assertion weather (đang fail, thuộc P0-2b).

## Quy ước chung cho mọi session

**Prompt mẫu (thay `<ID>`):**

```
Đọc AGENTS.md và OPTIMIZATION_STAGE2_PLAN.md. Làm bước <ID>.
Chỉ mở các file ở mục "File" của bước đó; dùng grep trước khi đọc cả file.
Chạy đúng lệnh ở mục "Done" rồi commit với message "P<ID>: <mô tả>".
Cập nhật checkbox của bước trong OPTIMIZATION_STAGE2_PLAN.md.
```

Quy tắc tiết kiệm token:

1. Không đọc `AI_HANDOFF.md`, `PROJECT_OVERVIEW.md`, `README.md` trừ khi bước yêu cầu.
2. Không đọc cả file >300 dòng nếu chỉ cần 1 hàm — dùng `grep`/`Select-String` lấy số dòng rồi `read` đúng khoảng.
3. Không chạy lại `npm.cmd install` hoặc build Rust đầy đủ; chỉ chạy lệnh ở mục **Done**.
4. Mỗi bước là một commit độc lập, có thể revert mà không kéo theo bước khác.
5. Bước nào sửa hành vi native (P2-x, P4-x) mới cần `npm.cmd run tauri dev`; còn lại chạy `npm.cmd run check`.
6. Nếu một bước hoá ra quá lớn, **dừng và tách** thành `<ID>a`, `<ID>b` thay vì làm ẩu.

Thứ tự làm: **P0 → P1 → P2 → P3 → P4 → P5**. Trong cùng một phase, các bước ghi
"độc lập" có thể đổi thứ tự. P3 trở đi là để mở rộng, chưa cấp thiết bằng P0–P2.

---

## Phase 0 — Lưới an toàn (làm ngay, tổng ~1 ngày)

### P0-1 · Git baseline
- [x] **Mục tiêu**: có lịch sử để rollback trước khi sửa gì.
- **File**: `.gitignore`, `.gitattributes` (tạo mới).
- **Việc**:
  - `git init` trong `streandeck-vk02/` (thư mục có `package.json`).
  - Thêm `.gitattributes` với `* text=auto eol=lf` để tránh diff CRLF/LF lẫn lộn.
  - Commit baseline gồm source + `.devtmp/` (vì `npm run check` phụ thuộc `.devtmp/check-flip.mjs`).
  - Tag `v0.1.0-baseline`.
- **Done**: `git status` sạch; `git log --oneline` có 1 commit; tag tồn tại.
- **Token**: ~8k.

### P0-2 · Chuẩn hoá tooling + `check:full` ✅
- [x] **Mục tiêu**: gate kiểm tra thật sự bắt lỗi, script không nằm trong thư mục tạm.
- **Kết quả**:
  - 7 script chuyển `.devtmp/*.mjs` → `scripts/` (giữ lịch sử qua `git mv`); `.devtmp/` chỉ còn output sinh ra và đã vào `.gitignore`.
  - `preview.mjs` tự tạo thư mục output; `check-preview.mjs` báo rõ nếu thiếu file.
  - `package.json`: thêm `preview`, `check:capsule`, `check:rust`, `check:smoke`, `check:preview`, `check:format`, `check:full`; thêm `prettier` vào devDependencies (trước đó script `format` bị hỏng vì chưa cài).
  - `check:full` = `check` (unit + build + flip) + `check:capsule` (75 PASS) + `cargo test` (7 PASS). Đã chạy pass.
  - **Chưa đưa vào gate** (assertion theo thiết kế cũ): `check:smoke` fail ở pomodoro/weather, `check:preview` fail 2 assertion pomodoro, `check:format` fail 56 file.
- **Bước tiếp theo tách riêng**: P0-2b (sửa smoke/preview), P0-2c (format toàn bộ) — xem dưới.
- **Token thực tế**: ~30k.

### P0-2b · Sửa suite `smoke` + `preview` cũ ✅
- [x] **Mục tiêu**: đưa 2 suite tĩnh vào gate, bắt drift markup/CSS thật.
- **Kết quả**:
  - `smoke.mjs`: thay `renderPomodoro` → `renderState`; assertion pomodoro theo markup forest (`forest-dial`, `forest-tree`, `forest-btn`, pathLength 263.894).
  - Assertion weather cập nhật theo CSS mới (nhiệt độ 48px đậm, °C 20px mờ, `translateX(5%)`, 2x1 `:not(.is-wide3)`, 9 tông gradient 145deg).
  - `weatherIconGroup`: gộp `drizzle` vào `rain`; assertion Rust đọc `weather.rs` thay vì `lib.rs`.
  - `preview.mjs`/`check-preview.mjs`: bỏ ô "Cài đặt" (đã gỡ khỏi lưới), dựng pomodoro từ markup forest.
  - `check:smoke` 128 PASS / 0 FAIL; `check:preview` PREVIEW OK.
  - `check:full` đã thêm `check:smoke` + `check:preview`.
- **Done**: `npm.cmd run check:full` pass.
- **Token thực tế**: ~28k.

### P0-2c · Format toàn bộ ✅
- [x] **Mục tiêu**: một chuẩn format duy nhất, có gate chặn drift.
- **Kết quả**:
  - Chạy Prettier cho `src/**/*.{js,css}` + file gốc (55 file); commit riêng chỉ format.
  - `.prettierrc` thêm override `*.css: singleQuote=false` để giữ nháy kép trong selector `[data-tint="..."]` như trước.
  - `smoke.mjs`/`check-preview.mjs` thêm bản gộp khoảng trắng (`styleFlat`, `jsFlat`) và nới regex để không phụ thuộc format.
  - `extract()` trong `smoke.mjs`/`preview.mjs` gộp được câu lệnh `const` bị Prettier xuống dòng.
  - `check:format` đã vào `check:full`.
- **Done**: `npm.cmd run check:full` pass (unit 10, flip 17, smoke 128, preview OK, capsule 75, cargo 10).
- **Token thực tế**: ~35k.

### P0-3 · Bắt lỗi frontend vào ring buffer ✅
- [x] **Mục tiêu**: lỗi widget/runtime không biến mất khỏi console.
- **Kết quả**:
  - `src/core/diagnostics.js`: `createDiagnostics({limit, now})` (thuần, test được), singleton `diagnostics`, `installDiagnostics(scope)` gắn `error`, `unhandledrejection` và wrap `console.error` (vẫn gọi console gốc).
  - Ring buffer 200 bản ghi; `format({title})` xuất text có mốc ISO + detail thụt dòng; `Error`/object/vòng tham chiếu đều được stringify an toàn.
  - `main.js` gọi `installDiagnostics()` trước `bootstrapApp()`.
  - Test: `src/core/diagnostics.test.js` (4 test) đã vào `npm run check`.
- **Done**: `npm.cmd run check` pass (unit + build + flip 17 PASS).
- **Token thực tế**: ~14k.

### P0-4 · Nút "Xuất chẩn đoán" ✅
- [x] **Mục tiêu**: có file log để gửi kèm khi báo lỗi.
- **Kết quả**:
  - `src-tauri/src/diagnostics.rs`: command `save_diagnostics(text)` ghi `app_data_dir/logs/diagnostics-<millis>.txt`, tự thêm header phiên bản app (`package_info`), giới hạn 2 MB; có unit test.
  - `settings-panel.js`: nút "Xuất chẩn đoán" ghép `diagnostics.format()` + thời gian + chế độ + số phím + kích thước cửa sổ + user agent; Tauri → ghi file và hiện đường dẫn; web → tải `.txt` qua Blob.
  - Sửa luôn nút **"Xong"** trong modal Cài đặt trước đây chưa được nối sự kiện.
  - `index.html` thêm nút + vùng trạng thái (`role="status"`); `modals.css` thêm `.settings-note`.
- **Done**: `npm.cmd run check` pass; `check:capsule` 75 PASS; `cargo test` **8 PASS**.
- **Còn lại**: chưa bấm thử trong app desktop thật (cần `npm.cmd run tauri dev`) — sẽ kiểm khi làm P1-2.
- **Token thực tế**: ~24k.

---

## Phase 1 — Hiệu năng (3 session)

### P1-1 · Scheduler đồng hồ theo nhu cầu ✅
- [x] **Mục tiêu**: bỏ vòng 100ms chạy mãi khi chỉ có clock digital.
- **Kết quả**:
  - `registry.js`: scheduler tự hẹn lại bằng `setTimeout`; analog 100ms, digital/flip bám mốc giây kế tiếp (`nextTickDelay`), digital chỉ vẽ khi sang giây mới (`refs.lastSecond`).
  - Dừng hẳn khi registry không còn đồng hồ; `registerLiveWidget` đánh thức lại khi thêm widget.
  - Tạm dừng khi ẩn cửa sổ / deck idle; chạy lại nhờ `visibilitychange`, `focus` và sự kiện mới `deck-idle-change` (phát từ `idle.js`).
  - Bỏ 3 hằng số tick cũ không còn dùng; `tickLiveWidgets` nhận thêm tham số `now` để test.
  - Test mới `src/core/registry.test.js` (4 test) đã vào `npm run check`.
- **Done**: `npm.cmd run check` pass + `check:capsule` 75 PASS.
- **Đã kiểm runtime** (Vite + browser): clock `19:01:24 → :26` sau 2,1s; khi deck idle thì dừng, `pointermove` đánh thức và chạy lại; không có console error.
- **Token thực tế**: ~26k.

### P1-2 · Giảm vòng quét audio/media ✅
- [x] **Mục tiêu**: không enumerate WASAPI session 2s/lần khi deck không có slider app.
- **Kết quả** (`src/core/deck-audio.js`):
  - Gộp 2 interval (2s + 500ms) thành **1 vòng 1 giây**; mỗi việc có chu kỳ riêng: media tick 1s, master volume 2s, media state 2s, session app **5s**.
  - Mỗi việc tự bỏ qua khi không có widget tương ứng (`syncSystemVolume`, `syncAll`, `appSliderWidget.sync` đều có guard sẵn).
  - Dừng hẳn interval khi deck idle / cửa sổ ẩn; chạy lại + quét đầy đủ khi thức (`visibilitychange`, `focus`, `deck-idle-change`).
- **Ước tính giảm**: gọi `get_audio_sessions` 30 → 12 lần/phút; số lần timer thức 150 → 60 lần/phút. `get_media_state` và `get_master_volume` giữ 2s.
- **Done**: `npm.cmd run check` pass; chạy Vite 12 phím, không console error.
- **Còn lại**: chưa đo IPC thật trong Tauri — chuyển sang P1-3.
- **Token thực tế**: ~16k.

### P1-3 · Đo lại và ghi số
- [x] **Mục tiêu**: có baseline định lượng, tránh tối ưu cảm tính về sau.
- **File**: `src/core/diagnostics.js`, `OPTIMIZATION_STAGE2_PLAN.md`.
- **Việc**:
  - Thêm hàm dev-only đếm số lần gọi IPC trong 60s (`window.__ipcCount`).
  - Chạy app 60s ở màn hình deck mặc định, ghi: số lần `get_master_volume`, `get_audio_sessions`, `media tick`, CPU thô của WebView (Task Manager).
  - Ghi kết quả vào mục "Số đo" cuối file này.
- **Done**: số liệu được ghi lại; không cần test mới.
- **Token**: ~10k.

---

## Phase 2 — Tách Rust (4 session, độc lập, làm bất kỳ thứ tự)

> Nguyên tắc: **chỉ di chuyển code, không đổi hành vi**. Mỗi bước build được ngay.
> Lưu ý: `scripts/check-capsule.mjs` và `scripts/smoke.mjs` đang đọc thẳng
> `src-tauri/src/lib.rs` — sau mỗi bước P2 phải sửa đường dẫn đọc sang module mới,
> nếu không `check:capsule` sẽ fail.

### P2-1 · `audio.rs`
- [x] **File**: `src-tauri/src/lib.rs`, tạo `src-tauri/src/audio.rs`.
- **Việc**: chuyển toàn bộ phần master volume / mute / peak / mic / audio session / `set_app_volume` / `toggle_app_mute` + các struct liên quan + static `CAPTURE`. Khai báo `mod audio;` và trỏ lại handler.
- **Done**: `cd src-tauri; cargo build` + `cargo test`; `npm.cmd run check`.
- **Token**: ~25k.

### P2-2 · `windows_info.rs`
- [x] **File**: `src-tauri/src/lib.rs`, tạo `windows_info.rs`.
- **Việc**: chuyển `cached_process_name`, `collect_visible_windows`, `strip_browser_suffix`, `display_label`, struct `WindowInfo`. Thêm test cho `strip_browser_suffix` và `display_label` (dùng dữ liệu mẫu, không cần WinAPI).
- **Done**: `cargo test`; `npm.cmd run check`.
- **Token**: ~20k.

### P2-3 · `actions.rs` + test `net`
- [x] **File**: `src-tauri/src/lib.rs`, `net.rs`, tạo `actions.rs`.
- **Việc**: chuyển `trigger_action`, `split_launch_target`; thêm test `net::is_safe_web_url` (http/https hợp lệ, `javascript:`, `file:`, chuỗi rỗng).
- **Done**: `cargo test`; `npm.cmd run check`.
- **Token**: ~20k.

### P2-4 · `windows.rs` + làm mỏng `lib.rs`
- [x] **File**: `src-tauri/src/lib.rs`, tạo `windows.rs`.
- **Việc**: chuyển `open_todo_window`, `close_todo_window`, `close_app`, `shutdown_computer`; `lib.rs` chỉ còn `run()` + `generate_handler`. Mục tiêu < 150 dòng.
- **Done**: `cargo build`; `npm.cmd run tauri dev` mở/đóng cửa sổ Todo 1 lần.
- **Token**: ~20k.

---

## Phase 3 — Widget registry (5 session)

### P3-1 · Lõi registry ✅
- [x] **Mục tiêu**: khai báo widget ở một nơi duy nhất.
- **Kết quả**:
  - `src/core/widget-registry.js`: `createWidgetRegistry()` với `registerWidget`, `getWidget`, `hasWidget`, `listWidgets`, `clear`; descriptor được chuẩn hoá + đóng băng; singleton `widgetRegistry`.
  - `create(ctx) -> { markup, setup, destroy }`; ctx = `{ el, content, services }`.
  - `widget-renderer.js`: ưu tiên widget đã đăng ký, giữ nguyên nhánh fallback cũ; instance lưu `WeakMap` để gọi `destroy`.
  - Test: `widget-registry.test.js` (5) + 1 test renderer theo registry.
- **Done**: `npm.cmd run check` pass (23 test).
- **Token thực tế**: ~22k.

### P3-2 · Migrate 3 widget đơn giản ✅
- [x] **Kết quả**: `shutdown_widget`, `mic_widget`, `music_wave` tự đăng ký descriptor trong module (side-effect khi import), renderer bỏ 3 nhánh `if/else`. `create()` lấy widget instance từ `ctx.services`.
- **Done**: `npm.cmd run check`; Vite smoke 12 phím — `.shutdown-unit`, `.mic-deck-unit` render đúng, không lỗi console.
- **Token thực tế**: ~18k.

### P3-3 · Migrate widget "sống" ✅
- [x] **Kết quả**: `mini_clock`, `weather_widget`, `pomodoro`, `bongo_cat` đăng ký trong module; giữ nguyên `registerLiveWidget`/`__pomo`/`__bongoState`. Clock truyền `applyWidgetTier` qua `ctx.services`.
- **Done**: `npm.cmd run check`; Vite smoke — clock chạy (`15:30`), pomodoro/weather/bongo markup đúng, không lỗi.
- **Token thực tế**: ~16k.

### P3-4 · Migrate widget còn lại (volume, app-slider, media, todo) + xoá nhánh cũ ✅
- [x] **Kết quả**: 4 widget còn lại đăng ký; `widget-renderer.js` còn ~65 dòng, không còn bảng dispatch; chỉ giữ fallback icon cho `open_url`/`launch_app`. Test renderer viết lại theo vòng đời registry.
- **Done**: `npm.cmd run check` pass (23 test); Vite smoke 12 phím — volume/app-slider/clock/weather/pomodoro/mic/shutdown render đúng, không lỗi console.
- **Token thực tế**: ~22k.

### P3-5 · Modal editor theo schema ✅
- [x] **Mục tiêu**: modal biết widget nào có trường nào từ registry, không hard-code type.
- **Kết quả**:
  - `configFields` chuẩn hoá trong registry (`FIELD_TYPES`: text/number/select/color/checkbox + field đặc thù icon/app/city); chặn key trùng và type lạ.
  - Mỗi widget khai báo `configFields` + `fixedSize` khi cỡ ô cố định.
  - `modal-editor.js` dùng `hasField(type, key)` để bật/tắt nhóm nhập liệu; bỏ danh sách `type === ...` cho từng nhóm.
  - Giữ nguyên các khối đặc thù (icon/app/city) trong DOM; schema chỉ điều khiển hiển thị + validate.
- **Done**: `npm.cmd run check` pass (25 test); Vite smoke: chọn `mini_clock` → nhóm Đồng hồ hiện, `weather_widget` → nhóm Thời tiết, `bongo_cat` → nhóm Bongo, `pomodoro` → nhóm Pomodoro, `open_url` → không nhóm nào.
- **Token thực tế**: ~24k.

---

## Phase 4 — Dữ liệu & layout (2 session)

### P4-1 · Layout schema v2 + migration ✅
- [x] **Kết quả**:
  - `layout-store.js`: `LAYOUT_SCHEMA_VERSION = 2`; `migrateLayout(items, fromVersion)` thêm `id` ổn định (giữ id cũ, chống trùng), chuẩn hoá `cfg` thành object, bỏ phím thiếu `x/y`.
  - Đọc được layout mảng cũ + v1 + v2; `writeLayout`/`writeLayoutFile` luôn ghi v2 đã migrate.
  - `serializeNode` lưu `id`; `tile-factory` gán `dataset.layoutId` để id không đổi qua mỗi lần lưu.
  - Rust `layout.rs`: chấp nhận `schemaVersion` 1..=2 (validate mềm), test cập nhật.
- **Done**: `npm.cmd run check` + `cargo test` pass (25 JS, 10 Rust); layout v1 cũ vẫn giữ đủ phím.
- **Token thực tế**: ~20k.

### P4-2 · Sao lưu / khôi phục
- [ ] **File**: `src-tauri/src/lib.rs` (hoặc `backup.rs`), `settings-panel.js`, `index.html`.
- **Việc**: command `export_backup` (layout + config + todo → 1 `.json` qua save dialog) và `import_backup` (validate + ghi đè có `.bak`). UI 2 nút trong Cài đặt, xác nhận 2 bước khi import.
- **Done**: `npm.cmd run check`; export → reset → import khôi phục đúng.
- **Token**: ~25k.

---

## Phase 5 — Tính năng (mỗi bước 1 session, làm sau cùng)

### P5-1 · Mở rộng Cài đặt
- [ ] **File**: `settings-panel.js`, `index.html`, `config-store.js`, `idle.js`.
- **Nội dung**: độ sáng, thời gian idle, khởi động cùng Windows (`tauri-plugin-autostart`), ngôn ngữ (vi/en), nút xuất chẩn đoán (đã có ở P0-4).
- **Token**: ~25k.

### P5-2 · Nhiều trang deck
- [ ] **File**: `layout-store.js` (schema trang), `app.js`, `grid.js`, `widget-registry.js`.
- **Nội dung**: model `{ pages: [{ id, name, widgets }] }`, phím `page_switch`, chỉ số trang đang xem, giữ tương thích layout 1 trang.
- **Token**: ~30k (tách nếu cần).

### P5-3 · Profile theo app đang focus
- [ ] **File**: Rust `windows_info.rs` (đã có hàm lấy process), command `get_foreground_process`, `app.js`.
- **Nội dung**: map `processName → pageId`, polling 1s chỉ khi bật tính năng; fallback về trang mặc định.
- **Token**: ~25k.

### P5-4 · Phím đa hành động
- [ ] **File**: `tile-factory.js`, `widget-registry.js`, `modal-editor.js`, Rust `actions.rs`.
- **Nội dung**: type `multi_action` với danh sách `{ action, target, delayMs }`, chạy tuần tự có huỷ.
- **Token**: ~30k.

### P5-5 · Auto-update + siết bảo mật
- [ ] **File**: `tauri.conf.json`, `Cargo.toml`, `lib.rs`, `index.html`.
- **Nội dung**: `tauri-plugin-updater` + endpoint; xác nhận 2 bước cho `shutdown_computer` ở lớp Rust; whitelist domain ảnh weather/icon; cân nhắc tắt `withGlobalTauri` sau khi chuyển hết sang import `@tauri-apps/api`.
- **Token**: ~30k.

---

## Số đo (điền ở P1-3)

Đo ngày **2026-10-19** trên layout đang lưu (có `music_wave` + `mic_widget`, **không** có
`app_slider`), app chạy `npm.cmd run tauri dev`, CPU 12 nhân. Số IPC lấy từ
`window.__ipcCount()` — cửa sổ trượt 60 giây, đếm tại lớp `tauri-ipc.js`
(Tauri đóng băng `__TAURI_INTERNALS__.invoke` nên không bọc trực tiếp được).
CPU lấy bằng `Get-Process` cho tiến trình app + toàn bộ tiến trình con WebView2,
mẫu 62 giây; giữ deck thức bằng `pointermove` tổng hợp (3 giây/lần) khi đo "thức".

| Chỉ số | Trước P1 | Sau P1 |
|---|---|---|
| IPC `get_master_volume` / 60s | ~30 (ước tính P1-2) | **26** |
| IPC `get_audio_sessions` / 60s | ~30 (ước tính P1-2) | **0** (layout hiện tại không có `app_slider`) |
| `media.tick` / 60s | 60 | **60** (không gọi IPC) |
| IPC `get_media_state` / 60s | chưa đo | **26** |
| IPC `get_mic_state` / 60s | chưa đo | **750** (poll 80 ms) |
| IPC `get_output_peak` / 60s | chưa đo | **857** (`music_wave`, ~70 ms) |
| **Tổng IPC khi deck thức / 60s** | chưa đo | **~1.665** |
| CPU WebView (deck thức) | chưa đo | **~53% một nhân** (~4,4% / 12 nhân) |
| CPU app .exe (deck thức) | chưa đo | **~1,3% một nhân** |
| CPU WebView (idle/screensaver) | chưa đo | **~15–25% một nhân** (~1,2–2,0% / 12 nhân) |
| CPU app .exe (idle/screensaver) | chưa đo | **~1,3% một nhân** |

**Nhận xét**:
- `get_mic_state` + `get_output_peak` chiếm **~96%** tổng IPC → đây là mục tiêu tối ưu
  tiếp theo (giảm tần suất hoặc chỉ poll khi tile thực sự hiển thị).
- Khi idle, mọi vòng poll đều dừng (IPC ~0/phút), nhưng WebView vẫn tốn CPU cho
  animation/CSS → có thể đo lại sau khi tối ưu hiệu ứng.
- Số CPU dao động theo animation nên chỉ dùng làm baseline tương đối.

## Trạng thái

- [x] P0-1 · Git baseline
- [x] P0-2 · Tooling + check:full
- [ ] P0-2b · Sửa smoke/preview
- [ ] P0-2c · Format toàn bộ
- [x] P0-3 · Ring buffer lỗi
- [x] P0-4 · Xuất chẩn đoán
- [x] P1-1 · Scheduler đồng hồ
- [x] P1-2 · Vòng quét audio/media
- [x] P1-3 · Đo lại
- [x] P2-1 · audio.rs
- [x] P2-2 · windows_info.rs
- [x] P2-3 · actions.rs
- [x] P2-4 · windows.rs
- [ ] P3-1 · Lõi registry
- [ ] P3-2 · Migrate 3 widget đơn giản
- [ ] P3-3 · Migrate widget sống
- [ ] P3-4 · Migrate widget còn lại
- [ ] P3-5 · Modal theo schema
- [ ] P4-1 · Layout v2
- [ ] P4-2 · Sao lưu/khôi phục
- [ ] P5-1 · Cài đặt mở rộng
- [ ] P5-2 · Nhiều trang
- [ ] P5-3 · Profile theo app
- [ ] P5-4 · Đa hành động
- [ ] P5-5 · Auto-update + bảo mật
