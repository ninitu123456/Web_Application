# FindIt — Backend

API REST viết bằng Node.js (ES Modules), Express 5 và MySQL 8, kèm Socket.IO cho chat realtime. Toàn bộ endpoint, request và response được mô tả trong [hợp đồng API](../docs/api-contract.md); quy tắc phân quyền và trạng thái nằm trong [quy tắc nghiệp vụ](../docs/business-rules.md).

## Cấu trúc

| Thư mục / file | Trách nhiệm |
| --- | --- |
| `server.js`, `app.js` | Khởi động, kiểm tra kết nối DB, lắp middleware/route, tắt an toàn khi nhận SIGTERM |
| `chat-socket.js` | Socket.IO: xác thực JWT, phòng chat theo cuộc trò chuyện |
| `config/` | Đọc biến môi trường, pool MySQL, Cloudinary |
| `routes/` → `controllers/` → `services/` → `repositories/` | Endpoint → nhận request → quy tắc nghiệp vụ và transaction → truy vấn SQL |
| `middleware/`, `validation/`, `utils/` | Xác thực, phân quyền, rate limit, validate dữ liệu, DTO, xử lý lỗi |
| `ai-visual/` | Worker AI gợi ý bằng hình ảnh (CLIP), chạy thành tiến trình riêng |
| `scripts/` | Kiểm tra DB, dọn ảnh mồ côi, đo coverage |
| `tests/` | Unit, HTTP và integration tests |

Các module: Auth (gồm quên mật khẩu), User, Item (bài đăng và ảnh), Matching và gợi ý AI, Claim, Chat, Notification, Report, Admin, Health.

## Chạy cục bộ

Cần Node.js 24 và MySQL 8. Từ thư mục gốc repository:

```bash
npm ci
cp .env.example .env        # rồi điền cấu hình DB, JWT, Cloudinary
npm run db:setup            # tạo schema, migration và dữ liệu mẫu cho môi trường dev
npm run dev                 # API tại http://127.0.0.1:3001/api
```

Tạo `JWT_SECRET` (tối thiểu 32 byte):

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Kiểm tra: `GET /api/health` trả 200 khi kết nối được database. Server từ chối khởi động nếu thiếu cấu hình bắt buộc hoặc không kết nối được MySQL.

## Các điểm kỹ thuật chính

**Xác thực và phân quyền.** JWT HS256, mật khẩu băm bcrypt. Vai trò và trạng thái tài khoản được đọc lại từ DB ở mỗi request, nên tài khoản bị khóa mất quyền ngay. Có hai vai trò `USER` và `ADMIN`; `ADMIN` không được xử lý bài hoặc Claim có liên quan đến chính mình.

**Matching theo thông tin.** Khi tạo hoặc sửa bài, hệ thống chấm điểm với mọi bài loại đối diện (`LOST ↔ FOUND`), xem `BR-MATCH-06` trong [quy tắc nghiệp vụ](../docs/business-rules.md#5-ghép-nối-thông-minh):

```
điểm = 0.30 × danh mục + 0.20 × địa điểm + 0.20 × ngày + 0.30 × nội dung
```

- Danh mục, địa điểm: trùng = 100, khác = 0.
- Ngày: giảm tuyến tính về 0 khi lệch 30 ngày.
- Nội dung: độ trùng từ (Jaccard) giữa tiêu đề và mô tả.

Chỉ lưu cặp có điểm ≥ 50. Điểm là độ tương đồng, không phải xác suất đúng chủ.

**Gợi ý bằng hình ảnh (AI).** Mỗi ảnh tải lên tạo một job trong cùng transaction. Worker `ai-visual/` dùng model CLIP (pretrained, chạy CPU) để sinh vector 512 chiều, rồi so cosine với ảnh của các bài loại đối diện. Chủ bài thấy kết quả trong mục "Gợi ý cho bạn". AI chỉ gợi ý, không tự tạo Match hay xác nhận Claim. Cấu hình production xem [triển khai](../docs/deployment.md#gợi-ý-bằng-hình-ảnh-ai).

**Claim và bàn giao.** Người nhận đồ gửi Claim (`PENDING`) kèm bằng chứng. Chủ bài duyệt (`APPROVED`) hoặc từ chối (`REJECTED`), rồi xác nhận đã bàn giao (`COMPLETED`). Mọi bước chạy trong transaction có khóa dòng, nên một món đồ không thể có hai Claim cùng được duyệt.

**Ảnh.** Lưu trên Cloudinary với public ID do server sinh (UUID). Kiểm tra MIME và chữ ký byte; tối đa 5 ảnh, 5 MiB mỗi ảnh. Ảnh bị xóa được dọn qua hàng đợi để không còn file mồ côi khi transaction lỗi.

**Bảo mật.**

- Helmet (security headers, HSTS trên production).
- CORS theo danh sách origin.
- Rate limit cho toàn API, đăng nhập, đăng ký, quên/đặt lại mật khẩu và upload.
- Giới hạn kích thước body.
- Lỗi trả về không lộ stack trace hay câu SQL.

## Kiểm thử

```bash
npm test                              # unit và HTTP tests
npm run test:integration:isolated     # integration trên MySQL tạm, tự dọn sau khi chạy
npm run test:coverage                 # đo coverage
```

Integration tests tự khởi động một MySQL riêng (đặt `MYSQLD_PATH` nếu không tìm thấy) và giả lập Cloudinary, nên không đụng tới database đang dùng. GitHub Actions chạy các bộ test này trên mỗi pull request.

## Lỗi thường gặp

| Lỗi | Kiểm tra |
| --- | --- |
| `INVALID_CONFIG` | Biến DB, `JWT_SECRET`, `PORT`, `CORS_ORIGINS` trong `.env` |
| `ECONNREFUSED` | MySQL đã chạy chưa, `DB_HOST`/`DB_PORT` |
| `ER_ACCESS_DENIED_ERROR` | Tài khoản/mật khẩu MySQL |
| `EADDRINUSE` | Cổng 3001 đang bị chiếm |
| Trình duyệt báo CORS | Origin frontend phải có trong `CORS_ORIGINS` |
