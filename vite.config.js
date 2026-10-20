/* Cấu hình Vite cho Stream Deck VK02.
   -----------------------------------------------------------------------------
   VITE MULTI-PAGE: dự án có HAI trang HTML ở gốc:
     - index.html : cửa sổ chính (nhãn "main" trong tauri.conf.json)
     - todo.html  : cửa sổ soạn việc To-do (nhãn "todo", mở bằng
                    WebviewUrl::App("todo.html") trong src-tauri/src/lib.rs)
   Bản build CHỈ gồm những trang được liệt kê trong rollupOptions.input. Thiếu
   todo.html ở đây thì `dist/` không có file đó -> cửa sổ To-do mở ra TRẮNG
   (hoặc lỗi 404) trong khi `npm run dev` vẫn chạy bình thường, vì dev server
   phục vụ mọi .html ở gốc. */
import { defineConfig } from 'vite';

/* Cổng phải khớp `build.devUrl` trong src-tauri/tauri.conf.json, nếu không
   `npm run tauri dev` sẽ trỏ vào URL không có gì. */
const DEV_PORT = 1420;

/* Biến môi trường Tauri (TAURI_ENV_*, TAURI_PLATFORM...) phải được Vite cho
   đi qua, song song với tiền tố mặc định VITE_. */
const envPrefix = ['VITE_', 'TAURI_ENV_', 'TAURI_'];

export default defineConfig({
  envPrefix,
  clearScreen: false,        // giữ nguyên log của cargo/tauri ở trên màn hình
  server: {
    port: DEV_PORT,
    strictPort: true,        // cổng bận -> báo lỗi ngay, không nhảy cổng khác
    watch: { ignored: ['**/src-tauri/**'] },   // sửa file Rust không reload webview
  },
  build: {
    target: 'esnext',         // chỉ dùng cho Tauri WebView - code hiện đại nhất
    rollupOptions: {
      input: {
        main: 'index.html',   // cửa sổ chính
        todo: 'todo.html',    // cửa sổ To-do (nút "Xong" gọi lệnh Rust đóng cửa sổ)
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/gridstack')) {
            return 'gridstack';
          }
        },
      },
    },
  },
});