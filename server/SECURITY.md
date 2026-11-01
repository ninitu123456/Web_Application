# Phase 7 — Bảo mật và chạy kiểm thử

## Cấu hình runtime

Helmet đặt security headers trên mọi response, kể cả 400/401/403/404/429/500 và preflight. `NODE_ENV=production` bật HSTS và CSP `upgrade-insecure-requests`; môi trường development/test HTTP tắt hai cơ chế này. Production phải phục vụ qua HTTPS. Header không tự cung cấp TLS.

| Phạm vi | Mặc định | Khóa đếm | Biến cấu hình |
|---|---:|---|---|
| `/api`, trừ `/health` và OPTIONS | 300/phút | IP | `RATE_LIMIT_API_MAX` |
| `/api/auth/login` | thêm 30/15 phút | IP | `RATE_LIMIT_LOGIN_MAX` |
| `/api/auth/register` | thêm 10/15 phút | IP | `RATE_LIMIT_REGISTER_MAX` |
| Upload ảnh | thêm 10/phút | user ID đã xác thực | `RATE_LIMIT_UPLOAD_MAX` |

Các giá trị phải là số nguyên dương an toàn. Global/auth limit chạy trước JSON parsing và xử lý service/bcrypt; upload limit chạy sau authentication/role và trước Multer. Thành công và thất bại đều được tính; ADMIN không được miễn. Quá giới hạn trả 429, JSON `{success:false,message:...}`, `Retry-After`, RateLimit headers và `Cache-Control: no-store`. Các limiter cộng dồn, không thay thế nhau.

Mỗi app có store bộ nhớ riêng. `trust proxy=false`, IP lấy từ kết nối, không lấy từ `X-Forwarded-For`/`Forwarded`. Các kiểm tra cảnh báo thư viện cho forwarded headers được tắt có chủ đích; proxy trust vẫn tắt. Người dùng sau NAT dùng chung giới hạn IP. Nếu triển khai sau reverse proxy hoặc nhiều instance, cần duyệt topology/IP trust và store dùng chung trước; khởi động lại process sẽ reset bộ đếm.

CORS giữ nguyên allowlist HTTP(S), không wildcard/cookie credentials. Origin ngoài danh sách không có Access-Control-Allow-Origin; client ngoài trình duyệt vẫn gọi được API công khai. CORS không thay JWT hoặc authorization.

Upload chỉ nhận field `images`, tối đa 5 file, 5 MiB/file, không nhận text fields; `parts=6` là chặn multipart parser và đã kiểm thử batch đủ 5 file. Có allowlist MIME JPEG/PNG/GIF/WebP và kiểm tra chữ ký bytes ở service. Đây không phải image decoder/antivirus. Filename không dùng làm Cloudinary public ID; UUID do server tạo, `overwrite:false`. Lỗi kích thước trả 413, field/count/framing sai trả 400, lỗi nội bộ vẫn 500. Asset cleanup dùng journal/row lock hiện có.

JWT vẫn HS256, issuer/audience cố định; role/account status đọc lại từ DB. Không thêm logout/refresh token hoặc thay đổi lifetime. Transaction có BEGIN/COMMIT không rõ kết quả bị đánh dấu fatal và hủy connection, không tự replay; lỗi operation thông thường rollback trước khi release.

## Chạy an toàn

```powershell
npm.cmd test
npm.cmd run test:security
npm.cmd run test:security:isolated
npm.cmd run test:integration:isolated
npm.cmd run test:regression
npm.cmd run test:coverage
npm.cmd run audit:production
```

`test:security` kiểm tra HTTP/unit; regression bao gồm transaction và database unit tests. Coverage dùng Node 24, xuất `coverage/unit.lcov` cho backend/auth unit/HTTP; không bao gồm MySQL integration hoặc database scripts, không phải số đo toàn hệ thống. Không đặt ngưỡng tùy ý thay cho assertion nghiệp vụ.

Mọi integration suite yêu cầu `FINDIT_ISOLATED_DATADIR` và xác minh datadir/port thực trước khi chạy test. Runner tạo credentials/port/datadir riêng, vô hiệu Cloudinary credentials và đặt cấu hình test cố định. Không tự đặt marker để chạy vào database khác. Các lệnh `test:*:integration` trực tiếp cũ sẽ từ chối khi không có runner identity; dùng các lệnh `*:isolated` ở trên.

Runner tự phát hiện các file `.integration.js` trong backend, auth và database; suite security luôn nằm trong regression. Chỉ cleanup database có tên sở hữu và thư mục tạm đã kiểm tra; shutdown/dọn datadir vẫn chạy khi suite thất bại. Không chạy `db:setup`, `db:migrate`, `images:cleanup` với cấu hình đang sử dụng để kiểm thử.

CI có job unit/coverage/audit và job MySQL 8.0 riêng trên Ubuntu 24.04 với Node 24. MySQL hệ thống của runner được dừng, tests chỉ dùng executable để tạo instance tạm. Không cần credentials/secrets sản xuất. Chỉ xuất LCOV, không xuất dump DB/password/JWT.

## Giới hạn và tồn đọng

- Frontend chưa có: chưa nghiệm thu DOM/stored XSS ở giao diện. Payload HTML được giữ như dữ liệu chuỗi JSON; không tự strip/sanitize nội dung nghiệp vụ.
- Không kiểm thử Cloudinary network thật, antivirus, tải lớn hoặc chống DDoS hạ tầng.
- Matching vẫn tuần tự hóa ghi bằng advisory lock; invariant Claim vẫn cần service/row lock. Ghi SQL trực tiếp có thể bỏ qua quy trình.
- Không có idempotency key cho client retry sau COMMIT mất phản hồi; 500 có thể xuất hiện dù giao dịch đã commit.
- Admin Claim/dispute/activity-log API và khác biệt `/close`–`/status` thuộc tồn đọng Phase 6; không bổ sung ở đây.

Tham khảo cấu hình thư viện: [Helmet](https://github.com/helmetjs/helmet#readme), [express-rate-limit](https://github.com/express-rate-limit/express-rate-limit#readme).
