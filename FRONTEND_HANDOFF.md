# Bàn giao frontend FindIt

Ngày rà soát: 03/11/2026. Repository: `ninitu123456/Web_Application`. Nhánh bàn giao: `feature/frontend`.

## Phạm vi bàn giao

- Toàn bộ ứng dụng React/Vite/TypeScript trong `client/`, gồm màn hình người dùng và Admin, cấu hình, manifest, lockfile và `.env.example` chỉ chứa địa chỉ API công khai.
- Các API hỗ trợ frontend: lookup danh mục/địa điểm công khai và danh sách bài của tài khoản hiện tại; wiring ứng dụng, controller, repository, service, route, tài liệu và kiểm thử liên quan.
- Unit test, scripts trình duyệt có thể chạy lại với Chrome và MySQL tạm; các cập nhật test harness cần thiết. Không thay bộ dữ liệu hoặc dịch vụ MySQL đang cài.
- Chuẩn hóa nội dung tiếng Việt, ánh xạ lỗi và nhãn trạng thái dùng chung; bảo toàn validation, quyền, trạng thái và nội dung người dùng nhập.
- Hướng dẫn chạy, ba báo cáo từng đợt triển khai/rà soát và ảnh tham chiếu `docs/design/style-reference.png`.

Các báo cáo trước ghi lại kết quả tại thời điểm từng đợt; số liệu và trạng thái Git trong đó là lịch sử. Hướng dẫn sử dụng hiện tại ở [client/README.md](client/README.md), hợp đồng API bổ sung ở [server/FRONTEND-API.md](server/FRONTEND-API.md), chi tiết câu chữ và giới hạn kiểm chứng ở [CONTENT_REVIEW_REPORT.md](CONTENT_REVIEW_REPORT.md).

## Kiểm tra repository và lịch sử

Đã fetch `origin` và xác minh trực tiếp remote. Trước khi tạo commit bàn giao, HEAD local là `0b60c1c`. Remote chưa có `feature/frontend`; nhánh local chưa có upstream. `origin/main` là `115032d4fcdfbb443c211c0106c55c773649f17a`, có thêm hai commit gồm merge backend audit đợt 3 và cập nhật RULES.md. Khác biệt cây mã giữa nền nhánh hiện tại và main chỉ nằm ở RULES.md.

Giữ nguyên nền nhánh và lịch sử. Không merge, rebase, force push, push main hoặc deploy. Commit bàn giao được đưa lên `origin/feature/frontend` và thiết lập upstream.

## Kết quả kiểm chứng

| Kiểm tra | Kết quả và nguồn |
| --- | --- |
| Rà soát file, dữ liệu nhạy cảm và nguồn dependency | Danh sách file cụ thể; không phát hiện private key, token thật, credential URL hoặc secret gán cố định. `.env.example` chỉ có `VITE_API_BASE_URL`. Manifest và lockfile khớp; dependency trong lockfile lấy từ npm registry, không có đường dẫn máy cá nhân hoặc nguồn dependency lạ. Kiểm tra mẫu không thay thế một cuộc kiểm toán bảo mật đầy đủ. |
| Backend/database `npm.cmd run test:regression` | Chạy lại trong đợt bàn giao: 127 backend + 7 auth + 7 database unit đạt; 286 isolated integration đạt; không fail/skip. |
| Frontend `npm.cmd test` | Sử dụng kết quả vừa chạy trong cùng phiên: 41/41 đạt. Source và tests liên quan không đổi sau kết quả này; chỉ thêm tài liệu bàn giao. |
| Frontend TypeScript và build | Sử dụng kết quả `typecheck` và `build` vừa đạt trong cùng phiên; build cuối cũng nằm trong lượt browser đạt. |
| Frontend `npm.cmd run test:browser` | Sử dụng kết quả vừa chạy: suite Item gồm browser người dùng/Admin desktop/mobile và API thật, 19/19 đạt, MySQL tạm đã được dừng và dọn. Không cộng con số này vào 286 để suy ra số test độc lập. |
| Frontend `npm.cmd run format:check` | Chạy lại trong đợt bàn giao: đạt. Chưa cấu hình ESLint; không gọi đây là kết quả lint. |

Đối chiếu SHA-256 xác nhận từ lúc bắt đầu rà soát bàn giao đến khi chuẩn bị stage, không thay đổi source hay tests; chỉ cập nhật README để liên kết tài liệu và thêm hướng dẫn về cơ chế lỗi/nhãn dùng chung.

## File giữ ngoài commit

- `RULES.md`: thay đổi local có sẵn về chỉ dẫn làm việc, ngoài phạm vi bàn giao frontend; giữ nguyên.
- `AUDIT_FIXES_REPORT.md`: báo cáo audit backend từ đợt trước trên nhánh khác, không phải báo cáo triển khai frontend; giữ nguyên.
- `.audit-evidence/`: log và bằng chứng audit thô; giữ nguyên, không stage.
- Các thư mục đã được ignore như `.cache/`, `coverage/`, `node_modules/`, `client/node_modules/`, `client/dist/`: kết quả sinh tự động hoặc dependency cục bộ, không đưa vào commit. Không xóa các thư mục này. Không stage `.env` thật hay credentials.

## Giới hạn còn lại

Chưa kiểm chứng Cloudinary qua mạng thật, Safari/Firefox, thiết bị vật lý, screen reader hoặc môi trường hosting production. Một số lỗi hiếm được kiểm chứng bằng unit test ánh xạ thay vì kích hoạt qua giao diện. Không nghiệm thu trực quan mọi tổ hợp trạng thái tải/rỗng/lỗi trên từng trang.

Quan sát màn hình lỗi khi tải lại trang riêng tư sau khi tài khoản đã bị đình chỉ được ghi rõ trong báo cáo nội dung. Không thay vòng đời xác thực trong đợt chuẩn hóa câu chữ. Không phát sinh migration, chức năng mới hoặc thay đổi bảo mật để phục vụ câu chữ.
