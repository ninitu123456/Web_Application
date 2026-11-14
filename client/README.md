# FindIt frontend

React, Vite, TypeScript, Tailwind CSS và React Router. Giao diện tiếng Việt, responsive; dùng backend Express/MySQL hiện có. Không có dữ liệu mock trong ứng dụng.

## Chạy cục bộ

Terminal tại gốc repository:

```powershell
npm.cmd ci
npm.cmd run dev
```

Backend cần cấu hình DB/JWT hiện có theo `server/README.md`, `server/AUTH.md`. Không thay thế `.env` đang dùng. Upload thật cần cấu hình Cloudinary phía backend.

Terminal thứ hai:

```powershell
cd client
npm.cmd ci
# Tùy chọn: sao chép .env.example thành .env nếu chưa có.
npm.cmd run dev
```

Mở `http://localhost:5173`. API mặc định `http://127.0.0.1:3001/api`; có thể đổi bằng `VITE_API_BASE_URL` (bao gồm `/api`). Biến Vite là cấu hình công khai; không đặt secret trong frontend. Nếu chạy frontend ở origin khác, thêm đúng origin vào `CORS_ORIGINS` của backend. Không bật cookie credentials.

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run format:check
# Example public build configuration; replace with the reviewed actual API URL.
$env:VITE_API_BASE_URL = 'https://api.example.test/api'
$env:VITE_AI_VISUAL_SUGGESTIONS_ENABLED = 'false'
$env:VITE_AI_VISUAL_SUGGESTIONS_PREVIEW_FIXTURE = 'false'
npm.cmd run build
npm.cmd run preview
```

Chưa cấu hình ESLint; `format:check` chỉ kiểm tra định dạng, không thay thế lint. `preview` mặc định dùng port 4173, cần thêm `http://localhost:4173` vào CORS nếu gọi API trực tiếp. Host phục vụ production phải fallback các đường dẫn giao diện về `index.html`, đồng thời giữ nguyên routing `/api`. Dự án không tự publish.

Build triển khai yêu cầu `VITE_API_BASE_URL` tường minh: URL HTTPS công khai kết thúc `/api`, hoặc `/api` khi đã xác minh reverse proxy cùng origin. Build từ chối thiếu URL, localhost/private IP, credentials/query/fragment trong URL, AI preview fixture và boolean flag không phải `true|false`. Ngoại lệ test local cần cả `--mode test` và `FINDIT_FRONTEND_BROWSER_BUILD=1`; không áp dụng cho production mode hay build có marker Vercel/Railway.

Socket.IO gọi origin của API ở path `/socket.io/`, không phải `/api/socket.io/`. Cấu hình `/api` cùng origin chỉ hoạt động khi host có cả proxy API và Socket.IO (HTTP polling và WebSocket upgrade). `vercel.json` hiện chỉ có SPA fallback, chưa cung cấp các proxy đó; không dùng `/api` cho deployment này trước khi cấu hình host được xác minh. CI dùng `/api` chỉ để kiểm tra build, không chứng minh proxy production hoạt động. Không đổi `trust proxy` hoặc số replica nếu chưa có topology thực tế. Xem [CI và AI E2E](../docs/CI-AI-E2E-20261109.md).

## Màn hình

| URL | Nội dung |
| --- | --- |
| `/` | Trang chủ FindIt 2.0, tìm kiếm và đồ vật mới; bookmark bộ lọc cũ chuyển sang Khám phá |
| `/kham-pha` | Tìm kiếm, bộ lọc theo URL, sorting và phân trang |
| `/dang-nhap`, `/dang-ky` | Xác thực, validation theo backend, quay lại đường dẫn nội bộ hợp lệ |
| `/do-vat/:id` | Gallery, chi tiết, đóng bài, Matching, gửi Claim, tab Claim nhận được |
| `/dang-bai`, `/do-vat/:id/sua` | Form chung, preview/thêm/xóa ảnh, phục hồi upload lỗi |
| `/bai-dang-cua-toi` | Bài của tài khoản hiện tại, phân trang và liên kết quản lý |
| `/yeu-cau-cua-toi` | Claim đã gửi, bằng chứng riêng và tiến trình bàn giao |
| `/thong-bao` | Thông báo phân trang, đánh dấu một/tất cả đã đọc và số chưa đọc trên header |
| `/ho-so` | Xem tài khoản và chỉ chỉnh sửa họ tên; cập nhật menu ngay sau khi lưu |
| `/bao-cao-cua-toi` | Báo cáo đã gửi, mục tiêu và trạng thái xử lý |
| `/quan-tri` | Dashboard từ số liệu backend, sidebar chỉ dành cho ADMIN |
| `/quan-tri/nguoi-dung`, `/quan-tri/nguoi-dung/:id` | Danh sách/lọc, chi tiết, kích hoạt/đình chỉ |
| `/quan-tri/bai-dang`, `/quan-tri/bai-dang/:id` | Kiểm tra bài và đóng qua canonical moderation có lý do |
| `/quan-tri/claims` | Summary/lọc Claim, xem đúng bằng chứng và giải quyết tranh chấp PENDING |
| `/quan-tri/bao-cao`, `/quan-tri/bao-cao/:id` | Danh sách và quy trình xem xét/giải quyết/bác bỏ báo cáo |
| `/quan-tri/danh-muc-dia-diem` | Tạo/đổi tên/bật/tắt lookup, giữ tham chiếu lịch sử |
| `/quan-tri/nhat-ky` | Nhật ký nghiệp vụ có bộ lọc, phân trang và details được cho phép |

Modal báo cáo được mở từ bài đăng, chủ bài hoặc Claim được phép tiếp cận; tự lấy loại/ID mục tiêu. Chat riêng tư có tại `/tin-nhan`; quên/đặt lại mật khẩu có tại `/quen-mat-khau` và `/dat-lai-mat-khau`. Chưa có sửa email/avatar hoặc đổi mật khẩu trong hồ sơ.

## API và trạng thái

- `lib/api.ts`: envelope, lỗi theo HTTP, query rỗng, FormData, cache chi tiết để bổ sung thông tin Matching. Không tự retry mutation.
- `lib/error-messages.ts`: ánh xạ lỗi theo mã HTTP và thông báo backend đã biết, có ngữ cảnh đăng nhập/phiên và thao tác đọc/ghi. Không nối hoặc hiển thị nguyên thông báo lỗi lạ. `lib/display-labels.ts`: nhãn riêng theo loại bài, trạng thái bài đăng, yêu cầu nhận đồ, báo cáo, tài khoản và vai trò; dùng chung cho badge, bộ lọc, thống kê và nhật ký.
- `lib/auth.tsx`: JWT lưu trong **sessionStorage**, fallback trong bộ nhớ nếu storage không khả dụng. Token tồn tại khi reload cùng tab, không dùng localStorage/cookie và không có refresh token. JavaScript cùng origin có thể đọc sessionStorage, vì vậy nội dung người dùng luôn render dưới dạng text và không dùng HTML tùy ý. JWT chỉ được giải mã cục bộ để đặt thời điểm hết phiên; backend xác thực chữ ký và quyết định quyền.
- Khởi động kiểm tra `/users/me`. Đăng xuất, hết hạn cục bộ hoặc response 401 của request đã xác thực đều xóa token và cache, bỏ kết quả request của tài khoản trước. Lỗi 403 được hiển thị riêng; lỗi mạng khi khôi phục phiên cho phép kiểm tra lại hoặc xóa phiên.
- Đăng ký thành công chuyển sang đăng nhập vì backend không cấp token khi đăng ký. `next` chỉ chấp nhận URL cùng origin; từ chối URL ngoài, `//`, backslash và ký tự điều khiển.
- Khi sửa, danh mục/địa điểm ngừng hoạt động vẫn hiển thị bằng tên từ Item DTO. Nếu giữ nguyên, PATCH không gửi lại ID đó; nếu đổi, lấy ID từ lookup đang hoạt động. Không tự chọn giá trị đầu tiên.
- Tạo Item trước rồi upload `images` bằng FormData, không gán Content-Type. Giữ ID Item khi upload lỗi; thay URL bằng trang sửa để reload không tạo bài trùng. Nếu không đọc lại được trạng thái ảnh, yêu cầu kiểm tra trạng thái trước khi gửi lại. Nếu create mất phản hồi, hướng người dùng kiểm tra Bài đăng của tôi thay vì tự gửi lại.
- Modal dùng native `<dialog>` để giữ focus, hỗ trợ Escape và trả focus khi đóng. Nút mutation có khóa đồng bộ bằng ref và trạng thái disabled.
- Claim chỉ trên FOUND OPEN/CLAIM_PENDING, không tự Claim; approve/reject/complete chỉ hiện cho chủ bài. ADMIN có quyền xem bằng chứng theo backend nhưng không có nút quyết định khi không phải chủ bài.
- Điểm Matching là điểm tương đồng trên thang 100, không phải xác suất đúng đồ. Chỉ lấy chi tiết bài đối ứng ở trang hiện tại, dùng cache để tránh gọi lặp. Không có nút xác nhận/từ chối Match.

## Thông báo, hồ sơ, báo cáo và Admin

- Thông báo dùng đủ bốn API hiện có. Một provider dùng chung quản lý unread-count cho header/trang; tải lại khi vào trang, focus cửa sổ (gộp focus gần nhau) và sau mutation. Không polling. Các GET giống nhau đang chạy được gộp trong cùng phiên; kết quả không được dùng cho tài khoản khác. Danh sách phân trang và nút đánh dấu không suy đoán link từ message vì DTO chưa có trường định tuyến.
- Hồ sơ dùng GET/PATCH `/users/me`, chỉ gửi `fullName` trim 1–150 Unicode code points. Email/vai trò chỉ đọc. Auth context cập nhật từ response; kiểm tra lại danh tính khi focus hoặc gặp 403 ở API nghiệp vụ để phản ánh thay đổi quyền/tài khoản.
- Báo cáo nhận `reason` 1–50 Unicode code points, optional `description` không rỗng và tối đa 65.535 byte UTF-8. Mô tả trống được bỏ khỏi body. Trùng báo cáo đang xử lý nhận 409. Mục tiêu hiển thị theo DTO (`targetType`, `targetId`); không bịa tên người dùng hoặc Item của Claim. Report CLAIM chưa có Item ID để liên kết thẳng bằng chứng; Admin có lối vào danh sách Claim riêng.
- Admin guard chặn USER trước khi mount trang con; backend kiểm tra quyền cho mọi request. Người dùng chỉ có `accountStatus`, `role` làm bộ lọc; bài đăng chỉ có `type`, `status`. Không gọi query tìm kiếm chưa được hỗ trợ.
- Dashboard hiển thị đúng số liệu/breakdown API; hoạt động là số bản ghi, không phải số lượt truy cập. Không tạo chỉ số giả.
- Chỉ dùng `/api/admin/items/:id/close` và `/api/admin/claims/:id/resolve` cho moderation/tranh chấp, yêu cầu lý do 1–1.000 code points, tối đa 4.000 byte UTF-8. Không sử dụng legacy `/status` để bỏ qua điều kiện. CLOSED vẫn công khai; resolve không hoàn tất bàn giao thay chủ bài.
- Kiểm tra Admin có liên quan bằng `GET /admin/claims?itemId=...&claimantId=...&page=1&limit=1`: query lọc chính xác tài khoản/Item, không lọc trạng thái, quyết định dựa vào `pagination.total` của toàn bộ kết quả, bao gồm lịch sử REJECTED. Không suy ra từ một trang danh sách Claim chung. Nếu bước kiểm tra lỗi/thiếu metadata, UI báo chưa xác định; backend vẫn quyết định, lỗi 403 hiển thị trong hộp thoại.
- Xem bằng chứng gọi `/items/:id/claims` với phân trang, tìm đúng `claimId` qua từng trang và dừng khi tìm được. Lỗi giữa chừng/thiếu pagination/đến giới hạn offset được báo là chưa xác định, không coi Claim là không tồn tại. Đổi tài khoản/đóng modal loại bỏ kết quả cũ.
- Xử lý Report đúng PENDING → REVIEWING → RESOLVED/DISMISSED, không tự đổi Item/User/Claim. Lookup dùng PATCH để bật/tắt, không xóa vĩnh viễn. Tên lookup theo giới hạn chuỗi backend (category 100/location 150 UTF-16 units).
- Nhật ký chỉ lấy `/admin/activity-logs`, lọc theo các trường được hỗ trợ và render details allowlist thành text; không gọi raw image journal hoặc endpoint nội bộ.

## Kiểm thử trình duyệt cô lập

Yêu cầu Chrome cài sẵn và MySQL >= 8.0.16 executable; có thể đặt `FINDIT_BROWSER_CHANNEL=msedge` để dùng Edge và `MYSQLD_PATH` nếu runner không tự tìm thấy binary.

```powershell
cd client
npm.cmd run test:browser
```

Lệnh này build frontend với `VITE_API_BASE_URL=/api`, gọi runner MySQL cô lập hiện có và chạy riêng suite Item với cờ `FINDIT_FRONTEND_BROWSER=1`. Không đọc hoặc ghi DB đang sử dụng. Frontend build được phục vụ trên HTTP port tạm; `/api` proxy tới HTTP backend test thật. Tất cả server và browser do test tạo đều được đóng. DB/datadir tạm được runner dọn có kiểm tra quyền sở hữu.

Storage ảnh được giả lập ở ranh giới Cloudinary; có fault injection upload 503 để kiểm tra phục hồi. Các API Auth/Item/Matching/Claim, JWT, transaction và MySQL là implementation thật. Ảnh chụp và log nằm trong `.cache/` bị Git ignore; không chứa credentials/token.

Kiểm tra có đăng ký, desktop/mobile, upload lỗi rồi thử lại, không tạo Item trùng, sửa lookup ngừng hoạt động, Matching, search, phân trang/sorting, quyền sửa, modal bàn phím, chống gửi lặp, Claim trùng, quyền riêng tư, duyệt/bàn giao, reload trang con và xóa phiên khi logout/JWT sai. Script mở rộng chạy tiếp profile/menu, notifications ownership/focus/read count, báo cáo ba loại mục tiêu và quy trình Admin, dashboard thật, lookup, đình chỉ/kích hoạt, moderation/resolve, thay đổi quyền và nhật ký. Fixture 103 Claim xác minh bằng chứng ở trang hai và recusal từ lịch sử Admin đã bị từ chối; fault injection preflight 503 xác nhận backend vẫn trả 403 có thẩm quyền.

Browser test chặn mạng HTTPS bên ngoài để dùng font hệ thống dự phòng và không gọi Cloudinary thật. Test app tăng riêng quota API lên 3.000/phút để đủ lượt hồi quy; runtime giữ nguyên quota hiện có. Tests limiter backend vẫn chạy với cấu hình riêng của chúng. Unit frontend còn kiểm tra gộp GET, bỏ lỗi response của phiên cũ và các nhánh tìm Claim qua trang. Log mới ở `.cache/frontend-extended-browser.txt`, `.cache/frontend-extended-regression.txt`.

Sau test, `dist/` là build test local dùng API cùng origin. Trước khi triển khai, build lại bằng API URL công khai đã xác minh và tắt preview fixture. Chưa kiểm chứng Cloudinary qua mạng thật, Firefox/Safari, thiết bị vật lý hoặc cấu hình hosting production.

## Gợi ý hợp nhất và regression runtime

Trang chi tiết của chủ bài LOST/FOUND dùng `GET /items/:id/suggestions`: một khu “Gợi ý cho bạn”, nhóm “Giống về hình ảnh” và “Trùng thông tin”. Dùng ItemCard chung; một thẻ có cả hai nguồn mang cả hai lý do. Backend loại ID visual khỏi COUNT/LIMIT của nhóm thông tin trước khi phân trang. Giao diện không render raw cosine hoặc gọi đó là xác suất; band chỉ trình bày và chưa hiệu chỉnh bằng ảnh thật. Feature AI tắt vẫn giữ gợi ý thông tin. Các trạng thái loading/processing/empty/error/retry và polling 10/30 giây được giữ, timer dọn khi unmount/item/session thay đổi.

Ở root, `npm run test:browser:runtime` chạy đầy đủ startServer + API/Socket.IO/CORS + frontend build local test trên MySQL disposable riêng. Kiểm tra console/HTTP không có lỗi ứng dụng, khác với suite cố ý chèn lỗi hoặc chỉ mount một phần service. HTTPS fonts ngoài bị chặn có nhãn riêng. Ảnh ở `.cache/frontend-browser/full-runtime/`; chỉ là giả lập browser, chưa xác minh keyboard/safe-area thiết bị vật lý.
