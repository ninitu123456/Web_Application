# FindIt — Frontend

Giao diện React 19 + TypeScript + Vite + Tailwind CSS, gọi API Express của thư mục `server/`. Giao diện tiếng Việt, responsive cho điện thoại và máy tính.

## Chạy cục bộ

Backend phải đang chạy (xem [server/README.md](../server/README.md)). Sau đó:

```bash
cd client
npm ci
npm run dev        # http://localhost:5173
```

Mặc định frontend gọi `http://127.0.0.1:3001/api`. Muốn đổi, đặt `VITE_API_BASE_URL` trong `client/.env` theo mẫu `client/.env.example`, và thêm origin của frontend vào `CORS_ORIGINS` của backend. Biến `VITE_*` được đóng vào bundle công khai nên không chứa secret.

Build production:

```bash
VITE_API_BASE_URL=https://<api-domain>/api npm run build
```

Build từ chối khi thiếu URL API, khi URL trỏ tới localhost/IP nội bộ, hoặc khi không phải HTTPS (ngoại trừ `/api` cùng origin). Vercel tự build lại mỗi khi `main` thay đổi; xem [triển khai](../docs/deployment.md).

## Cấu trúc

| Thư mục | Nội dung |
| --- | --- |
| `src/pages/` | Các trang người dùng; `src/pages/admin/` là trang quản trị |
| `src/components/` | Thành phần dùng chung: layout, thẻ bài đăng, modal, gợi ý AI |
| `src/lib/` | Gọi API, xác thực, validate form, bản nháp, nén và tải ảnh, nhãn hiển thị |
| `scripts/` | Kịch bản kiểm thử trình duyệt bằng Playwright |

## Màn hình chính

| Đường dẫn | Nội dung |
| --- | --- |
| `/` | Trang chủ: tìm kiếm nhanh, bài mới nhất, cách hoạt động |
| `/kham-pha` | Tìm kiếm và lọc theo danh mục, địa điểm, thời gian, trạng thái |
| `/dang-bai` | Đăng bài 3 bước, tự lưu bản nháp, hiện tiến trình tải ảnh |
| `/do-vat/:id` | Chi tiết bài, gợi ý trùng khớp (thông tin + hình ảnh), gửi yêu cầu nhận đồ |
| `/bai-dang-cua-toi`, `/yeu-cau-cua-toi` | Bài của tôi, yêu cầu nhận đồ đã gửi và tiến trình bàn giao |
| `/tin-nhan` | Nhắn tin riêng realtime |
| `/thong-bao`, `/ho-so`, `/bao-cao-cua-toi` | Thông báo, hồ sơ, báo cáo vi phạm đã gửi |
| `/dang-nhap`, `/dang-ky`, `/quen-mat-khau` | Xác thực và đặt lại mật khẩu qua email |
| `/quan-tri/...` | Trang quản trị: thống kê, người dùng, bài đăng, yêu cầu nhận đồ, báo cáo, danh mục/địa điểm, nhật ký |

## Kiểm thử

```bash
npm test               # unit tests (Vitest)
npm run typecheck      # kiểm tra kiểu TypeScript
npm run format:check   # kiểm tra định dạng Prettier
npm run test:browser   # kiểm thử trình duyệt trên Chrome
```

Kiểm thử trình duyệt dựng MySQL tạm và backend thật, chỉ giả lập Cloudinary. Kịch bản chạy trên cả màn hình điện thoại và máy tính: đăng bài và tải ảnh (kể cả lỗi rồi thử lại), tìm kiếm, gợi ý, yêu cầu nhận đồ, chat, thông báo và trang quản trị. Cần Chrome hoặc Edge (`FINDIT_BROWSER_CHANNEL=msedge`); đặt `MYSQLD_PATH` nếu không tìm thấy MySQL. Ảnh chụp và log lưu trong `.cache/`, không commit.
