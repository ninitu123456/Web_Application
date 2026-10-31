# FindIT — MySQL database

Phase 2 adds the append-only migration `012_item_search_indexes.sql`. The migration runner applies and verifies its three item search indexes while preserving the original 001–011 migration files and checksums. The SQL export and `db:build` include those indexes for fresh installs.

Triển khai theo `docs/erd.docx`, `docs/requirements.docx`, `docs/business-rules.docx` và `docs/api-contract.docx`. Database gồm **11 bảng nghiệp vụ** và bảng kỹ thuật `_schema_migrations`.

## Chuẩn bị và cấu hình

- Node.js >= 20, npm; MySQL >= 8.0.16 để CHECK được thực thi. Đã kiểm thử với Node.js 24.21.0 và MySQL 8.0.46 trên Windows.
- MySQL phải đang chạy. Trên PowerShell: `Get-Service MySQL80`. Không cần thêm `mysql.exe` vào PATH vì scripts dùng driver Node.js.
- Tài khoản setup cần quyền tạo database; trong `findit_db` cần CREATE, SELECT, INSERT, UPDATE và REFERENCES. Bộ integration cần CREATE/DROP database test; các câu ALTER/DROP chỉ chạy trong database test do chính bộ kiểm thử tạo.
- Không cần cài Express hoặc ORM. Chạy lệnh từ gốc repository:

```powershell
npm.cmd ci
Copy-Item .env.example .env
```

Nếu `.env` đã tồn tại, giữ nguyên file đó. Điền các biến sau bằng trình soạn thảo cục bộ:

| Biến | Ý nghĩa |
| --- | --- |
| `DB_HOST` | Mặc định `127.0.0.1` |
| `DB_PORT` | Mặc định `3306` |
| `DB_USER` | Tài khoản MySQL có quyền setup |
| `DB_PASSWORD` | Mật khẩu MySQL; phải khai báo, có thể để rỗng nếu server thực sự cho phép |
| `DB_NAME` | `findit_db`; CLI từ chối tên khác |
| `SEED_ADMIN_EMAIL`, `SEED_USER_EMAIL` | Hai email khác nhau cho tài khoản mẫu |
| `SEED_ADMIN_PASSWORD`, `SEED_USER_PASSWORD` | Mật khẩu mẫu không rỗng, tối đa 72 byte UTF-8 theo giới hạn bcrypt |

`.env` được đọc từ gốc repository; biến môi trường tiến trình có ưu tiên cao hơn. Không commit hoặc chia sẻ `.env`. Mật khẩu mẫu được hash bcrypt với cost 12; không log mật khẩu hoặc hash. Không dùng tài khoản mẫu trong môi trường production.

## Khởi tạo và vận hành

```powershell
npm.cmd run db:setup
```

Lệnh này kiểm tra cấu hình, tạo `findit_db` nếu chưa có, chạy migrations, insert seed và xác minh schema/seed. Các lệnh riêng:

| Lệnh | Chức năng |
| --- | --- |
| `npm.cmd run db:init` | Tạo database nếu chưa có, không tạo bảng |
| `npm.cmd run db:migrate` | Chạy migrations chưa hoàn tất; database phải tồn tại |
| `npm.cmd run db:seed` | Tạo hoặc xác minh dữ liệu mẫu; không ghi đè |
| `npm.cmd run db:verify` | Kiểm tra schema, lịch sử migration và seed, gồm xác minh mật khẩu |
| `npm.cmd run db:build` | Sinh migrations SQL và SQL export từ `schema.js` |

Trên shell khác có thể dùng `npm` thay cho `npm.cmd`.

Seed gồm vai trò USER/ADMIN, một tài khoản mỗi vai trò, bốn danh mục, bốn địa điểm UIT và bốn bài LOST/FOUND trạng thái OPEN. Đây là dữ liệu hư cấu; vị trí mẫu có tên tòa A, tòa B, thư viện và khuôn viên UIT. Không seed Claim hoặc luồng nghiệp vụ.

Seed tìm vai trò/danh mục/địa điểm theo tên; tài khoản theo email và dấu nhận diện fixture; item theo `private_identifiers` có namespace `findit:sample:v1`. Chạy lại không thêm trùng, không cập nhật tài khoản hoặc item hiện hữu. Nếu tài khoản trùng email không phải fixture, mật khẩu đã thay đổi, hoặc item mẫu đã được chỉnh sửa, script dừng và rollback toàn bộ seed. Không xóa dữ liệu để xử lý xung đột; dùng email fixture riêng khi phù hợp.

## Schema, migration và trách nhiệm backend

- `schema.js` mô tả cấu trúc; `migrations/001_*.sql` đến `011_*.sql` là SQL đã sinh, sắp theo phụ thuộc FK. `database-schema.sql` là bản xuất đầy đủ, dùng cùng nguồn.
- MySQL dùng InnoDB, `utf8mb4_0900_ai_ci`; PK là BIGINT UNSIGNED AUTO_INCREMENT. Driver trả BIGINT dưới dạng chuỗi để tránh mất độ chính xác. Backend sau này phải xử lý giới hạn số an toàn khi chuyển sang JSON ID dạng số theo API contract.
- `users.avatar_url` dùng VARCHAR(1000), `contact_info` dùng TEXT, cả hai nullable, theo quyết định bổ sung cho hai kiểu chưa quy định trong ERD.
- Datetime lưu UTC; kết nối đặt `time_zone='+00:00'` và scripts truyền thời gian tường minh. Không tự cập nhật `updated_at` bằng trigger; backend phải truyền giá trị khi sửa dữ liệu.
- FK đều RESTRICT khi xóa/cập nhật. Chỉ có indexes phục vụ PK, UNIQUE và FK. Không có DELETE CASCADE hoặc trigger nghiệp vụ.
- CHECK bảo vệ điểm match 0–100, hai item khác nhau, và report tham chiếu đúng một đối tượng theo target_type. UNIQUE bảo vệ email, student_code, tên lookup, cặp match và cặp claimant/item.
- Kiểm tra loại LOST/FOUND của hai phía match, trạng thái hợp lệ, quyền truy cập, Claim chỉ trên FOUND, chống tự Claim và các luồng trạng thái thuộc backend. Xét duyệt Claim phải khóa hàng Item bằng `SELECT ... FOR UPDATE` trong transaction, kiểm tra Claim đã APPROVED/COMPLETED, từ chối Claim cạnh tranh, cập nhật Item/thông báo và audit nguyên tử. Schema không tự bảo đảm chỉ một Claim được duyệt nếu ghi SQL trực tiếp bỏ qua quy trình này.
- Backend phải bảo vệ `private_identifiers`, `proof_description`, password hash và thông tin riêng tư; database scripts không tạo API.

`_schema_migrations` lưu tên phiên bản, SHA-256, trạng thái running/applied và thời gian UTC. Scripts dùng advisory lock theo database để tránh chạy setup/seed đồng thời. DDL MySQL có implicit commit: không tuyên bố rollback được toàn bộ migration. Trạng thái running được lưu trước DDL; lần chạy sau chỉ tiếp tục nếu bảng đã tạo khớp schema đầy đủ, hoặc chưa tồn tại. Checksum sai, bảng lạ, metadata thiếu, bảng đã áp dụng bị mất, constraint/column/index sai đều khiến script dừng để xem xét thủ công.

Không sửa migration đã áp dụng rồi chạy `db:build` trên database đang dùng. Thay đổi schema về sau cần migration phiên bản mới và cập nhật runner tương ứng; bộ hiện tại được thiết kế cho 11 migration khởi tạo đã thống nhất.

SQL export tạo `findit_db`, bảng kỹ thuật và 11 bảng nghiệp vụ, không chứa credentials, dữ liệu hoặc bản ghi lịch sử migration. Chỉ import vào database rỗng để tham khảo/khôi phục cấu trúc độc lập. Import tay không được runner tự nhận là migration đã áp dụng; dùng `db:setup` cho cài đặt có quản lý migration.

## Kiểm thử và reset test an toàn

```powershell
npm.cmd run db:test
npm.cmd run db:test:integration
```

- `db:test`: kiểm tra cấu hình, giới hạn bcrypt, đồng bộ SQL export và cách đối chiếu CHECK; không cần kết nối MySQL.
- `db:test:integration`: dùng kết nối trong `.env`, tạo database `findit_test_<24 ký tự hex>` mới. Kiểm tra migrations, seed/hash, chạy lại không đổi dữ liệu, PK của 11 bảng, các cột NOT NULL, các UNIQUE/FK, ENUM/JSON/CHECK, defaults, chặn xóa dữ liệu được tham chiếu, xung đột seed và phục hồi DDL.
- Mỗi lần chạy tự tạo database rỗng và xóa trong `finally` chỉ khi chính lần chạy đã tạo thành công. Tên database phải khớp tên sở hữu và mẫu test; `findit_db` luôn bị từ chối bởi cơ chế cleanup.
- Không có lệnh reset `findit_db`. Muốn tái tạo test, chạy lại bộ integration. Nếu tiến trình bị tắt cưỡng bức, database test có thể còn lại; kiểm tra chính xác tên và quyền sở hữu trước khi tự xóa bằng Workbench.

Có thể chạy MySQL test riêng mà không cần credentials của dịch vụ đang dùng:

```powershell
npm.cmd run db:test:isolated
```

Runner ưu tiên `MYSQLD_PATH` (đường dẫn tuyệt đối), sau đó tìm `mysqld` trên `PATH` và các thư mục `MySQL Server` trong `Program Files\MySQL` trên Windows. Nếu không tìm thấy, runner dừng và hướng dẫn cấu hình; không tự kết nối dịch vụ MySQL đang cài. Có thể giải nén bản ZIP portable từ [MySQL Community Archives](https://downloads.mysql.com/archives/community/) mà không cài Windows service:

```powershell
$env:MYSQLD_PATH = 'C:\tools\mysql-8.0.44-winx64\bin\mysqld.exe'
npm.cmd run test:integration:isolated
```

Thay đường dẫn bằng nơi thực tế đã giải nén MySQL >= 8.0.16. Biến này phải được đặt trong môi trường terminal; isolated runner không đọc `.env`. Runner khởi tạo data directory tạm, chạy trên loopback ở cổng tạm, xác minh `@@datadir`/`@@port`, đặt mật khẩu ngẫu nhiên trong bộ nhớ rồi chạy integration. Cuối cùng dừng đúng tiến trình đã tạo và xóa đúng thư mục dữ liệu tạm. Binary portable có thể tái sử dụng cho lần chạy sau. Không sửa dịch vụ MySQL hoặc data directory hiện hữu. Nếu môi trường ngăn chạy executable, cần quyền thực thi phù hợp.

## Kiểm tra bằng MySQL Workbench

1. Tạo/mở kết nối Standard TCP/IP với host, port và username tương ứng `.env`. Nhập mật khẩu cục bộ trong Workbench.
2. Refresh **Schemas**, mở `findit_db` → **Tables**. Có 12 bảng vật lý: 11 nghiệp vụ và `_schema_migrations`.
3. Chạy các truy vấn không chứa thông tin xác minh riêng tư:

```sql
USE findit_db;
SET time_zone = '+00:00';
SHOW TABLES;
SELECT version, status, applied_at FROM _schema_migrations ORDER BY version;
SELECT r.name AS role, COUNT(u.user_id) AS users
FROM roles r LEFT JOIN users u ON u.role_id = r.role_id GROUP BY r.role_id, r.name;
SELECT item_id, title, type, status FROM items ORDER BY item_id;
SHOW CREATE TABLE matches;
SHOW CREATE TABLE reports;
```

Có thể dùng **Database → Reverse Engineer** để xem quan hệ FK. Kết quả chạy thực tế của phiên triển khai được ghi trong `TEST-RESULTS.md`.

## Lỗi thường gặp

| Lỗi | Cách xử lý |
| --- | --- |
| Missing DB_USER / DB_PASSWORD hoặc SEED_* | Điền `.env`, không đặt credentials trong source code |
| ECONNREFUSED | Kiểm tra MySQL service, host và port |
| ER_ACCESS_DENIED_ERROR | Kiểm tra user/password và quyền truy cập host của tài khoản |
| ER_DBACCESS_DENIED_ERROR / CREATE denied | Cấp quyền setup; bộ integration cần thêm quyền tạo/xóa database test |
| ER_BAD_DB_ERROR | Chạy `db:init` trước migrate/seed, hoặc dùng `db:setup` |
| Schema/history/checksum mismatch | Giữ dữ liệu, kiểm tra cấu trúc và migration history; không tự reset, sửa checksum hay đánh dấu applied |
| Could not acquire setup lock | Chờ tiến trình setup/seed trước kết thúc, kiểm tra session giữ lock |
| Seed account/item conflict | Kiểm tra fixture đã tồn tại; không ghi đè tài khoản hoặc mật khẩu |
| PowerShell chặn npm.ps1 | Dùng `npm.cmd` như các ví dụ trên |
