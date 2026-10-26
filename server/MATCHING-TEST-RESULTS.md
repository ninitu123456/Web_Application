# Phase 3 — READY — 2026-10-26

Đã chạy thực tế trên Windows, Node.js 24.21.0, MySQL Community Server 8.0.46.
Không thêm dependency, sửa schema/migrations hoặc dùng database production.

## Kết quả cuối cùng

| Lệnh / suite | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| `npm.cmd test` — backend, Item, Matching, ảnh và transaction | 42 | 0 | 0 |
| `npm.cmd test` — Auth | 7 | 0 | 0 |
| `npm.cmd test` — Database unit | 4 | 0 | 0 |
| `npm.cmd run test:integration:isolated` — toàn bộ integration | 56 | 0 | 0 |

Unit/regression tổng 53. Backend có 18 tests mới cho Matching/dataset/transaction.
Integration gồm Backend 4, Database 7, Auth 10, Item 17 và Matching 18.
Số integration tính cả test cha của bốn nhóm Database/Auth/Item/Matching;
riêng Matching có 17 subtests. Hai commands hoàn tất exit code 0.

MySQL tạm đã xác minh datadir/port, áp dụng 12 migrations và kiểm tra seed/schema.
Matching dùng database `findit_test_<random>` riêng. Instance tạm đã shutdown và
data directory được runner dọn sau khi chạy. Cloudinary credentials được để rỗng
trong runner; regression ảnh dùng storage giả, không gọi cloud thật.

## Bằng chứng chức năng

- HTTP/JWT thật: create LOST trước FOUND, save score 100/explanation, GET hai chiều
  trả đúng counterpart ID. FOUND trước LOST và category khác vẫn ghép được.
- Dataset độc lập có điểm kỳ vọng 100/70/80/90/82/50/40/0; kiểm tra từng tiêu chí,
  biên 30 ngày, ngưỡng làm tròn 49.99/50/50.01, Unicode tiếng Việt, input rỗng/sai.
- Upsert không trùng; giữ ID/created_at và CONFIRMED/REJECTED. Giảm dưới 50 cập
  nhật score/reasons, giữ bản ghi nhưng không trả GET; tăng lại vẫn cùng bản ghi.
- CLOSED/RETURNED bị loại ở cả phía nguồn/candidate; không xóa lịch sử.
- 105 candidates mới cùng candidates có sẵn đi qua nhiều batch, không cắt kết quả.
- USER không phải chủ bài và ADMIN được xem; JWT lỗi/ID sai/Item thiếu/tài khoản
  SUSPENDED bị xử lý đúng; response chỉ có matchId/itemId/score/reasons; GET không
  làm thay đổi bản ghi Match.
- Barrier-controlled concurrency: create/create, update/update hai phía,
  update/close, close/update cùng Item; kiểm tra điểm cuối theo dữ liệu mới nhất,
  loại Item đóng và giải phóng advisory lock.
- Fault injection trên transaction MySQL thật: lỗi Matching đầu/giữa batch rollback
  Item và các Match đã ghi; lỗi sync close rollback cả status và admin audit.
- Giữ advisory lock bằng connection thứ hai gây timeout thực tế sau 2 giây và
  trả lỗi không ghi dữ liệu. Deadlock/lock-wait được inject bằng mã lỗi driver
  để kiểm tra rollback/retry hữu hạn; không tuyên bố đã tái tạo deadlock tự nhiên.
- COMMIT thực tế thành công rồi giả lập mất response: chỉ một lần commit/create,
  Item và Match vẫn nhất quán. Unit tests kiểm tra BEGIN/COMMIT/rollback/release
  lỗi và GET_LOCK timeout làm destroy connection thay vì đưa lại vào pool.
- Các regression Auth, Item/Search, quyền sở hữu, audit, upload đồng thời và
  durable image cleanup đều đạt.

## File tạo/chỉnh sửa

Tạo:

- `server/utils/match-score.js`
- `server/repositories/matching.repository.js`
- `server/services/matching.service.js`
- `server/services/matching-transaction.js`
- `server/controllers/matching.controller.js`
- `server/tests/fixtures/matching.js`
- `server/tests/matching.test.js`
- `server/tests/matching.integration.js`
- `server/MATCHING.md`
- `server/MATCHING-TEST-RESULTS.md`

Chỉnh sửa:

- `server/repositories/item.repository.js`
- `server/services/item.service.js`
- `server/routes/item.routes.js`
- `server/routes/index.js`
- `server/app.js`
- `server/server.js`
- `database/scripts/test-isolated.js`
- `server/README.md`

## Giới hạn và trạng thái bàn giao

Không còn lỗi đã biết trong phạm vi kiểm thử. Không benchmark tải lớn; advisory
lock tuần tự hóa thao tác ghi ảnh hưởng Matching và chi phí tăng theo candidates.
Không tự backfill Item hiện hữu. Module tương lai thay đổi Item phải dùng cùng
protocol; sửa trực tiếp SQL ngoài luồng không tự đồng bộ score. Client tự gửi lại
create sau lỗi COMMIT/network chưa có idempotency key. Không kiểm chứng mạng
Cloudinary thật, không triển khai Claim/Notifications hoặc endpoint đổi Match status.

Không chỉnh `.env`, tài liệu nghiệp vụ đã phê duyệt, package/lockfile hoặc migrations.
Không commit/push/merge. Hướng dẫn thuật toán, API và transaction trong `MATCHING.md`.
