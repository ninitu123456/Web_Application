# Kết quả Authentication/User — 2026-10-25

Đã thực thi code và kiểm thử trên Node.js 24.21.0, Express 5.3.0, MySQL 8.0.46. Dependency mới cài thực tế: jsonwebtoken 9.0.3; tái sử dụng bcryptjs 3.0.3, mysql2 3.24.6 và dotenv 17.4.2.

## Kiểm thử cuối cùng

| Lệnh | Kết quả |
| --- | --- |
| `npm.cmd run test:auth` | PASS — 7/7 |
| `npm.cmd run test:auth:integration` | PASS — 9 subtests và test tổng, 10/10 theo Node test runner |
| `npm.cmd run test:backend` | PASS — 8/8 |
| `npm.cmd run test:backend:integration` | PASS — 4/4 |
| `npm.cmd run db:test` | PASS — 4/4 |
| `npm.cmd run db:test:integration` | PASS — 7/7 |
| `npm.cmd run db:verify` | PASS — schema, migrations, seed và hashes giữ nguyên |
| `npm.cmd start` | PASS — xác minh MySQL rồi listen cổng 3001 |

Unit/HTTP tests xác minh validation, chống trường lạ/nâng quyền, bcrypt cost 12, lỗi race email, thiếu USER role, JWT lifetime/claims/signature/algorithm/expiry, DTO không lộ dữ liệu riêng tư, BIGINT an toàn, login lỗi dùng thông điệp chung, lỗi DB không trở thành 401 và Cache-Control no-store.

Auth integration dùng database test mới, vai trò USER/ADMIN có ID khác mặc định để kiểm tra lookup theo tên. Đã thực thi register 201, duplicate 409, đăng ký đồng thời chỉ tạo một account, invalid input 400, login 200/sai password/email lạ 401, thiếu/sai/hết hạn JWT 401, GET/PATCH me 200, không sửa được user khác hoặc vai trò, USER bị chặn ADMIN 403, đổi role trong DB có hiệu lực trên token cũ, SUSPENDED bị chặn ngay và ACTIVE phục hồi truy cập.

Đã đọc hash trong MySQL test và xác minh với bcrypt.compare. Response chỉ có public fields. Digest toàn bộ 11 bảng nghiệp vụ trong `findit_db` trước/sau Auth integration giống nhau. Database test được dọn theo kiểm tra tên sở hữu.

## HTTP thật tại cổng 3001 trên database chính

Sau khi người dùng bổ sung JWT secret cục bộ, đã xác minh cấu hình hợp lệ mà không in giá trị, khởi động server và gửi các request không ghi dữ liệu:

| Request | Kết quả |
| --- | --- |
| GET `/api/health` | 200, `data: { status: "ok", database: "up" }` |
| GET `/api/users/me`, không token | 401, `Chưa xác thực hoặc token không hợp lệ` |
| POST `/api/auth/login`, tài khoản USER seed | 200, token hợp lệ và DTO role USER |
| GET `/api/users/me`, token USER | 200, đúng 4 trường id/fullName/email/role |
| POST `/api/auth/login`, tài khoản ADMIN seed | 200, token hợp lệ và DTO role ADMIN |
| GET `/api/users/me`, token ADMIN | 200, đúng 4 trường công khai |
| GET `/api/not-found` | 404, `Không tìm thấy API` |

Không in token/password/JWT secret vào log hoặc báo cáo. Không chạy register/PATCH trên `findit_db` trong kiểm chứng này; các API ghi dữ liệu đã được kiểm chứng qua HTTP thật trên MySQL test riêng.

## Phạm vi thay đổi và bàn giao

- Thêm Auth/User controllers, services, repository, routes, validation, middleware authenticate/authorizeRoles, JWT và DTO utilities, tests cùng tài liệu Auth.
- Cập nhật app/router/server/config, test backend integration để dùng secret test riêng, package/lockfile và `.env.example`.
- Người dùng tự bổ sung `.env` cục bộ; agent không ghi đè hoặc sửa file đó.
- Không sửa RULES.md, các tài liệu nghiệp vụ, schema, migrations hoặc seeds; không commit/push.
- Không có lỗi triển khai còn mở trong phạm vi đã kiểm thử. Logout/refresh token và các module nghiệp vụ tiếp theo không thuộc đợt này.

Các file cần commit: thay đổi `package.json`, `package-lock.json`, `.env.example` và các file mới/sửa trong `server/`. Không commit `.env`, node_modules, token hoặc mật khẩu thật.

Commit message đề xuất: `feat(auth): add JWT authentication and user profile foundation`.
