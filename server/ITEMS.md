# Item & Search: sửa lỗi và kiểm thử hồi quy

Quyền tuân theo API Contract §7 và Business Rules BR-ITEM-03:
chỉ chủ bài được cập nhật nội dung/thêm/xóa ảnh khi Item OPEN. ADMIN có
thể đóng bài OPEN; thao tác này cùng audit log được commit trong một transaction.
Các thao tác không hợp lệ theo trạng thái trả 400 theo API Contract §11.4.
Không bổ sung quyền sửa bài của người khác hoặc thay đổi các luồng Claim.

## Transaction và ảnh

Mutation dùng `SELECT ... FOR UPDATE` trên Item. Upload thực hiện ngoài transaction,
sau đó khóa Item, kiểm tra lại owner/trạng thái/tổng số ảnh và ghi cả batch trong
một transaction. List lấy ảnh theo batch; mọi Item DTO đều có `images`.

Public ID được tạo trước khi gọi Cloudinary, với `overwrite: false`. Các sự kiện
`IMAGE_OPERATION_STARTED`, `IMAGE_OPERATION_COMMITTED`, `IMAGE_CLEANUP_COMPLETED`
được ghi nối tiếp vào bảng `activity_logs` hiện có. Marker COMMITTED nằm cùng
transaction với thay đổi ảnh; cleanup không suy đoán rollback từ lỗi COMMIT.
Worker dùng advisory lock theo operation và khóa Item trước khi đọc marker,
không xóa asset vẫn được `item_images` tham chiếu. Không cần migration mới.

Khi Cloudinary xóa lỗi, API trả 503 và journal giữ public ID để thử lại; metadata
ảnh đã bị loại khỏi Item trong transaction. Backend có cấu hình Cloudinary sẽ
tự xử lý các tác vụ còn lại khi khởi động và mỗi 60 giây, tối đa 100 tác vụ/lượt.
Shutdown dừng lịch và chờ lượt đang chạy. Có thể chạy thủ công:

```powershell
npm.cmd run images:cleanup
```

Lệnh này dùng database và Cloudinary đã cấu hình của môi trường chạy. Không chạy
nó với credentials production khi kiểm thử. Không xóa các sự kiện journal đang
chờ cleanup. Nếu database hoặc cloud ngừng hoạt động lâu, theo dõi sự kiện log
`image_cleanup_pending` / `image_cleanup_failed` và số tác vụ lỗi.

## Chạy test an toàn

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run test:integration:isolated
```

Lệnh integration khởi động `mysqld --no-defaults` với data directory và port tạm,
xác minh `@@datadir`/`@@port` trước khi ghi, và override credentials DB/JWT/seed.
Database mang tên `findit_db` trong lượt chạy này thuộc instance tạm mới tạo;
không phải database của MySQL service đang cài. Cloudinary credentials bị đặt
rỗng và các tests ảnh dùng storage giả trong bộ nhớ, không gọi cloud thật.

Runner chạy toàn bộ Backend, Auth/User, Item và Database integration suites,
sau đó shutdown đúng instance đã tạo và xóa data directory có kiểm tra đường dẫn.
Đặt `MYSQLD_PATH` nếu binary nằm ngoài đường dẫn MySQL 8.0 mặc định trên Windows.
Không chạy các lệnh integration trực tiếp với `.env` của môi trường đang sử dụng.

Regression tests bao phủ ownership ADMIN, audit rollback, upload đồng thời,
đóng bài trong lúc upload, lỗi ghi batch, upload mất phản hồi, cleanup sau khởi
động lại, mất phản hồi COMMIT, lỗi xóa DB/cloud, storage thiếu, bốn trạng thái
không phải OPEN, filter kết hợp và luồng HTTP/JWT xuyên suốt.

Chưa có kiểm chứng mạng Cloudinary thật trong bộ tests này. Những mâu thuẫn tài
liệu về ví dụ category/location dùng tên và trường định danh riêng tư tùy chọn
được giữ nguyên; implementation tiếp tục nhận ID và payload đã định nghĩa trong
API Contract, không tự mở rộng business rules.

## Kết quả xác minh ngày 2026-10-25

Node.js 24.21.0, MySQL 8.0 từ instance tạm. `npm.cmd ci --no-audit --no-fund`
đồng bộ dependencies theo lockfile, không đổi version hoặc nội dung lockfile.

| Lệnh/suite | Đạt | Trượt / bỏ qua |
| --- | ---: | ---: |
| `npm.cmd test` — Backend | 24 | 0 / 0 |
| `npm.cmd test` — Auth | 7 | 0 / 0 |
| `npm.cmd test` — Database unit | 4 | 0 / 0 |
| `npm.cmd run test:integration:isolated` — toàn bộ integration | 38 | 0 / 0 |

Integration bao gồm 4 Backend tests, nhóm Database (6 subtests), Auth/User
(9 subtests) và Item (16 subtests); số 38 có tính cả ba test cha của các nhóm.
MySQL tạm đã shutdown và data directory được dọn sau khi chạy. Không sử dụng
database/Cloudinary production, không đổi branch và không commit/push.
