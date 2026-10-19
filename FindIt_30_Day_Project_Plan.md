# FINDIT – SMART CAMPUS LOST AND FOUND MANAGEMENT SYSTEM

OFFICIAL DEVELOPMENT PLAN · VERSION 1.0

Thời gian thực hiện

# 30 ngày

Nhân sự

# 2 thành viên

Phương pháp

**Incremental Development**

Sản phẩm cuối

**Full-stack Web Application**

## I. Mục tiêu và phạm vi dự án

FindIt là hệ thống quản lý đồ thất lạc và tìm thấy trong khuôn viên đại học, dành cho sinh viên, giảng viên và nhân viên.

Hệ thống cho phép người dùng đăng thông tin đồ bị mất hoặc nhặt được, tự động đề xuất các bài đăng có khả năng liên quan, gửi yêu cầu nhận lại đồ, xác minh quyền sở hữu và quản lý quá trình bàn giao.

**Quy trình nghiệp vụ chính:**

Luồng nghiệp vụ xuyên suốt từ đăng bài đến hoàn trả đồ vật

### 1. Công nghệ thống nhất

| Thành phần | Công nghệ |
|--------|--------|
| Frontend | React, Vite, JavaScript |
| Styling | Tailwind CSS |
| Routing / API | React Router, Axios |
| Backend | Node.js, Express.js |
| Database | MySQL 8, mysql2/promise |
| Authentication | JWT, bcrypt |
| Validation | Zod |
| Image upload | Multer, Cloudinary |
| Smart Matching | Rule-based scoring bằng JavaScript |
| Dashboard | Recharts |
| Testing | Postman, Vitest, Supertest |
| Version Control | Git, GitHub |
| Deployment | Vercel, Render, Managed MySQL |

### 2. Các module bắt buộc

| Module | Phạm vi |
|--------|--------|
| Auth & User | Đăng ký, đăng nhập, JWT, hồ sơ, phân quyền |
| Item Management | CRUD Lost/Found, hình ảnh, trạng thái |
| Search & Filter | Tìm theo từ khóa, loại, danh mục, địa điểm, ngày |
| Smart Matching | Tính điểm tương đồng, lưu và giải thích gợi ý |
| Claim Verification | Gửi yêu cầu, duyệt, từ chối, hoàn tất bàn giao |
| Notification | Thông báo trong ứng dụng |
| Admin | Quản lý user, bài đăng, danh mục, báo cáo vi phạm |
| Dashboard | Thống kê và biểu đồ |
| Report | Người dùng gửi báo cáo, admin xử lý |
| Testing & Deployment | Kiểm thử và triển khai hệ thống |

Không triển khai AI/ML, real-time chat, thanh toán, email/SSO hoặc hệ thống giải quyết tranh chấp phức tạp trong 30 ngày. Smart Matching sử dụng thuật toán có quy tắc và trọng số rõ ràng.

## II. Phân chia trách nhiệm và quy tắc phối hợp

Hai người đều phải tham gia trực tiếp cả **Database, Backend và Frontend**, nhưng mỗi chức năng có một người chịu trách nhiệm tích hợp chính.

| Công việc | Người 1 | Người 2 |
|--------|--------|--------|
| Database | Auth, Matching, Notification | Item, Claim, Report |
| Backend | Auth, User, Search, Matching, Notification | Item, Claim, Admin, Report |
| Frontend | Auth, Profile, Search, Matching | Item, Claim, Admin, Dashboard |
| Testing | Auth, Search, Matching, Security | Item, Claim, Admin, Integration |
| Deployment | Frontend, kiểm thử production | Backend, MySQL, Cloudinary |
| Tài liệu | API, thuật toán, hướng dẫn sử dụng | ERD, testing, deployment |

Phân chia này là trách nhiệm chính, không có nghĩa một người chỉ được làm phần của mình. Mỗi ngày, cả hai phải hiểu, chạy thử và review phần liên quan của người còn lại.

### Quy tắc làm việc bắt buộc

1. Dùng một GitHub repository với thư mục `client/`, `server/`, `docs/`.
2. Mỗi ngày thống nhất API contract, database schema hoặc giao diện dữ liệu trước khi code.
3. Tách branch `feature/...` theo từng nhiệm vụ; không trực tiếp commit vào `main`.
4. Không cùng sửa một file nếu chưa thống nhất người chịu trách nhiệm.
5. Khi API chưa hoàn thiện, Frontend sử dụng mock data đúng contract đã chốt.
6. Mỗi ngày đều phải có pull request, review chéo, chạy thử và ghi kết quả.
7. Chỉ merge vào `main` khi code chạy được, không phá vỡ chức năng của ngày trước.
8. Database migration được đánh số thứ tự; không tùy tiện sửa migration đã áp dụng.
9. Không để testing và integration dồn hết vào hai ngày cuối.

## III. Lộ trình tổng thể

Thanh tiến độ biểu thị mốc mục tiêu kế hoạch, không phải tiến độ thực tế.

Milestone được kiểm tra vào cuối ngày **7, 14, 21, 28 và 30**. Nếu chưa đạt tiêu chí nghiệm thu, phải ưu tiên sửa lỗi cản trở trước khi phát triển chức năng mới.

---

# IV. Kế hoạch chi tiết 30 ngày

## Tuần 1 — Database & Backend Foundation

Ngày 1–7 · Mục tiêu: Hoàn thiện kiến trúc, cơ sở dữ liệu, xác thực và CRUD Item cơ bản.

### Ngày 1 — Requirement, ERD và API Contract

**Mục tiêu chung:** Hai người thống nhất cách hệ thống hoạt động, dữ liệu được lưu trữ và giao tiếp giữa các module.

**Người 1 — Phân tích nghiệp vụ**

- Chốt use cases Auth, User, Search, Matching.
- Định nghĩa roles `USER`, `ADMIN`.
- Định nghĩa các API request/response và mã lỗi.
- Đề xuất luồng JWT và phân quyền.

**Người 2 — Thiết kế dữ liệu**

- Chốt use cases Item, Claim, Admin, Report.
- Vẽ ERD gồm 11 bảng.
- Xác định PK, FK, unique constraints.
- Đề xuất các trạng thái và quan hệ giữa bảng.

**Phối hợp:** Cùng review ERD và kiểm tra từng API có đủ dữ liệu để thực hiện nghiệp vụ hay không. Chốt `item.type = LOST/FOUND`, `item.status = OPEN/CLAIM_PENDING/RETURNED/CLOSED`, `match.status = SUGGESTED/CONFIRMED/DISMISSED`, `claim.status = PENDING/APPROVED/REJECTED/COMPLETED`.

**Sản phẩm cuối ngày:** `requirements.md`, `ERD.png`, `api-contract.md`, `status-rules.md`.

### Ngày 2 — Tạo MySQL Database

**Mục tiêu chung:** Có schema hoàn chỉnh để tất cả module cùng sử dụng.

**Người 1:**

- Tạo migration cho `roles`, `users`, `notifications`, `activity_logs`, `matches`.
- Tạo khóa ngoại và unique constraints liên quan.
- Tạo seed cho roles và tài khoản test.
- Kiểm tra các quan hệ user–notification và item–match.

**Người 2:**

- Tạo migration cho `categories`, `locations`, `items`, `item_images`, `claims`, `reports`.
- Tạo các index tìm kiếm và khóa ngoại.
- Seed categories, locations và item mẫu.
- Kiểm tra ràng buộc Item–Claim–Report.

**Phối hợp:** Người 2 tạo bảng nền tảng `items` trước khi chạy migration `matches` của Người 1. Hai người thống nhất thứ tự migration và chạy lại toàn bộ schema từ database rỗng.

**Sản phẩm cuối ngày:** MySQL database 11 bảng, migration chạy thành công, seed data và `database-schema.sql`.

### Ngày 3 — Setup Backend và kết nối MySQL

**Mục tiêu chung:** Express server chạy được và kết nối thành công MySQL.

**Người 1:**

- Khởi tạo Node.js, Express.
- Tạo `app.js`, `server.js`, cấu trúc routes/controllers/services.
- Tạo global error handler và validation middleware.
- Viết `GET /api/health`.

**Người 2:**

- Cấu hình `mysql2/promise` connection pool.
- Tạo `db.js`, `.env.example`, DB configuration.
- Tạo database query helper và kiểm tra connection.
- Viết kiểm thử truy vấn dữ liệu mẫu.

**Phối hợp:** Cùng thống nhất cấu trúc `server/src`, import/export và response format. Ghép Express với DB pool.

**Sản phẩm cuối ngày:** Backend khởi động ổn định, `/api/health` trả kết quả và MySQL kết nối thành công.

### Ngày 4 — Authentication: Register & Login

**Mục tiêu chung:** Người dùng có thể tạo tài khoản và đăng nhập an toàn.

**Người 1:**

- Implement `POST /api/auth/register`.
- Implement `POST /api/auth/login`.
- Hash password bằng bcrypt.
- Tạo và ký JWT, validate request bằng Zod.

**Người 2:**

- Viết user queries và kiểm tra duplicate email.
- Tạo auth middleware kiểm tra JWT.
- Viết authorization middleware cho role.
- Tạo Postman tests cho login/register.

**Phối hợp:** Người 1 phụ trách controller/service, Người 2 phụ trách query/middleware. Thử login bằng tài khoản mới và truy cập route được bảo vệ.

**Sản phẩm cuối ngày:** Register, Login, JWT authentication hoạt động; có test cho token sai, mật khẩu sai và email trùng.

### Ngày 5 — User Profile & Permissions

**Mục tiêu chung:** Người dùng quản lý hồ sơ và chỉ truy cập dữ liệu được phép.

**Người 1:**

- Implement `GET /api/users/me`.
- Implement `PATCH /api/users/me`.
- Validate profile fields.
- Ngăn sửa role và trường nhạy cảm.

**Người 2:**

- Viết truy vấn update profile.
- Implement kiểm tra ownership.
- Tạo role middleware cho admin routes.
- Test user A không được sửa tài nguyên của user B.

**Phối hợp:** Dùng JWT của ngày 4 để test toàn bộ User API. Review các trường được phép cập nhật.

**Sản phẩm cuối ngày:** User API hoàn chỉnh, kiểm tra role/ownership thành công.

### Ngày 6 — Item CRUD và Cloudinary

**Mục tiêu chung:** Người dùng tạo, xem, sửa và đóng bài đăng Lost/Found.

**Người 1:**

- Tạo Item validation schema.
- Implement logic kiểm tra owner và trạng thái hợp lệ.
- Viết các test cho Item API.
- Chuẩn hóa response Item để frontend sử dụng.

**Người 2:**

- Implement `POST /api/items`, `GET /api/items/:id`.
- Implement `PATCH /api/items/:id`, đóng bài bằng cập nhật status.
- Tích hợp Multer và Cloudinary upload ảnh.
- Lưu URL/public ID ảnh trong `item_images`.

**Phối hợp:** Người 2 xây CRUD, Người 1 kiểm tra quyền và dữ liệu. Thử tạo bài có ảnh, sửa bài và kiểm tra ảnh lưu trên Cloudinary.

**Sản phẩm cuối ngày:** Item CRUD hoạt động, upload ảnh thành công, không cho người lạ sửa bài.

### Ngày 7 — Integration & Milestone 1

**Mục tiêu chung:** Hoàn thiện nền tảng Backend và kiểm thử luồng Auth → Item.

**Người 1:**

- Kiểm thử register/login/profile.
- Kiểm thử validation, JWT, ownership.
- Sửa lỗi Auth/User và bổ sung tài liệu API.

**Người 2:**

- Kiểm thử database migration, CRUD Item, Cloudinary.
- Sửa lỗi DB/Item.
- Kiểm tra toàn bộ cấu hình môi trường.

**Phối hợp:** Chạy lại dự án từ máy sạch, import DB, seed data, đăng nhập, đăng bài có ảnh, sửa bài, kiểm tra quyền. Review và merge code.

**Sản phẩm cuối ngày:** Backend Foundation v1, Postman collection và báo cáo Milestone 1.

**Milestone 1 — Ngày 7** (Foundation)

---

## Tuần 2 — Core Business Backend

Ngày 8–14 · Mục tiêu: Hoàn thiện Search, Smart Matching, Claim, Notification, Report và API Admin.

### Ngày 8 — Search & Filter API

**Mục tiêu chung:** Tìm kiếm các bài Lost/Found nhanh và đúng điều kiện.

**Người 1:**

- Implement `GET /api/items` với keyword search.
- Thêm lọc `type`, `category`, `location`, `status`.
- Thêm pagination, sorting và date range.
- Trả về metadata tổng số trang và kết quả.

**Người 2:**

- Tạo hoặc điều chỉnh index MySQL.
- Viết query tối ưu cho search.
- Seed dữ liệu đa dạng để test.
- Test kết hợp nhiều filter, không có kết quả, phân trang.

**Phối hợp:** Người 1 xây API, Người 2 tối ưu DB và kiểm tra query. Cùng thống nhất query parameters với frontend.

**Sản phẩm cuối ngày:** Search API có filter, sort, pagination, kết quả chính xác.

### Ngày 9 — Smart Matching Algorithm

**Mục tiêu chung:** Tạo thuật toán đề xuất bài Lost–Found có khả năng trùng nhau.

**Người 1:**

- Implement `matching.service.js`.
- Chuẩn hóa text, so khớp danh mục, địa điểm, ngày, mô tả.
- Tính điểm từ 0–100.
- Trả về lý do matching và xử lý trường dữ liệu thiếu.

**Người 2:**

- Viết truy vấn lấy ứng viên từ MySQL.
- Chỉ lấy cặp LOST–FOUND hợp lệ.
- Kiểm tra ngày nhặt không sớm hơn ngày mất.
- Viết unit test với các cặp item giả lập.

**Phối hợp:** Cùng kiểm tra công thức thống nhất:

\[
Score=0.30C+0.20L+0.20D+0.30T
\]

Trong đó C, L, D, T đều là điểm 0–100; ngưỡng đề xuất là **70/100**.

**Sản phẩm cuối ngày:** Matching engine hoạt động độc lập, có unit tests và tài liệu giải thích cách tính điểm.

### Ngày 10 — Matching Integration & Persistence

**Mục tiêu chung:** Kết nối Matching với Item và lưu kết quả gợi ý.

**Người 1:**

- Tích hợp matching khi tạo/cập nhật Item.
- Implement `GET /api/items/:id/matches`.
- Trả score, lý do matching, item liên quan.
- Đảm bảo không tạo gợi ý cho cùng một item.

**Người 2:**

- Implement insert/upsert vào bảng `matches`.
- Chống duplicate theo cặp Lost–Found.
- Xử lý kết quả cũ khi Item thay đổi.
- Kiểm tra matching không áp dụng cho Item đã RETURNED/CLOSED.

**Phối hợp:** Tạo một bài LOST và một bài FOUND tương đồng, kiểm tra điểm, lý do và dữ liệu trong MySQL. Kiểm tra cập nhật bài không tạo duplicate.

**Sản phẩm cuối ngày:** Smart Matching API hoạt động end-to-end, kết quả được lưu trong database.

### Ngày 11 — Claim Creation & Validation

**Mục tiêu chung:** Người dùng có thể gửi yêu cầu nhận lại đồ vật.

**Người 1:**

- Định nghĩa Claim validation schema.
- Viết các rule kiểm tra nghiệp vụ.
- Viết test cho self-claim, duplicate, invalid status.
- Kiểm tra thông tin xác minh không lộ công khai.

**Người 2:**

- Implement `POST /api/items/:id/claims`.
- Implement `GET /api/claims/mine`.
- Implement `GET /api/items/:id/claims` cho owner.
- Lưu bằng chứng/mô tả xác minh và trạng thái PENDING.

**Phối hợp:** Người 1 cung cấp validation/rule tests, Người 2 xây API. Test tạo claim hợp lệ và các trường hợp bị từ chối.

**Sản phẩm cuối ngày:** Claim API tạo và xem yêu cầu, ngăn self-claim, duplicate claim và claim Item không hợp lệ.

### Ngày 12 — Claim Approval, Completion & Transactions

**Mục tiêu chung:** Xử lý yêu cầu nhận đồ và hoàn tất bàn giao an toàn.

**Người 1:**

- Xây helper kiểm tra state transition.
- Implement audit log cho thao tác Claim.
- Viết integration tests cho giao dịch.
- Kiểm tra đồng thời nhiều yêu cầu nhận một item.

**Người 2:**

- Implement approve/reject claim.
- Implement hoàn tất bàn giao.
- Sử dụng MySQL transaction và row locking.
- Đồng bộ trạng thái Item và Claim.

**Phối hợp:** Test từ `PENDING → APPROVED → COMPLETED`, đồng thời kiểm tra `PENDING → REJECTED`. Không cho hai claim cùng được approve trên một item. Chỉ owner bài FOUND được duyệt và hoàn tất bàn giao sau xác nhận.

**Sản phẩm cuối ngày:** Claim workflow chạy hoàn chỉnh, transaction rollback đúng khi lỗi.

### Ngày 13 — Notification & Report Backend

**Mục tiêu chung:** Người dùng nhận được thông báo và có thể báo cáo bài đăng vi phạm.

**Người 1:**

- Implement Notification service.
- Implement `GET /api/notifications`, `PATCH /api/notifications/:id/read`.
- Tạo thông báo khi có match mới, claim mới, claim đổi trạng thái.
- Đảm bảo thông báo chỉ hiển thị cho đúng người.

**Người 2:**

- Implement `POST /api/reports`.
- Implement `GET /api/admin/reports`.
- Implement xử lý report với trạng thái `PENDING/RESOLVED/REJECTED`.
- Viết test quyền xem và xử lý report.

**Phối hợp:** Dùng luồng Matching/Claim để kích hoạt notification và dùng Item có sẵn để gửi report. Chốt payload để frontend hiển thị.

**Sản phẩm cuối ngày:** Notification API và Report API hoạt động, có dữ liệu mẫu và test quyền truy cập.

### Ngày 14 — Admin API & Milestone 2

**Mục tiêu chung:** Hoàn thiện backend nghiệp vụ và API quản trị.

**Người 1:**

- Implement Dashboard statistics API.
- Thống kê Lost/Found, Returned, Claims, Matches.
- Thêm thống kê theo thời gian/danh mục.
- Viết integration tests Search–Matching–Notification.

**Người 2:**

- Implement Admin User/Item management APIs.
- Implement quản lý categories/locations.
- Hoàn thiện Report moderation API.
- Test role ADMIN và USER, kiểm tra admin actions có audit log.

**Phối hợp:** Cùng chạy toàn bộ API bằng Postman, review authorization và transaction. Đóng băng API contract v1 để frontend tuần 3 triển khai.

**Sản phẩm cuối ngày:** Backend v1 hoàn chỉnh, Postman collection, OpenAPI/API documentation và test report.

**Milestone 2 — Ngày 14** (Core Backend)

---

## Tuần 3 — React Frontend & Integration

Ngày 15–21 · Mục tiêu: Xây dựng giao diện người dùng, tích hợp các API và hoàn thiện luồng nghiệp vụ chính trên website.

### Ngày 15 — Frontend Setup & UI Architecture

**Mục tiêu chung:** Tạo nền tảng React để cả hai phát triển giao diện độc lập nhưng thống nhất.

**Người 1:**

- Khởi tạo React với Vite.
- Cài React Router, Axios, Tailwind CSS.
- Tạo `AuthContext`, Axios instance và route guards.
- Thiết kế các component dùng chung: Button, Input, Alert, Loading, Modal.

**Người 2:**

- Thiết kế Main Layout, Navbar, Footer và Sidebar.
- Tạo các component ItemCard, StatusBadge, ImageUploader.
- Xây dựng responsive layout.
- Chuẩn bị mock data đúng API contract ngày 14.

**Phối hợp:** Người 1 sở hữu `contexts/`, `services/`, `components/common/`; Người 2 sở hữu `layouts/`, `components/items/`. Cùng thống nhất màu sắc, spacing, breakpoints và cách xử lý loading/error.

**Sản phẩm cuối ngày:** Frontend chạy được, có navigation, layout responsive, Axios và cấu trúc component thống nhất.

### Ngày 16 — Login, Register & Profile UI

**Mục tiêu chung:** Người dùng có thể đăng ký, đăng nhập và quản lý hồ sơ trên website.

**Người 1:**

- Xây LoginPage, RegisterPage.
- Tích hợp Auth API.
- Xử lý authentication state và protected routes.
- Hiển thị lỗi validation, trạng thái loading.

**Người 2:**

- Xây ProfilePage và EditProfileForm.
- Tích hợp User API.
- Hiển thị thông tin tài khoản và vai trò.
- Test responsive, validation và trạng thái hết phiên.

**Phối hợp:** Người 2 sử dụng AuthContext do Người 1 cung cấp. Thống nhất interface `useAuth()` ngay đầu ngày để không phải chờ hoàn thành toàn bộ Auth UI.

**Sản phẩm cuối ngày:** Đăng ký → đăng nhập → xem/sửa hồ sơ → đăng xuất hoạt động trên React.

### Ngày 17 — Item Listing & Item Creation UI

**Mục tiêu chung:** Người dùng có thể xem danh sách và đăng bài Lost/Found có hình ảnh.

**Người 1:**

- Xây ItemListPage.
- Tích hợp API lấy danh sách Item.
- Tạo ItemCard và phân trang.
- Hiển thị loại LOST/FOUND, danh mục, địa điểm, trạng thái.

**Người 2:**

- Xây CreateItemPage và ItemForm.
- Tích hợp tạo Item và upload Cloudinary.
- Xây chọn category, location, date.
- Validate dữ liệu và preview ảnh.

**Phối hợp:** Người 2 tạo Item thành công thì điều hướng về danh sách do Người 1 xây. Cùng test dữ liệu tạo mới hiển thị chính xác.

**Sản phẩm cuối ngày:** Người dùng đăng bài Lost/Found có ảnh và xem được bài vừa đăng.

### Ngày 18 — Item Detail, Edit & Search UI

**Mục tiêu chung:** Người dùng tìm kiếm, xem chi tiết và quản lý bài đăng của mình.

**Người 1:**

- Xây SearchBar và FilterPanel.
- Tích hợp keyword, category, location, type, date filter.
- Đồng bộ filter với URL query parameters.
- Xử lý pagination, empty state và loading.

**Người 2:**

- Xây ItemDetailPage.
- Xây EditItemPage và MyItemsPage.
- Tích hợp cập nhật và đóng bài đăng.
- Ẩn thao tác chỉnh sửa đối với người không sở hữu bài.

**Phối hợp:** Kết quả Search của Người 1 điều hướng đến ItemDetail của Người 2. Test tìm kiếm → mở bài → sửa bài → kết quả tìm kiếm cập nhật.

**Sản phẩm cuối ngày:** Search/Filter, Item Detail, Edit và My Items hoạt động end-to-end.

### Ngày 19 — Smart Matching UI

**Mục tiêu chung:** Người dùng xem các gợi ý đồ vật tương đồng và lý do được đề xuất.

**Người 1:**

- Xây MatchingPage và MatchCard.
- Tích hợp Matching API.
- Hiển thị điểm tương đồng 0–100.
- Hiển thị lý do matching và trạng thái gợi ý.

**Người 2:**

- Tạo MatchingSection trong ItemDetail.
- Xây giao diện so sánh hai bài Lost–Found.
- Hiển thị thông tin category, location, date, description.
- Xử lý empty state khi không có match.

**Phối hợp:** Cùng sử dụng một `matchService` và response format. Test bài mới tạo sinh gợi ý và mở được bài tương ứng.

**Sản phẩm cuối ngày:** Matching UI hoạt động, hiển thị score, lý do và thông tin hai bài liên quan.

### Ngày 20 — Claim & Notification UI

**Mục tiêu chung:** Người dùng gửi yêu cầu nhận đồ, người giữ đồ xét duyệt và hai bên nhận thông báo.

**Người 1:**

- Xây NotificationBell và NotificationsPage.
- Tích hợp đọc danh sách, đánh dấu đã đọc.
- Hiển thị thông báo Match/Claim.
- Điều hướng thông báo đến Item hoặc Claim tương ứng.

**Người 2:**

- Xây ClaimForm, MyClaimsPage, ClaimManagementPage.
- Tích hợp gửi claim, approve/reject và complete.
- Hiển thị bằng chứng xác minh cho đúng người có quyền.
- Hiển thị trạng thái và lịch sử xử lý.

**Phối hợp:** Người 2 tạo hoặc thay đổi Claim, Người 1 kiểm tra notification được tạo và hiển thị đúng. Cùng test hai tài khoản riêng biệt.

**Sản phẩm cuối ngày:** Claim và Notification hoạt động trên giao diện thực tế.

### Ngày 21 — Full User Flow Integration & Milestone 3

**Mục tiêu chung:** Hoàn thiện luồng người dùng từ đầu đến cuối.

**Người 1:**

- Kiểm thử Auth, Profile, Search, Matching, Notification.
- Sửa lỗi frontend routing và API handling.
- Kiểm tra responsive trên mobile và desktop.
- Hoàn thiện loading, error, empty states.

**Người 2:**

- Kiểm thử Item, Cloudinary, Claim.
- Sửa lỗi trạng thái Item/Claim.
- Kiểm tra phân quyền giao diện.
- Chuẩn hóa thông báo thành công/thất bại.

**Phối hợp:** Sử dụng ba tài khoản test: User A (người mất đồ), User B (người nhặt đồ), Admin. Thực hiện kịch bản hoàn chỉnh:

1. User A đăng bài LOST.
2. User B đăng bài FOUND tương đồng.
3. Matching engine đề xuất cặp bài.
4. User A xem gợi ý và gửi Claim cho bài FOUND.
5. User B nhận thông báo, kiểm tra và approve.
6. Hai bên xác nhận bàn giao theo quy trình đã chốt.
7. User B hoàn tất Claim; Item chuyển RETURNED.
8. User A nhận thông báo kết quả.

**Sản phẩm cuối ngày:** User-facing MVP hoàn chỉnh, video/screenshot minh chứng và báo cáo Milestone 3.

**Milestone 3 — Ngày 21** (User MVP)

---

## Tuần 4 — Admin, Report, Testing & Deployment

Ngày 22–28 · Mục tiêu: Hoàn thiện quản trị, kiểm thử, bảo mật và triển khai hệ thống lên Internet.

### Ngày 22 — Admin Dashboard UI

**Mục tiêu chung:** Admin có giao diện theo dõi tình trạng hoạt động của hệ thống.

**Người 1:**

- Xây các thống kê tổng số User, Item, Match, Claim.
- Tạo KPI cards và component thống kê.
- Tích hợp Dashboard statistics API.
- Xử lý loading và trường hợp dữ liệu rỗng.

**Người 2:**

- Xây AdminLayout, AdminSidebar.
- Tạo biểu đồ bằng Recharts.
- Hiển thị Lost/Found theo thời gian và danh mục.
- Tích hợp protected admin routes.

**Phối hợp:** Người 1 phụ trách các component KPI, Người 2 phụ trách layout và charts. Cùng test quyền admin và số liệu thống kê khớp MySQL.

**Sản phẩm cuối ngày:** Admin Dashboard hiển thị KPI và biểu đồ bằng dữ liệu thật.

### Ngày 23 — Admin Management & Report UI

**Mục tiêu chung:** Admin quản lý người dùng, bài đăng và xử lý báo cáo vi phạm.

**Người 1:**

- Xây giao diện UserManagement.
- Xây quản lý categories và locations.
- Tích hợp các API quản trị tương ứng.
- Hiển thị xác nhận trước thao tác ảnh hưởng dữ liệu.

**Người 2:**

- Xây ItemManagement và ReportManagement.
- Tạo ReportForm cho người dùng.
- Tích hợp xem/xử lý report.
- Hiển thị trạng thái report và lịch sử xử lý.

**Phối hợp:** Dùng một tài khoản USER gửi report, tài khoản ADMIN xử lý. Kiểm tra danh sách và trạng thái cập nhật chính xác.

**Sản phẩm cuối ngày:** Admin quản lý được users, items, categories, locations và reports.

### Ngày 24 — Automated Testing

**Mục tiêu chung:** Tăng độ tin cậy bằng kiểm thử tự động cho nghiệp vụ quan trọng.

**Người 1:**

- Viết unit tests cho Matching.
- Viết tests Auth/JWT/authorization.
- Kiểm tra Search/Filter với dữ liệu biên.
- Kiểm tra validation và lỗi API.

**Người 2:**

- Viết integration tests Item/Claim.
- Kiểm tra Claim transactions và rollback.
- Kiểm tra Report/Admin authorization.
- Test upload ảnh lỗi và dữ liệu không hợp lệ.

**Phối hợp:** Chạy chung test suite với database test riêng. Tạo danh sách lỗi theo mức `Critical/High/Medium/Low`; sửa ngay các lỗi Critical.

**Sản phẩm cuối ngày:** Automated test suite, test results và bug backlog.

### Ngày 25 — Security & Data Integrity Testing

**Mục tiêu chung:** Đảm bảo dữ liệu và thao tác nhạy cảm được bảo vệ.

**Người 1:**

- Kiểm tra JWT invalid/expired.
- Kiểm tra truy cập trái phép và IDOR.
- Kiểm tra XSS, validation và CORS.
- Thêm rate limiting cho login và các endpoint cần thiết.

**Người 2:**

- Kiểm tra SQL injection và parameterized queries.
- Kiểm tra file type/size upload.
- Kiểm tra foreign keys, transactions và concurrent claims.
- Kiểm tra audit logs và quyền admin.

**Phối hợp:** Review chéo security checklist. Thử các request độc hại bằng Postman, xác nhận server trả mã lỗi phù hợp và không làm sai dữ liệu.

**Sản phẩm cuối ngày:** Security test report, các lỗi nghiêm trọng được sửa và database integrity được xác nhận.

### Ngày 26 — System Testing & UI Polish

**Mục tiêu chung:** Hoàn thiện trải nghiệm và kiểm thử toàn hệ thống trước khi deploy.

**Người 1:**

- Kiểm tra giao diện responsive ở 375px, tablet và desktop.
- Hoàn thiện form validation, error/empty/loading states.
- Kiểm tra accessibility cơ bản.
- Sửa lỗi Search/Matching/Notification.

**Người 2:**

- Kiểm tra tất cả Item/Claim/Admin/Report flows.
- Hoàn thiện trạng thái, modal xác nhận, thông báo.
- Kiểm tra upload, pagination và biểu đồ.
- Sửa lỗi hiển thị và dữ liệu không đồng bộ.

**Phối hợp:** Thực hiện regression testing toàn bộ chức năng, kiểm tra console/network errors. Chốt danh sách lỗi còn lại trước triển khai.

**Sản phẩm cuối ngày:** Release Candidate v1, regression test report và UI ổn định.

### Ngày 27 — Deployment Backend, Database & Frontend

**Mục tiêu chung:** Đưa hệ thống lên môi trường production.

**Người 1:**

- Deploy React/Vite lên Vercel.
- Cấu hình `VITE_API_BASE_URL`.
- Cấu hình SPA routing và build.
- Kiểm tra frontend truy cập được bằng URL public.

**Người 2:**

- Deploy Express backend lên Render.
- Cấu hình Managed MySQL và chạy migrations.
- Cấu hình JWT secret, Cloudinary, CORS.
- Kiểm tra health endpoint và production logs.

**Phối hợp:** Khi backend production sẵn sàng, Người 1 kết nối frontend. Cùng kiểm tra register/login, tạo bài, upload ảnh, Search, Matching, Claim và Admin trên môi trường thật.

**Sản phẩm cuối ngày:** Public Frontend URL, Backend URL, production database và hướng dẫn cấu hình môi trường.

### Ngày 28 — Production Verification & Milestone 4

**Mục tiêu chung:** Xác nhận hệ thống production vận hành ổn định.

**Người 1:**

- Chạy smoke test Auth, Search, Matching, Notification trên production.
- Kiểm tra routing, HTTPS, API errors và responsive.
- Sửa các lỗi frontend production.
- Ghi nhận kết quả kiểm thử.

**Người 2:**

- Chạy smoke test Item, Claim, Report, Admin.
- Kiểm tra MySQL, Cloudinary và logs.
- Kiểm tra migration, dữ liệu mẫu và backup.
- Sửa các lỗi backend production.

**Phối hợp:** Chạy lại full user flow trên public URL, sử dụng tài khoản test không chứa thông tin cá nhân thật. Kiểm tra trạng thái sau refresh và đăng nhập lại.

**Sản phẩm cuối ngày:** Production Release v1, deployment checklist và báo cáo Milestone 4.

**Milestone 4 — Ngày 28** (Production Ready)

---

## Hai ngày hoàn thiện — Final Acceptance & Handover

### Ngày 29 — UAT, Documentation & Demo Preparation

**Mục tiêu chung:** Chuẩn bị đầy đủ minh chứng, tài liệu và demo cho buổi đánh giá dự án.

**Người 1:**

- Viết README hướng dẫn cài đặt và chạy dự án.
- Hoàn thiện API documentation.
- Viết tài liệu giải thích Smart Matching.
- Chuẩn bị kịch bản demo người dùng.

**Người 2:**

- Hoàn thiện ERD và database documentation.
- Viết deployment guide và test report.
- Chuẩn bị demo Admin Dashboard và Report.
- Tổng hợp screenshot, video và kết quả kiểm thử.

**Phối hợp:** Cùng thực hiện UAT bằng tài khoản người dùng thử, chạy toàn bộ kịch bản nghiệp vụ và ghi nhận lỗi. Tập demo từ 10–15 phút, kiểm tra dữ liệu demo và phương án dự phòng khi mạng lỗi.

**Sản phẩm cuối ngày:** Documentation hoàn chỉnh, UAT report, demo script và dữ liệu demo.

### Ngày 30 — Final Regression, Acceptance & Submission

**Mục tiêu chung:** Chốt phiên bản cuối cùng, xác nhận tiêu chí nghiệm thu và bàn giao dự án.

**Người 1:**

- Chạy final regression cho Auth, User, Search, Matching, Notification.
- Kiểm tra README và frontend production.
- Chuẩn bị phần trình bày kiến trúc, thuật toán, trải nghiệm người dùng.
- Đóng các issue đã hoàn thành.

**Người 2:**

- Chạy final regression cho Item, Claim, Admin, Report.
- Kiểm tra database, deployment và backup.
- Chuẩn bị phần trình bày ERD, workflow và dashboard.
- Tạo release tag `v1.0.0`.

**Phối hợp:** Hai người cùng demo từ đầu đến cuối, kiểm tra GitHub repository, production URLs, tài liệu, video và kết quả test. Chỉ chốt release khi toàn bộ tiêu chí bắt buộc đạt.

**Sản phẩm cuối ngày:** FindIt v1.0.0 hoàn chỉnh, source code, tài liệu, video demo, deployment URLs và biên bản nghiệm thu.

**Milestone 5 — Final Acceptance** (Ngày 30)

---

# V. Sự phụ thuộc giữa các ngày

Kế hoạch được xây dựng theo nguyên tắc: **kết quả của ngày trước là đầu vào của ngày sau**, đồng thời hai người có thể phát triển các thành phần độc lập trong cùng một ngày.

### Những phụ thuộc quan trọng phải tuân thủ

| Công việc | Phụ thuộc | Quy tắc tránh chờ |
|--------|--------|--------|
| Auth API | Users schema | Chốt schema ngày 1, migration ngày 2 |
| Item CRUD | Auth, Items schema | Dùng JWT và response contract cố định |
| Matching | Item, Search | Người 1 viết thuật toán, Người 2 viết candidate query |
| Claim | Item, JWT | Người 1 viết rules/tests, Người 2 viết transaction |
| Notification | Matching, Claim | Chốt notification events trước khi tích hợp |
| Frontend | API contract | Dùng mock data khi API chưa sẵn sàng |
| Dashboard | Admin statistics API | Chốt response và biểu đồ từ ngày 14 |
| Deployment | Integration + testing | Chuẩn bị môi trường trước ngày 27 |

Đặc biệt, **không được thay đổi schema hoặc response API tùy ý sau ngày 14**. Nếu bắt buộc thay đổi, người thực hiện phải cập nhật migration, contract, tests và thông báo cho người còn lại trước khi merge.

# VI. Quy trình làm việc mỗi ngày

Để đảm bảo tiến độ 30 ngày, nhóm nên dành khoảng 3–4 giờ tập trung mỗi người mỗi ngày, tùy độ khó và kinh nghiệm. Đây là mức dự kiến, không phải bảo đảm hoàn thành nếu gặp lỗi kỹ thuật lớn.

| Thời lượng tham khảo | Hoạt động |
|--------|--------|
| 15 phút | Daily meeting, thống nhất contract và nhiệm vụ |
| 90–120 phút | Hai người phát triển song song |
| 30–45 phút | Integration và review chéo |
| 30–45 phút | Testing, bug fixing |
| 15 phút | Commit, PR, cập nhật tiến độ ngày tiếp theo |

### Quy tắc Git

Cấu trúc repository đề xuất:

```text
findit/
├── client/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── layouts/
│   │   ├── contexts/
│   │   ├── services/
│   │   └── hooks/
│   └── package.json
├── server/
│   ├── src/
│   │   ├── routes/
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── repositories/
│   │   ├── middleware/
│   │   ├── validators/
│   │   └── config/
│   └── package.json
├── database/
│   ├── migrations/
│   └── seeds/
├── docs/
├── README.md
└── .gitignore
```

Branch mẫu:

- `feature/day09-matching-engine`
- `feature/day09-matching-query`
- `feature/day20-notification-ui`
- `feature/day20-claim-ui`

Mỗi người làm việc trên branch riêng, tạo PR và yêu cầu người còn lại review. Nếu có conflict, người sở hữu module chịu trách nhiệm giải quyết, người còn lại xác nhận kết quả sau merge.

# VII. Tiêu chí nghiệm thu cuối dự án

Đây là bộ tiêu chí chính thức để đánh giá FindIt đã hoàn thành hay chưa.

| Hạng mục | Điều kiện đạt |
|--------|--------|
| Authentication | Đăng ký, đăng nhập, JWT, role hoạt động |
| User | Xem và chỉnh sửa profile đúng quyền |
| Item | Tạo/sửa/đóng bài, upload ảnh thành công |
| Search | Tìm kiếm, lọc, phân trang chính xác |
| Smart Matching | Đúng trọng số 30/20/20/30, ngưỡng 70, không duplicate |
| Claim | Không self-claim, duplicate, unauthorized approval; transaction an toàn |
| Notification | Đúng sự kiện, đúng người nhận |
| Admin | Quản lý người dùng, bài đăng, danh mục, địa điểm |
| Report | Gửi, xem và xử lý báo cáo |
| Dashboard | KPI và biểu đồ sử dụng dữ liệu MySQL |
| Security | JWT, authorization, validation, SQL parameterization, upload restrictions |
| Testing | Các test nghiệp vụ quan trọng đều pass; không còn lỗi Critical/High |
| Deployment | Frontend và Backend hoạt động qua HTTPS |
| Documentation | README, ERD, API docs, testing, deployment guide |
| Demo | Chạy thành công toàn bộ Lost → Found → Matching → Claim → Returned |

## VIII. Quy tắc ưu tiên khi trễ tiến độ

Nếu phát sinh chậm trễ, nhóm không nên cố hoàn thành tất cả phần giao diện phụ trước khi chức năng cốt lõi chạy ổn định.

**Thứ tự ưu tiên:**

1. **Bắt buộc:** Auth, Item, Search, Matching, Claim, các kiểm tra phân quyền và toàn vẹn dữ liệu.
2. **Hoàn thiện nghiệp vụ:** Notification, Admin, Report, Dashboard cơ bản.
3. **Chất lượng và bàn giao:** Testing, Deployment, Documentation.
4. **Có thể giản lược:** Animation, biểu đồ nâng cao, hiệu ứng giao diện và các tính năng ngoài phạm vi MVP.

Không cắt bỏ testing bảo mật, transaction Claim hoặc deployment chỉ để thêm hiệu ứng giao diện.

# IX. Tổng kết kế hoạch

## 5 mốc bàn giao

**Kết quả kỳ vọng sau 30 ngày:** Nhóm có một ứng dụng FindIt full-stack triển khai được trên Internet, cho phép người dùng thực hiện trọn vẹn quy trình tìm và nhận lại đồ thất lạc, có chức năng quản trị, thống kê, báo cáo vi phạm, kiểm thử và tài liệu bàn giao.

Điểm quan trọng nhất của kế hoạch là **hai thành viên cùng tạo ra một sản phẩm tích hợp mỗi ngày**, không phải hai người xây hai hệ thống riêng rồi mới ghép vào cuối dự án. Mỗi ngày đều có mục tiêu, người chịu trách nhiệm, điểm phối hợp và sản phẩm kiểm chứng được.
