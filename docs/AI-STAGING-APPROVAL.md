# FindIt AI — kiểm tra miễn phí và đề nghị staging

Ngày 09/11/2026 (Asia/Saigon). Chỉ kiểm tra control-plane metadata, source,
billing metadata và CI; chưa tạo/deploy service, volume, database, sandbox hay
Cloudinary asset. Chưa mở kết nối database production, chạy migration, bật cờ
production hoặc chạy backfill. Không có chi phí staging mới do lượt chuẩn bị này.

## 1. Môi trường đã xác minh

| Đối tượng | Giá trị |
| --- | --- |
| Railway workspace | Kinnnn's Projects — `e32afbc2-46d9-4d40-9d73-69ea3d497572` |
| Project | awake-illumination — `66fa13b8-9b28-4ccc-a9bd-0b3f6c187a21` |
| Environment production (cấm thay đổi) | `c9320496-f1b1-4730-b22b-777d7125b06d` |
| Environment ai-staging (đã tồn tại) | `f6fc555e-48e8-4518-a14c-9971539ca6ce` |
| Production API service (cấm dùng cho staging) | Web_Application — `5ce2c6ec-9081-4e98-86be-9d0b4406fea5` |
| Production MySQL service (cấm truy cập từ staging) | MySQL — `a3c952f3-1ea4-413b-8bb8-566fcb5a3271` |
| Production code đang chạy | main `d1514024f888133e6bd534643215b2644f76e39e` |
| Source được yêu cầu kiểm tra | `427a3006bac5b77495d5e986a925f8432306cc90` |
| Railway project subscriptionType | `trial` tại thời điểm kiểm tra; không tự nâng gói |

Metadata hiện tại: production API có trigger GitHub duy nhất cho `main`,
`checkSuites=true`; pre-deploy chạy `npm run db:migrate`. Project `prDeploys=false`.
`ai-staging` không có service instance, deployment trigger, shared variable hay
service variable trong environment config. Không duplicate production environment.
Production matching/suggestions/notification AI đều đang false, không thay đổi.

Staging có volume **đã tồn tại**, instance `b01c72e5-d6db-45ed-8c89-fc63260d1caf`,
volume `4592e68f-88b7-4c62-b28b-5f8271be1e02`, 500 MB, chưa gắn service,
tạo 08/11/2026 và có khoảng 155 MB dữ liệu theo metadata. **Không mount, đọc,
tái sử dụng hay xóa volume này** vì chưa biết provenance. Nó có thể tiếp tục
phát sinh phí volume có sẵn; không quy khoản đó thành chi phí staging mới.

## 2. Đối chiếu tài liệu và Linux CI

[Runbook production](AI-PRODUCTION-DEPLOYMENT.md) và
[báo cáo gốc](AI-AUTO-MATCHING-PRODUCTION.md) thống nhất model pinned q8/CPU,
worker riêng, MySQL queue, feature flags opt-in và không thông báo AI tự động.
Đã sửa dòng runbook cũ đề xuất benchmark 2 GiB: thử **1 vCPU/1 GiB** trước,
không tự tăng khi lỗi. Mức $4–8/tháng trong báo cáo cũ chỉ tính worker ít tải,
không phải tổng chi phí tạo staging API/MySQL/volume mới.

[Linux CI baseline](https://github.com/ninitu123456/Web_Application/actions/runs/42579663619)
ở SHA 427a300: unit thành công, integration thất bại, coverage-integrity skipped.
Test 30 demo bị `Query inactivity timeout` trong bước UPDATE thu hồi expired lease
khi upload transaction chưa commit. SELECT claim có SKIP LOCKED chưa bảo vệ UPDATE
trước đó. Bản sửa trên cùng nhánh chọn batch tối đa 100 expired job bằng
`FOR UPDATE SKIP LOCKED`, rồi UPDATE đúng primary keys đã khóa. Không sửa schema,
threshold, dữ liệu hay giới hạn timeout để che lỗi. Cần CI Linux xanh của SHA sửa
trước provisioning; không triển khai baseline 427a300 như một bản đã đạt Linux CI.
Local sau sửa: 185 unit và 338 integration pass, không skip.

## 3. Tài nguyên đề nghị duyệt — chưa tạo

Chỉ tạo trong project/environment ai-staging nêu trên, region sfo, replica 1.
Tên đề xuất chưa phải service ID; ghi lại ID sau khi được duyệt và tạo.

| Service mới | Giới hạn CPU / RAM | Volume mới | Khởi chạy |
| --- | --- | --- | --- |
| `ai-stage-worker` | **1 vCPU / 1 GiB**; job concurrency 1 | 500 MB tại `/data` | `npm run worker:ai-visual` |
| `ai-stage-api` | 0.25 vCPU / 0.5 GiB | Không | `npm start` |
| `ai-stage-mysql` | 0.5 vCPU / 0.5 GiB | 500 MB tại `/var/lib/mysql` | MySQL 8 pinned digest, buffer pool 128 MiB, performance_schema off |

Không dùng Railway sandbox/VM (đơn giá khác container), Vercel deploy, GPU,
Redis, email provider hay service frontend trả phí. Frontend build từ cùng SHA,
chạy Vite preview cục bộ `localhost:4173`, browser/Playwright gọi API staging HTTPS;
không dùng mock suggestions hay preview fixture. Chỉ CORS origin này được phép.

Build API/worker `npm ci --omit=dev`, `ONNXRUNTIME_NODE_INSTALL_CUDA=skip`, root repo.
Deploy thủ công từ archive Git đúng SHA đã qua Linux CI, loại toàn bộ `.env`,
`.cache`, dump, credentials, user files. Không connect GitHub auto-deploy cho
service staging; không thay source/trigger của service production. Trước deploy,
verify archive hash, service/environment ID, source tree, limits và runtime Linux.

**Thời lượng:** tối đa 6 giờ từ tài nguyên đầu tiên bắt đầu chạy; chỉ thực hiện
khi có thể theo dõi liên tục và dọn dẹp trong cửa sổ này. Đặt absolute UTC deadline
cho launcher cả ba service trước start: khi hết hạn thoát 0, không bị restart
lại sau deadline; cần kiểm tra launcher trước dùng. ON_FAILURE giới hạn 3 lần
trong thời gian test; không ALWAYS vô hạn trong staging có ngân sách. Dừng ngay
khi worker OOM/không ổn định, không tự tăng CPU/RAM/replica hay nâng plan.
Nếu provider không cho áp giới hạn hoặc không xác minh được deadline thì không start.

## 4. Ngân sách và dọn dẹp đề nghị duyệt

Theo [giá container Railway](https://docs.railway.com/pricing/plans), dùng mức
$10/GB-tháng RAM, $20/vCPU-tháng CPU, $0.15/GB-tháng volume, $0.05/GB egress.
Tổng caps là 1.75 vCPU + 2 GiB RAM và 1 GB volume mới. Nếu dùng hết caps liên tục
6 giờ thì compute/storage xấp xỉ **$0.48** (trước thuế/egress). Dành tối đa 1 GB
egress Railway ($0.05), số request/asset synthetic nhỏ; dự trù tổng **$0.10–0.60**,
đề nghị ngân sách tối đa cho đợt này **$1.00 trước thuế**, trước áp credits.
Không mua/nâng subscription, không tiêu vượt credit/gói nếu platform yêu cầu nâng.

Giá thực tế chưa đo vì chưa có service staging. Metadata billing hiện đã chụp
baseline riêng trong ignored cache; billing period hiện tại kết thúc lúc
07:00 ngày 10/11/2026 Asia/Saigon. Nếu cửa sổ test qua mốc đó, thu evidence cả
hai billing periods; không lấy chênh tổng workspace làm phí staging vì production
và volume cũ vẫn có chi phí riêng. Lưu usage theo các ID service/volume mới.

Workspace hiện không có compute hard limit. Agent Usage $1.50 hiện hữu không
giới hạn container compute. Theo [Railway cost control](https://docs.railway.com/pricing/cost-control),
hard limit compute workspace có thể tắt cả production: **không đặt/đổi limit chung**.
$1.00 là ngân sách vận hành được kiểm soát bằng caps, deadline và theo dõi, không
phải hard cap hóa đơn riêng do Railway bảo đảm. Metric billing có thể chậm; ngừng
tạo tải khi attributable usage tới $0.50 hoặc chạm deadline/OOM/lỗi cô lập.

Approval này cần bao gồm dọn dẹp đúng ba service và hai volume mới: xuất kết quả
aggregate không secrets, dừng deployment, xóa service/volume theo ID allowlist,
xác nhận service không chạy và volume không còn tính phí mới. Xóa đúng asset
Cloudinary đã upload theo manifest run; không delete folder hàng loạt. Nếu cleanup
thất bại, báo ngay phần còn lại và phí volume tiếp tục; không coi stop service là
đã ngừng mọi phí storage. Giữ nguyên environment, volume cũ và production.

## 5. Cô lập database và Cloudinary

- Không restore backup/dump production, không đọc bảng hay lấy 30 row thật.
  Tạo MySQL instance mới, credentials mới; migrate/seed synthetic chỉ sau khi
  service ID + environment ID + private host khớp allowlist vừa tạo.
- Code hiện bắt `DB_NAME=findit_db` trong production AI mode. Staging vẫn dùng
  tên database đó trên **instance khác**; tên DB không phải bằng chứng cô lập.
  `NODE_ENV=production`/`AI_VISUAL_MODE=production` ở đây là chế độ runtime, không
  chọn Railway environment production. Không giả lập local isolation datadir.
- `DB_HOST/PORT/USER/PASSWORD` chỉ tham chiếu `ai-stage-mysql` cùng environment;
  không copy literal production password/public URL/shared variable. Không mở
  public TCP proxy DB. Trước migration ghi staging `@@server_uuid`, DB, version,
  hostname vào evidence từ instance mới; xác minh env/service metadata trước SQL.
- [Private network Railway](https://docs.railway.com/networking/private-networking/how-it-works)
  cô lập theo environment; điều đó không chặn ai cố dùng public endpoint và secret
  production. Vì vậy kiểm tra cả reference và env resolved đã lọc, không chỉ hostname.
- Cần **Cloudinary cloud staging riêng** và credentials staging được cấu hình
  qua kênh secret, không gửi secret vào chat/repo. Chưa xác minh cloud staging nào;
  đây là checkpoint còn thiếu trước provisioning. Không copy Cloudinary write key
  của production. Worker chỉ nhận cloud name công khai, không key/secret.
- Chỉ ảnh synthetic từ repo/demo cache; upload tối đa 35 asset mới, UUID public ID
  đúng pattern `findit/items/<UUID>`. Prefix folder `staging/...` không tương thích
  worker hiện tại nên dùng cloud riêng để cách ly. Manifest ghi đúng ID/hash,
  tổng input dưới 150 MB, dùng free quota sẵn có; không nâng gói Cloudinary.
- Tài khoản `.invalid`, JWT riêng, không credentials người thật; không RESEND key,
  không external email worker; cả ba cờ AI notification false. Mọi endpoint auth,
  CORS và frontend URL đều staging/local, không domain/API production.

## 6. Test thực tế sau duyệt và xác minh

| Thử nghiệm | Evidence / tiêu chí |
| --- | --- |
| Linux caps | `/sys/fs/cgroup` memory.max, cpu.max; runtime image SHA, kernel/Node, replica 1 |
| Cold start | Empty new model cache; pinned model/revision; download bytes, load time, memory.peak/cgroup usage |
| Warm start | Restart với volume còn cache; không tải model lại từng ảnh; đo init và inference p50/p95 |
| Idle ≥15 phút | Queue rỗng: 0 inference/download; CPU mean/p95, RAM, DB polling/heartbeat |
| Real Cloudinary | Synthetic upload qua staging API, response timing, public ID allowlist, HTTP timeout/size/decode errors |
| Real matching | 30 bài fixture 15 LOST/15 FOUND; CLIP thật, 7 cặp mong đợi, score/top-3 thực, zero same-type pairs |
| Posting automatic | Ảnh/job commit trước worker claim; API không chờ inference, FOUND mới cập nhật LOST cũ |
| Retry/restart | Lỗi download kiểm soát, max 3/backoff; SIGTERM/forced kill, expired lease, stale-token rejection, cache reuse |
| Timeout | Fault injection **chỉ staging**, watchdog process exit; bounded restart, no parallel runaway inference |
| Image changes | Thêm/xóa/thay ảnh, giữ vector không đổi, không duplicate jobs/candidates |
| Frontend | Login owner LOST: processing → ready, gợi ý thực; user khác 404; empty/error/polling, screenshot/video |
| No side effects | Không email ngoài, không auto-Claim/RETURNED; không truy cập production |
| Chi phí/cleanup | Usage theo ID tài nguyên mới, window timestamps, cleanup inventory; delayed final usage báo provisional |

Không dùng 7/7 ảnh trùng để kết luận precision/recall hay ownership. Không tự đổi
threshold để ép đạt test. Nếu crash/OOM hoặc real E2E sai, giữ kết quả thất bại,
dừng worker, kết thúc đợt và báo cáo trước khi đề xuất thay cấu hình.

## 7. Production sau này — không nằm trong approval staging

Chỉ lập đề nghị sau số đo Linux/Cloudinary/UI thực đạt. Thứ tự: xác minh source SHA,
backup/retention và restore rehearsal riêng đã duyệt; kiểm tra ledger/manifest và
pending migration, không seed production; chuẩn bị release AI-off và rollback
image/env; deploy/bật enqueue-worker/UI từng bước sau xác nhận riêng; canary
synthetic được duyệt; monitoring queue age, failed, expired lease, job latency,
Cloudinary errors, RSS/OOM, CPU và enqueue failure logs.

Backup/restore không được thực hiện bằng staging approval này. Nếu migration đã
đủ 30 manifest thì không chạy lại schema changes tùy tiện. Nhánh không thêm SQL.
Mỗi bước rollout có checkpoint và dừng khi auth/posting/Claim/Match/chat lỗi.
Rollback: dừng worker, matching/suggestions/UI flags=false trong lần thay đổi
được duyệt; giữ queue/vectors/data/ledger, không drop hay delete demo.

Backfill production duyệt riêng: lấy **đúng 30 ID** từ manifest demo + marker/owner
đã xác minh, không tìm bằng title prefix; hash allowlist/baseline; chạy scoped
`--item-id=...` với đủ 30 ID, không unscoped CLI; kiểm tra fresh embeddings, actual
scores và 7 expected pairs với tie; không re-infer vector hợp lệ. Không thu gom
bài người dùng thật; retry/rebuild giữ cùng allowlist. Hiện chưa chạy bước nào.

**Điểm dừng:** chờ duyệt ba service + hai volume mới, tối đa 6 giờ/$1.00,
cleanup đúng ID và Cloudinary staging riêng. Chưa có kết quả Railway benchmark
hay phí staging thực tế để kết luận production-ready.
