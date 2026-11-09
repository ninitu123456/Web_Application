# FindIt — báo cáo đồng bộ và kiểm toán ngày 09/11/2026

**Kết luận: PROJECT NEEDS FIXES.** Mã local sau sửa vượt qua toàn bộ regression đã chạy. Hai lỗi nghiệp vụ/bảo mật phát hiện trong lượt này đã được sửa và có regression test. Chưa đủ bằng chứng để xác nhận sẵn sàng production: CI frontend còn thiếu, cấu hình hạ tầng/proxy, backup/restore và hiệu năng production chưa được xác minh. Đây không phải kết luận hệ thống production đang hỏng.

1. **Nhánh và HEAD ban đầu**

   `release/findit-ai-ui`, HEAD `c48e6d12e16cab0efe123774df8107e94197a656`; working tree sạch. `origin/release/findit-ai-ui` cùng SHA sau fetch: release đã hiện diện trên remote trước lượt này. `git log --branches --not --remotes` không có commit chưa được remote nào chứa. Không có AGENTS.md trong repository hoặc các thư mục cha được kiểm tra.

2. **Main mới nhất đã xác minh**

   `origin/main`: `d1514024f888133e6bd534643215b2644f76e39e`, commit ngày 08/11/2026 11:53:54 +07, `Merge pull request #12 from ninitu123456/feature/ai-production`. Đã fetch đầu và cuối lượt đồng bộ; SHA main không đổi. Main chứa toàn bộ release, đi trước release 4 commit.

   So sánh các nhánh local với origin/main sau fetch, theo thứ tự số commit riêng local / số commit chỉ có ở main:

   | Nhánh local | Riêng local | Chỉ ở main |
   | --- | ---: | ---: |
   | chore/frontend-security-format | 0 | 23 |
   | feat/ai-visual-matching | 0 | 12 |
   | feat/minimal-blue-theme | 0 | 21 |
   | integration/ai-ui | 0 | 7 |
   | main | 0 | 18 |
   | phase-2-item-search | 0 | 72 |
   | phase-4-claim-workflow | 0 | 69 |
   | phase-6-admin-api | 0 | 61 |
   | release/findit-ai-ui | 0 | 4 |
   | test/real-environment | 0 | 18 |

3. **Mã đã tích hợp**

   Tạo `audit/findit-sync-20261109` từ release, chạy `git merge --ff-only origin/main`. Fast-forward thành công, không conflict, không tạo merge commit. Bốn commit mới: `3c9ffb6` chuẩn bị suggestions/worker production, `95e807d` bổ sung Node types cho Vite, `7af45b5` sửa suggestion trùng do MySQL semijoin, `d151402` merge PR. Tổng thay đổi từ release tới main: 35 file, +911/-49 dòng. Các branch AI khác được fetch để cập nhật refs, không tự đưa mã chưa thuộc main vào nhánh kiểm toán.

4. **Trạng thái Git cuối**

   Nhánh làm việc `audit/findit-sync-20261109`, HEAD `d1514024f888133e6bd534643215b2644f76e39e`; ahead/behind origin/main bằng `0/0`. Các bản sửa local chưa stage/commit: 21 file đã theo dõi được sửa, 3 file mới gồm helper kiểm tra ADMIN, integration test và báo cáo này. Trong đó 14 file frontend chỉ được Prettier định dạng. Log, coverage và dist nằm trong các thư mục đã được ignore.

   Nhánh local main vẫn ở `673f3b6`; nhánh release và remote release vẫn ở `c48e6d1`. Không push, merge vào main, reset, force-push, deploy hoặc tạo commit mới.

5. **Bảo toàn AI/UI**

   `git merge-base --is-ancestor c48e6d1 HEAD` thành công. UI mới, AI suggestions, worker, nền tảng notification shadow/demo, Match/Claim và admin hide/restore đều còn trong lịch sử và vượt qua các regression tương ứng. Không thiết kế lại giao diện trong lượt này. Toàn bộ file SQL migration giữ nguyên so với release.

6. **Kiến trúc tổng thể**

   Frontend React 19/TypeScript/Vite, React Router và các provider auth/notification/chat. Backend Express 5 chia route/controller/service/repository, dependency injection phục vụ test, MySQL cho dữ liệu và giao dịch. Socket.IO xử lý chat; email outbox có worker trong tiến trình API. CLIP chạy bằng worker riêng, API không nạp model. Cấu trúc phù hợp để phát triển và kiểm thử; logic giao dịch, giới hạn timeout và xử lý commit không chắc chắn đã có test thực tế.

   Matching hiện tuần tự hóa các writer bằng advisory lock toàn database, chờ tối đa 2 giây rồi trả 503. Đây là giới hạn thiết kế có thật cần đo dưới tải, chưa có bằng chứng lỗi ở tải campus thực tế. Không refactor phần khóa trong lượt kiểm toán.

7. **Frontend**

   Đã rà routing, bảo vệ phiên, đăng ký/đăng nhập, wizard LOST/FOUND, sửa bài/ảnh, tìm kiếm/phân trang, chi tiết, suggestions, Claim, thông báo, hồ sơ, chat/password reset và trang quản trị. Browser regression kiểm tra loading/empty/error/retry, lỗi upload và retry, quyền chủ bài, bằng chứng riêng tư, focus bàn phím/modal và responsive 360–1440 px. Đã xem trực tiếp ảnh chụp mobile wizard, mobile AI/detail và desktop dashboard; không thấy lỗi bố cục rõ ràng trên các ảnh được xem.

   JWT nằm trong sessionStorage; cache/read scope thay đổi theo phiên, có xử lý expiry và chặn phản hồi từ phiên cũ. Nội dung người dùng render bằng React text. API mặc định trong mã là localhost; browser build dùng `/api` proxy đến backend local. Build cuối dùng tường minh `http://127.0.0.1:3001/api`, hai cờ `VITE_AI_VISUAL_SUGGESTIONS_ENABLED` và `VITE_AI_VISUAL_SUGGESTIONS_PREVIEW_FIXTURE` đều false. Bundle cuối chứa API localhost, không chứa domain production FindIt/Railway được kiểm tra. Không để lại build fixture làm build cuối.

   Đã chuẩn hóa 14 file Prettier đang làm `format:check` thất bại. Repository chưa cấu hình ESLint; không coi Prettier là kiểm tra lint ngữ nghĩa.

8. **Backend**

   Authentication sử dụng bcrypt cost 12, JWT có kiểm tra tài khoản/role/session version, reset token được hash và tiêu thụ nguyên tử. Route quản trị kiểm tra quyền trước validation. DTO hạn chế trường công khai; SQL dùng tham số và whitelist cho phần định danh động. Helmet, CORS allowlist, body/upload limits và rate limits đã có. Error handler không trả SQL/secrets ra client.

   Claim khóa Item rồi Claim, duyệt một Claim và từ chối Claim cạnh tranh trong cùng transaction; hoàn tất chuyển Item sang RETURNED và invalidates AI candidates. Hide/restore giữ nguyên nghiệp vụ và lịch sử, audit/notification/catalog revision cùng transaction. Test còn kiểm tra rollback, timeout, lease, retry và phản hồi COMMIT bị mất. Đã vá kiểm tra lại ADMIN cho các đường ghi cũ, chi tiết tại mục 14.

9. **Database và migration**

   Manifest thực tế gồm 30 file SQL, 11 bảng nghiệp vụ + 11 bảng AI + 4 bảng account/chat + `_schema_migrations` = 27 bảng. Đã xác minh schema/SQL export/manifest, PK, FK, UNIQUE, CHECK, ENUM, JSON, indexes, checksum và chạy lại migration/seed không làm đổi dữ liệu. Migration upgrade regression dựng schema main lịch sử 18 migration rồi áp dụng thêm 12, bảo toàn dữ liệu, ledger và sự kiện hide/restore. Main hiện tại đã có đủ 30; không gọi schema 18 là main mới nhất.

   Các prefix 014–018 trùng số giữa hai nhánh lịch sử nhưng tên file đầy đủ khác nhau; manifest/ledger dùng tên đầy đủ và checksum. Không đổi số hay sửa SQL đã công bố. Đã sửa README database đang ghi 25 migration và thiếu các bảng account/chat. Không đọc ledger production, không chạy production migration.

10. **AI Visual Matching**

    Model pin `Xenova/clip-vit-base-patch32`, revision `4c1807b705b1d015fb032789cc4d221b23025a6f`, q8/CPU, 512 chiều; embedding chuẩn hóa, blob 2.048 byte, cosine dùng cho xếp hạng, không phải xác suất. Candidate LOST/FOUND được tổng hợp max cosine giữa các ảnh, lọc lifecycle/moderation/freshness và giới hạn API tối đa 3 FOUND. API owner-only có kiểm tra lại nguồn sau khi đọc kết quả. Regression đã bao gồm kế hoạch MySQL từng gây kết quả trùng.

    Job có retry/backoff, lease token, heartbeat và fencing. Worker khóa Item theo ID rồi Job, đọc lại embeddings trước ghi; xóa ảnh/close/return/hide làm mất hiệu lực candidate. Snapshot có input hash/catalog revision/generation/lease, revalidation trước delivery. Notification pair có khóa unique/dedup. Production config từ chối các cờ notification processing/shadow/demo bật; không có threshold cosine production được xác nhận.

    **CLIP thật đã chạy riêng** trên cùng ảnh PNG tổng hợp local hai lần, dùng model cache: vector 512 chiều, cosine `0.9999999946589865`, khởi tạo cache 255 ms, inference khoảng 21,6/13,7 ms, RSS cuối khoảng 280 MiB. Đây là smoke của model, không chứng minh độ chính xác LOST/FOUND hoặc hiệu năng cloud/cold start.

    **Integration/browser AI dùng fixture embeddings và adapter ảnh giả lập. Không upload hoặc tải ảnh từ Cloudinary production; không chạy full E2E Cloudinary → CLIP → suggestions.** Demo notification chỉ được test trên database disposable với synthetic entities. Không bật/gửi AI notification production.

11. **Phát hiện bảo mật**

    Phát hiện P1 đã sửa: identity ADMIN đã qua middleware có thể trở nên lỗi thời trước transaction ở các thao tác lookup, xử lý Report và legacy close. Các đường ghi này trước đây chưa kiểm tra lại role/account status trong transaction, khác với moderation mới. Helper `server/repositories/admin-actor.js` kiểm tra và khóa chia sẻ role ADMIN → actor; thao tác ghi bị từ chối nếu actor đã SUSPENDED hoặc role trong DB không còn ADMIN. Khóa giữ tới khi transaction kết thúc. Không thay đổi quyền chủ bài hay quy tắc recusal của endpoint moderation.

    Production dependency audit root/client cùng báo **0 advisory**. Các test authorization, injection, XSS dạng text, chống lộ bằng chứng và private DTO đều đạt. Kết quả này không thay thế penetration test hoặc đánh giá hạ tầng production.

12. **Kết quả automated tests trên mã cuối**

    Môi trường Windows, Node `24.21.0`, npm `11.19.0`, MySQL `8.0.46`. Dependencies được cài từ cả hai lockfile bằng npm ci. Không đổi package/lockfile. CI đang pin Node `24.22.2`; chưa chạy lại CI Linux từ nhánh này.

    | Kiểm chứng | Kết quả cuối | Baseline lịch sử |
    | --- | ---: | ---: |
    | Backend unit (`npm run test:backend`, qua `npm test`) | 165/165 | 160 |
    | Authentication unit (`npm run test:auth`) | 7/7 | 7 |
    | Database unit (`npm run db:test`) | 9/9 | 9 |
    | Tổng backend/auth/database | **181/181** | 176 |
    | Full isolated MySQL (`npm run test:integration:isolated`) | **349/349** | 327 |
    | Frontend Vitest, 10 file | **63/63** | 60 |
    | Browser Item/AI/admin runner | **19/19** | 19 |
    | Account/chat/password-reset suite có browser | **13/13** | Không đối chiếu cộng gộp |
    | TypeScript `typecheck` | Đạt | — |
    | Vite production build | Đạt, 109 modules | — |
    | Prettier `format:check` | Đạt | — |
    | npm audit production root / client | 0 / 0 advisory | — |
    | `git diff --check` | Đạt | — |

    Các suite cuối không fail/cancel/skip. Chênh lệch count đã được đối chiếu: main thêm 5 unit backend, 9 integration và 3 frontend; lượt này thêm 7 trường hợp/nhóm email và 6 trường hợp/nhóm admin-actor integration. `327 + 9 + 7 + 6 = 349`; không bỏ test để làm xanh. Số đếm Node gồm cả nhóm cha; 19 của browser runner không có nghĩa là 19 luồng browser độc lập. Suite account có 1 subtest browser và 12 test/nhóm còn lại; không cộng trùng vào tổng MySQL chính.

    Đã chạy thêm coverage unit + integration + combined bằng scripts có sẵn, output mới `coverage/audit-20261109-final/`. Kiểm tra toàn vẹn raw/source/runtime/report và merge đạt. Coverage kết hợp: server lines 94,60%, branches 90,77%, functions 96,71%; database lines 94,02%, branches 82,05%, functions 97,67%. Đây là tỷ lệ đo được, không phải bảo đảm đã kiểm chứng mọi nhánh. Hai manifest cùng HEAD `d151402...` và source hash `6fdbd3061cafce6f63341f92ae8eee80ef8c6befa402205ef106b38da0957c35`, ghi nhận cây mã có bản sửa chưa commit.

13. **Kết quả browser và luồng người dùng thật**

    Chrome headless desktop/mobile chạy HTTP/JWT/MySQL thật trên cổng tạm. Đã thực hiện đăng ký/đăng nhập, tạo LOST/FOUND, chọn/upload ảnh qua adapter test, tìm kiếm/lọc, owner authorization, Claim tạo/duyệt/từ chối/bàn giao, thông báo/đánh dấu đọc, admin dashboard/RBAC/lookup/report/recusal/audit và hide/restore. AI owner API/UI, loading/empty/error/retry, fixture scores và demo dedup được thực hiện trong browser suite.

    Chạy riêng `FINDIT_FEATURE_BROWSER=1 node database/scripts/test-isolated.js --all --suite=account-chat-email.integration.js`: chat realtime desktop → mobile, nội dung XSS render dạng text, confirmation password, bật/tắt hiển thị password, reset fragment bị xóa khỏi URL và logout sau reset đều đạt. Email provider là transport mock, không gửi email thật. Kiểm thử chặn HTTPS ngoài; không test Safari/Firefox hoặc thiết bị vật lý.

14. **Lỗi tìm thấy và đã sửa**

    - **P1 — quyền ADMIN trong transaction:** bổ sung helper kiểm tra actor vào create/update/deactivate category/location, Report update và legacy Item close. Regression `server/tests/admin-actor.integration.js` tái hiện trước sửa, sau sửa đạt 6/6; bảo toàn toàn bộ snapshot dữ liệu/audit khi bị từ chối và kiểm tra ACTIVE ADMIN vẫn thành công.
    - **P2 — email Match lỗi thời:** worker trước đây chỉ kiểm tra hidden nên vẫn gửi queue sau CLOSED/RETURNED hoặc điểm giảm dưới 50, đồng thời dùng tiêu đề/điểm cũ. Đã revalidate type/lifecycle/threshold/recipient/visibility và dựng nội dung từ dữ liệu hiện tại trước gửi. Thêm regression trong `account-chat-email.integration.js`, gồm 4 tình huống CLOSED/RETURNED, giảm score và nội dung hiện tại. Đã thấy test thất bại trước sửa và đạt sau sửa. Kiểm tra này không thể thu hồi email đã gửi hoặc làm giao dịch MySQL nguyên tử với dịch vụ email ngoài.
    - **P3 — format và tài liệu:** chuẩn hóa 14 file để format check đạt; sửa số bảng/migration trong README. Không sửa giao diện hay SQL migration.

    Các lần lỗi do sandbox npm cache/network và esbuild đọc đường dẫn OneDrive đã được chạy lại với quyền công cụ phù hợp. Các lần regression cố ý chạy trước bản vá nằm trong log `*-before.log`; không tính chúng là kết quả mã cuối. Không có yêu cầu tự động phê duyệt nào bị từ chối.

15. **Vấn đề còn lại theo mức độ**

    | Mức | Vấn đề / bằng chứng / giới hạn |
    | --- | --- |
    | P1, điều kiện trước production | Chưa xác minh backup/restore, ledger/checksum thực tế, branch/deploy triggers và cấu hình đang chạy. Không truy cập production theo phạm vi yêu cầu nên không thể đóng các điều kiện này; không khẳng định chúng đang cấu hình sai. |
    | P2, khoảng trống CI | `.github/workflows/tests.yml` hiện chỉ chạy backend/security/coverage, chưa có frontend Vitest/typecheck/build/format hoặc browser job. Các kiểm tra đó đã đạt local nhưng chưa được CI cưỡng chế; chưa có kết quả Linux cho bản sửa chưa commit. |
    | P2, điều kiện vận hành | Rate limit và chat budget ở memory từng process; `trust proxy=false`. Cần xác minh reverse-proxy/IP topology và store khi mở rộng replica để tránh dùng chung quota theo IP proxy hoặc quota không nhất quán. Không tự bật trust proxy khi chưa có cấu hình hạ tầng. |
    | P2, giới hạn kiểm chứng | Chưa đo tải advisory lock/catalog revision hoặc CLIP worker trên Linux/cloud, chưa benchmark model download/cold start/ảnh lớn. Chưa có kiểm thử Cloudinary/Resend thật hoặc full AI E2E; smoke synthetic không đánh giá chất lượng tìm đồ. |
    | P3, giới hạn công cụ | Chưa có ESLint và accessibility audit toàn diện bằng công cụ chuyên biệt; đã kiểm tra focus, label, modal và responsive trong phạm vi browser runner. |

    Không phát hiện lỗ hổng dependency production đang mở trong npm audit. Không phát hiện thêm regression chức năng còn mở trong các suite đã chạy. Các điều kiện vận hành ở bảng trên được phân biệt với lỗi mã đã tái hiện.

16. **Mức độ sẵn sàng và bằng chứng bàn giao**

    Mã tích hợp đã sẵn sàng để review các diff chưa commit và dùng môi trường local/cô lập. **Verdict tổng thể: PROJECT NEEDS FIXES**, do còn khoảng trống CI và bằng chứng vận hành trước khi xác nhận production-ready. Không có blocker ngăn chạy kiểm thử local; không coi kết quả local là chấp thuận triển khai. AI automatic notification production tiếp tục bị khóa.

    Log lượt này: `.cache/audit-20261109/`; các kết quả cuối dùng hậu tố `final-v2` cho unit/integration/frontend/browser/build, `coverage-*-final.log`, `audit-*-final.json`. Coverage cuối: `coverage/audit-20261109-final/`. Ảnh browser: `.cache/frontend-browser/` và `.cache/feature-browser/`. Model smoke: `.cache/audit-20261109/clip-smoke.log`.

    Chỉ dùng MySQL disposable do runner tạo, xác minh datadir/cổng rồi dọn; không kết nối cổng 3306/3311, Railway MySQL hay Cloudinary production. Không chạy migration production, deploy, push hoặc commit bản vá.
