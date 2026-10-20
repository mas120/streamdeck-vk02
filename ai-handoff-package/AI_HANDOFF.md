# AI Handoff – Stream Deck VK02

> **Lưu ý snapshot:** thư mục này là bản sao phục vụ chia sẻ, không phải source đang chạy. Workspace gốc ở thư mục cha mới là chuẩn; `src/main.js` và `src/deck.css` trong package có thể cũ và không chứa các cập nhật `body.sd-look` mới. Nếu tiếp tục phát triển workspace hiện tại, đọc `../AI_HANDOFF.md` và sửa source trong `../src/`.

## 1. Dự án này là gì
Đây là ứng dụng desktop kiểu Stream Deck, chạy bằng Tauri + Vite + JavaScript thuần. Mục tiêu là tạo một “deck” gồm nhiều widget dạng keycap. Mỗi widget có logic riêng, kích thước riêng, và mức độ tương tác khác nhau, nhưng phải giữ cùng một hệ thống UI: keycap 3D, mặt phẳng mềm, màu đồng bộ, spacing chắc chắn.

## 2. Tình trạng hiện tại
Workspace hiện tại dùng phong cách **Stream Deck LCD tràn mặt**: vỏ tối dùng chung, nội dung widget phủ mặt LCD. Accent tương tác là cyan; Weather có nền tối trung tính; Pomodoro giữ cây Forest nhưng giảm nền/viền nổi; flip clock được làm phẳng về mono.

Các style cập nhật gần nhất nằm ở `../src/styles/overrides.css` của workspace và **chưa được đồng bộ vào snapshot này**. Build frontend workspace đã thành công bằng `npm.cmd run build`.

## 3. Kiến trúc cơ bản
### Frontend
- Trong snapshot này, frontend là Vite + Vanilla JS; một số logic còn nằm trong `src/main.js`.
- Workspace hiện tại đã tách composition ở `src/core/app.js`, logic widget ở `src/widgets/` và style ở `src/styles/`.
- Đối chiếu workspace trước khi dùng tên hàm/đường dẫn trong package.

### Desktop shell
- Tauri v2
- Dùng để đóng gói app desktop và chạy ở môi trường native

### Layout
- GridStack quản lý vị trí và kích thước widget
- Các widget có thể ở size như 1x2, 2x2, 3x1, tùy mục đích hiển thị
- Khi resize thì class trạng thái kích thước và layout CSS phải được đồng bộ lại

### Styling
- Snapshot dùng CSS cũ trong `src/deck.css` và các file theme.
- Workspace hiện tại import CSS qua `src/styles/index.css`; `src/styles/overrides.css` chứa style `body.sd-look` mới.
- Phong cách hiện tại là vỏ tối, LCD tràn mặt, logo shortcut giữ nguyên nhận diện và accent theo ngữ nghĩa.

## 4. File quan trọng cần đọc trước
Nếu AI mới vào dự án, đọc theo thứ tự này:
1. `src/main.js` – logic app chính, render, timer, widget state
2. `src/deck.css` – style chung cho keycap, layout whole deck, weather, clock
3. `src/forest-pomodoro.css` – style riêng cho theme Forest Pomodoro
4. `src/forest-tree-svgs.js` – SVG cây cho trạng thái tiến độ Pomodoro
5. `index.html` – entry HTML và import CSS
6. `src-tauri/` – backend Tauri, config app

## 5. Widget chính đang hoạt động
### Pomodoro
- Theme Forest
- Layout dọc cho size 1x2
- Có ring tiến độ + cây SVG + nhãn trạng thái
- Là widget có nhiều nhất logic trực quan và cần giữ performance khi timer chạy

### Weather
- Trình bày như card keycap 3D
- Dùng layout 3 cột cho thông tin chính
- Có điều kiện refresh được debounce để tránh spam cập nhật

### Flip Clock
- Chạy theo logic flip card cho từng đơn vị giờ/phút/giây
- Đã fix lỗi số 0 và cập nhật không còn “đè nhầm” render
- Cần tránh render lại toàn bộ widget nếu chỉ đổi một chữ số

### Mini Clock (digital / analog / flip)
- Có 3 mặt đồng hồ: digital, analog, flip
- Mỗi mặt có logic render và cập nhật riêng
- `parseClockCfg()` và `updateClockWidget()` là điểm khởi đầu khi sửa đồng hồ
- `mini_clock` là widget “sống” và cần lưu config tz / face / label để khôi phục sau reload

### Volume Slider
- Widget thanh trượt âm lượng theo kiểu keycap lớn
- Lưu mức volume trong `dataset.target` và cập nhật qua touch/drag logic
- Vì có tương tác kéo tay, không sửa trực tiếp vào render mà nên sửa `setupTouchSlider()` / `updateVolumeUI()` tương ứng

### App Slider
- Dùng để chọn ứng dụng đang phát âm thanh và điều khiển volume riêng của app
- Có dữ liệu từ audio session cache ở Rust
- Logic chính ở `refreshAudioSessions()`, `updateAppWidget()`, `syncAppSliders()`
- Khi sửa xử lý app audio, luôn kiểm tra trạng thái `muted`, `active`, `idle`, `off`

### Bongo Cat
- Widget hoạt hình kiểu keyboard cat, có phản ứng theo tay trái/phải và trạng thái nhấn
- Cấu hình `size` và `showKps` được lưu vào `dataset.cfg`
- Xem `setupBongoCatPointer()`, `setupBongoCatEventListener()`, `bongoCatMarkup()`
- Đây là widget tương tác kiểu animation + event, không nên sửa đè vào logic timer khác

### Todo List
- Widget ghi chú / checklist dạng keycap
- Nội dung có thể mở editor và lưu vào localStorage / `todo-store.js`
- Logic chính: `todoMarkup()`, `updateTodoWidget()`, `openTodoEditor()`

### Settings
- Nút cài đặt deck dạng 1x1
- Chịu trách nhiệm bật chế độ chỉnh sửa / mở settings modal
- Logic dùng double click / right-click / modal riêng

### Utility widgets
- `open_url`: mở link/website
- `launch_app`: mở app hệ thống như Notepad, Task Manager, Resmon
- Đây là widget “quick action”, logic thường ít phức tạp
- Khi thêm widget mới, cần đảm bảo `renderWidgetBody()` và `click` handler đều được gom đúng loại

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
- `src/deck.css` cho style chung của deck/system
- `src/forest-pomodoro.css` cho theme Pomodoro đặc thù
- Nếu style chỉ dùng cho một widget, nên giữ riêng widget đó

### Quy tắc 4: Không tối ưu sai hướng
- Dự án kiểu Stream Deck cần performance ổn và render mượt
- Không nên thay đổi toàn bộ kiến trúc UI chỉ để “gọn code” nếu nó làm chậm app

## 7. Cấu trúc thư mục
- `src/` – frontend chính
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

### Chạy dev
```bash
npm run dev
```

### Chạy app desktop
Nếu project có cấu hình Tauri ready:
```bash
npm run tauri dev
```

## 9. Mục tiêu hiện tại và kế hoạch tiếp theo
### Mục tiêu current
- hoàn thiện polish từng widget
- đồng bộ style trên các kích thước deck
- giảm bug layout / resize / render
- giữ app nhanh và mượt khi chạy liên tục

### Kế hoạch tiếp theo
- tune spacing và font-size cho từng widget nhỏ
- đồng bộ các theme và trạng thái idle / active / warning
- kiểm tra lại ở các size deck khác nhau trước khi dừng công việc

## 10. Prompt chuẩn cho AI tiếp theo
"Đây là package snapshot của Stream Deck VK02. Trước khi sửa, xác định bạn đang làm trong package hay workspace gốc. Với workspace hiện tại, dùng ../AI_HANDOFF.md; source chuẩn là ../src/core/, ../src/widgets/ và ../src/styles/. Giữ phong cách LCD tràn mặt và kiểm tra đúng CSS/state module. Không chép ngược snapshot cũ lên workspace."

## 11. Nên nhớ khi tiếp tục code
AI mới vào dự án cần hiểu 3 điều này trước khi sửa:
1. Đây là app Stream Deck, không phải web app thông thường
2. UI đang rất chú trọng vào “độ đẹp + tốc độ render” cùng lúc
3. Logic chính nằm trong `src/main.js`, css chung nằm trong `src/deck.css`

Nếu không đọc gì khác, hãy đọc 3 file này trước: `src/main.js`, `src/deck.css`, `src/forest-pomodoro.css`.

## 12. Kết luận ngắn
Tài liệu này đủ để AI hiểu dự án ở mức “nắm bối cảnh + biết file nào cần đọc + biết khuôn mẫu phát triển”. Nó không quá dài, nhưng cũng không bị cắt quá mức đến nỗi thiếu thông tin quan trọng.
