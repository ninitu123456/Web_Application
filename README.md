# FindIt — Smart Campus Lost & Found

Ứng dụng hỗ trợ tìm và trả lại đồ thất lạc trong khuôn viên trường, gồm giao diện người dùng, trang quản trị và API backend. Đồ án được thực hiện bởi nhóm 2 thành viên.

## Chức năng

| Người dùng | Quản trị viên |
| --- | --- |
| Đăng ký, đăng nhập và cập nhật họ tên | Xem thống kê hệ thống |
| Đăng bài LOST/FOUND, quản lý bài và ảnh | Quản lý tài khoản, danh mục và địa điểm |
| Tìm kiếm, lọc và xem gợi ý Matching | Kiểm duyệt bài đăng, xử lý báo cáo vi phạm |
| Gửi Claim, duyệt yêu cầu và xác nhận bàn giao | Giải quyết Claim đang chờ và xem nhật ký nghiệp vụ |
| Xem thông báo và gửi báo cáo vi phạm | Thao tác theo phân quyền và quy tắc tránh xung đột lợi ích |

Matching chấm điểm tương đồng giữa các bài LOST/FOUND; điểm số không phải xác suất xác nhận đúng chủ sở hữu. Claim và bàn giao được quản lý theo trạng thái, quyền truy cập và transaction.

## Công nghệ và cấu trúc

| Thành phần | Công nghệ / trách nhiệm |
| --- | --- |
| `client/` | React, Vite, TypeScript, Tailwind CSS; giao diện và kiểm thử frontend |
| `server/` | Node.js, Express, JWT, Zod; routes → controllers → services → repositories |
| `database/` | MySQL 8, schema, migrations, seeds và công cụ vận hành/kiểm thử |
| `docs/` | Yêu cầu, quy tắc nghiệp vụ, ERD và hợp đồng API |
| `scripts/` | Công cụ coverage dùng chung |
| `.github/workflows/` | GitHub Actions kiểm thử backend/database và kiểm tra coverage |

Ảnh được lưu trên Cloudinary; MySQL lưu dữ liệu nghiệp vụ và tham chiếu ảnh. Frontend gọi API Express qua HTTP.

## Chạy cục bộ

Khuyến nghị Node.js 24, npm và MySQL 8.0.16 trở lên. Các lệnh dưới đây dùng PowerShell trên Windows; trên shell khác dùng `npm` thay cho `npm.cmd` và lệnh sao chép tương ứng.

### 1. Cài đặt và cấu hình

```powershell
git clone https://github.com/ninitu123456/Web_Application.git
cd Web_Application
npm.cmd ci
# Chỉ sao chép khi chưa có .env:
Copy-Item .env.example .env
```

Điền cấu hình trong `.env` tại gốc:

- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME=findit_db`.
- `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_USER_EMAIL`, `SEED_USER_PASSWORD`: hai tài khoản mẫu riêng để chạy thử.
- `JWT_SECRET`: secret ngẫu nhiên tối thiểu 32 byte; `JWT_EXPIRES_IN` tính bằng giây.
- Các biến `CLOUDINARY_*` nếu cần upload ảnh thật.

Không commit `.env` hoặc credentials. Cách tạo JWT secret và yêu cầu cấu hình chi tiết nằm trong [hướng dẫn Auth](server/AUTH.md) và [hướng dẫn database](database/README.md).

### 2. Khởi tạo database và chạy backend

MySQL phải đang chạy, tài khoản setup có đủ quyền tạo database và áp dụng migrations.

```powershell
npm.cmd run db:setup
npm.cmd run dev
```

API mặc định: `http://127.0.0.1:3001/api`. Kiểm tra readiness tại `http://127.0.0.1:3001/api/health`.

Setup tạo schema và seed nếu chưa có; khi gặp dữ liệu không khớp fixture, lệnh dừng để kiểm tra, không ghi đè. Xem [hướng dẫn database](database/README.md).

### 3. Chạy frontend

Mở terminal thứ hai tại gốc repository:

```powershell
cd client
npm.cmd ci
npm.cmd run dev
```

Mở `http://localhost:5173`. Đăng nhập bằng tài khoản mẫu đã cấu hình hoặc đăng ký tài khoản mới.

Frontend mặc định gọi `http://127.0.0.1:3001/api`. Có thể đặt `VITE_API_BASE_URL` theo [client/.env.example](client/.env.example). Khi đổi origin frontend, cập nhật `CORS_ORIGINS` của backend cho khớp. Xem [hướng dẫn frontend](client/README.md) về build và hosting.

## Kiểm thử

Tại gốc repository:

```powershell
npm.cmd test
npm.cmd run test:integration:isolated
# Hoặc chạy cả hai bước:
npm.cmd run test:regression
```

Trong `client/`:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run format:check
npm.cmd run build
# Kiểm thử trình duyệt, cần Chrome hoặc Edge và MySQL executable:
npm.cmd run test:browser
```

Integration và browser tests tạo MySQL instance tạm, không dùng dịch vụ MySQL đang cài. Đặt `MYSQLD_PATH` nếu runner không tự tìm thấy executable. Cloudinary được thay bằng storage giả trong các tests này.

GitHub Actions hiện kiểm tra backend/database, dependency production và coverage; frontend được kiểm tra bằng các lệnh riêng ở trên. Xem [bảo mật và coverage](server/SECURITY.md) và [browser tests](client/README.md#kiểm-thử-trình-duyệt-cô-lập).

## Tài liệu

| Nội dung | Tài liệu |
| --- | --- |
| Đặc tả | [Yêu cầu](docs/requirements.md) · [Quy tắc nghiệp vụ](docs/business-rules.md) · [ERD](docs/erd.md) · [Hợp đồng API](docs/api-contract.md) |
| Cài đặt và vận hành | [Frontend](client/README.md) · [Backend](server/README.md) · [Database](database/README.md) |
| API theo module | [Auth/User](server/AUTH.md) · [Item và ảnh](server/ITEMS.md) · [Matching](server/MATCHING.md) · [Claim](server/CLAIMS.md) · [Admin](server/ADMIN.md) |
| API hỗ trợ frontend | [Lookup và bài của tôi](server/FRONTEND-API.md) |
| Notification và Report | [Hợp đồng API](docs/api-contract.md) và [quy tắc nghiệp vụ](docs/business-rules.md) |
| Bảo mật và kiểm thử | [Cấu hình, coverage và giới hạn](server/SECURITY.md) |

## Giới hạn cần biết

- Chưa kiểm chứng Cloudinary qua mạng thật, Firefox/Safari, thiết bị vật lý hoặc hosting production trong bộ kiểm thử được mô tả.
- Có chat riêng tư realtime và đặt lại mật khẩu qua email khi Resend được cấu hình. Chưa có refresh token hoặc trang đổi mật khẩu trong hồ sơ.
- Bài CLOSED kết thúc hoạt động nghiệp vụ nhưng vẫn có thể được đọc công khai. ADMIN resolve chỉ xử lý Claim PENDING, không hoàn tất bàn giao thay chủ bài.
- Trước khi triển khai sau reverse proxy hoặc nhiều instance, cần cấu hình phù hợp cho HTTPS, IP trust và rate-limit store; xem [bảo mật](server/SECURITY.md).
