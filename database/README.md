# FindIt — Database

Database MySQL 8 của FindIt, triển khai theo [ERD](../docs/erd.md), [yêu cầu](../docs/requirements.md), [quy tắc nghiệp vụ](../docs/business-rules.md) và [hợp đồng API](../docs/api-contract.md). Thư mục này chứa định nghĩa schema, migration, dữ liệu mẫu, công cụ CLI và bộ kiểm thử.

## Tổng quan

| Thành phần | Nội dung |
| --- | --- |
| Bảng | 11 bảng nghiệp vụ, 4 bảng tài khoản và chat, 11 bảng AI, cộng bảng kỹ thuật `_schema_migrations` |
| `schema.js`, `features-schema.js`, `phase5-schema.js` | Nguồn định nghĩa cấu trúc; `db:build` sinh SQL từ đây |
| `migrations/` | 30 file SQL áp dụng theo thứ tự trong manifest |
| `database-schema.sql` | Bản xuất toàn bộ cấu trúc (27 bảng), sinh từ cùng nguồn |
| `seeds/` | Dữ liệu mẫu cho môi trường dev |
| `scripts/` | CLI `init`, `migrate`, `seed`, `setup`, `verify`, `build` và runner kiểm thử cô lập |
| `tests/` | Unit và integration tests |

### Danh sách migration

| Tiền tố | Nội dung |
| --- | --- |
| `001`–`011` | 11 bảng nghiệp vụ |
| `012`–`013` | Index tìm kiếm; hỗ trợ chống trùng thông báo và báo cáo |
| `014`–`016` (AI) | `item_image_embeddings`, `ai_visual_jobs`, `ai_visual_candidates` |
| `014`–`018` (tài khoản, chat) | `session_version`, `password_reset_tokens`, `email_outbox`, `conversations`, `messages` |
| `017`–`024` (AI) | Revision, snapshot, kết quả, thông báo, outbox, chống trùng cảnh báo và đánh dấu dữ liệu demo |
| `025` | Tạo revision gốc cho danh mục ảnh AI |

Tiền tố `014`–`018` được dùng ở hai nhánh phát triển trước khi gộp. Tên file đầy đủ và checksum mới là định danh trong ledger, nên **không đổi tên, đổi số hay sửa** các file đã phát hành.

## Chuẩn bị

- Node.js 24 (tối thiểu 20) và npm.
- MySQL 8.0.16 trở lên để CHECK được thực thi. MySQL phải đang chạy; trên Windows kiểm tra bằng `Get-Service MySQL80`. Không cần `mysql.exe` trong PATH vì scripts dùng driver Node.js.
- Tài khoản setup cần quyền tạo database và các quyền `CREATE`, `ALTER`, `INDEX`, `SELECT`, `INSERT`, `UPDATE`, `REFERENCES` trên `findit_db`.

Cài dependencies từ thư mục gốc repository:

```bash
npm ci
cp .env.example .env     # chỉ khi chưa có .env
```

Trên Windows PowerShell, dùng `npm.cmd` và `Copy-Item .env.example .env`.

Điền các biến sau trong `.env`:

| Biến | Ý nghĩa |
| --- | --- |
| `DB_HOST` | Mặc định `127.0.0.1` |
| `DB_PORT` | Mặc định `3306` |
| `DB_USER` | Tài khoản MySQL có quyền setup |
| `DB_PASSWORD` | Mật khẩu MySQL; phải khai báo, để rỗng chỉ khi server thật sự cho phép |
| `DB_NAME` | `findit_db`; CLI từ chối tên khác |
| `SEED_ADMIN_EMAIL`, `SEED_USER_EMAIL` | Hai email khác nhau cho tài khoản mẫu |
| `SEED_ADMIN_PASSWORD`, `SEED_USER_PASSWORD` | Mật khẩu mẫu không rỗng, tối đa 72 byte UTF-8 (giới hạn của bcrypt) |

`.env` được đọc từ thư mục gốc; biến môi trường của tiến trình được ưu tiên hơn. Không commit `.env`. Mật khẩu mẫu được băm bcrypt cost 12 và không bao giờ được ghi log. Không dùng tài khoản mẫu trên production.

## Khởi tạo

```bash
npm run db:setup
```

Lệnh này kiểm tra cấu hình, tạo `findit_db` nếu chưa có, chạy migration, thêm dữ liệu mẫu và xác minh schema. Các lệnh riêng lẻ:

| Lệnh | Chức năng |
| --- | --- |
| `npm run db:init` | Tạo database nếu chưa có, không tạo bảng |
| `npm run db:migrate` | Chạy các migration chưa áp dụng; database phải tồn tại |
| `npm run db:seed` | Tạo hoặc xác minh dữ liệu mẫu, không ghi đè |
| `npm run db:verify` | Kiểm tra schema, lịch sử migration và dữ liệu mẫu (gồm cả mật khẩu) |
| `npm run db:build` | Sinh lại file migration và `database-schema.sql` từ các file `*schema.js` |

Trên production chỉ dùng `db:migrate`; `db:setup` và `db:seed` tự từ chối khi `NODE_ENV=production`.

### Dữ liệu mẫu

- Gồm hai vai trò `USER`/`ADMIN`, một tài khoản cho mỗi vai trò, bốn danh mục, bốn địa điểm UIT (tòa A, tòa B, thư viện, khuôn viên) và bốn bài `LOST`/`FOUND` trạng thái `OPEN`. Dữ liệu là hư cấu; không có Claim.
- Seed nhận diện bản ghi theo tên (vai trò, danh mục, địa điểm), theo email và dấu fixture (tài khoản), theo `private_identifiers` có namespace `findit:sample:v1` (bài đăng).
- Chạy lại không thêm trùng và không cập nhật bản ghi đã có. Nếu email đã thuộc tài khoản không phải fixture, mật khẩu đã đổi, hoặc bài mẫu đã bị sửa, seed dừng và rollback toàn bộ. Không xóa dữ liệu để xử lý xung đột; dùng email fixture khác nếu cần.

## Schema và migration

- PK kiểu `BIGINT UNSIGNED AUTO_INCREMENT`. Driver trả BIGINT dưới dạng chuỗi để không mất độ chính xác; backend kiểm tra giới hạn số an toàn khi chuyển sang ID dạng số trong JSON.
- InnoDB, `utf8mb4_0900_ai_ci`. Datetime lưu UTC; kết nối đặt `time_zone='+00:00'`.
- Không có trigger: backend tự truyền `updated_at` khi sửa dữ liệu. Mọi FK dùng `RESTRICT`, không có `DELETE CASCADE`.
- CHECK bảo vệ điểm match 0–100, hai bài khác nhau trong một match, báo cáo trỏ đúng một đối tượng theo `target_type`. UNIQUE bảo vệ email, `student_code`, tên danh mục/địa điểm, cặp match và cặp người gửi–bài của Claim.

`_schema_migrations` lưu tên migration, SHA-256, trạng thái `running`/`applied` và thời gian UTC. Scripts dùng advisory lock theo database để không có hai tiến trình setup hoặc seed chạy cùng lúc.

DDL của MySQL tự commit, nên một migration không rollback được hoàn toàn. Runner ghi trạng thái `running` trước khi chạy DDL; lần sau chỉ tiếp tục nếu bảng đã tạo khớp đầy đủ schema hoặc chưa tồn tại. Checksum sai, bảng lạ, thiếu metadata, mất bảng đã áp dụng, hoặc sai cột/index/constraint đều làm runner dừng để xem xét thủ công.

Quy tắc khi đổi schema:

- Mọi thay đổi đi bằng một file migration mới, kèm cập nhật manifest.
- Không sửa migration đã áp dụng rồi chạy `db:build` trên database đang dùng.
- Trước khi chạy phiên bản backend mới trên một database, chạy `npm run db:migrate` và xác nhận `025_ai_visual_catalog_state_seed.sql` đã ở trạng thái `applied`. Backend cần đủ các bảng revision, snapshot và thông báo của `017`–`025`.

`database-schema.sql` chỉ chứa cấu trúc, không có dữ liệu, credentials hay lịch sử migration. Chỉ import vào database rỗng để tham khảo; runner không nhận bản import tay là đã áp dụng migration. Cài đặt có quản lý luôn dùng `db:setup`.

### Trách nhiệm của backend

Database không tự kiểm tra các quy tắc sau; backend phải đảm bảo:

- Loại `LOST`/`FOUND` của hai phía match, trạng thái hợp lệ, quyền truy cập, Claim chỉ trên bài `FOUND`, không tự Claim bài của mình.
- Xét duyệt Claim khóa dòng bài bằng `SELECT ... FOR UPDATE` trong transaction, từ chối Claim cạnh tranh, cập nhật bài, thông báo và nhật ký nguyên tử. Ghi SQL trực tiếp bỏ qua quy trình này có thể tạo hai Claim được duyệt.
- Bảo vệ `private_identifiers`, `proof_description`, `password_hash` và thông tin riêng tư.

## Kiểm thử

```bash
npm run db:test              # không cần MySQL
npm run db:test:isolated     # trên MySQL tạm
```

- `db:test` kiểm tra cấu hình, giới hạn bcrypt, đồng bộ giữa schema và `database-schema.sql`, cách đối chiếu CHECK.
- `db:test:isolated` tạo database `findit_test_<24 ký tự hex>` trên một MySQL tạm, kiểm tra migration, seed và hash, chạy lại không đổi dữ liệu, bảng và constraint, ENUM/JSON/CHECK, giá trị mặc định, chặn xóa dữ liệu đang được tham chiếu, xung đột seed và phục hồi DDL.
- `npm run test:integration:isolated` chạy integration của cả backend và database theo cùng cách.

Integration tests không chạy trên MySQL đang dùng. Runner tự dựng một instance MySQL tạm:

1. Tìm `mysqld` theo `MYSQLD_PATH` (đường dẫn tuyệt đối), sau đó trong `PATH`, rồi trong `Program Files\MySQL\MySQL Server*` trên Windows. Không tìm thấy thì dừng và hướng dẫn cấu hình.
2. Tạo thư mục dữ liệu tạm, chạy trên loopback ở cổng tạm, xác minh `@@datadir`/`@@port`, đặt mật khẩu ngẫu nhiên chỉ giữ trong bộ nhớ.
3. Chạy test. Guard dùng chung xác minh marker, datadir và port trước mỗi lần ghi dữ liệu.
4. Dừng đúng tiến trình đã tạo và xóa đúng thư mục dữ liệu tạm. Database test chỉ bị xóa nếu chính lần chạy đó tạo ra; `findit_db` luôn bị từ chối.

Không có lệnh reset `findit_db`. Nếu tiến trình bị tắt ngang, database test có thể còn lại; kiểm tra đúng tên trước khi tự xóa.

Nếu chưa cài MySQL, có thể giải nén bản ZIP từ [MySQL Community Archives](https://downloads.mysql.com/archives/community/) mà không cần cài Windows service:

```powershell
$env:MYSQLD_PATH = 'C:\tools\mysql-8.0.44-winx64\bin\mysqld.exe'
npm.cmd run test:integration:isolated
```

`MYSQLD_PATH` phải đặt trong môi trường terminal; runner không đọc biến này từ `.env`.

## Kiểm tra bằng MySQL Workbench

1. Tạo kết nối Standard TCP/IP với host, port và user như trong `.env`; nhập mật khẩu trong Workbench.
2. Refresh **Schemas**, mở `findit_db` → **Tables**: có 11 bảng nghiệp vụ, 4 bảng tài khoản và chat, 11 bảng AI và `_schema_migrations`.
3. Chạy các truy vấn (không đụng tới thông tin riêng tư):

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

Dùng **Database → Reverse Engineer** để xem sơ đồ quan hệ và đối chiếu với [ERD](../docs/erd.md).

## Lỗi thường gặp

| Lỗi | Cách xử lý |
| --- | --- |
| Thiếu `DB_USER`, `DB_PASSWORD` hoặc `SEED_*` | Điền `.env`; không đặt credentials trong source code |
| `ECONNREFUSED` | Kiểm tra MySQL đã chạy, `DB_HOST`, `DB_PORT` |
| `ER_ACCESS_DENIED_ERROR` | Kiểm tra user, mật khẩu và quyền truy cập từ host |
| `ER_DBACCESS_DENIED_ERROR` / CREATE denied | Cấp quyền setup cho tài khoản |
| `ER_BAD_DB_ERROR` | Chạy `db:init` trước `migrate`/`seed`, hoặc dùng `db:setup` |
| Schema, history hoặc checksum mismatch | Giữ nguyên dữ liệu, kiểm tra cấu trúc và lịch sử migration; không tự reset, sửa checksum hay đánh dấu `applied` |
| Could not acquire setup lock | Chờ tiến trình setup/seed khác kết thúc |
| Xung đột tài khoản hoặc bài mẫu | Kiểm tra fixture đã có; không ghi đè tài khoản hay mật khẩu |
| PowerShell chặn `npm.ps1` | Dùng `npm.cmd` |
