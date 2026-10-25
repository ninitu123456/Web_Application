# FindIT — Authentication và User Foundation

Thực hiện theo Auth/User API trong `docs/api-contract.docx` và quy tắc nghiệp vụ tương ứng. Không có refresh token, logout, đổi mật khẩu hoặc endpoint quản trị trong giai đoạn này.

## Chạy và cấu hình

Từ terminal VS Code tại gốc repository:

```powershell
npm.cmd ci
```

Tạo JWT secret riêng trên máy:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Tự bổ sung kết quả vào `.env` hiện có bằng trình soạn thảo, không thay thế nội dung file:

```dotenv
JWT_SECRET=<secret-vua-tao-cuc-bo>
JWT_EXPIRES_IN=3600
```

Không dùng nguyên placeholder trên. Secret phải có ít nhất 32 byte UTF-8; không gửi secret, password hoặc token qua chat/Git. `JWT_EXPIRES_IN` là số nguyên dương tính bằng giây, không dùng `1h`. Backend từ chối startup khi cấu hình JWT sai. Không cần thay đổi thông tin DB đã có.

```powershell
npm.cmd start
# Hoặc:
npm.cmd run dev
```

Mặc định API ở `http://127.0.0.1:3001`. Nếu một server cũ đang chạy, dừng bằng Ctrl+C trong đúng terminal của nó rồi khởi động lại để nạp code/cấu hình mới.

## API và response

| Method | Endpoint | Body | Thành công |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | fullName, email, password | 201, public user |
| POST | `/api/auth/login` | email, password | 200, token và public user |
| GET | `/api/users/me` | Không có | 200, public user |
| PATCH | `/api/users/me` | fullName | 200, public user đã cập nhật |

Hai endpoint `/api/users/me` yêu cầu header `Authorization: Bearer <token>`. Mọi response Auth/User đều có `Cache-Control: no-store`.

Public user chỉ có `id` dạng số nguyên an toàn, `fullName`, `email`, `role`. Không trả password hash, student_code, contact_info, avatar_url, trạng thái nội bộ hoặc timestamps.

Đăng ký:

```json
{"fullName":"Nguyen Van A","email":"user@example.test","password":"example-password-123"}
```

Thành công — HTTP 201:

```json
{"success":true,"message":"Đăng ký thành công","data":{"id":1,"fullName":"Nguyen Van A","email":"user@example.test","role":"USER"}}
```

Đăng nhập thành công — HTTP 200:

```json
{"success":true,"message":"Đăng nhập thành công","data":{"token":"<JWT>","user":{"id":1,"fullName":"Nguyen Van A","email":"user@example.test","role":"USER"}}}
```

GET hồ sơ — HTTP 200:

```json
{"success":true,"data":{"id":1,"fullName":"Nguyen Van A","email":"user@example.test","role":"USER"}}
```

PATCH với body `{"fullName":"Nguyen Van B"}` — HTTP 200:

```json
{"success":true,"message":"Cập nhật hồ sơ thành công","data":{"id":1,"fullName":"Nguyen Van B","email":"user@example.test","role":"USER"}}
```

Các ID và token trên là minh họa, không phải credentials thật.

## Quy tắc validation và bảo mật

- Body phải là object JSON với đúng các trường quy định, không nhận trường lạ. Không được gửi role, roleId, accountStatus, userId, email mới hoặc password mới trong PATCH hồ sơ.
- `fullName` được trim, dài 1–150 ký tự. `email` trim, chuyển chữ thường, đúng định dạng cơ bản và tối đa 255 ký tự; không giới hạn domain UIT.
- Mật khẩu đăng ký tối thiểu 8 ký tự, tối đa 72 byte UTF-8; giữ nguyên khoảng trắng và nội dung. Login chỉ yêu cầu không rỗng và tối đa 72 byte để tương thích tài khoản seed cũ. Không yêu cầu chữ hoa/ký tự đặc biệt.
- Đăng ký luôn tìm vai trò USER bằng tên, không hardcode role ID. Mật khẩu hash bcrypt cost 12. UNIQUE email bảo vệ cả tình huống hai đăng ký đồng thời.
- JWT dùng HS256 cố định; payload chỉ gồm sub/iat/exp/iss/aud. `sub` là chuỗi user ID; issuer `findit-api`, audience `findit-client`. Middleware kiểm tra chữ ký, thuật toán, thời hạn, issuer/audience và định dạng subject.
- Mỗi request bảo vệ đọc lại user, trạng thái và vai trò từ MySQL. Role trong DB có hiệu lực ngay; JWT không quyết định quyền bằng dữ liệu role từ client.
- Tài khoản không ACTIVE không đăng nhập được (401); token đã cấp cũng bị từ chối ngay (403). Token của tài khoản không tồn tại nhận 401.
- `authorizeRoles('ADMIN')` đã sẵn sàng để dùng cho module sau. Endpoint kiểm tra ADMIN chỉ tồn tại trong test app, không có API quản trị trong production.
- PATCH chỉ dùng ID từ middleware xác thực, cập nhật tên và updated_at theo UTC. Không nhận ID tài khoản đích từ client.
- Repositories dùng SQL có placeholders, không nối giá trị người dùng vào SQL. Lỗi DB không bị ngụy trang thành sai mật khẩu/token; error handler hiện có che thông tin SQL và stack trace.
- Không có cơ chế thu hồi từng JWT/logout trong đợt này. Token hết hạn sau thời lượng cấu hình; khóa tài khoản chặn truy cập ngay.

| HTTP | Trường hợp |
| --- | --- |
| 400 | Body/field/email/password/fullName không hợp lệ hoặc cố gửi trường quyền hạn |
| 401 | Login không hợp lệ; thiếu/sai/hết hạn token hoặc tài khoản không tồn tại |
| 403 | User đã xác thực nhưng tài khoản không ACTIVE hoặc không đủ role |
| 404 | API không tồn tại hoặc tài khoản bị mất trong lúc cập nhật hồ sơ |
| 409 | Email đăng ký đã tồn tại, kể cả đăng ký đồng thời |
| 500 | Lỗi bất ngờ/DB; response chỉ có thông điệp chung |

## Kiểm tra bằng Postman và PowerShell

Để kiểm thử **không ghi dữ liệu thật**, dùng `npm.cmd run test:auth:integration`. Nó tự tạo database test và HTTP server cổng tạm rồi dọn sau khi chạy. Không đăng ký tài khoản test vào `findit_db` trong các bài kiểm thử tự động.

Các ví dụ thủ công sau gọi vào database của server tại URL được chỉ định: POST đăng ký và PATCH sẽ ghi dữ liệu. Chỉ thực hiện khi bạn muốn tạo/cập nhật tài khoản tại server đó.

Trong Postman:

1. Tạo POST `/api/auth/register`, chọn Body → raw → JSON, dùng body đăng ký minh họa trên.
2. Tạo POST `/api/auth/login` với email/password vừa dùng.
3. Với GET/PATCH `/api/users/me`, chọn Authorization → Bearer Token rồi dán token vừa nhận vào máy cục bộ.
4. Xem Status và JSON response; không lưu token hoặc password thật vào collection được commit.

Ví dụ PowerShell đọc mật khẩu từ bàn phím, không ghi literal vào lịch sử lệnh:

```powershell
$base = 'http://127.0.0.1:3001'
$email = Read-Host 'Email'
$securePassword = Read-Host 'Password' -AsSecureString
$password = [System.Net.NetworkCredential]::new('', $securePassword).Password
$loginBody = @{ email = $email; password = $password } | ConvertTo-Json
$login = Invoke-RestMethod "$base/api/auth/login" -Method Post -ContentType 'application/json' -Body $loginBody
$headers = @{ Authorization = "Bearer $($login.data.token)" }
Invoke-RestMethod "$base/api/users/me" -Headers $headers
# Chi cap nhat neu ban muon thay doi ten tai khoan nay:
$profileBody = @{ fullName = 'Nguyen Van B' } | ConvertTo-Json
Invoke-RestMethod "$base/api/users/me" -Method Patch -Headers $headers -ContentType 'application/json' -Body $profileBody
Remove-Variable password,loginBody,login,headers -ErrorAction SilentlyContinue
```

Với curl, có thể kiểm tra endpoint được bảo vệ khi chưa có token mà không ghi dữ liệu:

```powershell
curl.exe -i http://127.0.0.1:3001/api/users/me
```

Kết quả mong đợi: HTTP 401. Trình duyệt nhập URL thông thường không gửi Bearer token; dùng Postman hoặc terminal để thử API được bảo vệ.

## Cấu trúc bổ sung và kiểm thử

```text
server/
├── controllers/     auth.controller.js, user.controller.js
├── services/        auth.service.js, user.service.js
├── repositories/    user.repository.js
├── routes/          auth.routes.js, user.routes.js
├── middleware/      authenticate.js, authorize-roles.js
├── validation/      auth.validation.js
├── utils/           jwt.js, user-dto.js
└── tests/auth/      auth.test.js, auth.integration.js, helpers.js
```

Điểm lắp ráp: app factory, router chung và server hiện có. Cấu hình JWT được thêm vào config/env.js. Không tạo pool mới cho từng module; Auth/User dùng chung pool của runtime. Health-only tests vẫn inject dependencies như trước.

Dependency mới: `jsonwebtoken`; dùng lại bcryptjs và mysql2/promise. Scripts mới:

```powershell
npm.cmd run test:auth
npm.cmd run test:auth:integration
```

Các tests sinh JWT secrets ngẫu nhiên trong bộ nhớ. Auth integration chạy migrations nguyên bản trong database tên `findit_test_<24 hex>`, không sửa schema. Mọi register/update/đổi role/khóa user nằm trong database đó; cleanup chỉ xóa database đúng tên do lần chạy sở hữu. Test còn so sánh digest toàn bộ dữ liệu nghiệp vụ `findit_db` trước/sau, không in dữ liệu hoặc digest nhạy cảm ra log.

Chạy hồi quy bằng `test:backend`, `test:backend:integration`, `db:test`, `db:test:integration` và `db:verify`. Kết quả thực tế nằm trong [AUTH-TEST-RESULTS.md](AUTH-TEST-RESULTS.md).
