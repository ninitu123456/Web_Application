# FindIt v3 — Mobile responsive

Ngày kiểm tra: 28/11/2026 (Asia/Saigon).

## Branch và phạm vi

- Branch: `fix/findit-v3-mobile-responsive`, tạo sau `git fetch origin` từ `7203947123f64f32f5a0afaef69d18bac7f881c5` (`origin/main`). Working tree ban đầu sạch.
- Commit UI: `b7a301b` — `fix(ui): complete FindIt v3 mobile and tablet layouts`.
- Branch `feat/core50-evaluation-test-stability` giữ nguyên tại `7a22c069d1ccb0459b30c9a014e48fb86b7065b1`; không reset, clean, merge, push hoặc deploy.
- Không thay đổi code backend chạy thật, API contracts, migrations, AI/ranking, quyền riêng tư, phân quyền hoặc trạng thái Claim. Chỉ bổ sung service hiện có vào **test harness** `server/tests/items.integration.js` để mô phỏng đúng runtime; không sửa service/repository/router.
- Không chỉnh Word/PowerPoint. Cache CORe50 có sẵn trong `research/` được giữ lại, không đưa vào commit responsive.

## Lỗi đã tái hiện trước khi sửa

| Vấn đề | Bằng chứng/ảnh hưởng |
| --- | --- |
| Header v3 ghi đè `display: none` của menu mobile | Menu hiện dù chưa mở; nhiều trang rộng 412px khi đăng nhập, 469px ở phiên ẩn danh tại viewport 320/390px. Bộ browser cũ thất bại ở `Explore fits 360px`. |
| Hero, search và spacing giữ kích thước desktop | Trang chủ quá dài, tiêu đề/nút/khối thống kê bị ép hẹp. |
| Chat v3 ghi đè breakpoint thành ba cột | Trang chat rộng 481px tại viewport 320/390px; thông tin giao dịch cạnh tranh diện tích với composer. |
| Handover form vẫn chia ba cột | Trường ngày giờ, địa điểm và nút khó sử dụng trên điện thoại. |
| Thumbnail gallery còn grid và chiều rộng cũ | Năm ảnh xuống dòng; ảnh chính chưa hỗ trợ vuốt/chuyển bằng phím. |
| Detail/actions giữ padding lớn và cột nhãn 210px | Nội dung, địa điểm dài và các nút bị ép; card AI lồng trong panel quá hẹp. |
| Footer tìm trước khi đăng cố định dưới màn hình | Cạnh tranh với bottom navigation. |
| Chi tiết Admin ở 320px | Badge trạng thái tràn ngang (351px); breakpoint topbar 901–960px làm mất nút mở menu. |
| Nút dài và hình 404 | Tràn ngang ở 320px. |

Ảnh `before-*` được chụp mới bằng Playwright từ source gốc của `origin/main`, nạp qua Vite plugin chỉ dùng trong test. Không checkout/reset source để chụp, không dùng ảnh cũ. Cùng dữ liệu giả lập, font, viewport và reduced motion với ảnh `after-*`.

## Các trang và giải pháp

Đã đo 35 route tại đủ 8 kích thước: **320×700, 360×800, 375×812, 390×844, 414×896, 768×1024, 1024×768, 1440×900**.

- Public: Home, Explore/search, Item Details, login, register, quên mật khẩu, đặt lại mật khẩu thiếu token, About/quy tắc, Contact, tìm trước khi đăng và 404. Dùng phiên ẩn danh để tránh login/register tự chuyển về Home.
- Tài khoản: tạo tin, sửa tin LOST, My Items, Saved Items, Profile/settings, AI Matching của chủ tin, Claim đã gửi, Claim review của chủ tin FOUND, handover, conversation list/thread, notifications và My Reports. Kiểm tra chọn loại LOST/FOUND và upload/preview qua browser suite thật.
- Admin: Dashboard, Items/list/detail, Users/list/detail, Claims, Reports/list/detail, Lookups, Activity Logs, Contact inbox và Handover disputes. Matrix có dữ liệu giả lập cho các màn hình chính; inbox/disputes có empty state an toàn. Luồng moderation/RBAC/Claim dùng suite MySQL tạm.

Thay đổi UI tập trung trong `client/src/mobile.css`, được import sau `v3.css`; tái sử dụng màu, gradient, radius, shadow và typography v3. Phần lớn rule giới hạn ở ≤760px; navigation/chat tablet dùng ≤1100px. Không dùng `overflow-x: hidden` toàn trang hoặc scale toàn bộ nội dung.

| Thành phần | Thay đổi |
| --- | --- |
| `Layout.tsx` + responsive navigation | Menu đóng mặc định, active state rõ, Escape trả focus về nút, đóng khi click ngoài/chuyển route; giảm header actions trùng với quick nav, giữ truy cập thông báo và tài khoản. |
| Home/Explore/static/auth | Hero gọn, search xếp hợp lý, grid co giãn, filter đóng/mở, nút dài wrap, trường nhập ≥16px trên mobile, form Contact một cột, ảnh 404 co theo container. |
| `ItemDetailPage.tsx` | Gallery vuốt ngang và phím trái/phải; giữ thumbnail buttons, thông báo số ảnh bằng live region. Fact rows, action buttons và cards AI có thể xuống dòng. |
| Create/Edit + Profile | Form một cột; preview, validation, input ngày giờ và action buttons nằm trong chiều rộng màn hình. |
| Claim/Handover/Modal | Bằng chứng dài wrap; nút tách khoảng; form lịch hẹn một cột; dialog giới hạn theo `dvh`, cuộn nội bộ. |
| `MessagesPage.tsx` | Mobile một cột chuyển list/thread bằng URL có sẵn; nút mở/đóng context giao dịch; composer có đủ diện tích, lịch hẹn thành hàng riêng; history/context cuộn độc lập, đo lại theo visual viewport. Desktop giữ ba cột. |
| Admin/My Reports | KPI/chart/filter co theo màn hình; bảng giữ cột dữ liệu và cuộn ngang có chủ đích, hỗ trợ focus/phím; badge xuống dòng; menu Admin truy cập được trên tablet. |

## Kiểm thử và bằng chứng

| Kiểm tra | Kết quả |
| --- | --- |
| `npm --prefix client test` | PASS — 17 files, 126 tests. |
| `npm --prefix client run typecheck` | PASS. |
| `npm --prefix client run format:check` | PASS. |
| `npm --prefix client run build` | PASS với `/api`, AI preview fixture tắt. Có cảnh báo bundle >500kB đã có từ baseline. |
| `npm --prefix client run test:responsive` | PASS — **280** route/viewport combinations, không document overflow, `errors: []`. |
| Responsive interaction checks | PASS — menu/Escape, search/filter/đi vào detail, thumbnail/phím/vuốt, Claim dialog nằm trong viewport, mở xác nhận duyệt Claim, handover form, validation form, gửi chat và quay về list, context toggle, admin menu, keyboard scroll của bảng giữ đủ cột, loading/empty/error/AI-processing. |
| Viewport thấp | PASS — composer 390×480; chưa thay thế kiểm tra bàn phím thiết bị thật. |
| `npm --prefix client run test:browser` | PASS — **19/19 tests**, 0 fail/skip; full browser workflow gồm extended Admin/RBAC, upload recovery, image deletion và AI/UI. MySQL tạm đã dừng và xóa. |
| Desktop visual comparison | PASS — 7/8 ảnh 1440px giống từng pixel. Admin chỉ khác **776 pixels** trong chữ thời gian cập nhật (x416–520, y77–92); kích thước trang không đổi. Xem `desktop-comparison.json`. |

Browser suite hiện có được đồng bộ với v3: đường dẫn Explore, nút tài khoản thay `summary`, tên các nút/heading, chart/category empty state và query `days`. Test báo cáo dùng bài của tài khoản khác vì UI v3 không cho báo cáo chính bài của mình. Giữ kiểm tra duplicate, quyền riêng tư, DB state, HTTP/console errors; không thêm allowlist để bỏ qua lỗi ứng dụng. Service engagement thật được gắn vào fixture để hết 404 giả ở saved IDs, item stats và user stats.

### Screenshot

Thư mục: [`presentation/screenshots/mobile-responsive/`](presentation/screenshots/mobile-responsive/).

- 58 ảnh PNG: 24 before, 24 after cho 8 màn hình tại 320/390/1440px; thêm 4 Claim modal, 2 form validation, 4 trạng thái loading/empty/error/processing.
- [Home 390px](presentation/screenshots/mobile-responsive/after-home-390.png)
- [Explore 390px](presentation/screenshots/mobile-responsive/after-explore-390.png)
- [Item Details 390px](presentation/screenshots/mobile-responsive/after-detail-390.png)
- [AI Matching 390px](presentation/screenshots/mobile-responsive/after-ai-matching-390.png)
- [Create form 390px](presentation/screenshots/mobile-responsive/after-item-form-390.png) / [validation 320px](presentation/screenshots/mobile-responsive/after-item-form-validation-320.png)
- [Claim modal 390px](presentation/screenshots/mobile-responsive/after-claim-modal-390.png) / [Claim review](presentation/screenshots/mobile-responsive/after-claim-review-390.png)
- [Chat 390px](presentation/screenshots/mobile-responsive/after-chat-390.png)
- [Admin 390px](presentation/screenshots/mobile-responsive/after-admin-390.png)
- [Desktop Home](presentation/screenshots/mobile-responsive/after-home-1440.png) / [Desktop Detail](presentation/screenshots/mobile-responsive/after-detail-1440.png)

`results.json` ghi route, viewport, document width và console/page errors. `baseline.json` ghi đối chứng source gốc. `desktop-comparison.json` ghi so sánh ảnh desktop. Screenshot dùng tên/email/bằng chứng giả lập và ảnh SVG nhúng; không có dữ liệu production hoặc secrets.

## Giới hạn và kiểm tra tiếp theo

- Kiểm thử tự động dùng Chrome headless trên Windows; chưa xác minh Safari/iOS, Firefox, notch/safe area và bàn phím ảo trên máy thật. Đã có CSS safe-area/dvh và kiểm tra viewport thấp nhưng không coi đó là bằng chứng thiết bị thật.
- Dữ liệu AI trong matrix là fixture kiểm tra trình bày, không phải kết quả đánh giá CLIP mới. Không chạy lại thuật toán/worker hoặc thay thứ hạng.
- Matrix dùng mock API; browser suite thứ hai dùng HTTP API, JWT và MySQL tạm. Cloudinary/email được giả lập hoặc tắt theo runner, không thao tác production.
- Chưa kiểm tra mọi tổ hợp dữ liệu/status/tài khoản có thể có; auth reset có token thật và email delivery không thuộc phạm vi responsive. Các trạng thái thiếu token/validation được kiểm tra an toàn.
- Desktop không phát hiện regression trong 8 mẫu pixel comparison và các luồng browser đã kiểm tra; không khẳng định mọi thiết bị/trạng thái đều đã được thử.

## Chạy lại

Từ repository root sau khi cài dependencies root và client:

```powershell
npm.cmd --prefix client test
npm.cmd --prefix client run typecheck
npm.cmd --prefix client run format:check
npm.cmd --prefix client run test:responsive
npm.cmd --prefix client run test:browser
```

Baseline screenshot: `node client/scripts/mobile-responsive-check.mjs --baseline` (đọc source gốc từ Git). Runner responsive chỉ bind `127.0.0.1:5174`, tự đóng browser/server; yêu cầu Chrome hoặc `FINDIT_BROWSER_CHANNEL` phù hợp. Runner browser thật tự tạo và xóa MySQL data directory tạm sau khi xác minh danh tính instance.
