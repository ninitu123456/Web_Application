# FindIt — Triển khai

Tài liệu mô tả kiến trúc production, biến môi trường, tính năng AI, migration, sao lưu và khôi phục.

Website: **<https://findit.io.vn>**. Mỗi lần merge vào `main`, GitHub Actions chạy kiểm thử:

- Railway (API và AI worker) bật "Wait for CI": chỉ build và triển khai lại khi toàn bộ kiểm thử đạt.
- Vercel build frontend ngay khi có commit, không chờ GitHub Actions. Bản build vẫn tự kiểm tra cấu hình `VITE_*` và từ chối khi sai.
- Nhánh khác `main` chỉ tạo bản Preview trên Vercel. Preview dùng `VITE_API_BASE_URL=/api` nên không gọi tới API và database production.

Toàn bộ service Railway chạy ở vùng US West (California, Mỹ).

## Kiến trúc

| Thành phần | Nền tảng | Vai trò |
| --- | --- | --- |
| Frontend (`client/`) | Vercel | Build Vite tĩnh, SPA fallback về `index.html`, tên miền `findit.io.vn` |
| API (`server/`) | Railway: service `Web_Application` | Express + Socket.IO. Chạy `npm run db:migrate` trước khi deploy, healthcheck `/api/health` |
| AI worker (`server/ai-visual/`) | Railway: service `ai-visual-worker` | Chạy `npm run worker:ai-visual`, xử lý hàng đợi ảnh bằng CLIP trên CPU. Cache model trên volume `/data`, restart policy `ALWAYS` |
| Cơ sở dữ liệu | Railway: MySQL 8 | Dữ liệu nghiệp vụ, hàng đợi AI, embeddings |
| Sao lưu | Railway: service `db-backup` | Cron mỗi ngày 03:00 (giờ Việt Nam): `mysqldump` vào volume `/backup`, sau đó restore thử để xác minh bản sao lưu |
| Ảnh | Cloudinary | Lưu ảnh bài đăng; DB chỉ lưu public ID |
| Email | Resend | Đặt lại mật khẩu và thông báo qua email |

API và worker dùng chung một commit và một database. Worker không mở cổng HTTP và không cần secret JWT, email hay quyền ghi Cloudinary.

## Biến môi trường

Chỉ liệt kê tên biến. Giá trị nằm trong dashboard Vercel và Railway, không commit vào repository. Mẫu cho môi trường local nằm ở `.env.example` và `client/.env.example`.

| Biến | API | Worker | Vercel |
| --- | --- | --- | --- |
| `NODE_ENV` | `production` | `production` | |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | ✓ | ✓ | |
| `JWT_SECRET`, `JWT_EXPIRES_IN`, `CORS_ORIGINS`, `FRONTEND_URL` | ✓ | | |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | ✓ | | |
| `RESEND_API_KEY`, `EMAIL_FROM` | ✓ | | |
| `AI_VISUAL_MODE` | `production` | `production` | |
| `AI_VISUAL_SERVICE_ROLE` | `api` | `worker` | |
| `AI_VISUAL_MATCHING_ENABLED` | `true` | `true` | |
| `AI_VISUAL_SUGGESTIONS_ENABLED` | `true` | `false` | |
| `AI_VISUAL_MATCHING_CLOUD_NAME` | trùng cloud Cloudinary | trùng cloud Cloudinary | |
| `AI_VISUAL_MATCHING_CACHE_DIR` | | `/data/findit-ai/model-cache` | |
| `AI_VISUAL_MATCHING_CONCURRENCY` | | `1` | |
| `AI_VISUAL_NOTIFICATION_*` (3 cờ) | `false` | `false` | |
| `VITE_API_BASE_URL` | | | Production: URL HTTPS của API, kết thúc bằng `/api`. Preview: `/api` |
| `VITE_AI_VISUAL_SUGGESTIONS_ENABLED` | | | `true` |
| `VITE_AI_VISUAL_SUGGESTIONS_PREVIEW_FIXTURE` | | | `false` |

File `.npmrc` ở gốc repository đặt `onnxruntime-node-install-cuda=skip` để `npm ci` (CI, API, worker) không tải thư viện GPU: bản tải đó không còn tồn tại (404) và FindIt chỉ chạy CLIP trên CPU. Biến `VITE_*` được đóng vào bundle công khai nên không bao giờ chứa secret.

## Gợi ý bằng hình ảnh (AI)

- Model: `Xenova/clip-vit-base-patch32` (pretrained, không cần huấn luyện), chạy CPU, vector 512 chiều. Pin revision `4c1807b705b1d015fb032789cc4d221b23025a6f`.
- Upload ảnh tạo job trong cùng transaction với ảnh. Worker lấy job, sinh embedding, rồi so cosine với các bài loại đối diện (LOST ↔ FOUND).
- Chủ bài thấy mục "Gợi ý cho bạn" trên trang chi tiết. Điểm tương đồng chỉ để xếp hạng, không chứng minh quyền sở hữu, và không tự tạo Match hay Claim.
- Job lỗi được thử lại tối đa 3 lần. Watchdog 120 giây cho mỗi job; nếu worker treo, Railway khởi động lại và job được nhận lại khi lease hết hạn.

Lệnh vận hành, chạy bằng biến môi trường của worker:

```bash
npm run ai-visual:backfill                    # xếp hàng các ảnh cũ chưa có embedding
npm run ai-visual:backfill -- --retry-failed  # thử lại các job FAILED
npm run ai-visual:backfill -- --rebuild       # tính lại toàn bộ sau khi đổi model hoặc tắt AI một thời gian
```

Tắt khẩn cấp:

1. Dừng worker.
2. Đặt `AI_VISUAL_MATCHING_ENABLED=false` và `AI_VISUAL_SUGGESTIONS_ENABLED=false` cho API.
3. Build lại frontend với `VITE_AI_VISUAL_SUGGESTIONS_ENABLED=false`.

Không xóa bảng AI. Bật lại theo thứ tự ngược và chạy `--rebuild`.

## Migration

`npm run db:migrate` chỉ áp dụng migration còn thiếu theo manifest, kiểm tra checksum và dừng khi schema lệch. Trên production không chạy `db:setup` hay `db:seed`; hai lệnh này tự từ chối khi `NODE_ENV=production`. Không sửa hay đổi tên file migration đã phát hành. Thay đổi schema luôn đi bằng file migration mới.

Migration hiện có 36 file. Bản cập nhật giao diện v3 thêm 6 bảng (019–024): `item_verification_questions`, `claim_answers`, `saved_items`, `item_views`, `contact_messages`, `claim_handovers`. Các bảng này chỉ thêm mới, không sửa bảng cũ; Railway tự chạy `npm run db:migrate` (pre-deploy) trước khi bật bản API mới.

## Sao lưu và khôi phục

Service `db-backup` chạy hằng ngày:

1. Dump `findit_db` (`--single-transaction`, kèm routines, triggers và events).
2. Khởi động một MySQL tạm và restore bản dump vào đó.
3. Kiểm tra dữ liệu đã restore để xác nhận bản sao lưu dùng được, rồi mới giữ file trên volume `/backup`.

Log mỗi lần chạy kết thúc bằng `RESTORE_VERIFIED` nếu thành công.

Khôi phục khi cần:

1. Tạm dừng API và worker.
2. Restore file dump mới nhất vào MySQL.
3. Chạy `npm run db:migrate` để kiểm tra ledger.
4. Bật lại API, rồi bật worker.

Ảnh trên Cloudinary không nằm trong bản dump.

## Kiểm tra sau triển khai

- `GET /api/health` trả 200.
- Trang chủ, Khám phá, đăng nhập, đăng bài có ảnh và nhắn tin hoạt động trên máy tính (giao diện điện thoại của bản v3 chưa hoàn thiện).
- Lưu tin, gửi yêu cầu có câu hỏi xác minh, hẹn lịch bàn giao trong Tin nhắn, form Liên hệ và trang Quản trị (tổng quan, hộp thư liên hệ, khiếu nại) hoạt động.
- Log worker có heartbeat mỗi 60 giây, và job của ảnh mới chuyển sang hoàn tất.

## Hạn chế hiện tại

- Bản sao lưu nằm trên volume Railway cùng vùng với database, chưa có bản sao ở nơi khác.
- Ảnh trên Cloudinary không được sao lưu riêng.
- Server đặt ở Mỹ nên độ trễ với người dùng tại Việt Nam cao hơn. Railway có vùng Singapore; chuyển vùng cần di chuyển volume MySQL và có thời gian gián đoạn.
