# FindIt — Hoàn thiện thông báo, hồ sơ, báo cáo và Admin

Ngày 03/11/2026, Asia/Saigon. Đây là **đợt 2**, tiếp tục từ working tree chưa commit của đợt 1; không tạo lại frontend hoặc loại bỏ các thay đổi cũ. [Báo cáo đợt 1](FRONTEND_IMPLEMENTATION_REPORT.md) được giữ với số liệu lịch sử riêng.

## Chức năng đã triển khai

- Chuông thông báo/badge, danh sách phân trang, phân biệt đọc/chưa đọc, đánh dấu một/tất cả. Làm mới khi vào trang, focus và sau mutation; không polling. Dùng một provider đếm chung, gộp GET đang chạy và xóa dữ liệu theo phiên.
- Hồ sơ GET/PATCH, chỉ sửa họ tên theo validation hiện có; cập nhật menu/auth context ngay sau lưu. Email/vai trò chỉ đọc.
- Báo cáo trong ngữ cảnh Item/chủ bài/Claim, lấy targetType/targetId từ tài nguyên, validation lý do/mô tả, lỗi trùng/quyền và trang báo cáo của tôi có phân trang.
- Sidebar Admin responsive và guard chặn USER trước khi mount trang con; backend vẫn quyết định quyền cho mỗi request.
- Dashboard số liệu thật, trạng thái User/Item/Claim/Report, danh mục và hoạt động 30 ngày do API cung cấp.
- Người dùng: lọc accountStatus/role, phân trang, chi tiết an toàn, kích hoạt/đình chỉ có xác nhận; khóa tự thay đổi trạng thái và phản ánh quyền/tài khoản đã thay đổi.
- Bài đăng: danh sách/lọc/phân trang, chi tiết và canonical close với lý do; không dùng legacy status, không diễn giải CLOSED là ẩn/xóa.
- Claim: summary/filter/page, tìm đúng bằng chứng qua các trang, approve/reject tranh chấp PENDING có lý do, không hoàn tất bàn giao hoặc đảo trạng thái kết thúc.
- Report Admin: danh sách/lọc/phân trang/chi tiết, PENDING → REVIEWING → RESOLVED/DISMISSED; thao tác tài nguyên là quyết định độc lập.
- Lookup: component quản lý dùng chung cho category/location, tạo/đổi tên/bật/tắt, lỗi trùng tên, giữ lịch sử.
- Nhật ký nghiệp vụ: lọc action/entity/actor/date/sort, phân trang, hiển thị details allowlist dạng text; không truy cập raw journal.

Style, form, Button, Modal, ConfirmDialog, StatusBadge, state và Pagination được tái sử dụng. Native dialog quản lý focus; mutation có khóa ref/disabled/xác nhận, không tự retry.

## API đã kết nối và giới hạn contract

Không bổ sung endpoint, đổi schema, business rules hoặc quyền backend trong đợt này. Không thêm dependency. Thay đổi backend chỉ ở test harness để gắn các service hiện có vào app kiểm thử; quota 3.000/phút chỉ bật khi FINDIT_FRONTEND_BROWSER=1.

Kết nối:

```text
GET /api/notifications
GET /api/notifications/unread-count
PATCH /api/notifications/:id/read
PATCH /api/notifications/read-all
GET/PATCH /api/users/me
POST /api/reports
GET /api/reports/mine
GET /api/admin/dashboard
GET /api/admin/users
GET /api/admin/users/:id
PATCH /api/admin/users/:id/status
GET /api/admin/items
GET /api/admin/items/:id
PATCH /api/admin/items/:id/close
GET /api/admin/claims
PATCH /api/admin/claims/:id/resolve
GET /api/items/:id/claims
GET /api/admin/reports
GET/PATCH /api/admin/reports/:id
GET/POST /api/admin/categories
PATCH /api/admin/categories/:id
GET/POST /api/admin/locations
PATCH /api/admin/locations/:id
GET /api/admin/activity-logs
```

- Notification DTO chưa có đích định tuyến: chỉ hiển thị nội dung/đánh dấu đọc, không phân tích message thành link.
- Report DTO chỉ có loại/ID mục tiêu. Chỉ link Item và User (User detail dành Admin) khi có route hợp lệ. Report CLAIM không đủ Item ID để đi thẳng bằng chứng; có lối vào danh sách Claim, không tải toàn bộ Claim về để suy đoán.
- Admin recusal: kiểm tra Item owner hoặc query Claim lọc đúng itemId + claimantId của Admin; dùng total của toàn bộ tập và không lọc status, kể cả lịch sử REJECTED. Không kết luận từ trang đầu danh sách chung. Nếu preflight lỗi/thiếu dữ liệu, báo chưa xác định và xử lý rõ 403 từ backend.
- Evidence: tìm đúng claimId lần lượt qua `/items/:id/claims`, không coi thiếu ở trang 1 là không tồn tại. Không biến lỗi giữa chừng/thiếu metadata/giới hạn API thành not-found; hoàn tất scan vẫn nhắc dữ liệu có thể thay đổi giữa các trang.
- Auth vẫn sessionStorage, không refresh token. GET được gộp theo phiên và lần invalidation; logout/expire xóa cache. Cả response thành công lẫn lỗi của phiên cũ đều bị loại; recheck danh tính khi focus hoặc gặp 403 ở API nghiệp vụ.

## Kết quả kiểm chứng mới

| Lệnh/kiểm tra | Kết quả đợt 2 |
| --- | --- |
| `client: npm.cmd run typecheck` và TypeScript trong build | Thành công |
| `client: npm.cmd run build` | Production build thành công |
| `client: npm.cmd test` | **14 tests đạt**, 0 fail |
| `client: npm.cmd run format:check` | Thành công; chưa cấu hình ESLint |
| `npm.cmd run test:regression` ở gốc | Backend unit 127 + auth 7 + database 7; isolated integration **286 đạt**, 0 fail/skip/cancel |
| `client: npm.cmd run test:browser` | Suite Item + Chrome **19 tests đạt**, 0 fail/skip/cancel; gồm luồng cũ và toàn bộ script mở rộng |

Con số 19 là tổng của suite Item (có test cha và bài browser tổng hợp), không phải 19 kịch bản browser độc lập. Số liệu đợt 1 được giữ nguyên ở báo cáo cũ; các kết quả trên được chạy lại trong đợt 2.

Trình duyệt thực tế đã xác minh:

1. Profile lưu họ tên cập nhật menu, reload giữ tên; USER bị chặn toàn bộ URL Admin và API Admin trả 403.
2. Dashboard đối chiếu COUNT MySQL; notification read-all không đổi số chưa đọc của tài khoản khác, mark của tài khoản khác bị 403; focus tải thông báo mới và đọc một giảm đúng một.
3. Báo cáo Item/User/Claim đúng ID từ ngữ cảnh; duplicate báo cáo đang xử lý trả 409; mine không lẫn tài khoản; Admin REVIEWING rồi RESOLVED/DISMISSED, tài nguyên không tự bị thay đổi.
4. Category và location đều tạo/đổi tên/tắt/bật, trùng tên 409, public lookup loại bản ghi inactive.
5. Canonical close OPEN và FOUND/CLAIM_PENDING; Claim pending bị reject, reason chỉ có trong audit chứ không lộ Item công khai; nội dung CLOSED vẫn đọc được.
6. Resolve approve sang CLAIMED, reject về OPEN khi hết pending; không có nút complete thay chủ bài; Claim bị reject không thể gửi lại.
7. Fixture **103 Claim**: bằng chứng mục tiêu ở trang 2 được tìm đúng; lịch sử REJECTED của Admin nằm ngoài trang đầu nhưng UI vẫn phát hiện recusal. Khi preflight bị fault 503, backend trả 403, hộp thoại hiển thị đúng và không dùng endpoint legacy để vượt quyền.
8. Nhật ký hiển thị reason của moderation, không có proof hoặc image journal; tự đình chỉ bị khóa; đình chỉ có hiệu lực với JWT, kích hoạt đăng nhập lại được; role đổi trong DB được backend/frontend guard phản ánh.
9. Các màn Admin và trang cá nhân ở viewport mobile 390×844 không tràn ngang trang; bảng dùng vùng cuộn riêng. Ảnh desktop 1440×1000 và mobile đã được mở kiểm tra trực tiếp.
10. Hồi quy đăng ký/đăng nhập, tạo/sửa bài và lookup inactive, ảnh/upload lỗi/phục hồi/xóa-thêm lại, text HTML an toàn, Matching, search/filter/page/sort, Claim trùng/quyền riêng tư, approve/complete và RETURNED, reload trang con, logout/JWT sai.

Tất cả ghi dữ liệu tự động chỉ trong instance/datadir/port MySQL tạm do runner hiện có tạo và xác minh. Test app dùng service thật và SQL thật. Storage Cloudinary giả, lỗi upload/preflight được tiêm có chủ đích. HTTPS ngoài được chặn trong Chrome test để dùng font fallback và tránh phụ thuộc Google Fonts/Cloudinary; không giả API nghiệp vụ để báo hoàn thành.

Artifacts Git-ignore:

```text
.cache/frontend-extended-browser.txt
.cache/frontend-extended-regression.txt
.cache/frontend-browser/desktop-admin-dashboard.png
.cache/frontend-browser/desktop-admin-activity.png
.cache/frontend-browser/mobile-admin-activity.png
.cache/frontend-browser/mobile-my-reports.png
```

## Chưa kiểm chứng và giới hạn

- Chưa kiểm chứng mạng Cloudinary thật, font Google Fonts qua mạng trong lượt browser test này, Firefox/Safari, thiết bị vật lý, screen reader hoặc production hosting.
- Chưa đo lại coverage baseline hoặc audit dependencies. ESLint chưa cấu hình; format check không được coi là lint.
- Không có endpoint đọc Claim trực tiếp bằng ID hoặc target metadata mở rộng của Report; UI dùng contract hiện có như mô tả, không tự mở rộng API.
- Pagination offset không có snapshot xuyên request; khi dữ liệu thay đổi giữa trang, người dùng có thể cần tải lại. Backend là nơi quyết định trạng thái/quyền cuối cùng.

## File thay đổi trong đợt 2

Tiếp tục sửa các file frontend chưa commit:

```text
client/src/main.tsx
client/src/styles.css
client/src/components/Layout.tsx
client/src/components/ui.tsx
client/src/lib/api.ts
client/src/lib/api.test.ts
client/src/lib/auth.tsx
client/src/lib/hooks.ts
client/src/pages/Claims.tsx
client/src/pages/ItemDetailPage.tsx
client/scripts/browser-check.mjs
client/README.md
FRONTEND_IMPLEMENTATION_REPORT.md
server/tests/items.integration.js
```

Thêm:

```text
client/src/components/ReportButton.tsx
client/src/lib/extended-types.ts
client/src/lib/notifications.tsx
client/src/lib/claim-inspection.ts
client/src/lib/claim-inspection.test.ts
client/src/pages/NotificationsPage.tsx
client/src/pages/ProfilePage.tsx
client/src/pages/MyReportsPage.tsx
client/src/pages/admin/AdminLayout.tsx
client/src/pages/admin/DashboardPage.tsx
client/src/pages/admin/UsersPage.tsx
client/src/pages/admin/ItemsPage.tsx
client/src/pages/admin/ClaimsPage.tsx
client/src/pages/admin/ReportsPage.tsx
client/src/pages/admin/LookupsPage.tsx
client/src/pages/admin/ActivityPage.tsx
client/src/pages/admin/shared.tsx
client/scripts/extended-browser-check.mjs
FRONTEND_EXTENSION_REPORT.md
```

Nhánh vẫn **feature/frontend**. Các file frontend/báo cáo mới vẫn untracked, các file tracked sửa vẫn unstaged; index không có thay đổi staged. Toàn bộ thay đổi đợt 1 và các phần local `RULES.md`, `.audit-evidence/`, `AUDIT_FIXES_REPORT.md`, `docs/design/` được giữ. Không stash/reset/clean, commit/push/merge/deploy.

## Chạy và rà soát

Backend: `npm.cmd run dev` tại gốc với DB/JWT cục bộ đã cấu hình. Frontend: `npm.cmd run dev` trong client, mở `http://localhost:5173`. Mở menu tài khoản để vào hồ sơ/thông báo/báo cáo; ADMIN có thêm “Quản trị hệ thống”. Hướng dẫn cấu hình và lệnh kiểm thử ở [client/README.md](client/README.md).
