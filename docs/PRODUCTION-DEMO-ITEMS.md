# Chuẩn bị 30 món đồ demo FindIt

Trạng thái cập nhật 2026-11-09: **chưa ghi demo vào MySQL production**. Đã upload và xác minh 10 ảnh Cloudinary theo phê duyệt riêng; manifest thật được lưu tại `database/demo-assets/cloudinary-manifest.json`. Đã kiểm tra trực tiếp schema/ledger/quyền DB trong sandbox private chỉ đọc. Backup đang được hoàn tất bằng phương án mã hóa/private bucket đã được duyệt. Không gọi đây là seed thành công. Ngày mốc **2026-11-09** theo Asia/Saigon; ngày sự việc 03–08/11/2026. Nếu thực hiện ngày khác phải duyệt lại ngày mốc, không tự thay ngày khi chạy lại.

## Bằng chứng mới và các phê duyệt

- Nhánh vẫn là `feature/production-demo-items`, nguồn `53626cd0ed1ef604febfa39ae61af69985381279`; fetch không có commit remote mới khi bắt đầu lượt tiếp tục. Hai tài liệu UI chưa tracked có trước được giữ nguyên.
- Workspace Railway Hobby; đã được người dùng duyệt sandbox private 1 vCPU/1 GB, idle 5 phút, không domain/SSH key/TCP proxy và không redeploy service. Sandbox kiểm tra `0f84ad75-a770-49d9-a0b2-fb6d14b974bd` đã tự hủy do idle. API/CLI sandbox exec hoạt động không cần SSH key. Các biến DB được resolve server-side bằng reference đến service backend, không chép credentials vào source/chat/log.
- Kết nối thực tế xác minh MySQL **8.4.13**, database **findit_db**, server UUID **77676fb2-d8c9-11f1-9f0a-a2aad3869ed2**, 30 migration/checksum/schema PASS. Ledger hash **2ce430d4ab43b5c9d3f6910c47eb0ba4dcbaa0995c2250c805e1a962e003d84f**. Các bảng InnoDB, không trigger/event cần xử lý. DB user hiện tại có quyền cần thiết; process plan/capture bị MySQL khóa ở SESSION READ ONLY.
- Có **8 items, 3 item_images, 7 users** trước seed; không có marker demo v1. Public API vẫn trả total 0: không được coi database rỗng. Đã thu baseline SHA256/count/PK cutoff cho 27 bảng để đối chiếu dữ liệu cũ, không lưu plaintext bản ghi người dùng. PK không phải số không được xuất ra baseline.
- Đã được duyệt upload đúng 10 ảnh. Cloudinary `n7vjm6qn` xác thực được; 10 PNG đều 1254×1254, tổng 23.452.819 byte. Public ID không tồn tại trước upload, `overwrite:false`; 10 public URL GET 200, bytes/hash delivery khớp nguồn. Manifest hash **272b62c93c033fc59f470d5efff8e5d64d7078d1f57b5b1abe589a060dc4f452**. Không ghi DB hoặc tạo AI/email/notifications khi upload.
- Đã được duyệt một manual backup nhưng API từ chối `BAD_USER_INPUT`: manual backup/schedule chỉ dành cho Pro. Không upgrade, không tạo được snapshot và không được báo backup thành công từ lời gọi này.
- Sau đó người dùng duyệt phương án A: backup logic mã hóa vào private S3 bucket Railway và secret khôi phục mới với `skipDeploys:true`. Đã tạo bucket **findit-demo-backups**, ID **c45cad73-6d69-4f9b-8029-62d59a2041ec**. Khóa RSA khôi phục nằm trong shared secret Railway; chỉ public key vào sandbox. Không lưu private key vào repo/file local/chat/log. File metadata backup không chứa secrets; backup chưa được coi hoàn tất nếu thiếu upload/download/decryption proof.
- Backend deployment vẫn **a390daae-4c95-4c90-852a-8fcdcfcc6751**, không đổi sau khi tạo secret. Không bật AI/suggestions/notification/shadow/demo hoặc đổi image/PITR/volume.
- Bộ backup dùng consistent read-only InnoDB snapshot, giữ CREATE TABLE, columns, generated-column metadata, typed rows (kể cả binary/JSON), từ chối routine/trigger/event/view ngoài phạm vi. Gzip + AES-256-GCM, data key bọc RSA-OAEP/SHA256; S3 object private, không tạo presigned URL. Kiểm thử đã restore đầy đủ dữ liệu tổng hợp và schema qua hai MySQL tạm có UUID khác nhau, kiểm tra FK và migration ledger, phát hiện ciphertext bị sửa. Đây không phải restore production.
- Phí storage bucket theo [Railway](https://docs.railway.com/storage-buckets/billing); bucket có xác thực qua HTTPS, không phải endpoint private network. Không dựa vào máy local để giữ bản backup hoặc khóa khôi phục.

## Tiếp tục tự vận hành

Không yêu cầu người dùng chạy SQL/copy metadata nữa: đường truy cập private qua sandbox chính thức đã được xác minh. Tạo/tái tạo sandbox phải nằm trong phạm vi hạ tầng người dùng duyệt. `production-demo-sandbox.js` chỉ cho inspect/plan/baseline dưới scope `read-only`; apply yêu cầu scope `seed-approved`, approval file cụ thể, backup reference, manifest thật, target UUID/DB/ledger hash và baseline dữ liệu cũ không đổi. Chưa tạo approval ghi DB từ việc duyệt backup/upload.

`production-demo-backup.js` cung cấp capture/encrypt/decrypt/restore; restore từ chối source UUID, target chưa duyệt hoặc database không rỗng. `production-demo-backup-capture.js` chỉ chạy trong sandbox read-only đúng project/environment/host/UUID, chỉ xuất ciphertext và metadata. Kiểm tra tải lại/giải mã bản backup production trước final plan. Restore thật là thao tác riêng cần duyệt, không gọi tự động để kiểm thử.

Các mục bên dưới ghi lại kế hoạch và bằng chứng ở lượt chuẩn bị trước; các trạng thái mới ở phần đầu có ưu tiên.

## Đã xác minh chỉ đọc

- Git fetch `origin/main`, base `d1514024f888133e6bd534643215b2644f76e39e`; nhánh code `feature/production-demo-items`.
- Railway project `awake-illumination` (`66fa13b8-9b28-4ccc-a9bd-0b3f6c187a21`), environment `production` (`c9320496-f1b1-4730-b22b-777d7125b06d`). API service `Web_Application` (`5ce2c6ec-9081-4e98-86be-9d0b4406fea5`), MySQL service `a3c952f3-1ea4-413b-8bb8-566fcb5a3271`.
- Backend đang chạy commit base nói trên, branch `main`; cấu hình DB private `mysql.railway.internal:3306`, database `findit_db`. Đây là bằng chứng cấu hình, chưa phải bằng chứng server UUID/schema thực tế.
- Website `https://findit.io.vn/` HTTP 200; JavaScript đã build trỏ API `https://webapplication-production-20c5.up.railway.app/api`. Health 200; public items trả total 0. Không suy ra DB không có dữ liệu người dùng từ kết quả public này.
- API trả 4 danh mục: Thiết bị điện tử, Giấy tờ và thẻ, Chìa khóa, Đồ dùng cá nhân; 6 địa điểm UIT: tòa A/B/C/E, thư viện, khuôn viên. Bộ demo dùng các tên này, không tạo/sửa lookup. API lọc LOST, FOUND, keyword DEMO, category=1/location=3 đều HTTP 200 với total 0; chưa chứng minh hành vi trên dữ liệu sau seed.
- Cloudinary có đủ ba biến cấu hình; chưa thử quyền upload. Các cờ matching/suggestions/notification/shadow/demo đều `false`. Không có worker AI trong danh sách service hiện tại.
- MySQL không có TCP proxy. `railway connect MySQL --no-ssh` từ chối vì thiếu proxy; SSH từ chối vì không có key đã đăng ký. Người dùng yêu cầu **không tạo key, không mở proxy, không thay cấu hình**. `railway run` chạy lệnh trên máy local nên không cung cấp đường vào private network.
- Public GraphQL schema không cung cấp SQL query. Có metadata quản lý deployment/backup; không dùng các mutation quản trị để dựng đường truy cập thay thế.
- Volume instance `760e4ed3-db89-43b6-912d-8811363244e5`: danh sách backup và lịch backup đều rỗng. PITR disabled; image/start command hiện tại không hỗ trợ bật PITR trực tiếp. Không tạo backup, bật PITR hay đổi image/start command trong lượt chuẩn bị.

## Phương án Dashboard dự phòng (không yêu cầu thực hiện lúc này)

1. Mở project `awake-illumination`, chọn environment **production**, chọn service **MySQL** (đúng ID phía trên).
2. Mở **Data**. Chọn database `findit_db` nếu có bộ chọn; SQL đính kèm dùng tên database đầy đủ nên không phụ thuộc database mặc định.
3. Mở chức năng **Query / SQL query** trên trang Data. Chạy **từng câu** trong `database/scripts/production-demo-preflight.sql`. Đây chỉ là SELECT/SHOW, không DDL/DML, không tạo user/key/proxy.
4. Gửi lại kết quả metadata, ledger/checksum, FK, trigger/event, quyền và số lượng. Không gửi Connection URL, mật khẩu, biến môi trường, email, password hash hoặc nội dung bản ghi người dùng. Nếu Query không hiện hoặc bị Access denied, kiểm tra với chủ workspace quyền truy cập Data; không tự đổi quyền hay bật public networking.
5. Mở volume **mysql-volume** gắn `/var/lib/mysql` của đúng service, xem mục **Backups**. Xác nhận tình trạng backup/retention và phương án phục hồi. Đừng bấm Restore hoặc tạo backup khi chưa duyệt thao tác đó. Rollback chọn lọc đã được diễn tập nhưng không thay thế full backup nếu có sự cố ngoài phạm vi demo.
6. Trước production seed vẫn cần một đường thực thi riêng được duyệt trong private network. Data Query giúp xác minh SQL nhưng không chạy được script Node này. Nếu không có quyền thực thi hiện tại, không thể hứa seed tự động chỉ bằng CLI. Có thể chốt một phiên thao tác do chủ dự án thực hiện hoặc một job vận hành trong private network ở bước duyệt sau; không cần mở MySQL ra Internet.

Tham khảo UI chính thức: [Railway Data View](https://docs.railway.com/databases/database-view), [SQL queries trên Data UI](https://railway.com/changelog/2026-03-20-new-dashboard-layout).

## Thay đổi dự kiến sau khi duyệt

| Đối tượng | Số lượng tối đa | Nội dung |
| --- | ---: | --- |
| Cloudinary | 10 asset | PNG minh họa AI, public ID ổn định `findit/items/<UUID>`, dùng adapter upload hiện tại, `overwrite:false` |
| users | 2 INSERT | Hai tài khoản USER/ACTIVE riêng cho LOST và FOUND, email `.invalid`, mật khẩu ngẫu nhiên bcrypt cost 12 không lưu lại, không thay admin |
| items | 30 INSERT | 15 LOST + 15 FOUND, status OPEN, tên tiếng Việt, nhãn `[DEMO]`, marker riêng từng món |
| item_images | 30 INSERT | Mỗi bài 1 ảnh; cùng loại dùng chung asset, thông báo rõ trong mô tả |
| ai_visual_catalog_state | 1 UPDATE | Tăng revision một lần khi có thay đổi catalog, theo kiến trúc hiện tại |

Không sửa schema, role, lookup hoặc code HTTP/frontend. Dữ liệu MySQL và ảnh Cloudinary tồn tại độc lập với máy local. Frontend đang đọc API động nên dự kiến không cần deploy. Khả năng hiển thị thực tế chỉ được kết luận sau seed và kiểm chứng.

Phân bổ: điện thoại 4, laptop 3, tai nghe 4, balo 4, ví 3, thẻ 2, chìa khóa 2, bình nước 3, sách/vở 3, ô gấp 2. Danh mục DB vẫn là bốn nhóm hiện hữu; các nhóm đồ chi tiết nằm ở tiêu đề/mô tả.

Bảy cặp thử nghiệm có cùng ảnh/đặc điểm, địa điểm và ngày: `phone-01/02`, `laptop-01/02`, `headphones-01/02`, `bag-01/02`, `wallet-01/02`, `bottle-01/02`, `books-01/02`. Đây là dữ liệu tổng hợp để smoke test; dùng chung ảnh có thể làm similarity cao, không phải benchmark độ chính xác. Không lưu embedding, score, candidate, Match, notification hay email giả. Không enqueue/backfill/start worker. Muốn thử AI thực phải duyệt riêng tài nguyên và quy trình hiện có.

## Script và checkpoint

- `database/seeds/production-demo-data.js`: 30 fixture, tên hai chủ demo, ngày tương đối và toàn bộ prompt ảnh.
- `database/seeds/production-demo.js`: inspect/plan/seed/rollback, advisory lock demo + matching, transaction, không overwrite/upsert. Xác minh toàn bộ field/owner/ảnh trước khi nhận bản ghi cũ. Chạy lại không thêm trùng hoặc cập nhật thời gian.
- `database/scripts/production-demo-cli.js`: mặc định plan; local DB chỉ được dùng instance test tạm có identity guard. `--bundle` tạo mã thực thi trong bộ nhớ cho phiên private đã được duyệt, pin project/environment/service, UUID, DB name, ledger/checksum và manifest ảnh. Việc tạo bundle không chạy production. Bundle SSH chỉ dùng nếu về sau có đường truy cập đã được duyệt; hiện chưa có và không tạo key mới.
- Plan/inspect dùng read-only transaction; migration verifier chỉ đọc và dừng nếu schema không đúng. Không tự migrate.
- Apply/rollback yêu cầu `.cache/production-demo-approval.json` có proof từ plan, confirmation cụ thể `APPROVED:apply:2026-11-09` hoặc `APPROVED:rollback:2026-11-09`, cùng `recoveryReference`. File này chỉ lập **sau khi người dùng xác nhận** và đủ bằng chứng; không có giá trị placeholder trong repo.
- Cloudinary upload cần `FINDIT_DEMO_UPLOAD_APPROVED=findit:production-demo:v1`. Sau approval dùng `railway run --service Web_Application --environment production -- node database/scripts/production-demo-cli.js upload` trên máy vận hành để nhận biến trong process, không chép `.env`. Upload lưu manifest sau mỗi asset, không overwrite; gặp asset chưa có journal thì dừng để xác minh. GET public URL, kiểm tra PNG/kích thước và lưu riêng hash nguồn/hash delivery trước DB insert; Cloudinary có thể thay metadata PNG. Không bật biến trên Railway.
- Dùng `FINDIT_DEMO_ANCHOR_DATE=2026-11-09` khi tạo plan/bundle. Không đưa credentials vào arguments hoặc output.

Trước khi xin duyệt ghi: kiểm tra lại schema/target/grants, recovery, số INSERT còn thiếu, danh sách bảng, Cloudinary và các cờ AI. Approval đầu tiên có thể cho phép upload 10 ảnh; sau upload cần plan cuối với manifest thật và xin duyệt DB. Không tự coi duyệt đọc hoặc duyệt upload là duyệt seed.

## Rollback

`rollback()` khóa và kiểm tra lại đủ 30 marker chính xác, owner, field và ảnh. Duyệt tất cả FK tham chiếu items/images/users để phát hiện tương tác mới. Nếu có claim/report/chat/match/job hoặc field đã sửa, dừng toàn transaction để giữ dữ liệu đó cho review. Không dùng `DELETE WHERE title LIKE '[DEMO]%'`.

Nếu không có tương tác: xóa đúng 30 item_images, 30 items, 2 user demo và tăng catalog revision. Asset Cloudinary được giữ lại để tránh phá tham chiếu; muốn xóa 10 asset cần duyệt riêng, đối chiếu manifest/hash và chứng minh không còn item_images nào tham chiếu. Không thực hiện rollback production khi chưa có yêu cầu.

## Kiểm chứng sau seed (chưa thực hiện)

Đối chiếu 30 ID trả về với marker và API; kiểm tra total, 15 LOST/15 FOUND, 30 ảnh, GET detail của từng ID, keyword, type/category/location filter, public URLs. Mở website ở chế độ không đăng nhập để kiểm tra card/detail/search/filter. Đối chiếu số liệu/ID dữ liệu có trước và notifications/email/AI jobs trước/sau, xem backend error logs trong cửa sổ thao tác. Chỉ báo thành công khi 30 bài thực sự hiển thị ở `https://findit.io.vn/`.

## Kiểm thử cục bộ

`node --test database/tests/production-demo.test.js` kiểm tra số lượng, phân bổ, 7 cặp, ngày/nhãn và file PNG thực. `node database/scripts/test-isolated.js --all --suite=production-demo.integration.js` diễn tập trên MySQL mới, cổng ngẫu nhiên và datadir tạm, không dùng service local 3306/3311. Kiểm tra atomic rollback khi lỗi image INSERT, chống trùng, không sửa baseline/admin, không tạo AI/email/thông báo, từ chối dữ liệu demo đã thay đổi, chặn rollback khi có claim thật và rollback chỉ demo. Kết quả: 1 unit test + 9 integration assertions/subtests PASS. Đây không phải kết quả production.

## Git và triển khai

Không merge main hoặc tự deploy. Railway đang theo main. `client/vercel.json` thêm `git.deploymentEnabled` với duy nhất `feature/production-demo-items:false`, ngăn Git integration tạo preview khi push nhánh chuẩn bị. Các nhánh khác giữ mặc định. Đây là config trong nhánh code, không thay settings Railway/Vercel đang chạy. Cơ chế theo [tài liệu Vercel](https://vercel.com/docs/project-configuration/git-configuration#git.deploymentenabled). Kiểm tra commit checks/deployments sau push; không chạy lệnh deploy.
