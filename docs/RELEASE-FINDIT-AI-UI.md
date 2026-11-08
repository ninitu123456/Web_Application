# FindIt — candidate release UI + AI

> Follow-up on `feature/ai-production`: the code restriction that rejected all
> production suggestions has been replaced by explicit production configuration,
> separate API/worker validation and resumable backfill. See
> [AI production deployment](AI-PRODUCTION-DEPLOYMENT.md). The historical release
> verdict below is retained as evidence of c48e6d1, not current enablement guidance.
> Backup/restore, provider checks and Linux resource/E2E evidence remain blockers;
> this change grants no permission to deploy. AI notifications remain prohibited.

## Nguồn tích hợp

Nhánh local `release/findit-ai-ui` giữ cả `integration/ai-ui` (`f379011056951048129f03b06fed2d447a4a1ebd`) và main đã fetch (`a7cceb3`, bao gồm `f9fa62a3` moderation hide/restore và bản rút gọn UI copy). Lượt chuẩn bị không sửa main, push, deploy, truy cập DB Railway hoặc đổi biến production.

Ba conflict thật ở Item/Claim/Admin moderation repositories được xử lý bằng cách giữ cả visibility predicates/lock semantics từ main và catalog revision/invalidation từ AI. Không chọn ghi đè nguyên một phía. Không sửa migration đã công bố: 18 SQL blobs của main khớp nguyên bytes Git; đủ manifest30 từ bản tích hợp. Main18→release30 cần12 migration AI khi ledger thực đúng18; phải kiểm tra ledger production riêng, không suy từ commit backend.

## Các sửa lỗi release

- Test config suggestions dùng `tmpdir()` + `path.join()` thay Windows-only `C:\Temp`/backslash. Validator thật được regression bằng cả POSIX và Windows path semantics; đường dẫn cũ bị từ chối dưới POSIX. Đây là lỗi xác định được trong code có thể làm bước `npm test` trên Ubuntu thất bại. Log đầy đủ run42387311416 không truy cập được bằng public API (403 yêu cầu admin); không khẳng định đây là lỗi duy nhất của run khi chưa xem log. Không gỡ guard, disable test hoặc giảm coverage.
- Hide/restore tăng catalog revision và xóa candidate trong cùng transaction audit/notification; restore requeue các job đã complete/cancel/fail để dựng lại gợi ý, không lấy lease của worker đang processing.
- API owner eligibility và suggestion results lọc LOST/FOUND bị ẩn; frontend owner-hidden không mount panel AI. Worker lọc discovery và kiểm tra lại visibility sau Item locks, không ghi lại pair từ page đọc trước hide. Snapshot manifest/acquisition/delivery cùng tôn trọng visibility, revision và guard shadow/demo.
- Browser assertions theo copy mới `a7cceb3` cho recusal notice và chart summary; vẫn kiểm tra backend403, trạng thái lỗi, quyền xử lý và bảng dữ liệu, không thay UI để làm test qua.
- Audit phát hiện Sharp/libvips high advisories. Pin Sharp0.35.5, scoped override cho dependency của Transformers3.8.1; giữ nguyên model/revision/q8. Không chạy audit fix --force. Decoder tests và inference CLIP thật trên ảnh tổng hợp được chạy lại; production audit về0.

## Regression và evidence

Node24.22.2 portable từ nodejs.org, checksum chính thức được đối chiếu, cùng patch version với CI; không thay Node hệ thống. Dependency cài sạch bằng npm ci. Thực hiện backend/auth/database, full MySQL isolated integration, frontend Vitest, TypeScript/Vite, Chrome browser, unit+integration coverage và combined report-integrity, audit và Git diff checks. Kết quả cụ thể được ghi trong báo cáo kết thúc và `.cache/release-prep/`; coverage dùng output mới, không xóa/ghi đè evidence cũ. Chưa chạy GitHub Actions từ nhánh release vì chưa push.

Test mới `database/tests/release-upgrade.integration.js` dựng18 migration main nguyên bản, có users/data/audit ITEM_HIDDEN, nâng cấp12 migration còn lại và xác minh giữ nguyên rows/ledger, restore moderation vẫn hoạt động. `server/tests/ai-visual-visibility.integration.js` kiểm tra hide/restore, stale worker page, API filtering, snapshot/candidate invalidation, demo revalidation và dedup/shadow. Frontend regression bổ sung owner-hidden gate.

Kết quả trên mã cuối trước commit:176/176 backend/auth/database (160+7+9),327/327 MySQL integration,60/60 frontend trên9 file,19/19 Item/browser runner; TypeScript và Vite109 modules đạt. Unit/integration coverage và combined source/runtime/raw/report integrity đạt, không skip/cancel/fail; production audit0 vulnerabilities. Diễn tập encrypted recovery đạt5 nhóm, restore27 bảng cùng ledger/row hash; production startup AI-off đạt và0 AI notification. Không coi các lượt thử ban đầu thất bại khi dựng fixture/đổi UI copy là kết quả cuối. Evidence sau commit phải được đo mới để gắn đúng release SHA, không sửa manifest cũ để thay SHA.

Browser dùng HTTP/JWT/MySQL thật local, với synthetic SVG/vector/cloud adapters và fault fixtures; không upload Cloudinary hoặc gửi email/SMS/push. CLIP smoke riêng dùng ảnh tổng hợp local + model pin chính thức, không phải full Cloudinary E2E. Snapshot/demo chỉ ghi vào DB disposable. Build cuối phải trả mọi UI AI flag về false sau browser preview.

CLIP smoke với Sharp0.35.5/libvips8.18.7 sinh512 chiều, norm≈1, kết quả ảnh lặp deterministic. Một lượt Windows ảnh224px ghi nhận RSS≈283MiB, cold init≈39.6s, inference≈22.5/13.7ms. Các số này không phải cam kết latency/footprint trên Railway Linux, decode ảnh40MP, tải queue hoặc workload API.

## Production readiness và resource

Theo thông tin dashboard người dùng cung cấp: Vercel project findit-campus, production domain findit.io.vn, source main; backend Railway Web_Application, Node24.22.1, US West,2vCPU/1GB/1replica; MySQL Railway findit_db chưa có backup xác minh. Cần xác nhận lại active deployment/source/build/start/variables scopes trước bất kỳ thay đổi production nào. Repository chỉ có workflow test/coverage, không có workflow deploy; provider Git integrations nằm ngoài repo.

**Không push release branch** khi chưa xác nhận Railway branch filters/PR environments, Vercel branch/domain mappings và mọi deploy hook. Vercel main production được người dùng xác nhận; không suy ra branch release là an toàn chỉ vì tên branch. Không mở PR/merge main hoặc kích hoạt rerun/deploy trong lượt này.

Ba phạm vi được phân biệt:

1. **UI/backend với AI OFF:** có thể xin production approval sau khi backup/restore/schema/env/runtime staging và deployment triggers được xác minh. Không bỏ các bảng AI: unconditional catalog updates cần017/025 và đủ manifest30 cho code tích hợp.
2. **Suggestions + CLIP production:** chưa sẵn sàng. Giữ development/disposable guards; không bật NODE_ENV development hoặc giả datadir test trên cloud. Worker/API hiện từ chối production. Cần thiết kế rollout config được review, shared/private DB và Cloudinary access có scope, backfill/freshness/visibility tests, giới hạn process và approval riêng.
3. **AI automatic notifications:** bị cấm triển khai/bật. Shadow/demo cũng false trong production; không có validated production cosine threshold và không dùng threshold demo cho người thật.

Không chạy CLIP cùng API trong service1GB/2vCPU. Đề xuất process/service worker riêng, CPU concurrency1, pinned model, persistent cache, restart/lease/monitoring và graceful drain. Mức RAM tối thiểu phải lấy từ peak RSS/decode/backlog trên chính Linux image với headroom và memory limit;2GB là điểm bắt đầu benchmark hợp lý, không phải mức tối thiểu đã chứng minh hoặc bảo đảm đủ. Tính disk từ artifacts model pin thực + temp images/headroom, xác minh permission và cache cold-start. Web/API không phụ thuộc download model và không phải chịu peak memory worker. Không tạo service/volume/chi phí trong lượt này.

Production flags phải false: `AI_VISUAL_MATCHING_ENABLED`, `AI_VISUAL_SUGGESTIONS_ENABLED`, `AI_VISUAL_NOTIFICATION_PROCESSING_ENABLED`, `AI_VISUAL_NOTIFICATION_SHADOW_MODE`, `AI_VISUAL_NOTIFICATION_DEMO_ENABLED`, `VITE_AI_VISUAL_SUGGESTIONS_ENABLED`, `VITE_AI_VISUAL_SUGGESTIONS_PREVIEW_FIXTURE`. Giữ Official Match/Claim notifications hiện hữu; không tự bật email provider hoặc đổi secrets.

## Checkpoint trước deployment

1. Đối chiếu main mới nhất và candidate SHA, lấy log CI cũ nếu muốn xác nhận đầy đủ run cũ; sau push đã duyệt phải có CI Linux xanh trên SHA cuối. Không giả Windows regression là run GitHub đã sửa.
2. Xác minh source branch/deploy triggers/root/install/build/start/pre-deploy, active SHA, env names/scopes, CORS/HTTPS/proxy/IP trust và WebSocket/single replica. Không auto-migrate trong build/start. Startup health không tự chứng minh đủ schema.
3. Thực hiện [backup/restore procedure](PRODUCTION-BACKUP-RESTORE.md) với approval riêng. Backup chưa xác minh là blocker, kể cả code/test đạt.
4. Lập pending migrations từ ledger/checksum thực; diễn tập trên restore cô lập, không seed dữ liệu thật hoặc sửa lịch sử. Duyệt maintenance window, quyền DDL, lock/disk budget, RTO/RPO và rollback image/env trước migration.
5. Chỉ sau approval production cụ thể: freeze writers → backup đã restore-verify → pending migrations → schema verify → backend AI-off → frontend AI-off → smoke/monitor → mở lại writes. Rollback ứng dụng không down schema tùy tiện. Không kích hoạt worker/AI notifications trong release này.

**Verdict trước checkpoint: BLOCKED cho production bởi backup chưa xác minh và provider/CI Linux/deploy-trigger checks còn thiếu; repository preparation không được hiểu là quyền deploy.**
