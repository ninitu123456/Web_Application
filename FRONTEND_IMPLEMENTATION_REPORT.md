# FindIt — Kết quả triển khai frontend

Phần dưới ghi nhận **đợt 1**. Kết quả mới cho thông báo/hồ sơ/báo cáo/Admin và hồi quy toàn bộ được ghi riêng tại [FRONTEND_EXTENSION_REPORT.md](FRONTEND_EXTENSION_REPORT.md).

Ngày: 03/11/2026 (Asia/Saigon).

## Git và bảo toàn dữ liệu local

Đã fetch origin. `origin/main` ở `115032d`, đi trước HEAD `0b60c1c` hai commit: merge backend audit và cập nhật RULES. Diff nội dung giữa hai đầu chỉ ở `RULES.md`, không khác backend/package/schema.

Git từ chối chuyển thẳng sang origin/main vì sẽ ghi đè RULES local. Đã tạo `feature/frontend` từ HEAD `0b60c1c`, cùng mã backend với origin/main. Không stash/reset/clean, không stage/commit/push/merge/deploy. Branch vẫn 0 commit ahead/2 behind origin/main theo lịch sử; thay đổi triển khai nằm ở working tree.

Giữ nguyên các thay đổi có sẵn: `RULES.md`, `.audit-evidence/`, `AUDIT_FIXES_REPORT.md`, `docs/design/`. Không đưa chúng vào thay đổi triển khai. `git diff --check` trên toàn repository báo dòng trống cuối RULES có sẵn; kiểm tra phần frontend/backend/tài liệu của nhiệm vụ không báo lỗi whitespace.

## Đã viết và kết nối

- React/Vite/TypeScript, Tailwind, React Router; giao diện tiếng Việt, design tokens đen/xám/trắng, card bo lớn, nút pill và responsive theo ảnh tham chiếu đã xem trực tiếp.
- Header, menu tài khoản, route được bảo vệ, đăng ký/đăng nhập, kiểm tra `/users/me`, quay lại URL nội bộ hợp lệ, logout và xử lý hết phiên.
- Trang chủ kết hợp giới thiệu, tìm kiếm, tất cả bộ lọc backend hỗ trợ, sorting, phân trang theo response; bộ lọc đồng bộ URL và đổi lọc về trang đầu.
- Chi tiết, gallery, fallback ảnh, quyền sửa/đóng, gửi Claim, Matching phân trang có điểm/lý do và cache chi tiết bài đối ứng.
- Form tạo/sửa chung, khóa type khi sửa, kiểm tra Unicode/UTF-8, giữ lookup ngừng hoạt động hiện tại, tạo Item trước upload, preview/thêm/xóa ảnh, phục hồi upload lỗi không tạo bài trùng.
- Bài của tôi, yêu cầu đã gửi, Claim nhận được, approve/reject/complete có xác nhận, khóa thao tác và tải lại dữ liệu sau mutation.
- Component dùng chung, loading/empty/error, thông báo, label, focus, native dialog; nội dung người dùng render text.

Token lưu trong **sessionStorage** (fallback trong bộ nhớ), không có refresh token. Hết hạn, logout hoặc authenticated 401 xóa token/cache; response từ phiên cũ bị bỏ qua. Không dùng API logout giả. Backend vẫn quyết định quyền cuối cùng.

## API

Mới:

- `GET /api/categories`, `GET /api/locations`: công khai, chỉ active, DTO đúng `{id,name}`, không nhận query lạ.
- `GET /api/items/mine`: danh tính từ JWT, query chỉ page/limit, lọc chủ bài trong COUNT và SELECT, pagination cấp cao nhất; route trước `/:id`.

Kết nối API hiện có:

- POST `/api/auth/register`, `/api/auth/login`; GET `/api/users/me`.
- GET/POST `/api/items`; GET/PATCH `/api/items/:id`; PATCH `/api/items/:id/close`.
- POST `/api/items/:id/images`, DELETE `/api/items/:id/images/:imageId`.
- GET `/api/items/:id/matches`.
- POST/GET `/api/items/:id/claims`; GET `/api/claims/mine`.
- PATCH `/api/claims/:id/approve`, `/reject`, `/complete`.

Không đổi schema, business rules, Matching algorithm, dependencies hoặc scripts tại package gốc. Không triển khai các khu vực ngoài phạm vi đã duyệt.

## Kiểm chứng thực tế

| Kiểm tra | Kết quả |
| --- | --- |
| Frontend `npm.cmd run typecheck` | Thành công |
| Frontend `npm.cmd run build` | Thành công: TypeScript + Vite production build |
| Frontend `npm.cmd test` | 7 tests đạt, 0 thất bại |
| Frontend `npm.cmd run format:check` | Thành công; chưa cấu hình ESLint |
| Backend `npm.cmd run test:regression` | Unit 127 backend + 7 auth + 7 database; integration 286 đạt, 0 fail/skip/cancel |
| Frontend `npm.cmd run test:browser` | Chrome desktop 1440×1000 và mobile 390×844, real HTTP/backend/MySQL cô lập; suite Item gồm 19 tests đạt, 0 fail/skip/cancel |

Browser đã kiểm tra:

- Đăng ký và điều hướng về đăng nhập, đăng nhập hai tài khoản riêng biệt.
- Tạo FOUND kèm ảnh; fault injection 503 ở upload đầu, thử lại upload cho cùng Item; DB xác nhận không tạo bài trùng.
- Xóa ảnh đã lưu và thêm ảnh thay thế qua giao diện.
- Giữ giá trị danh mục/địa điểm ngừng hoạt động khi sửa nội dung.
- HTML thử nghiệm trong mô tả được hiển thị nguyên dạng text, không thực thi handler.
- Matching có chi tiết bài đối ứng; không lộ proof trên Item công khai/DOM.
- Tìm kiếm, phân trang 13 fixtures qua hai trang, sorting và đổi bộ lọc xóa page cũ.
- Chặn sửa bài người khác, bàn phím/Escape trong modal.
- Nhấp đúp chỉ tạo một request Claim đang chạy; Claim trùng trả lỗi dễ hiểu.
- Chủ bài duyệt sang CLAIMED, xác nhận bàn giao; truy vấn DB xác nhận Claim COMPLETED và Item RETURNED.
- Reload trang con, logout và JWT không hợp lệ xóa sessionStorage/loại nội dung riêng tư.
- Không có uncaught browser error, không tràn ngang mobile.

Tất cả ghi dữ liệu test nằm trong MySQL instance tạm do runner có sẵn tạo; marker/datadir/port được xác minh và dọn đúng instance sau test. Không dùng DB của dịch vụ đang cài. Storage Cloudinary giả ở ranh giới lưu ảnh; Auth/Item/Matching/Claim, JWT, SQL và transactions dùng code thật.

Artifacts bị ignore: `.cache/frontend-regression.txt`, `.cache/frontend-browser.txt`, `.cache/frontend-browser/{desktop-explore,mobile-explore,desktop-detail,mobile-detail}.png`. Ảnh trang chủ đã được mở và kiểm tra trực tiếp.

## Lệnh chạy

Tại gốc: `npm.cmd ci`, `npm.cmd run dev` (hoặc `npm.cmd start`). Backend cần cấu hình DB/JWT cục bộ theo tài liệu hiện có, không tự thay `.env`.

Tại `client/`: `npm.cmd ci`, `npm.cmd run dev`; mở `http://localhost:5173`. API mặc định `http://127.0.0.1:3001/api`; đổi qua `VITE_API_BASE_URL`. CORS backend mặc định đã cho phép localhost:5173.

`npm.cmd run test:browser` từ client tự build với API cùng origin và chạy MySQL cô lập. Lệnh này cần Chrome cài sẵn, hoặc `FINDIT_BROWSER_CHANNEL=msedge`; runner tìm executable MySQL hiện có hoặc qua `MYSQLD_PATH`. Xem `client/README.md` và `server/FRONTEND-API.md`.

## Giới hạn đã ghi nhận

- Chưa kiểm chứng Cloudinary qua mạng thật; không dùng credentials cloud thật trong tests.
- Chưa kiểm chứng Firefox/Safari, thiết bị vật lý, screen reader hoặc môi trường hosting production. Chưa chạy coverage baseline mới hay audit dependencies cho phiên triển khai này.
- Cấu hình hosting tương lai phải có SPA fallback và đúng CORS. Chưa deploy hoặc khẳng định production hosting đã hoạt động.
- Font từ Google Fonts, có fallback hệ thống khi không tải được.
- Backend chưa có idempotency key/refresh token. Giao diện không tự retry mutation; create mất phản hồi yêu cầu kiểm tra bài hiện có, không tự tạo lại.

## File thay đổi trong phạm vi

Sửa:

```text
README.md
server/README.md
server/SECURITY.md
server/app.js
server/server.js
server/controllers/item.controller.js
server/repositories/item.repository.js
server/routes/index.js
server/routes/item.routes.js
server/services/item.service.js
server/tests/items.integration.js
```

Thêm:

```text
FRONTEND_IMPLEMENTATION_REPORT.md
server/FRONTEND-API.md
server/controllers/lookup.controller.js
server/repositories/lookup.repository.js
server/services/lookup.service.js
server/tests/frontend-api.test.js
client/.env.example
client/.gitignore
client/README.md
client/index.html
client/package.json
client/package-lock.json
client/tsconfig.json
client/vite.config.ts
client/scripts/browser-check.mjs
client/scripts/test-browser.mjs
client/src/main.tsx
client/src/styles.css
client/src/components/Layout.tsx
client/src/components/ui.tsx
client/src/lib/api.ts
client/src/lib/api.test.ts
client/src/lib/auth.tsx
client/src/lib/hooks.ts
client/src/lib/types.ts
client/src/lib/validation.ts
client/src/lib/validation.test.ts
client/src/pages/AuthPage.tsx
client/src/pages/Claims.tsx
client/src/pages/ExplorePage.tsx
client/src/pages/ItemDetailPage.tsx
client/src/pages/ItemFormPage.tsx
client/src/pages/MyItemsPage.tsx
```

Các file client mới và backend mới vẫn untracked; các file sửa vẫn unstaged. Không có commit mới; không có push, merge hoặc deploy.
