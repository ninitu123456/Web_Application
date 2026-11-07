# FindIt — backup và phục hồi trước release

## Phạm vi và checkpoint bắt buộc

Tài liệu này là quy trình chuẩn bị, **không phải lệnh cho phép truy cập production**. Railway MySQL `findit_db` chưa có backup đã được xác minh theo thông tin dashboard người dùng cung cấp. Đây là blocker triển khai. Chưa backup, restore hoặc migrate Railway trong lượt chuẩn bị này.

Phải được người dùng duyệt riêng: đọc inventory database, tạo backup vào kho cụ thể, restore bản sao vào instance cụ thể và sau đó mới migration/cutover. Không dùng database/cổng MySQL hiện hữu trên máy phát triển (3306/3311). Không đưa SQL dump, credentials hay private key vào repository, Desktop hoặc CI artifacts.

## Điều kiện trước khi thực hiện trên Railway

1. Xác nhận project/environment/service IDs, database/server UUID, MySQL version, charset/collation, toàn bộ bảng InnoDB, GTID/binlog và ledger migration/checksum. Không suy ra ledger từ commit ứng dụng. Ghi metadata schema, không tải bản ghi người dùng để lập inventory.
2. Xác nhận tính năng backup/retention/PITR và điều kiện gói thực trong Railway dashboard. Nếu chưa có, không gọi backup provider là đã khả dụng; logical backup mã hóa là phương án thay thế cần duyệt cùng chi phí/lưu trữ/retention.
3. Dùng job vận hành tạm riêng trong private network đã duyệt, với MySQL client tương thích và công cụ mã hóa đã pin/được duyệt. Không cài công cụ hoặc chạy shell trong API production khi chưa có approval. Không thay biến môi trường API để chạy backup.
4. Tài khoản backup tạm có quyền tối thiểu cho `SELECT`, `SHOW VIEW`, `TRIGGER`, `EVENT` và đọc routine metadata thích hợp với phiên bản MySQL. Xác nhận quyền routine/GTID theo provider; không cấp quyền ghi/drop tùy tiện. Tài khoản restore/migrate là tài khoản khác, chỉ được cấp trên instance phục hồi tương ứng.
5. Mount cấu hình client qua secret manager/provider vào tmpfs hoặc đường dẫn tạm owner-only, mode `0600`, thư mục `0700`, `umask 077`. Kiểm tra owner/mode bằng `stat`; không `cat` file hoặc in connection string, env hay password. Dùng `--defaults-file` làm option đầu để không đọc cấu hình MySQL ngoài dự kiến. Không đặt password trong argument/history.
6. Xác minh private endpoint và TLS/CA/hostname theo khả năng thực của Railway MySQL; ưu tiên TLS xác thực danh tính. Không tự tắt xác minh certificate để vượt lỗi. Cấu hình thực hiện nay chưa được kiểm tra nên đây vẫn là điều kiện chặn.
7. Chốt kho backup private đã được duyệt, quyền upload/read tách biệt, TLS, lifecycle/retention, integrity manifest và nhật ký truy cập. Chỉ public encryption recipient nằm trong job backup; private key/khả năng decrypt thuộc bên phục hồi riêng. Không lưu khóa giải mã cạnh backup. Không giả định ephemeral Railway filesystem là nơi giữ backup lâu dài.
8. Chốt RPO/RTO, maintenance window, image/env rollback và người có quyền phục hồi. Chặn DDL suốt backup. Để có recovery point chính xác trước release, drain/chặn ghi API, worker, email/cleanup phù hợp trước backup và giữ chặn ghi đến cutover; không hứa zero downtime khi chưa đo thời gian.

Tham chiếu: [MySQL mysqldump](https://dev.mysql.com/doc/refman/8.0/en/mysqldump.html), [Railway volume backups](https://docs.railway.com/volumes/backups), [Railway deployment rollback](https://docs.railway.com/deployments/deployment-actions). Backup volume/PITR phải được xác nhận theo service và gói thực, không chỉ theo khả năng chung của nền tảng.

## Backup logic nhất quán và mã hóa

Sau approval, operator thực hiện trên job riêng đã xác minh, không trên máy developer. Các biến dưới đây là **tên**, không phải giá trị secret cần gửi vào chat:

- `MYSQL_BACKUP_CNF`: file secret owner-only, trỏ đúng production service đã duyệt.
- `BACKUP_RECIPIENT`: public recipient của công cụ `age` đã pin/được duyệt.
- `BACKUP_PATH`: đường dẫn file mã hóa trong thư mục tạm private.
- `GTID_DUMP_FLAGS`: array option GTID đã được DBA/provider duyệt.

`--set-gtid-purged=OFF` chỉ là lựa chọn cho logical clone khi đã xác minh không cần phục hồi topology/GTID từ dump; không mặc định áp dụng cho mọi production/PITR. Nếu chưa xác định GTID thì **dừng**, không chạy mẫu sau với array tùy ý.

```bash
# Chỉ chạy sau checkpoint approval, trên backup job đã xác minh.
set -euo pipefail
umask 077
mysqldump --defaults-file="$MYSQL_BACKUP_CNF" \
  --single-transaction --quick --hex-blob \
  --routines --events --triggers --no-tablespaces \
  --default-character-set=utf8mb4 "${GTID_DUMP_FLAGS[@]}" \
  findit_db | age --encrypt --recipient "$BACKUP_RECIPIENT" \
  --output "$BACKUP_PATH"
sha256sum "$BACKUP_PATH" > "$BACKUP_PATH.sha256"
```

Không dùng `--all-databases`/`--databases` ở đây: dump chỉ chứa application schema/data, tránh `USE`/CREATE database ngoài dự kiến khi restore. Không thêm `--force` hoặc bỏ qua exit status. `pipefail` bắt cả lỗi dump lẫn mã hóa; chỉ coi artifact hợp lệ khi mọi process exit 0. Artifact giải mã được vẫn chưa chứng minh dump đầy đủ nếu `mysqldump` lỗi.

`--single-transaction` bảo đảm consistent snapshot cho InnoDB, không biến toàn bộ DDL thành transactional. Không ALTER/CREATE/DROP/RENAME/TRUNCATE trong lúc dump. Xác minh object inventory/routine/event/trigger thực và quyền export; không bỏ các object để làm backup qua. Upload **chỉ file mã hóa** và manifest SHA256 vào kho private bằng quyền đã duyệt, đối chiếu checksum sau upload. Ghi backup ID, thời gian UTC, schema/ledger fingerprint, MySQL/tool version, recipient fingerprint, vị trí object, retention và trạng thái xác minh; không ghi rows/credentials/private key vào báo cáo.

## Restore rehearsal bắt buộc

1. Tạo instance phục hồi riêng đã duyệt, không reuse production. Xác minh control-plane service/environment IDs, endpoint/server UUID khác production và outbound delivery đã khóa. Dùng cùng MySQL version/SQL mode/charset/collation; cần database `findit_db` trên **instance mới** để tương thích config app.
2. Người giữ khóa khôi phục kiểm tra quyền đọc object và decrypt bằng secret mount private. Đối chiếu checksum file mã hóa với manifest trước decrypt; không chia sẻ private key qua chat/log/artifact.
3. Tạo database rỗng trên đúng instance phục hồi. File `MYSQL_RESTORE_CNF` owner-only phải trỏ instance này, không dùng lại backup cnf production.

```bash
# Chỉ chạy trên instance phục hồi đã duyệt, tuyệt đối không trỏ live DB.
set -euo pipefail
umask 077
sha256sum --check "$BACKUP_PATH.sha256"
age --decrypt --identity "$RESTORE_IDENTITY_FILE" "$BACKUP_PATH" \
  | mysql --defaults-file="$MYSQL_RESTORE_CNF" \
      --default-character-set=utf8mb4 findit_db
```

4. Kiểm tra bảng/index/FK/check/generated column, routine/event/trigger (event scheduler tắt trên recovery), ledger/checksums và row counts/checksums. Kiểm tra dữ liệu tổng hợp hoặc tài khoản kiểm thử được duyệt; không công khai dữ liệu thật. Logs restore chỉ ở phạm vi private đã duyệt và được loại thông tin nhạy cảm trước báo cáo.
5. Giữ mọi AI flag false; chặn Cloudinary/email/SMS/push ở môi trường phục hồi, không chỉ trông vào biến env. Xác minh moderation ẩn/khôi phục, auth và Match/Claim. Không chạy seed application lên dữ liệu restore. `db:setup`, `db:seed` và `db:verify` hiện tại gắn seed fixtures; dùng schema/ledger-only verifier phù hợp để không đụng tài khoản thật.
6. Diễn tập pending migrations trên bản restore bằng release tooling đã pin; dừng nếu schema/ledger drift, running migration bất thường, thiếu quyền, thiếu dung lượng hoặc lock budget vượt giới hạn. Không sửa checksum/đánh dấu applied thủ công. Ghi RTO/RPO và kết quả trước khi xin duyệt migration thật.

## Rollback và dọn tài nguyên

- Lưu deployment/image/environment versions cũ trước cutover. Backend và frontend rollback không tự rollback dữ liệu/schema. Giữ schema additive nếu image cũ đã được kiểm chứng tương thích; không down migration hoặc DROP bảng AI.
- Nếu cần phục hồi dữ liệu, restore sang instance mới rồi xác minh và chuyển kết nối với approval riêng. Xác định ảnh hưởng các ghi phát sinh sau backup theo RPO, không ghi đè live DB tùy tiện.
- Thu hồi backup/restore credentials tạm sau khi hoàn thành scope đã duyệt. Chỉ dọn job/tmp/dump/recovery service do lượt vận hành tạo và đã xác minh IDs; giữ object backup theo retention. Không xóa database, volume hoặc dữ liệu người dùng hiện hữu để “cleanup”.

## Bằng chứng chuẩn bị local

Lượt release sử dụng MySQL mới, cổng ngẫu nhiên không phải 3306/3311, xác minh actual datadir/port trước ghi. Diễn tập chỉ có synthetic data: migrate30, boot production với AI off, auth/create/update, zero AI notification, backup nhất quán, mã hóa authenticated AES-256-GCM với RSA-OAEP key envelope, phát hiện ciphertext bị sửa và restore sang DB trống khác. So sánh schema/ledger/27 bảng và hash toàn bộ rows. Credentials/private key/dump test nằm trong tài nguyên tạm và được dọn; helper/log nằm `.cache/release-prep/`, không commit.

Đây là kiểm tra cơ chế với synthetic data trên Windows, **không phải** backup production, không kiểm chứng ACL Linux/KMS/kho object/provider restore hoặc `age` trên Railway. Các điều kiện production ở trên vẫn là blocker cho đến khi thực hiện với approval riêng và có bằng chứng.
