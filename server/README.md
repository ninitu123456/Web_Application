# FindIt — Backend

Frontend hiện có trong [client/](../client/README.md). API lookup công khai và bài của tài khoản hiện tại: [FRONTEND-API.md](FRONTEND-API.md).

Backend JavaScript ES Modules, Express 5 và MySQL2 promise pool. Dùng chung `package.json`, dependencies và `.env` tại gốc với bộ database đã có. Đã bổ sung Authentication JWT và hồ sơ người dùng; xem [AUTH.md](AUTH.md).

Item/Search và các sửa lỗi ownership, transaction ảnh, audit và cleanup được mô tả trong [ITEMS.md](ITEMS.md). Chạy toàn bộ integration trên MySQL tạm bằng `npm.cmd run test:integration:isolated`.

Thuật toán và API Matching: [MATCHING.md](MATCHING.md).

Notification & Report: xem [hợp đồng API](../docs/api-contract.md) và [quy tắc nghiệp vụ](../docs/business-rules.md).

## Chạy trong VS Code

Backend yêu cầu Node.js >= 20 (khuyến nghị Node.js 24 cho toàn bộ dự án) và MySQL `findit_db` đã được khởi tạo. Nếu cài từ đầu, cấu hình `.env` theo [README gốc](../README.md#chạy-cục-bộ), chạy `npm.cmd ci` rồi `npm.cmd run db:setup` trước khi bật server. Trong terminal tại gốc repository:

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

Các biến HTTP sau đều có mặc định, không cần ghi lại `.env` để khởi động:

| Biến | Mặc định |
| --- | --- |
| `HOST` | `127.0.0.1` |
| `PORT` | `3001` |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:3000` |

`PORT` phải là số nguyên 1–65535. `CORS_ORIGINS` là danh sách origin HTTP(S) phân cách bằng dấu phẩy, không chứa path, credentials hoặc wildcard. Nếu dùng frontend tại `127.0.0.1` thay vì `localhost`, cần thêm đúng origin đó. Biến môi trường tiến trình ưu tiên hơn `.env`.

Server yêu cầu thêm `JWT_SECRET` riêng tối thiểu 32 byte và `JWT_EXPIRES_IN` là số nguyên giây (mặc định 3600). Thiếu secret thì startup bị từ chối trước khi mở HTTP. Không ghi secret mặc định vào source hoặc thay thế `.env`; xem cách tạo cục bộ trong `AUTH.md`. Script `backend:check-db` và các lệnh `db:*` không yêu cầu JWT secret.

CORS cho phép các origin cấu hình và preflight với Content-Type/Authorization; không bật cookie credentials. Origin ngoài danh sách không nhận header cho phép CORS. CORS là cơ chế trình duyệt, không thay thế xác thực hoặc phân quyền; curl/Postman vẫn gọi được endpoint công khai.

## Cấu trúc và trách nhiệm

| Thành phần | Trách nhiệm |
| --- | --- |
| `app.js`, `server.js` | Lắp ráp ứng dụng, kiểm tra DB, listen và shutdown |
| `config/` | Cấu hình môi trường, pool MySQL, Cloudinary và snapshot đọc |
| `routes/`, `controllers/` | Khai báo endpoint, nhận request và trả response |
| `services/` | Quy tắc nghiệp vụ, transaction và phối hợp các thao tác |
| `repositories/` | Truy vấn và khóa dữ liệu MySQL |
| `middleware/`, `validation/`, `utils/` | Xác thực, phân quyền, bảo mật, validation, DTO và xử lý lỗi |
| `scripts/` | Kiểm tra DB, cleanup ảnh và đo coverage |
| `tests/` | Unit, HTTP, integration, fixtures và helpers |

Luồng xử lý: route → controller → service → repository → MySQL. Các module hiện có gồm Auth/User, Item, Matching, Claim, Notification, Report, Admin và Health.

Pool tối đa 10 connections, hàng đợi tối đa 20. Acquisition, kết nối và mỗi truy vấn có timeout 5 giây riêng; tổng thời gian request có thể gồm nhiều giai đoạn này. Connection đến muộn sau acquisition timeout được release. Mỗi lần lấy connection đều thiết lập UTC và strict SQL mode trước khi dùng, sau đó release trong `finally`. Connection có lỗi fatal/query timeout bị destroy để tránh tái sử dụng khi lệnh vẫn còn đang chạy. BIGINT được giữ dưới dạng chuỗi như bộ database hiện có.

Server xác minh kết nối và đúng database trước khi listen; lỗi DB hoặc config khiến tiến trình thoát khác 0. Không tự chạy migrations hoặc seed khi bật HTTP. Khi nhận SIGINT/SIGTERM, server ngừng nhận request, đợi HTTP và cleanup ảnh đóng rồi đóng pool; shutdown có giới hạn 10 giây. Server không tự thay đổi schema. Khi Cloudinary được cấu hình, worker khôi phục các tác vụ ảnh còn chờ từ journal khi khởi động và mỗi 60 giây; xem `ITEMS.md`.

## Health check và lỗi HTTP

`GET /api/health` là readiness phụ thuộc DB. Probe chạy `SELECT 1 AS ok, DATABASE() AS database_name` qua pool nghiệp vụ. Mỗi process chỉ cho một operation health tồn tại, kể cả acquisition đã hết deadline nhưng driver chưa settle. Request đồng thời dùng chung probe; cache nội bộ success 2 giây và failure 1 giây. HTTP vẫn `Cache-Control: no-store`.

Limiter health riêng mặc định 60 request/phút/IP (`RATE_LIMIT_HEALTH_MAX`), tính cả GET/HEAD và biến thể route được Express chấp nhận; OPTIONS không probe. Quá quota trả 429 với JSON lỗi chuẩn, Retry-After và RateLimit headers trước khi dùng DB. Health không tiêu quota API nghiệp vụ; `trust proxy=false` giữ nguyên.

`HEALTH_PROBE_TIMEOUT_MS=1000` là deadline tổng khởi đầu cho acquire/setup/SELECT; phải kiểm chứng lại theo deployment. Acquisition tới muộn được release mà không chạy SQL; command quá hạn làm destroy session. Không cập nhật cache thành công muộn hoặc mở acquisition mới khi operation cũ chưa settle. Startup yêu cầu kiểm tra mới. Deadline của transaction được mô tả trong [SECURITY.md](SECURITY.md). Chỉ khi probe/cache thành công và database là `findit_db` mới trả HTTP **200**:

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

Sau TTL lỗi 1 giây, request sau thử lại nếu operation cũ đã settle. Nếu driver cũ còn pending, tiếp tục 503 mà không thêm acquisition. Cache success có thể trì hoãn phát hiện lỗi tối đa 2 giây. Health dùng `Cache-Control: no-store`. Probe xác minh kết nối và database được chọn; việc kiểm tra toàn bộ schema/seed vẫn dùng `npm.cmd run db:verify`.

Route không tồn tại trả **404** với `success: false` và message `Không tìm thấy API`. JSON sai trả **400**, body JSON quá 100 KB trả **413**, lỗi không dự kiến trả **500** với message `Lỗi máy chủ nội bộ`. HTTP response không có stack trace, SQL hoặc cấu hình kết nối. Logger chỉ ghi tên thao tác và mã lỗi, không serialize driver error.

## Kiểm thử

```powershell
npm.cmd test
npm.cmd run test:integration:isolated
# Hoặc toàn bộ regression backend/database:
npm.cmd run test:regression
```

- `npm.cmd test`: unit/HTTP tests backend, Auth và database; kiểm tra validation, phân quyền, quyền riêng tư, transaction và xử lý lỗi.
- `test:integration:isolated`: toàn bộ integration backend/Auth/database trên MySQL instance tạm, gồm các luồng nghiệp vụ và concurrency.
- Runner xác minh datadir/port, tạo dữ liệu riêng và cleanup tài nguyên do nó sở hữu. Cloudinary được giả lập; không dùng database hoặc cloud của môi trường đang chạy.
- `npm.cmd run db:verify` là lệnh kiểm tra schema/seed của database đã cấu hình, không phải một bộ test cô lập.
- Cấu hình MySQL executable và cách chạy riêng database tests: [database/README.md](../database/README.md). Frontend và browser tests: [client/README.md](../client/README.md).

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

Hướng dẫn theo module: [Auth/User](AUTH.md), [Item và ảnh](ITEMS.md), [Matching](MATCHING.md), [Claim](CLAIMS.md), [Admin](ADMIN.md) và [API hỗ trợ frontend](FRONTEND-API.md). Notification/Report được mô tả trong [hợp đồng API](../docs/api-contract.md).

## Bảo mật và kiểm thử tự động

Đã bổ sung Helmet, rate limiting, giới hạn multipart và bảo vệ session khi BEGIN/COMMIT mất phản hồi. Mọi integration suite yêu cầu runner MySQL cô lập. Xem [SECURITY.md](SECURITY.md) để cấu hình, lệnh chạy, giới hạn triển khai và CI.

## Phân trang Claim và Matching

Claim mine, Claim theo Item và Match theo Item phân trang mặc định page=1/limit=10, max=100, offset tối đa 100000. `data` vẫn là array, có top-level `pagination`. Client không gửi params nhận trang đầu; client cần toàn bộ dữ liệu phải duyệt các trang. Xem CLAIMS.md, MATCHING.md và SECURITY.md. Không đổi batch mutation hoặc Matching algorithm.
