# Tối ưu build - Giai đoạn 1 (hoàn thành) và trạng thái hiện tại

Giai đoạn 1 là tối ưu build và tách CSS. Giai đoạn 2 (module hóa `main.js`, tách widget) đã hoàn thành; xem mục "Trạng thái hiện tại" ở cuối file.

## Các thay đổi giai đoạn 1:

### 1. Tách CSS khỏi HTML
- **Trước**: CSS inline trong `index.html` (~2400 dòng, 29KB+)
- **Sau (lúc đó)**: tách thành một file CSS riêng import qua `<link>`
- **Hiện tại**: CSS đã chia tiếp trong `src/styles/` (`tokens.css`, `grid-deck.css`, `keycap-base.css`, `widgets/*.css`, `overrides.css`), được gom bởi `src/styles/index.css`
- **Lợi ích**:
  - Browser cache CSS riêng biệt
  - HTML nhẹ hơn, tải nhanh hơn
  - Dễ maintain và debug

### 2. Tối ưu vite.config.js
- **target: 'esnext'** - code hiện đại cho Tauri WebView
- **manualChunks** - tách GridStack ra chunk riêng
  - Chunk gridstack chỉ load 1 lần, cache lâu dài
- **Multi-page**: `rollupOptions.input` có `main: index.html` và `todo: todo.html`; thiếu `todo.html` thì cửa sổ Todo trắng trong bản build
- `server.port: 1420` + `strictPort`, khớp `devUrl` trong `src-tauri/tauri.conf.json`
- Fix encoding UTF-8 without BOM

### 3. Thêm Prettier config
- `.prettierrc` với cấu hình chuẩn
- npm scripts:
  - `npm run format` - format code
  - `npm run format:check` - kiểm tra formatting

### 4. Kết quả build (`npm.cmd run build`, đo lại)

```
dist/index.html                     13.57 kB │ gzip:  3.81 kB
dist/todo.html                       2.96 kB │ gzip:  1.35 kB
dist/assets/main-*.css              79.07 kB │ gzip: 16.77 kB
dist/assets/gridstack-*.css          5.99 kB │ gzip:  1.41 kB
dist/assets/main-*.js              118.17 kB │ gzip: 38.43 kB
dist/assets/gridstack-*.js          91.62 kB │ gzip: 25.45 kB  ← cache riêng
dist/assets/icon-data-lucide-*.js    7.75 kB │ gzip:  2.72 kB
```

Chú ý: bundle `main` lớn hơn số đo ban đầu (65-67 KB) vì từ đó đã thêm nhiều widget (Mic, Volume, Media, Todo, Bongo Cat...) và bộ icon.

## Giai đoạn 3 - Dọn dẹp `app.js` (đã thực hiện)

- `src/core/app.js` giảm từ 858 xuống còn khoảng 370 dòng, chỉ còn vai trò lắp ghép (composition).
- Tách các phần độc lập thành module riêng:
  - `layout-helpers.js`: occupancy map, tìm ô trống, serialize tile.
  - `layout-persistence.js`: debounce + ghi `layout.json` / localStorage.
  - `tile-factory.js`: tạo tile, nút kéo/xóa, toast hoàn tác.
  - `deck-audio.js`: đồng bộ âm lượng hệ thống/app/media và vòng quét nền.
  - `settings-panel.js`: modal Cài đặt Deck + xác nhận "Đặt lại bố cục".
- Bỏ import chết (`keyContent`), sửa comment lỗi thời trong `index.html`.
- `media.tick()` bỏ qua truy vấn DOM khi deck không có phím media.
- Runtime đã thử trên Vite: dựng đủ 12 tile, vào Edit Mode, tạo/xóa/hoàn tác phím, đặt lại bố cục; `npm.cmd run check` pass.

## Trạng thái hiện tại (sau giai đoạn 2)
- `main.js` đã module hóa: `src/main.js` chỉ import `src/styles/index.css` và gọi `bootstrapApp()` trong `src/core/app.js`.
- Logic chia thành `src/core/` (grid, renderer, registry, layout/config store, IPC) và `src/widgets/` (mỗi widget một module).
- Giao diện dùng phong cách Stream Deck LCD tràn mặt (`body.sd-look`), thay cho keycap 3D / glass cũ.
- Kiểm tra: `npm.cmd run check` (Node unit test + build + `.devtmp/check-flip.mjs`).
- Còn lại tùy chọn: thêm JSDoc cho type safety; port các script `.devtmp/` còn assertion theo thiết kế cũ.

Chạy `npm.cmd run tauri dev` để thử app desktop.
