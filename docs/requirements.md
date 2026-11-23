# FindIt — Yêu cầu hệ thống

Tài liệu mô tả mục tiêu, tác nhân, yêu cầu chức năng và phi chức năng của FindIt. Ràng buộc chi tiết cho từng chức năng nằm trong [quy tắc nghiệp vụ](business-rules.md); endpoint cụ thể nằm trong [hợp đồng API](api-contract.md).

## 1. Mục tiêu

FindIt giúp sinh viên và cán bộ trong khuôn viên trường tìm lại đồ thất lạc. Người làm mất đồ và người nhặt được đồ cùng đăng bài, hệ thống gợi ý các bài có khả năng trùng khớp, người nhận đồ chứng minh quyền sở hữu và chủ bài xác nhận bàn giao.

## 2. Tác nhân

| Tác nhân | Mô tả |
| --- | --- |
| Khách | Chưa đăng nhập. Xem và tìm kiếm bài đăng công khai. |
| `USER` | Người dùng đã đăng nhập. Đăng bài, gửi Claim, nhắn tin, báo cáo vi phạm. |
| `ADMIN` | Quản trị viên. Có mọi quyền của `USER`, cộng thêm các chức năng quản trị ở mục 3.10. |

Tài khoản đăng ký mới luôn là `USER`; không ai được tự gán vai trò `ADMIN`.

## 3. Yêu cầu chức năng

### 3.1. Xác thực

- Đăng ký tài khoản bằng họ tên, email và mật khẩu (nhập hai lần để xác nhận).
- Đăng nhập bằng email và mật khẩu, nhận JWT để gọi các API cần xác thực.
- Quên mật khẩu: nhận liên kết đặt lại qua email; liên kết dùng một lần và hết hạn sau 15 phút.
- Sau khi đặt lại mật khẩu, mọi phiên đăng nhập cũ của tài khoản bị vô hiệu.

### 3.2. Hồ sơ người dùng

- Xem hồ sơ của chính mình.
- Cập nhật họ tên. Không thể đổi vai trò hoặc sửa hồ sơ người khác qua API hồ sơ.

### 3.3. Bài đăng đồ vật

- Người dùng đã đăng nhập tạo bài `LOST` (đồ bị mất) hoặc `FOUND` (đồ nhặt được).
- Thông tin bắt buộc: tiêu đề, loại bài, danh mục, địa điểm, ngày xảy ra (không ở tương lai), mô tả. Không bắt buộc: màu sắc.
- Đính kèm tối đa 5 ảnh, mỗi ảnh tối đa 5 MiB. Biểu mẫu đăng bài tự lưu bản nháp trên trình duyệt.
- Bài mới có trạng thái `OPEN`. Không đổi được loại bài sau khi tạo.
- Chỉ chủ bài được sửa (khi bài còn `OPEN`) hoặc đóng bài của mình.
- Hệ thống không xóa bài; bài được đóng hoặc bị quản trị viên gỡ hiển thị để giữ lịch sử Claim, báo cáo và nhật ký.

### 3.4. Tìm kiếm

- Tìm theo từ khóa; lọc theo loại bài, danh mục, địa điểm, trạng thái và khoảng ngày.
- Sắp xếp theo thời gian đăng hoặc ngày xảy ra; có phân trang.
- Các bộ lọc là tùy chọn và kết hợp được với nhau. Không có kết quả thì trả danh sách rỗng, không báo lỗi.

### 3.5. Gợi ý trùng khớp

- **Theo thông tin:** khi bài được tạo hoặc sửa, hệ thống chấm điểm 0–100 với các bài loại đối diện (`LOST ↔ FOUND`) dựa trên danh mục, địa điểm, ngày xảy ra và nội dung. Mỗi kết quả có điểm và lý do đề xuất.
- **Theo hình ảnh (AI):** ảnh tải lên được chuyển thành vector bằng model CLIP; hệ thống so độ tương đồng với ảnh của các bài loại đối diện.
- Chỉ chủ bài xem được gợi ý cho bài của mình. Gợi ý chỉ để tham khảo, không tự xác nhận quyền sở hữu hay tạo Claim.
- Bài `CLOSED`, `RETURNED` hoặc đang bị gỡ hiển thị không tham gia ghép nối.

### 3.6. Yêu cầu nhận đồ (Claim)

- Người dùng gửi Claim cho bài `FOUND` của người khác, kèm bằng chứng sở hữu. Mỗi người chỉ có một Claim cho một bài.
- Bằng chứng chỉ hiển thị với người gửi Claim, chủ bài và quản trị viên.
- Chủ bài chấp thuận (`APPROVED`) hoặc từ chối (`REJECTED`) Claim đang chờ, rồi xác nhận đã bàn giao (`COMPLETED`). Khi hoàn tất, bài chuyển sang `RETURNED`.
- Mỗi bài `FOUND` có tối đa một Claim được chấp thuận hoặc đã hoàn tất.

### 3.7. Nhắn tin

- Hai người dùng nhắn tin riêng với nhau theo thời gian thực (Socket.IO), có REST API dự phòng.
- Xem danh sách cuộc trò chuyện, lịch sử tin nhắn, số tin chưa đọc và đánh dấu đã đọc.

### 3.8. Thông báo

- Thông báo khi có gợi ý trùng khớp mới, Claim mới, Claim được chấp thuận, bị từ chối hoặc hoàn tất, và khi quản trị viên xử lý bài hoặc Claim liên quan.
- Xem danh sách, số chưa đọc, đánh dấu một hoặc tất cả là đã đọc, mở thẳng tới nội dung liên quan.
- Người dùng chỉ truy cập được thông báo của chính mình.

### 3.9. Báo cáo vi phạm

- Người dùng báo cáo một bài đăng (`ITEM`), tài khoản (`USER`) hoặc Claim (`CLAIM`), kèm lý do và mô tả tùy chọn.
- Xem lại các báo cáo mình đã gửi.

### 3.10. Quản trị

| Chức năng | Mô tả |
| --- | --- |
| Thống kê | Số liệu tổng hợp từ dữ liệu thực trong database |
| Người dùng | Xem danh sách, khóa (`SUSPENDED`) và mở khóa (`ACTIVE`) tài khoản |
| Bài đăng | Xem danh sách, đóng bài, gỡ hoặc khôi phục hiển thị |
| Claim | Giải quyết tranh chấp: chấp thuận hoặc từ chối Claim đang chờ |
| Báo cáo | Xem xét, giải quyết hoặc bác bỏ báo cáo vi phạm |
| Danh mục, địa điểm | Thêm, sửa, ngừng sử dụng |
| Nhật ký | Xem nhật ký hoạt động nghiệp vụ |

Mọi thao tác quản trị phải kiểm tra quyền và được ghi vào nhật ký hoạt động. Quản trị viên không được xử lý bài hoặc Claim mà chính mình có liên quan.

## 4. Yêu cầu phi chức năng

| Nhóm | Yêu cầu |
| --- | --- |
| Giao diện | Tiếng Việt; dùng tốt trên điện thoại và máy tính |
| Bảo mật | Mật khẩu băm bằng bcrypt; JWT kiểm tra lại vai trò và trạng thái tài khoản ở mỗi request; rate limit cho API, đăng nhập, đăng ký, quên mật khẩu và upload; lỗi trả về không lộ stack trace hay câu SQL |
| Riêng tư | Bằng chứng Claim, đặc điểm nhận dạng riêng và lý do quyết định quản trị không xuất hiện trong dữ liệu công khai |
| Toàn vẹn dữ liệu | Thao tác Claim và quản trị chạy trong transaction có khóa dòng; không dùng xóa dây chuyền |
| Vận hành | Migration có kiểm tra checksum; sao lưu database hằng ngày và tự kiểm tra bản sao lưu; endpoint `GET /api/health` cho healthcheck |
| Kiểm thử | Unit, integration và browser tests chạy tự động trên GitHub Actions cho mỗi push và pull request |

## 5. Trạng thái và quy ước dữ liệu

### 5.1. Loại bài đăng

| Giá trị | Ý nghĩa |
| --- | --- |
| `LOST` | Đồ bị mất |
| `FOUND` | Đồ nhặt được |

### 5.2. Trạng thái bài đăng

| Giá trị | Ý nghĩa |
| --- | --- |
| `OPEN` | Đang hoạt động |
| `CLAIM_PENDING` | Có Claim đang chờ xử lý |
| `CLAIMED` | Đã có Claim được chấp thuận, chờ bàn giao |
| `RETURNED` | Đã bàn giao thành công |
| `CLOSED` | Đã đóng |

Hiển thị (`PUBLIC` / `HIDDEN`) là thuộc tính riêng, không phải trạng thái bài đăng.

### 5.3. Trạng thái ghép nối

| Giá trị | Ý nghĩa |
| --- | --- |
| `POTENTIAL` | Ghép nối tiềm năng |
| `CONFIRMED` | Đã xác nhận |
| `REJECTED` | Đã bị từ chối |

### 5.4. Trạng thái Claim

| Giá trị | Ý nghĩa |
| --- | --- |
| `PENDING` | Đang chờ xét duyệt |
| `APPROVED` | Đã được chấp thuận |
| `REJECTED` | Đã bị từ chối |
| `COMPLETED` | Đã hoàn tất bàn giao |

### 5.5. Trạng thái báo cáo

| Giá trị | Ý nghĩa |
| --- | --- |
| `PENDING` | Đang chờ xử lý |
| `REVIEWING` | Đang được xem xét |
| `RESOLVED` | Đã giải quyết |
| `DISMISSED` | Đã bác bỏ |

### 5.6. Quy ước đặt tên

- Cơ sở dữ liệu MySQL 8, thiết kế trong [ERD](erd.md).
- Trường trong API dùng camelCase (`categoryId`, `eventDate`); cột trong database dùng snake_case (`category_id`, `event_date`).
