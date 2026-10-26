# Phase 3 — Matching Engine

Matching dùng bảng `matches` hiện có, không thêm dependency hoặc migration.
Các quyết định thuật toán bên dưới theo kế hoạch Phase 3 được phê duyệt.

## Thuật toán

`calculateMatchScore(first, second)` trong `utils/match-score.js` nhận hai Item
camelCase có `id`, `type`, `status`, `categoryId`, `locationId`, `eventDate`,
`title`, `description`. Chấp nhận LOST/FOUND đảo thứ tự. Trả `{ score, reasons }`.

`score = 0.30C + 0.20L + 0.20D + 0.30T`, mỗi thành phần từ 0 đến 100:

- C: cùng category ID = 100, khác = 0.
- L: cùng location ID = 100, khác = 0.
- D: `100 × max(0, 1 − abs(daysDifference) / 30)`, tính ngày lịch UTC.
- T: `100 × intersection / union` của tập từ title + description. Chuẩn hóa
  Unicode NFC, chữ thường; thay dấu câu/ký hiệu bằng khoảng trắng; loại từ trùng,
  giữ dấu tiếng Việt. Union rỗng cho T = 0. Không dùng color/ảnh/thông tin riêng tư.

Làm tròn tổng điểm hai chữ số trước khi so ngưỡng lưu >= 50. Reasons có thứ tự
category, location, date, text; chỉ thêm tiêu chí đóng góp điểm. Explanation về text
chỉ nói có từ ngữ tương đồng, không khẳng định hai vật phẩm là một.

Null text là chuỗi rỗng. Sai kiểu text, thiếu ID/lookup ID, ngày không đúng lịch,
cùng Item, cùng type hoặc trạng thái ngoài OPEN/CLAIM_PENDING/CLAIMED gây TypeError
có kiểm soát. Tầng HTTP đã validate request; dữ liệu DB sai làm rollback thao tác,
trả lỗi máy chủ qua error handler hiện có thay vì lưu kết quả sai.

## Persistence và lifecycle

Tạo Item tự tìm toàn bộ candidate đối lập; cập nhật category, location, event date,
title/description tính lại; sửa riêng color hoặc ảnh không tính lại. Candidate
query theo item_id bằng keyset batch 100, không giới hạn tổng số, không lọc cứng
category hoặc ngày. Chỉ lấy trường cần tính điểm. Không có backfill lúc startup.

Upsert dùng UNIQUE `(lost_item_id, found_item_id)`. Match mới là POTENTIAL. Match
cũ chỉ đổi score/reasons, giữ ID, created_at và status, kể cả CONFIRMED/REJECTED.
Cặp cũ xuống dưới 50 vẫn được cập nhật và giữ lịch sử nhưng không xuất hiện khi
GET; không insert cặp mới dưới 50. Đóng/returned giữ nguyên bản ghi, GET kiểm tra
type và trạng thái hiện tại của cả hai Item. Không có endpoint đổi status Match.

## Transaction và concurrency

Item repository dùng `matchingTransaction` cho create, sửa trường ảnh hưởng điểm
và close. Advisory lock theo database được lấy trên cùng connection trước BEGIN
và trước mọi row lock, với server wait 2 giây và query timeout 5 giây. Không lấy
lock qua một connection rồi ghi qua connection khác. Lock bận trả 503.

Thay đổi Item, tính điểm/upsert Match và audit close cùng một transaction. Đọc
lại nguồn và candidates bằng FOR UPDATE; tính điểm trong transaction, không gọi
dịch vụ mạng. Commit mới công bố Item/Match cùng nhau. GET dùng JOIN trong một
SELECT nên không trộn score cũ với Item từ commit mới. Image operations tiếp tục
dùng row lock/journal riêng, không lấy advisory lock Matching.

Deadlock/lock-wait chỉ retry sau rollback thành công, tối đa ba attempts. Lỗi
BEGIN/COMMIT không rõ kết quả, timeout/fatal, rollback lỗi hoặc release lock không
xác nhận khiến connection bị destroy. Không replay COMMIT lỗi; caller có thể nhận
500 dù commit đã thành công, nhưng Item/Match vẫn nguyên tử. Không hứa idempotency
cho client tự gửi lại create sau lỗi mạng.

## API

`GET /api/items/:id/matches`, header `Authorization: Bearer <JWT>`.
USER/ADMIN được xem mọi Item theo contract, không giới hạn chủ bài.

```json
{
  "success": true,
  "data": [{
    "matchId": 15,
    "itemId": 28,
    "score": 82,
    "reasons": ["Cùng danh mục", "Cùng địa điểm", "Thời gian xảy ra gần nhau", "Nội dung có từ ngữ tương đồng"]
  }]
}
```

`itemId` là Item đối ứng. Điểm giảm dần, matchId tăng dần khi bằng điểm. Không
lọc thêm theo status Match. Không có kết quả hoặc Item đã đóng/returned trả [];
ID sai 400, JWT thiếu/sai 401, tài khoản bị chặn 403, Item không tồn tại 404.
GET không ghi database và không trả private_identifiers, proof hoặc thông tin user.

## Kiểm thử và giới hạn

Dataset điểm kỳ vọng: `tests/fixtures/matching.js`; unit/transaction tests:
`tests/matching.test.js`; HTTP/MySQL/concurrency: `tests/matching.integration.js`.
Integration suite được liệt kê trong runner MySQL cô lập. Chạy từ gốc repo:

```powershell
npm.cmd test
npm.cmd run test:integration:isolated
```

Integration xác minh datadir/port của MySQL tạm trước khi ghi, tạo database test
riêng và xóa sau kiểm thử; không dùng Cloudinary thật hay database production.

Advisory lock tuần tự hóa thao tác ghi ảnh hưởng Matching: ưu tiên tính nhất quán,
không tối ưu cho lưu lượng ghi lớn. Matching là O(số candidate đối lập); transaction
có thể kéo dài khi dữ liệu lớn dù bộ nhớ được chia batch. Các thao tác ghi của
module tương lai phải tuân thủ cùng transaction/locking protocol; SQL trực tiếp
thay đổi trường tính điểm ngoài luồng không tự được đồng bộ. Claim/Notifications,
backfill dữ liệu cũ, queue và matching bằng AI không thuộc Phase 3.
