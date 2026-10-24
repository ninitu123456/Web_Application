# Kết quả triển khai — 2026-10-24

Các kết quả dưới đây đã được thực thi trên máy, không phải kết quả dự kiến.

## Môi trường và database chính

- Windows, Node.js 24.21.0, npm 11.19.0, MySQL Community Server 8.0.46.
- Database `findit_db` trên MySQL cổng 3306 đã được tạo bằng `db:setup` và xác minh bằng `db:verify`.
- 11 bảng nghiệp vụ + `_schema_migrations`, 11 phiên bản migration trạng thái applied.
- INFORMATION_SCHEMA: 12 PRIMARY KEY (gồm metadata), 16 FOREIGN KEY, 7 UNIQUE, 3 CHECK được thực thi.
- Seed: roles 2, users 2, categories 4, locations 4, items 4. Sáu bảng nghiệp vụ còn lại chưa có bản ghi, đúng phạm vi seed.
- Mật khẩu mẫu được hash bcrypt và đã xác minh bằng `bcrypt.compare`; không ghi credentials trong báo cáo.
- Đã chụp dữ liệu của toàn bộ bảng và lịch sử migration trước/sau khi chạy lại migrate/seed trên database chính: **PASS**, không có bản ghi thay đổi hoặc trùng.
- `.env` bị Git bỏ qua và không nằm trong danh sách file tracked.

## Các lệnh đã chạy và kết quả cuối

| Lệnh/kiểm tra | Kết quả |
| --- | --- |
| `npm.cmd install --no-audit --no-fund --fetch-retries=0 --fetch-timeout=20000` | PASS — đã cài dependencies và tạo lockfile |
| `node database/scripts/build.js` | PASS — sinh 11 migrations và SQL export |
| `npm.cmd run db:setup` | PASS — tạo database, áp dụng 11 migrations, seed và verify |
| `npm.cmd run db:test` | PASS — 4/4 tests |
| `npm.cmd run db:test:integration` | PASS — 6 subtests và test tổng, 7/7 theo Node test runner, trên MySQL chính trong database test riêng |
| `npm.cmd run db:test:isolated` | PASS — 7/7 trên MySQL instance tạm dùng cùng binary 8.0.46; đã dừng instance và xóa data directory tạm |
| Script Node chụp/so sánh dữ liệu trước và sau migrate/seed trên `findit_db` | PASS — migration mới 0, dữ liệu và metadata giữ nguyên |
| `npm.cmd run db:verify` | PASS — schema, metadata, seed và password hashes |
| Truy vấn INFORMATION_SCHEMA và đếm dữ liệu thực tế | PASS — đúng số lượng nêu trên; không còn database test sinh bởi bộ kiểm thử |
| `git diff --check` | PASS |

Integration đã thực thi các tình huống: tạo mới từ database rỗng; chạy lại giữ nguyên dữ liệu; vi phạm PK/NOT NULL/UNIQUE/FK/ENUM/JSON; điểm match ngoài khoảng và bằng biên 0/100; self-match; report thiếu, sai hoặc nhiều đối tượng; report hợp lệ cho ITEM/USER/CLAIM; chặn xóa dữ liệu được tham chiếu; defaults; xung đột seed không ghi đè; phục hồi migration running khi bảng đã có/chưa có; từ chối checksum hoặc cấu trúc sai; bảo vệ tên database khi cleanup.

## Giới hạn phạm vi

Không có lỗi triển khai còn mở. Frontend, API, phân quyền và quy trình xét duyệt Claim bằng transaction/row lock không thuộc đợt triển khai database này; xem trách nhiệm backend trong README. Không commit/push Git hoặc sửa tài liệu nghiệp vụ. Thay đổi có sẵn trong README tại gốc repository được giữ nguyên.
