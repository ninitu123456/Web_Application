# Kết quả kiểm chứng backend — 2026-10-25

Đã thực thi trên Windows với Node.js 24.21.0 và MySQL Community Server 8.0.46. Dependencies mới được cài thực tế: Express 5.3.0, cors 2.8.6. Tái sử dụng mysql2 3.24.6, dotenv 17.4.2 và cấu hình database đã có.

## Khởi động và HTTP thực tế

Đã chạy `npm.cmd start`, nhận log:

```text
MySQL connection verified: findit_db
FindIT backend listening at http://127.0.0.1:3001
```

Đã gửi HTTP request thực tế tới server trên cổng 3001:

`GET /api/health` — **HTTP 200**:

```json
{"success":true,"message":"Hệ thống hoạt động bình thường","data":{"status":"ok","database":"up"}}
```

`GET /api/not-found` — **HTTP 404**:

```json
{"success":false,"message":"Không tìm thấy API"}
```

Trong integration test, health qua HTTP thật sau khi đóng pool riêng của test trả **HTTP 503**:

```json
{"success":false,"message":"Cơ sở dữ liệu tạm thời không khả dụng"}
```

Không dừng MySQL chính để giả lập lỗi. Tiến trình startup với cổng DB không có listener thoát mã 1, không mở HTTP và chỉ log mã lỗi an toàn.

## Kết quả cuối cùng

| Lệnh | Kết quả |
| --- | --- |
| `npm.cmd install express@5 cors --no-audit --no-fund --fetch-retries=0 --fetch-timeout=20000` | PASS — cài dependencies và cập nhật lockfile |
| `npm.cmd run test:backend` | PASS — 8/8 |
| `npm.cmd run test:backend:integration` | PASS — 4/4 |
| `npm.cmd run backend:check-db` | PASS — health up, đọc được USER/ADMIN và 4 danh mục mẫu |
| `npm.cmd run db:test` | PASS — 4/4 |
| `npm.cmd run db:verify` | PASS — schema, migration history, seed và hashes |
| `npm.cmd run db:test:integration` | PASS — 7/7 theo Node test runner |
| `npm.cmd start` + HTTP requests tới cổng 3001 | PASS — health 200, route lạ 404 |
| `git diff --check` | PASS |

Backend tests xác minh probe lại từng request và phục hồi 503 → 200, không cache, không có x-powered-by, JSON lỗi 400, body lớn 413, lỗi async 500 không lộ SQL/secrets, CORS/preflight, database sai không báo thành công và logger không serialize driver error.

Integration xác minh pool thật, UTC/strict mode, dữ liệu mẫu, đóng pool trả 503, khởi động/shutdown, cổng HTTP bị chiếm không ảnh hưởng listener có sẵn và startup DB lỗi thoát đúng mã.

## Phạm vi thay đổi

- Thêm code foundation, scripts, tests và tài liệu trong `server/`.
- Cập nhật `package.json`, `package-lock.json`, `.env.example`.
- Không sửa `.env`, các file trong `database/`, tài liệu nghiệp vụ hoặc dữ liệu hiện hữu. Không commit/push.
- Không có lỗi triển khai còn mở trong phạm vi đã kiểm thử. Các module nghiệp vụ thuộc giai đoạn sau.

Commit message đề xuất: `feat(server): add Express foundation and MySQL health integration`.
