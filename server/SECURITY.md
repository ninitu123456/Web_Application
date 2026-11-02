# Phase 7 — Bảo mật và chạy kiểm thử

## Cấu hình runtime

Helmet đặt security headers trên mọi response, kể cả 400/401/403/404/429/500 và preflight. `NODE_ENV=production` bật HSTS và CSP `upgrade-insecure-requests`; môi trường development/test HTTP tắt hai cơ chế này. Production phải phục vụ qua HTTPS. Header không tự cung cấp TLS.

| Phạm vi | Mặc định | Khóa đếm | Biến cấu hình |
|---|---:|---|---|
| `/api`, trừ `/health` và OPTIONS | 300/phút | IP | `RATE_LIMIT_API_MAX` |
| `/api/health` (GET/HEAD) | 60/phút | IP | `RATE_LIMIT_HEALTH_MAX` |
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

`test:security` kiểm tra HTTP/unit; regression bao gồm transaction và database unit tests. Coverage giữ node:test với c8/V8 trên Node 24. Chạy `npm run test:coverage`, `npm run test:coverage:integration`, rồi `npm run test:coverage:combined`. Reports nằm ở `coverage/audit3/{unit,integration,combined}/{server,database}/`: LCOV, JSON summary và manifest. Không ghi đè artifact cũ; đo lại bằng `node server/scripts/test-coverage.js unit coverage/<run-name>`, sau đó integration/combined cùng run-name.

Scope chính: toàn bộ `server/**/*.js`, trừ tests và measurement harness `server/scripts/test-coverage.js`; giữ repositories, security, transaction, bootstrap và scripts vận hành. Database JavaScript có báo cáo bổ sung, trừ database/tests. SQL migrations/schema được xác minh bằng tests, không giả làm JavaScript coverage. c8 `all` đưa file chưa load vào báo cáo với coverage 0; manifest đối chiếu chính xác tập nguồn. Không loại module quan trọng hoặc ignore nhánh chỉ để tăng tỷ lệ.

Unit gồm toàn bộ backend/auth/database `.test.js`; isolated integration gồm toàn bộ `.integration.js`. Hai tập thu raw V8 riêng. Combined hợp nhất execution bằng cùng c8, không cộng/average LCOV hoặc percentages. Integrity gates kiểm tra Git SHA, hash từng nguồn/test/helper/fixture/harness/lockfile, Node/provider version, checkout path, raw checksums, TAP totals không fail/skip/cancel, từng test process và standalone bootstrap process. Nguồn thay đổi trong lúc đo, artifact thiếu hoặc sai phải fail. Chưa hỗ trợ merge raw từ checkout paths khác.

CI upload unit/integration artifacts và chạy job coverage-integrity tạo combined. Không đặt numeric thresholds trong đợt này; baseline mới và floors cần phê duyệt riêng. Coverage không thay regression/security/concurrency assertions. Raw V8 có thông tin mã nguồn; artifacts giữ 7 ngày, không chứa dump DB hoặc credentials.

Mọi integration suite yêu cầu `FINDIT_ISOLATED_DATADIR` và xác minh datadir/port thực trước khi chạy test. Runner tạo credentials/port/datadir riêng, vô hiệu Cloudinary credentials và đặt cấu hình test cố định. Không tự đặt marker để chạy vào database khác. Các lệnh `test:*:integration` trực tiếp cũ sẽ từ chối khi không có runner identity; dùng các lệnh `*:isolated` ở trên.

Runner tự phát hiện các file `.integration.js` trong backend, auth và database; suite security luôn nằm trong regression. Chỉ cleanup database có tên sở hữu và thư mục tạm đã kiểm tra; shutdown/dọn datadir vẫn chạy khi suite thất bại. Không chạy `db:setup`, `db:migrate`, `images:cleanup` với cấu hình đang sử dụng để kiểm thử.

CI có job unit/coverage/audit và job MySQL 8.0 riêng trên Ubuntu 24.04 với Node 24. MySQL hệ thống của runner được dừng, tests chỉ dùng executable để tạo instance tạm. Không cần credentials/secrets sản xuất. Upload reports, manifest, TAP và raw V8 phục vụ integrity; không xuất dump DB/password/JWT.

## Giới hạn và tồn đọng

- Frontend chưa có: chưa nghiệm thu DOM/stored XSS ở giao diện. Payload HTML được giữ như dữ liệu chuỗi JSON; không tự strip/sanitize nội dung nghiệp vụ.
- Không kiểm thử Cloudinary network thật, antivirus, tải lớn hoặc chống DDoS hạ tầng.
- Matching vẫn tuần tự hóa ghi bằng advisory lock; invariant Claim vẫn cần service/row lock. Ghi SQL trực tiếp có thể bỏ qua quy trình.
- Không có idempotency key cho client retry sau COMMIT mất phản hồi; 500 có thể xuất hiện dù giao dịch đã commit.
- Đợt audit 2 đã bổ sung bốn API Admin Claim/dispute/activity-log và `/close`; `/status` legacy giữ nguyên. Resolve chỉ PENDING; CLOSED chưa ẩn nội dung. Xem [Admin API](ADMIN.md).

Tham khảo cấu hình thư viện: [Helmet](https://github.com/helmetjs/helmet#readme), [express-rate-limit](https://github.com/express-rate-limit/express-rate-limit#readme).

Health readiness dùng limiter riêng, probe chung tối đa một operation/process, TTL success 2s/failure 1s, deadline khởi đầu 1s (`HEALTH_PROBE_TIMEOUT_MS`). Xem README.md; xác nhận monitor, NAT/proxy và timeout trước rollout. Không miễn quota dựa trên forwarded headers hoặc user-agent. Không thêm liveness endpoint.
