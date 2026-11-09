# FindIt: tự động AI Visual Matching — báo cáo chuẩn bị production

Ngày kiểm tra: 09/11/2026, Asia/Saigon. Nhánh:
[`feature/ai-auto-matching-production`](https://github.com/ninitu123456/Web_Application/tree/feature/ai-auto-matching-production).
Không merge main, deploy, tạo service/volume tính phí, đổi biến production,
backfill production, gửi thông báo/email hoặc sửa dữ liệu production trong công việc này.

## A. Audit

Đã fetch origin trước khi tạo nhánh từ main `d151402` (PR #12).
`feat/ai-visual-matching` (`53d1e93`) và `feature/ai-production` (`7af45b5`)
đã là tổ tiên main; không cần cherry-pick hay xây lại AI. Nhánh demo
`feature/production-demo-items` tại `649794e` có bộ 30 fixture/10 ảnh dùng chung;
chỉ lấy key/type/image/pair làm fixture kiểm thử và ảnh vào cache bị Git ignore.
Không nhập các script seed/backup production hay ảnh lớn vào nhánh này.

Model thực tế: **Xenova/clip-vit-base-patch32**, revision
`4c1807b705b1d015fb032789cc4d221b23025a6f`, Transformers.js **3.8.1**,
ONNX **q8**, **CPU**, vector chuẩn hóa **512 chiều**. Đây là pretrained CLIP:
không cần huấn luyện; cần tải artifact công khai lần đầu, lưu volume cache và
giữ encoder trong RAM suốt đời worker. Không dùng API AI trả phí.

Luồng sẵn có được giữ nguyên:

1. Frontend tạo Item, rồi upload ảnh qua API. Cả LOST và FOUND đều được enqueue.
2. API lưu `item_images` và `ai_visual_jobs` trong **cùng transaction**. Queue row
   được chèn trước commit nhưng chỉ được worker khác claim **sau commit**;
   không dùng callback sau commit dễ mất sự kiện khi API chết giữa hai bước.
3. API trả kết quả mà không gọi/download model. Worker riêng polling queue MySQL;
   không có job thì không download ảnh/inference/quét catalog toàn bộ.
4. Worker đọc Cloudinary public ID được kiểm soát, sinh embedding, lưu binary
   float32 LE (2048 byte) trong `item_image_embeddings`.
5. So với các vector đã lưu của loại đối diện bằng cosine; nhiều ảnh lấy maximum.
   Phân trang 250 ảnh đối diện, lưu `ai_visual_candidates` theo cặp LOST/FOUND.
6. API owner đọc top 3 FOUND của LOST, kiểm tra ownership/visibility/status,
   account active, model revision và mọi ảnh/job hiện tại hoàn tất.
   UI polling 10 giây khi xử lý, 30 giây khi ready/empty/error phân tích.
   Một FOUND mới có thể cập nhật gợi ý trên LOST cũ. Panel hiện tại dành cho
   **chủ bài LOST**; không bổ sung panel đối xứng cho chủ FOUND trong thay đổi này.

Không có threshold xác nhận danh tính; endpoint hiện tại xếp hạng cosine top 3.
Giữ nguyên thuật toán/threshold và thông báo điểm tương đồng không chứng minh
quyền sở hữu. Không tự tạo Match/Claim, xác nhận Claim hay chuyển RETURNED.

Queue có unique `(image_id,model_id,model_revision)`, lease token 2 phút,
heartbeat lease 30 giây, retry mặc định 3, backoff tối đa 300 giây và stale-lease
fencing. Restart lấy lại job hết lease; hết số lần thử giữ FAILED để quan sát,
không xóa mất job. Đây là at-least-once processing với ghi kết quả idempotent.
API startup kiểm tra schema khi bật AI. Nhánh gốc vẫn có hành vi best-effort
đối với lỗi SQL enqueue không phá transaction: log `ai_visual_job_enqueue_failed`
và giữ upload thành công; lỗi transaction/deadlock làm rollback + bù Cloudinary.
Không thể cam kết không có ảnh thiếu job nếu queue table bị hỏng giữa lúc chạy.
Cần alert log này và phục hồi bằng backfill giới hạn đúng Item sau khi sửa lỗi;
không gọi đó là bảo đảm exactly-once cho mọi lỗi database.

## B. Thay đổi thực hiện

- Tái sử dụng embedding đúng image/model/revision và public ID khi retry/rebuild;
  kiểm tra 512 chiều, độ dài blob, finite/unit norm. Vector hỏng sẽ inference lại.
- Xóa một ảnh chỉ xóa vector của ảnh đó, giữ vector ảnh còn lại và rebuild pairs.
- Giới hạn native ONNX intra/inter-op threads = 1 cùng concurrency job = 1.
- Watchdog toàn job mặc định 120 giây: dừng process nếu native inference treo,
  không dùng Promise.race để bỏ lại inference chạy nền. Restart khôi phục lease.
- Log per-job RSS/reuse và heartbeat CPU/RSS mỗi 60 giây.
- Backfill hỗ trợ lặp `--item-id=<ID>` (tối đa 1000) để giới hạn đợt demo đã duyệt.
- Thêm CLI benchmark ảnh cục bộ, không load dotenv/kết nối DB/Cloudinary.

File runtime thay đổi: `.env.example`, `package.json`,
`server/ai-visual/{backfill-main,backfill,clip-encoder,config,main,repository,worker}.js`,
`server/repositories/item.repository.js`, `server/services/item.service.js`.
File runtime mới: `server/ai-visual/{benchmark,job-watchdog}.js`.
Test: `server/tests/ai-auto-matching.{test,integration}.js`,
`server/tests/fixtures/ai-demo.json`, `server/tests/ai-production.integration.js`,
`server/tests/ai-visual.test.js`. Tài liệu: báo cáo này và
`docs/AI-PRODUCTION-DEPLOYMENT.md`. Không sửa schema/migration/lockfile/frontend.

## C. Kiểm thử

Windows, Node v24.21.0. MySQL executable từ bản cài 8.0, nhưng mỗi lần runner
tạo datadir/port tạm, xác minh live `@@datadir`/`@@port`; không dùng service cài sẵn
hay `.env` production. Runner dừng và xóa datadir của chính nó sau test.

| Kiểm tra | Kết quả |
| --- | --- |
| `npm test` | 185 pass: 169 backend + 7 auth + 9 database |
| `npm run test:integration:isolated` | 338 pass, 0 fail/skip |
| Demo 30 bài (15 LOST, 15 FOUND) | 7/7 cặp kỳ vọng nằm trong top 3 |
| Queue visibility/rollback | Không claim trước commit; rollback không để lại job |
| Retry/restart | Lease cũ bị chặn; worker mới dùng vector đã lưu |
| Thêm/xóa ảnh | Giữ vector ảnh còn lại, rebuild không inference lại |
| Chống trùng | Enqueue lặp không thêm job; pairs không trùng theo ảnh |
| Không tác dụng phụ | Count Claim/Match/notification/email outbox không đổi do AI |
| Frontend `npm test` | 63/63 |
| Frontend browser runner | 19/19, HTTP/JWT/MySQL/Chrome cục bộ |
| Frontend production build | TypeScript + Vite pass, đã build lại sau browser test |
| `git diff --check`, syntax entrypoints | Pass |

Integration/browser dùng storage và model **mock**, còn DB/transaction/lease,
services và API là thật. 7/7 là kiểm tra plumbing với vector fixture, **không phải
độ chính xác model**. Benchmark dưới đây gọi CLIP thật trên 30 ảnh demo cục bộ
(10 ảnh dùng chung), không chèn score/candidate giả vào production. Bộ demo có
ảnh trùng nên không thể dùng để kết luận precision/recall trên đồ vật thật.

## D. Benchmark và staging còn chờ

`AI_VISUAL_MATCHING_CACHE_DIR=<absolute workspace cache>`;
`npm run ai-visual:benchmark -- <30 local demo paths>`.
Các số dưới đo decoder + CLIP, không gồm download Cloudinary, DB hay latency UI.
Peak RSS là process high-water mark (`process.resourceUsage().maxRSS`), không phải
tổng container/cgroup. CPU time gồm mọi thread trong process.

| CLIP thật, 30 ảnh, ONNX 1 luồng | Cache trống | Cache đã tải |
| --- | ---: | ---: |
| Khởi tạo model | 74.179 s | 0.213 s |
| Toàn bộ process benchmark | 76.522 s | 2.497 s |
| CPU time tổng | 6.235 s | 3.343 s |
| Peak RSS | 379.94 MiB | 375.13 MiB |
| Median decode + inference/ảnh | 71.43 ms | 67.99 ms |
| p95 decode + inference/ảnh | 91.91 ms | 84.12 ms |

Chưa benchmark Linux/Railway: Docker daemon local không chạy; không tự tạo
staging trả phí. **1 vCPU / 1 GiB RAM là cấu hình thử staging đề xuất**, chưa phải
minimum đã chứng minh. Không tự nâng cấp nếu OOM. Chạy cold/warm/40MP ảnh giới hạn,
queue backlog, idle CPU, kill/SIGTERM/restart trong container Linux với cgroup
1 GiB trước production; nếu vượt, báo số đo và xin duyệt cấu hình tối thiểu mới.
Raw local evidence (ignored): `.cache/ai-auto-{unit-final,integration-final,browser}.log`,
`.cache/ai-auto-benchmark-{cold,serial}.json`.

## E. Cấu hình và chi phí trình phê duyệt

Dùng bảng biến đầy đủ trong [runbook](AI-PRODUCTION-DEPLOYMENT.md).
Worker riêng: root repository; build `npm ci --omit=dev`; start
`npm run worker:ai-visual`; replica 1; restart **ALWAYS**; không cron/serverless
sleep/public domain/HTTP healthcheck. Giám sát heartbeat, job completions,
FAILED và queue age qua log/DB. Mount volume `/data`, cache
`/data/findit-ai/model-cache`. Build env `ONNXRUNTIME_NODE_INSTALL_CUDA=skip`.

API: `NODE_ENV=production`, `AI_VISUAL_MODE=production`,
`AI_VISUAL_SERVICE_ROLE=api`, `AI_VISUAL_MATCHING_ENABLED=true`,
`AI_VISUAL_SUGGESTIONS_ENABLED=true`, `AI_VISUAL_MATCHING_CLOUD_NAME` trùng cloud upload.
Worker: cùng mode/NODE_ENV, role `worker`, matching=true, suggestions=false,
cloud name, cache path, concurrency=1, poll=1000, max attempts=3,
**`AI_VISUAL_MATCHING_JOB_TIMEOUT_MS=120000`**. `DB_HOST/PORT/NAME/USER/PASSWORD`
cùng MySQL private network, quyền riêng phù hợp; không đưa credentials DB lên frontend.
Worker không cần Cloudinary write key/secret hay JWT/email credentials.
Frontend build `VITE_AI_VISUAL_SUGGESTIONS_ENABLED=true`, preview fixture=false.
Ba cờ notification AI luôn false; `FINDIT_ISOLATED_DATADIR` phải absent trên Railway.

Giá container Railway kiểm tra ngày báo cáo theo
[Railway pricing plans](https://docs.railway.com/pricing/plans): RAM $10/GB-tháng,
CPU $20/vCPU-tháng, volume $0.15/GB-tháng, egress $0.05/GB.
Công thức worker = 10 × RAM trung bình (GB) + 20 × CPU trung bình (core)
+ 0.15 × volume (GB) + network. Ví dụ RAM 0.4 GB, CPU 0.02 core, volume 1 GB
cho **$4.55/tháng** trước egress/thuế. Dự trù **$4–8/tháng tăng thêm** cho worker
ít tải, cần xác minh idle/cgroup usage trên staging. Trường hợp tiêu thụ liên tục
1 GB + 1 CPU + 1 GB volume là khoảng $30.15/tháng trước network.
Không tính lại API/MySQL/Vercel hiện có; plan minimum/included credits áp dụng cho
tổng project/account, không phải phí cố định riêng mỗi worker. Đây là ước tính,
không phải giới hạn hóa đơn hay đề nghị tự nâng gói.

## F. Rollout, demo và rollback (chưa thực hiện)

1. Duyệt staging scope/chi phí; kiểm tra Linux CI đúng SHA, private network và
   branch deploy triggers, backup/restore và ledger production. Không tự suy từ
   nhánh demo rằng schema production đã đúng.
2. Branch này không thêm migration. So ledger với manifest 30 migration; chỉ apply
   pending migration trong cửa sổ được duyệt, không setup/seed/xóa dữ liệu.
3. Thử staging với Cloudinary synthetic đã duyệt, giới hạn 1 GiB/1 CPU, đo backlog,
   peak memory/idle CPU/download/restart; xác nhận UI owner và không notification.
4. Trình lại kết quả thực tế, costs, exact env/service/SHA để duyệt production.
5. Sau duyệt: đưa code vào release được duyệt, bật enqueue và worker, kiểm tra một
   LOST/FOUND synthetic; bật owner suggestions API/UI. Bài mới tự xử lý, không nút AI.
6. Backfill demo cần duyệt riêng: xác định đúng 30 item ID bằng manifest/marker và
   owner đã kiểm chứng (không title prefix), lưu số lượng baseline. Truyền đủ 30
   `--item-id=...`; không chạy unscoped CLI. Kiểm tra 30 job/embeddings, 7 cặp và
   top-3 với tie do ảnh dùng chung; không đổi threshold để ép kết quả. Rerun mặc định
   không inference ảnh đã xong. Retry FAILED dùng cùng scope + `--retry-failed`.
7. Rollback: dừng worker; API matching/suggestions=false; frontend AI flag=false
   và build lại. Giữ bảng/vector/job/volume và business/demo data; không drop bảng
   hay downgrade ledger. Sau sửa lỗi mới chạy scoped retry/rebuild và bật lại.

Trạng thái: A/B/C hoàn tất cục bộ; D chưa chạy trên Railway; E/F chờ phê duyệt
và số đo staging. Tính năng chưa được bật trên website production bởi nhánh này.
