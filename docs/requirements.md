# YÊU CẦU BACKEND – DỰ ÁN FINDIT

### 1. Vai trò người dùng (User Roles)

Hệ thống hỗ trợ hai vai trò chính:

- USER – Người dùng thông thường.
- ADMIN – Quản trị viên.

#### 1.1. USER – Người dùng

Người dùng có thể:

- Đăng ký tài khoản.
- Đăng nhập vào hệ thống.
- Xem và cập nhật thông tin cá nhân.
- Tạo bài đăng đồ bị mất (LOST) và đồ nhặt được (FOUND).
- Tìm kiếm các bài đăng đồ bị mất và đồ nhặt được.
- Xem các gợi ý ghép nối đồ vật từ hệ thống.
- Gửi yêu cầu nhận lại đồ vật (Claim).
- Xem các thông báo liên quan đến hoạt động của mình.

#### 1.2. ADMIN – Quản trị viên

Quản trị viên có tất cả quyền của người dùng thông thường và được bổ sung các quyền:

- Quản lý tài khoản người dùng.
- Kiểm duyệt các bài đăng đồ vật.
- Quản lý danh mục đồ vật.
- Quản lý các địa điểm trong khuôn viên trường.
- Xử lý các báo cáo vi phạm.
- Xem thống kê hoạt động của hệ thống.

### 2. Yêu cầu xác thực (Authentication Requirements)

Hệ thống phải cho phép người dùng:

- Đăng ký tài khoản mới.
- Đăng nhập bằng thông tin tài khoản.
- Nhận JWT (JSON Web Token) sau khi đăng nhập thành công.
- Sử dụng JWT để truy cập các API yêu cầu xác thực.
Quy tắc nghiệp vụ:

- Tài khoản đăng ký thông thường phải được gán vai trò USER.
- Người dùng không được tự gán vai trò ADMIN trong quá trình đăng ký.

### 3. Yêu cầu quản lý người dùng (User Requirements)

Người dùng đã đăng nhập có thể:

- Xem thông tin hồ sơ cá nhân.
- Cập nhật những thông tin cá nhân được hệ thống cho phép.
Quy tắc nghiệp vụ:

- Người dùng không được chỉnh sửa hồ sơ của người dùng khác.
- Người dùng không được tự thay đổi vai trò của mình thông qua API cập nhật hồ sơ.

### 4. Yêu cầu tìm kiếm (Search Requirements)

Hệ thống phải cho phép người dùng tìm kiếm các bài đăng đồ bị mất (LOST) và đồ nhặt được (FOUND).

Chức năng tìm kiếm phải hỗ trợ:

- Từ khóa (Keyword): Tìm kiếm theo từ khóa.
- Loại đồ vật (Item Type): Lọc theo đồ bị mất hoặc đồ nhặt được.
- Danh mục (Category): Lọc theo danh mục đồ vật.
- Địa điểm (Location): Lọc theo địa điểm.
- Trạng thái (Status): Lọc theo trạng thái bài đăng.
- Khoảng thời gian (Date Range): Lọc theo khoảng ngày.
- Sắp xếp (Sorting): Sắp xếp kết quả tìm kiếm.
- Phân trang (Pagination): Chia kết quả thành nhiều trang.
Quy tắc nghiệp vụ:

- Người dùng có thể kết hợp nhiều bộ lọc trong cùng một yêu cầu tìm kiếm.
- Nếu không có bài đăng nào phù hợp, hệ thống phải trả về danh sách rỗng thay vì thông báo lỗi.

### 5. Yêu cầu ghép nối thông minh (Smart Matching Requirements)

Hệ thống phải cung cấp chức năng ghép nối thông minh giữa các bài đăng đồ bị mất và đồ nhặt được.

#### 5.1. Nguyên tắc ghép nối

Hệ thống chỉ được phép so sánh:

- LOST ↔ FOUND: Đồ bị mất với đồ nhặt được.
Hệ thống không được phép so sánh:

- LOST ↔ LOST: Hai bài đăng đồ bị mất.
- FOUND ↔ FOUND: Hai bài đăng đồ nhặt được.

#### 5.2. Tiêu chí tính điểm tương đồng

Điểm ghép nối được tính dựa trên:

- Category Similarity: Mức độ tương đồng về danh mục.
- Location Similarity: Mức độ tương đồng về địa điểm.
- Date Similarity: Mức độ tương đồng về thời gian.
- Text Similarity: Mức độ tương đồng về nội dung mô tả.

#### 5.3. Kết quả ghép nối

Mỗi kết quả ghép nối phải bao gồm:

- Điểm tương đồng (Match Score).
- Thông tin của bài đăng đồ vật được ghép nối.
- Lý do giải thích tại sao hệ thống đề xuất ghép nối hai bài đăng.
Quy tắc nghiệp vụ:

Các bài đăng có trạng thái không hợp lệ để ghép nối, chẳng hạn như CLOSED hoặc RETURNED, không được tham gia quá trình Smart Matching.

### 6. Yêu cầu thông báo (Notification Requirements)

Hệ thống phải cung cấp chức năng thông báo cho người dùng.

#### 6.1. Các sự kiện tạo thông báo

Thông báo có thể được tạo khi:

- Hệ thống phát hiện một kết quả Smart Matching mới.
- Có yêu cầu nhận lại đồ vật (Claim) mới được gửi.
- Yêu cầu nhận đồ được chấp thuận.
- Yêu cầu nhận đồ bị từ chối.
- Quá trình nhận lại đồ vật được hoàn tất.

#### 6.2. Chức năng quản lý thông báo

Người dùng có thể:

- Xem danh sách thông báo của mình.
- Đánh dấu một thông báo là đã đọc.
- Đánh dấu tất cả thông báo là đã đọc.
- Xem số lượng thông báo chưa đọc.
Quy tắc nghiệp vụ:

Người dùng chỉ được phép truy cập các thông báo thuộc về tài khoản của chính mình.

### 7. Yêu cầu quản lý đồ vật (Item Management Requirements)

#### 7.1. Tạo bài đăng

Người dùng đã xác thực (USER hoặc ADMIN) có thể tạo bài đăng:

- LOST: Đồ vật bị mất.
- FOUND: Đồ vật nhặt được.
Thông tin bắt buộc:

- title: Tiêu đề bài đăng.
- type: Loại bài đăng.
- categoryId: Mã danh mục.
- locationId: Mã địa điểm.
- eventDate: Ngày xảy ra sự việc.
- description: Mô tả đồ vật.
Thông tin không bắt buộc:

- color: Màu sắc.
- Hình ảnh đồ vật.
- Các đặc điểm nhận dạng riêng biệt.

#### 7.2. Quy tắc quản lý bài đăng

- Bài đăng mới được tạo phải có trạng thái ban đầu là OPEN.
- Không được thay đổi loại bài đăng (LOST hoặc FOUND) sau khi tạo.
- Người dùng có thể xem công khai và tìm kiếm các bài đăng.
- Bằng chứng xác minh quyền sở hữu phải được bảo mật và không được xuất hiện trong dữ liệu trả về công khai.
- Chỉ chủ sở hữu bài đăng mới được chỉnh sửa hoặc đóng bài đăng của mình.
- Việc chỉnh sửa thông thường chỉ được phép khi bài đăng có trạng thái OPEN.
- Quản trị viên có quyền kiểm duyệt bài đăng.
- Bài đăng có trạng thái RETURNED không được tiếp nhận yêu cầu Claim mới.
- Khi xóa bài đăng, hệ thống sử dụng cơ chế xóa mềm (Soft Delete) hoặc đóng bài theo quy trình kiểm duyệt nhằm bảo toàn lịch sử hoạt động và dữ liệu Claim.

### 8. Yêu cầu nhận lại đồ vật (Claim Requirements)

#### 8.1. Gửi yêu cầu nhận đồ

Người dùng đã xác thực có thể gửi yêu cầu nhận lại một đồ vật thuộc bài đăng FOUND, nếu bài đăng đó đủ điều kiện tiếp nhận Claim.

Quy tắc nghiệp vụ:

- Người dùng không được gửi Claim cho bài đăng do chính mình tạo.
- Mỗi người dùng chỉ được có một Claim cho cùng một bài đăng FOUND.
- Người gửi Claim phải cung cấp bằng chứng hoặc thông tin chứng minh quyền sở hữu đồ vật.
- Bằng chứng xác minh chỉ được phép hiển thị cho:
- Người gửi Claim.
- Chủ sở hữu bài đăng FOUND.
- Quản trị viên có thẩm quyền.

#### 8.2. Xét duyệt yêu cầu

Chủ sở hữu bài đăng FOUND có quyền xem xét các Claim đang ở trạng thái PENDING và thực hiện:

- APPROVED: Chấp thuận yêu cầu.
- REJECTED: Từ chối yêu cầu.
Quản trị viên có thể giải quyết các tranh chấp liên quan đến Claim và phải ghi lại lịch sử xử lý (Audit Log).

#### 8.3. Hoàn tất nhận lại đồ vật

- Mỗi bài đăng FOUND chỉ được có tối đa một Claim đã được chấp thuận hoặc đang trong quá trình bàn giao.
- Khi quá trình bàn giao đồ vật thành công, Claim được chuyển sang trạng thái COMPLETED.
- Bài đăng đồ vật tương ứng được chuyển sang trạng thái RETURNED.

### 9. Yêu cầu báo cáo vi phạm (Report Requirements)

#### 9.1. Gửi báo cáo

Người dùng đã xác thực có thể gửi báo cáo vi phạm đối với một trong các đối tượng:

- ITEM: Bài đăng đồ vật.
- USER: Tài khoản người dùng.
- CLAIM: Yêu cầu nhận lại đồ vật.
Mỗi báo cáo phải bao gồm:

- Đối tượng bị báo cáo.
- Lý do báo cáo.
Người dùng có thể cung cấp thêm phần mô tả chi tiết nếu cần thiết.

#### 9.2. Xử lý báo cáo

Quản trị viên có quyền:

- Xem và kiểm tra các báo cáo.
- Giải quyết báo cáo vi phạm.
- Bác bỏ các báo cáo không hợp lệ.
Hệ thống phải lưu lại:

- Kết quả xử lý báo cáo.
- Quản trị viên thực hiện xử lý.

### 10. Yêu cầu quản trị hệ thống (Admin Requirements)

Quản trị viên (ADMIN) có trách nhiệm quản lý và giám sát toàn bộ hệ thống.

Các chức năng quản trị bao gồm:

- User Management: Quản lý tài khoản người dùng.
- Category Management: Quản lý danh mục đồ vật.
- Location Management: Quản lý các địa điểm trong khuôn viên trường.
- Item Moderation: Kiểm duyệt các bài đăng.
- Claim Dispute Management: Xử lý tranh chấp liên quan đến yêu cầu nhận đồ.
- Report Management: Xem và xử lý báo cáo vi phạm.
- Activity Logs: Theo dõi lịch sử hoạt động của hệ thống.
- Dashboard: Xem thống kê tổng hợp.
Quy tắc nghiệp vụ:

- Mọi thao tác quản trị đều phải được kiểm tra quyền truy cập (Authorization).
- Các thao tác quản trị phải được ghi nhận vào nhật ký hoạt động (Audit Log).
- Dữ liệu thống kê trên Dashboard phải được tổng hợp từ các bản ghi thực tế trong cơ sở dữ liệu.

### 11. Yêu cầu trạng thái và dữ liệu (Status and Data Requirements)

#### 11.1. Loại bài đăng (Item Type)

| Trạng thái | Ý nghĩa |
| --- | --- |
| LOST | Đồ vật bị mất |
| FOUND | Đồ vật nhặt được |

#### 11.2. Trạng thái bài đăng (Item Status)

| Trạng thái | Ý nghĩa |
| --- | --- |
| OPEN | Bài đăng đang hoạt động |
| CLAIM_PENDING | Bài đăng có yêu cầu nhận đồ đang chờ xử lý |
| CLAIMED | Đã có yêu cầu nhận đồ được chấp thuận |
| RETURNED | Đồ vật đã được bàn giao thành công |
| CLOSED | Bài đăng đã đóng |

#### 11.3. Trạng thái ghép nối (Match Status)

| Trạng thái | Ý nghĩa |
| --- | --- |
| POTENTIAL | Kết quả ghép nối tiềm năng |
| CONFIRMED | Kết quả ghép nối đã được xác nhận |
| REJECTED | Kết quả ghép nối đã bị từ chối |

#### 11.4. Trạng thái yêu cầu nhận đồ (Claim Status)

| Trạng thái | Ý nghĩa |
| --- | --- |
| PENDING | Đang chờ xét duyệt |
| APPROVED | Đã được chấp thuận |
| REJECTED | Đã bị từ chối |
| COMPLETED | Đã hoàn tất bàn giao |

#### 11.5. Trạng thái báo cáo (Report Status)

| Trạng thái | Ý nghĩa |
| --- | --- |
| PENDING | Đang chờ xử lý |
| REVIEWING | Đang được xem xét |
| RESOLVED | Đã được giải quyết |
| DISMISSED | Báo cáo đã bị bác bỏ |

#### 11.6. Yêu cầu cơ sở dữ liệu

- Hệ thống sử dụng MySQL làm hệ quản trị cơ sở dữ liệu.
- Cơ sở dữ liệu gồm 11 bảng được định nghĩa trong tài liệu erd.md.
- Tên các trường dữ liệu trong API sử dụng quy tắc camelCase.
Ví dụ: categoryId, locationId, eventDate.

- Tên các cột trong cơ sở dữ liệu sử dụng quy tắc snake_case.
Ví dụ: category_id, location_id, event_date.
