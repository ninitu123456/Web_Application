# FindIt — Tìm đồ thất lạc trong khuôn viên trường

[![Tests](https://github.com/ninitu123456/Web_Application/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/ninitu123456/Web_Application/actions/workflows/tests.yml)

**Website:** https://findit.io.vn

FindIt kết nối người làm mất đồ và người nhặt được đồ trong trường. Người dùng đăng bài kèm ảnh. Hệ thống gợi ý các bài có khả năng trùng khớp theo thông tin và theo hình ảnh (AI). Người nhận đồ gửi yêu cầu kèm bằng chứng, chủ bài xác minh rồi xác nhận bàn giao.

## Thành viên nhóm

| Họ tên | MSSV | Vai trò |
| Nguyễn Ngọc Thiên Tú | 24521911 | Backend Developer |
| Nguyễn Quốc Đạt| 24520273 | Frontend Developer |
| | | |

## Chức năng

| Người dùng | Quản trị viên |
| --- | --- |
| Đăng ký, đăng nhập, quên mật khẩu qua email | Thống kê tổng quan hệ thống |
| Đăng bài mất đồ / nhặt được đồ kèm tối đa 5 ảnh, tự lưu bản nháp | Quản lý tài khoản: khoá, mở khoá |
| Tìm kiếm, lọc theo danh mục, địa điểm, thời gian, trạng thái | Kiểm duyệt, ẩn hoặc đóng bài đăng |
| Gợi ý bài trùng khớp theo thông tin và theo hình ảnh (AI) | Xử lý báo cáo vi phạm |
| Gửi yêu cầu nhận đồ kèm bằng chứng; chủ bài duyệt và xác nhận bàn giao | Giải quyết tranh chấp yêu cầu nhận đồ |
| Nhắn tin riêng realtime, thông báo, báo cáo vi phạm | Quản lý danh mục, địa điểm và xem nhật ký hoạt động |

Giao diện tiếng Việt, dùng tốt trên cả điện thoại và máy tính.

## Công nghệ

| Phần | Công nghệ |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, GSAP |
| Backend | Node.js, Express 5, Socket.IO, JWT, bcrypt |
| Cơ sở dữ liệu | MySQL 8 (migration có kiểm tra checksum) |
| AI | CLIP (`clip-vit-base-patch32`) qua Transformers.js, chạy CPU trong worker riêng |
| Lưu trữ và email | Cloudinary (ảnh), Resend (email) |
| Triển khai | Vercel (frontend), Railway (API, AI worker, MySQL, sao lưu hằng ngày) |
| Kiểm thử | node:test, Vitest, Playwright, GitHub Actions |

## Cấu trúc repository

```
client/      Giao diện React (trang người dùng và trang quản trị)
server/      API Express, chat Socket.IO, worker AI
database/    Migrations, schema, dữ liệu mẫu và công cụ kiểm thử MySQL
docs/        Yêu cầu, quy tắc nghiệp vụ, ERD, hợp đồng API, triển khai
.github/     CI chạy kiểm thử trên mỗi push và pull request
```

## Chạy trên máy

Cần Node.js 24 và MySQL 8.

```bash
git clone https://github.com/ninitu123456/Web_Application.git
cd Web_Application
npm ci
cp .env.example .env     # điền DB, JWT_SECRET, tài khoản mẫu, Cloudinary
npm run db:setup         # tạo database, chạy migration và dữ liệu mẫu
npm run dev              # API: http://127.0.0.1:3001/api
```

Mở terminal thứ hai:

```bash
cd client
npm ci
npm run dev              # Giao diện: http://localhost:5173
```

Trên Windows PowerShell, dùng `npm.cmd` và `Copy-Item .env.example .env`. Chi tiết cấu hình: [backend](server/README.md), [database](database/README.md), [frontend](client/README.md).

## Kiểm thử

```bash
npm test                              # unit và HTTP tests backend, database
npm run test:integration:isolated     # integration trên MySQL tạm
cd client && npm test                 # unit tests frontend
cd client && npm run test:browser     # kiểm thử trình duyệt (Chrome)
```

Integration và browser tests tự dựng MySQL riêng và giả lập Cloudinary, nên không đụng tới dữ liệu thật. GitHub Actions chạy toàn bộ trên mỗi pull request.

## Tài liệu

| Tài liệu | Nội dung |
| --- | --- |
| [Yêu cầu](docs/requirements.md) | Mục tiêu, tác nhân, yêu cầu chức năng và phi chức năng |
| [Quy tắc nghiệp vụ](docs/business-rules.md) | Trạng thái bài đăng, quy trình nhận đồ, phân quyền |
| [ERD](docs/erd.md) | Thiết kế cơ sở dữ liệu |
| [Hợp đồng API](docs/api-contract.md) | Toàn bộ endpoint, request, response và mã lỗi |
| [Triển khai](docs/deployment.md) | Kiến trúc production, AI worker, sao lưu và khôi phục |
