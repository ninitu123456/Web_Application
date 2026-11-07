# Tích hợp UI mới với AI Visual Matching

## Nguồn và trạng thái Git

- Nền AI: `feat/ai-visual-matching`, commit `53d1e9312c1410c92e475b863a46eb8763f37d02`.
- UI đã xác minh sau `git fetch origin`: `origin/feature/findit-ui-refresh`, commit `4323ad14063dbcd9d953e8183bb27507ebb96157` (`feat(ui): refresh FindIt user and admin workflows with regression coverage`). Remote `main` cũng chứa commit này; local `main` không thay đổi.
- Nhánh tích hợp: `integration/ai-ui`. Merge dùng `--no-commit --no-ff`; giữ lịch sử cả hai phía, chưa commit/push.
- UI kế thừa chat và quên mật khẩu từ lịch sử upstream, nên backend, dependency và schema tương ứng được giữ cùng UI.

## Hợp đồng được giữ

Panel AI vẫn nằm trên trang chi tiết LOST của owner khi hai feature flag gợi ý được bật. Giữ nguyên loading/empty/error/retry/success, điểm cosine dạng thập phân và cảnh báo không xác nhận quyền sở hữu. Panel dùng màu và biến CSS xanh của UI mới. Trang FOUND vẫn có Claim, chat và hướng dẫn nhận đồ; Match chính thức, API riêng tư và notification UI cũ tiếp tục hoạt động.

Các service AI, model pinning, lease, snapshot và notification policy không được triển khai lại. Feature flag AI và production notification vẫn mặc định tắt.

## Điều kiện schema của bản tích hợp

Bản tích hợp cần **30 migration** và 26 bảng nghiệp vụ/tính năng cùng `_schema_migrations`: 11 bảng nghiệp vụ gốc, 11 bảng AI, 4 bảng account/chat. Ngoài 001–025 của AI, cần `014_session_version.sql`, `015_password_reset_tokens.sql`, `016_email_outbox.sql`, `017_conversations.sql`, `018_messages.sql` từ upstream.

Hai lịch sử có tiền tố số trùng nhau. Danh tính migration là **toàn bộ tên file và SHA-256**, không chỉ tiền tố số. Tất cả tên và nội dung migration cũ được giữ nguyên. Manifest kết hợp sắp xếp tên file; ledger chấp nhận các bản ghi đã biết của từng lịch sử, xác minh checksum/trạng thái và chỉ cho phép tối đa một migration đang chạy. Kiểm tra schema nghiêm ngặt vẫn từ chối bảng lạ, bảng không có lịch sử và checksum sai.

Regression MySQL tạo riêng hai trạng thái tiền nhiệm (AI 25 và UI 18 migration), nâng cấp lần lượt thêm 5 và 12 migration, kiểm tra seed và checksum. Không dùng cơ chế này để tự ý nâng cấp database đang vận hành. Lượt tích hợp chỉ thao tác trên instance MySQL mới với datadir tạm và cổng được xác minh, không dùng 3306/3311.

## Kiểm thử UI/AI

- `npm test`: backend, auth và schema unit tests.
- `npm run test:integration`: toàn bộ MySQL integration, bao gồm lịch sử migration hai nhánh, worker concurrency/lease, snapshot, >100 LOST, demo isolation và dedup.
- Trong `client`: `npm test`, `npm run typecheck`, `npm run build`.
- Trong `client`: `npm run test:browser` build với API `/api` và flag preview fixture, tạo MySQL disposable rồi chạy Chrome desktop/mobile. HTTP/API/JWT và notification demo dùng implementation thật; Cloudinary/upload adapter, embedding vectors và fault/loading fixtures được mô phỏng. Không chạy lại inference CLIP thật trong bài test giao diện này.
- Browser test chặn HTTPS bên ngoài và dùng ảnh SVG local. Demo notification chỉ là bản ghi trong database disposable với bốn marker cùng run; không gửi email/SMS/push. Các server và database được runner dọn sau kiểm thử.
- Screenshot/log nằm trong `.cache/frontend-browser/` và `.cache/ai-ui/`, được Git bỏ qua. Chúng không được stage cùng source.

Build preview bật flag fixture chỉ trong tiến trình test. Cấu hình mặc định của website và các flag production không thay đổi.

## Kết quả xác nhận trên mã cuối

- Backend: 157/157; auth: 7/7; database unit: 9/9 (tổng `npm test`: 173/173).
- MySQL integration đầy đủ: 315/315; cả hai trạng thái schema tiền nhiệm nâng cấp thành công. Instance/datadir disposable đã được runner xóa.
- Frontend Vitest: 59/59 trên 9 file, gồm 6 test mới cho trang chi tiết AI sau redesign.
- Chrome browser regression: 19/19 test trong lượt Item/browser; kiểm tra Home, auth/navigation, FOUND/Claim, admin, notification và AI. AI panel được kiểm tra ở 360, 390, 768, 1024, 1440 px, có loading/empty/error/retry/success và link sang FOUND.
- TypeScript và Vite build mặc định thành công; không giữ flag fixture trong build cuối.
- Screenshot đã xem: `desktop-explore.png`, `mobile-explore.png`, `ai-ui-panel-1440.png`, `ai-ui-panel-390.png`, `ai-ui-found-desktop.png`, `ai-ui-notifications-mobile.png` trong `.cache/frontend-browser/`.
- Toàn bộ 11 conflict đã xử lý. Không phát sinh merge commit tự động; HEAD vẫn là commit AI gốc và merge đang chờ người dùng cho phép commit.

Sẵn sàng demo local. Lượt browser sử dụng API/JWT/MySQL và notification demo thật, nhưng vector embedding và ảnh là fixture; không coi đây là kiểm tra lại CLIP inference hoặc Cloudinary production. Browser chặn HTTPS ngoài để dùng font hệ thống và không tải tài nguyên production.
