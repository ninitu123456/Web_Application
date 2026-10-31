# FindIT — Express backend foundation

Backend JavaScript ES Modules, Express 5 và MySQL2 promise pool. Dùng chung `package.json`, dependencies và `.env` tại gốc với bộ database đã có. Đã bổ sung Authentication JWT và hồ sơ người dùng; xem [AUTH.md](AUTH.md).

Item/Search và các sửa lỗi ownership, transaction ảnh, audit và cleanup được mô tả trong [ITEMS.md](ITEMS.md). Chạy toàn bộ integration trên MySQL tạm bằng `npm.cmd run test:integration:isolated`.

Matching Engine (Phase 3): [MATCHING.md](MATCHING.md). Verification: [MATCHING-TEST-RESULTS.md](MATCHING-TEST-RESULTS.md).

## Chạy trong VS Code

Yêu cầu Node.js >= 20 và MySQL `findit_db` đang hoạt động. Trong terminal tại gốc repository:

```powershell
npm.cmd ci
npm.cmd start
```

Hoặc chạy chế độ tự khởi động lại khi sửa code:

```powershell
npm.cmd run dev
```

Mặc định server tại `http://127.0.0.1:3001`. Mở terminal thứ hai:

```powershell
Invoke-RestMethod http://127.0.0.1:3001/api/health
curl.exe -i http://127.0.0.1:3001/api/not-found
npm.cmd run backend:check-db
```

Dừng server bằng Ctrl+C trong terminal chạy server. Nếu cổng đã có tiến trình sử dụng, server báo `EADDRINUSE` và thoát; không tự chọn cổng khác hoặc dừng tiến trình đang có.

## Cấu hình

Giữ nguyên `.env` hiện có. Backend tái sử dụng `configFromEnv()` của bộ database để đọc `.env` tại gốc và validate `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`. Không cần biến `SEED_*` để chạy HTTP server. `DB_NAME` phải là `findit_db`.

Các biến HTTP mới đều có mặc định, không cần ghi lại `.env` để khởi động:

| Biến | Mặc định |
| --- | --- |
| `HOST` | `127.0.0.1` |
| `PORT` | `3001` |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:3000` |

`PORT` phải là số nguyên 1–65535. `CORS_ORIGINS` là danh sách origin HTTP(S) phân cách bằng dấu phẩy, không chứa path, credentials hoặc wildcard. Nếu dùng frontend tại `127.0.0.1` thay vì `localhost`, cần thêm đúng origin đó. Biến môi trường tiến trình ưu tiên hơn `.env`.

Server yêu cầu thêm `JWT_SECRET` riêng tối thiểu 32 byte và `JWT_EXPIRES_IN` là số nguyên giây (mặc định 3600). Thiếu secret thì startup bị từ chối trước khi mở HTTP. Không ghi secret mặc định vào source hoặc thay thế `.env`; xem cách tạo cục bộ trong `AUTH.md`. Script `backend:check-db` và các lệnh `db:*` không yêu cầu JWT secret.

CORS cho phép các origin cấu hình và preflight với Content-Type/Authorization; không bật cookie credentials. Origin ngoài danh sách không nhận header cho phép CORS. CORS là cơ chế trình duyệt, không thay thế xác thực hoặc phân quyền; curl/Postman vẫn gọi được endpoint công khai.

## Cấu trúc và trách nhiệm

```text
server/
├── app.js                         # Cấu hình Express, không tự listen
├── server.js                      # Kiểm tra DB, listen, shutdown
├── config/
│   ├── env.js                     # Tái sử dụng config DB, validate HTTP
│   └── db.js                      # Pool, timeout, UTC/strict mode, release
├── routes/
│   ├── index.js                   # Router chung /api
│   └── health.routes.js
├── controllers/health.controller.js
├── services/health.service.js
├── repositories/health.repository.js
├── middleware/
│   ├── not-found.js
│   └── error-handler.js
├── utils/
│   ├── http-error.js
│   └── logger.js
├── scripts/check-db.js            # Chỉ đọc vai trò và danh mục mẫu
├── tests/
│   ├── helpers.js
│   ├── http.test.js
│   └── mysql.integration.js
├── README.md
└── TEST-RESULTS.md
```

Luồng hiện tại: `/api/health` → controller → service → repository → MySQL pool. Khi bổ sung module sau này, SQL đặt trong repository, quy tắc nghiệp vụ trong service và HTTP trong controller. Không có base class hoặc các module nghiệp vụ giả.

Pool tối đa 10 connections, hàng đợi tối đa 20. Acquisition, kết nối và mỗi truy vấn có timeout 5 giây riêng; tổng thời gian request có thể gồm nhiều giai đoạn này. Connection đến muộn sau acquisition timeout được release. Mỗi lần lấy connection đều thiết lập UTC và strict SQL mode trước khi dùng, sau đó release trong `finally`. Connection có lỗi fatal/query timeout bị destroy để tránh tái sử dụng khi lệnh vẫn còn đang chạy. BIGINT được giữ dưới dạng chuỗi như bộ database hiện có.

Server xác minh kết nối và đúng database trước khi listen; lỗi DB hoặc config khiến tiến trình thoát khác 0. Không tự chạy migrations hoặc seed khi bật HTTP. Khi nhận SIGINT/SIGTERM, server ngừng nhận request, đợi HTTP và cleanup ảnh đóng rồi đóng pool; shutdown có giới hạn 10 giây. Server không tự thay đổi schema. Khi Cloudinary được cấu hình, worker khôi phục các tác vụ ảnh còn chờ từ journal khi khởi động và mỗi 60 giây; xem `ITEMS.md`.

## Health check và lỗi HTTP

Mỗi request `GET /api/health` thực hiện `SELECT 1 AS ok, DATABASE() AS database_name`, không dùng kết quả cache. Chỉ khi probe thành công và database là `findit_db` mới trả HTTP **200**:

```json
{
  "success": true,
  "message": "Hệ thống hoạt động bình thường",
  "data": { "status": "ok", "database": "up" }
}
```

Lỗi database sau khi server đã khởi động trả HTTP **503**:

```json
{
  "success": false,
  "message": "Cơ sở dữ liệu tạm thời không khả dụng"
}
```

Request sau sẽ thử truy vấn lại; không giữ cố định trạng thái lỗi. Health dùng `Cache-Control: no-store`. Probe xác minh kết nối và database được chọn; việc kiểm tra toàn bộ schema/seed vẫn dùng `npm.cmd run db:verify`.

Route không tồn tại trả **404** với `success: false` và message `Không tìm thấy API`. JSON sai trả **400**, body JSON quá 100 KB trả **413**, lỗi không dự kiến trả **500** với message `Lỗi máy chủ nội bộ`. HTTP response không có stack trace, SQL hoặc cấu hình kết nối. Logger chỉ ghi tên thao tác và mã lỗi, không serialize driver error.

## Kiểm thử

```powershell
npm.cmd run test:backend
npm.cmd run test:backend:integration
npm.cmd run db:test
npm.cmd run db:verify
npm.cmd run db:test:integration
```

- Backend tests: HTTP thật trên cổng tạm, dependency giả để kiểm tra 200/503/phục hồi, 404, lỗi 500, JSON 400/413, CORS và che dữ liệu nhạy cảm.
- Backend integration: pool MySQL thật, session UTC/strict, SELECT dữ liệu mẫu, HTTP health; đóng pool riêng của test để kiểm tra 503; kiểm tra startup/shutdown, cổng HTTP bị chiếm và DB không kết nối được.
- Backend tests không dừng MySQL hoặc thay đổi `.env`, schema hay dữ liệu. Cổng DB lỗi chỉ được override trong môi trường tiến trình con.
- Database integration hiện có tạo/xóa database test riêng do nó sở hữu; không reset hoặc xóa dữ liệu `findit_db`.

Các npm scripts mới: `start`, `dev`, `test:backend`, `test:backend:integration`, `backend:check-db`. Dependencies mới: `express`, `cors`; không cài lại thư viện DB hoặc thêm ORM.

## Xử lý lỗi thường gặp

| Mã/tình huống | Kiểm tra |
| --- | --- |
| `INVALID_CONFIG` | Biến DB bắt buộc, PORT và định dạng CORS_ORIGINS |
| `ECONNREFUSED` | Dịch vụ MySQL, DB_HOST, DB_PORT |
| `ER_ACCESS_DENIED_ERROR` | Credentials và quyền truy cập của tài khoản MySQL |
| `ER_BAD_DB_ERROR` | `findit_db` đã tồn tại và tài khoản được truy cập |
| `DB_ACQUIRE_TIMEOUT` | Pool đang bận hoặc mất kết nối; kiểm tra MySQL và tải truy vấn |
| `EADDRINUSE` | Cổng HTTP đã được dùng; dừng đúng server của mình hoặc cấu hình PORT khác |
| Trình duyệt bị CORS | Origin frontend phải khớp cả protocol, hostname và port |

Auth và User Foundation hiện có 4 API; cấu trúc bổ sung và hướng dẫn nằm trong `AUTH.md`. Claim Workflow (Phase 4) có 6 API; quyền truy cập, state machine và transaction được mô tả trong [CLAIMS.md](CLAIMS.md). Các API quản trị riêng chưa được triển khai. Kết quả foundation nằm trong `TEST-RESULTS.md`, kết quả Auth/User nằm trong `AUTH-TEST-RESULTS.md`.
