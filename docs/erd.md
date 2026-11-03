# FINDIT – THIẾT KẾ SƠ ĐỒ THỰC THỂ VÀ QUAN HỆ (ERD)

Phiên bản: Day 1 – Bản thiết kế cuối cùng Dự án: FindIT – Smart Campus Lost and Found Management System Hệ quản trị cơ sở dữ liệu: MySQL Mục đích: Làm cơ sở triển khai Database Migration vào Day 2.

### 1. Phạm vi và quy ước thiết kế

Cơ sở dữ liệu của hệ thống FindIT được thiết kế với 11 bảng, phục vụ các chức năng quản lý người dùng, bài đăng đồ vật, ghép nối thông minh, yêu cầu nhận lại đồ vật, thông báo, báo cáo vi phạm và quản trị hệ thống.

#### 1.1. Quy ước về khóa và ràng buộc

| Ký hiệu | Tên đầy đủ | Ý nghĩa |
| --- | --- | --- |
| PK | Primary Key | Khóa chính, dùng để định danh duy nhất mỗi bản ghi |
| FK | Foreign Key | Khóa ngoại, dùng để liên kết các bảng |
| UQ | Unique | Giá trị phải duy nhất |
| NN | Not Null | Trường bắt buộc phải có giá trị |
| NULL | Nullable | Trường được phép không có giá trị |
| DEFAULT | Default Value | Giá trị mặc định |

#### 1.2. Quy ước về dữ liệu

- Các khóa định danh (ID) sử dụng kiểu BIGINT UNSIGNED AUTO_INCREMENT.
- Các khóa ngoại sử dụng cùng kiểu dữ liệu với khóa chính được tham chiếu.
- Thời gian được lưu bằng kiểu DATETIME, theo múi giờ UTC.
- Tên trường dữ liệu trong API sử dụng quy tắc camelCase, ví dụ: userId, createdAt.
- Tên cột trong cơ sở dữ liệu sử dụng quy tắc snake_case, ví dụ: user_id, created_at.
Đây là thiết kế cơ sở dữ liệu logic đã được nhóm thống nhất để triển khai các migration trong ngày thứ hai.

### 2. Danh sách bảng và cấu trúc dữ liệu

Hệ thống bao gồm 11 bảng:

- roles – Vai trò người dùng.
- users – Tài khoản người dùng.
- categories – Danh mục đồ vật.
- locations – Địa điểm trong khuôn viên trường.
- items – Bài đăng đồ vật bị mất hoặc nhặt được.
- item_images – Hình ảnh của bài đăng.
- matches – Kết quả ghép nối thông minh.
- claims – Yêu cầu nhận lại đồ vật.
- notifications – Thông báo người dùng.
- reports – Báo cáo vi phạm.
- activity_logs – Nhật ký hoạt động hệ thống.

#### 2.1. Bảng roles – Vai trò người dùng

**Mục đích:** Lưu trữ các vai trò và phục vụ chức năng phân quyền trong hệ thống.

| Tên cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
| --- | --- | --- | --- |
| role_id | BIGINT UNSIGNED | PK | Mã vai trò |
| name | VARCHAR(20) | NN, UQ | Tên vai trò: USER hoặc ADMIN |

**Quy tắc:** Mỗi vai trò có một tên duy nhất.

#### 2.2. Bảng users – Tài khoản người dùng

**Mục đích:** Lưu trữ thông tin tài khoản, hồ sơ cá nhân và trạng thái hoạt động của người dùng.

| Tên cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
| --- | --- | --- | --- |
| user_id | BIGINT UNSIGNED | PK | Mã người dùng |
| role_id | BIGINT UNSIGNED | FK, NN | Tham chiếu bảng roles |
| full_name | VARCHAR(150) | NN | Họ và tên |
| email | VARCHAR(255) | NN, UQ | Email đăng nhập |
| password_hash | VARCHAR(255) | NN | Mật khẩu đã được băm |
| student_code | VARCHAR(50) | NULL, UQ | Mã số sinh viên |
| avatar_url | Chưa quy định cụ thể | NULL | Đường dẫn ảnh đại diện |
| contact_info | Chưa quy định cụ thể | NULL | Thông tin liên hệ |
| account_status | VARCHAR(20) | NN, DEFAULT 'ACTIVE' | Trạng thái tài khoản |
| created_at | DATETIME | NN | Thời điểm tạo tài khoản |
| updated_at | DATETIME | NN | Thời điểm cập nhật gần nhất |

**Quy tắc:**

- Mỗi email phải là duy nhất.
- Mã số sinh viên có thể để trống, nhưng nếu có thì không được trùng.
- Mật khẩu phải được lưu dưới dạng đã băm.
- Trạng thái tài khoản mặc định là ACTIVE.

#### 2.3. Bảng categories – Danh mục đồ vật

**Mục đích:** Quản lý và phân loại các đồ vật trong hệ thống.

| Tên cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
| --- | --- | --- | --- |
| category_id | BIGINT UNSIGNED | PK | Mã danh mục |
| name | VARCHAR(100) | NN, UQ | Tên danh mục |
| is_active | BOOLEAN | NN, DEFAULT TRUE | Trạng thái hoạt động |

**Quy tắc:** Tên danh mục không được trùng lặp.

#### 2.4. Bảng locations – Địa điểm

**Mục đích:** Quản lý các địa điểm trong khuôn viên trường, phục vụ việc đăng bài và tìm kiếm đồ vật.

| Tên cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
| --- | --- | --- | --- |
| location_id | BIGINT UNSIGNED | PK | Mã địa điểm |
| name | VARCHAR(150) | NN, UQ | Tên địa điểm |
| is_active | BOOLEAN | NN, DEFAULT TRUE | Trạng thái hoạt động |

**Quy tắc:** Tên địa điểm không được trùng lặp.

#### 2.5. Bảng items – Bài đăng đồ vật

**Mục đích:** Lưu trữ thông tin các bài đăng đồ bị mất (LOST) và đồ nhặt được (FOUND).

| Tên cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
| --- | --- | --- | --- |
| item_id | BIGINT UNSIGNED | PK | Mã bài đăng |
| user_id | BIGINT UNSIGNED | FK, NN | Người tạo bài đăng |
| category_id | BIGINT UNSIGNED | FK, NN | Danh mục đồ vật |
| location_id | BIGINT UNSIGNED | FK, NN | Địa điểm xảy ra sự việc |
| title | VARCHAR(200) | NN | Tiêu đề bài đăng |
| description | TEXT | NN | Mô tả đồ vật |
| type | ENUM('LOST','FOUND') | NN | Loại bài đăng |
| color | VARCHAR(80) | NULL | Màu sắc |
| private_identifiers | TEXT | NULL | Đặc điểm nhận dạng riêng tư |
| event_date | DATE | NN | Ngày xảy ra sự việc |
| status | ENUM | NN, DEFAULT 'OPEN' | Trạng thái bài đăng |
| created_at | DATETIME | NN | Thời điểm tạo |
| updated_at | DATETIME | NN | Thời điểm cập nhật |

Các trạng thái hợp lệ của status:

| Trạng thái | Ý nghĩa |
| --- | --- |
| OPEN | Bài đăng đang hoạt động |
| CLAIM_PENDING | Có yêu cầu nhận đồ đang chờ xử lý |
| CLAIMED | Đã có yêu cầu nhận đồ được chấp thuận |
| RETURNED | Đồ vật đã được bàn giao thành công |
| CLOSED | Bài đăng đã đóng |

**Quy tắc:** Trạng thái ban đầu của bài đăng là OPEN. Các thông tin nhận dạng riêng tư phải được bảo vệ, không hiển thị công khai.

#### 2.6. Bảng item_images – Hình ảnh đồ vật

**Mục đích:** Lưu trữ thông tin hình ảnh liên quan đến bài đăng, bao gồm đường dẫn và mã quản lý hình ảnh trên Cloudinary.

| Tên cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
| --- | --- | --- | --- |
| image_id | BIGINT UNSIGNED | PK | Mã hình ảnh |
| item_id | BIGINT UNSIGNED | FK, NN | Bài đăng chứa hình ảnh |
| image_url | VARCHAR(1000) | NN | Đường dẫn hình ảnh |
| cloudinary_public_id | VARCHAR(255) | NULL | Mã ảnh trên Cloudinary |
| created_at | DATETIME | NN | Thời điểm thêm ảnh |

**Quy tắc:** Một bài đăng có thể có nhiều hình ảnh.

#### 2.7. Bảng matches – Ghép nối thông minh

**Mục đích:** Lưu trữ các kết quả ghép nối giữa bài đăng đồ bị mất và đồ nhặt được.

| Tên cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
| --- | --- | --- | --- |
| match_id | BIGINT UNSIGNED | PK | Mã kết quả ghép nối |
| lost_item_id | BIGINT UNSIGNED | FK, NN | Tham chiếu bài đăng LOST |
| found_item_id | BIGINT UNSIGNED | FK, NN | Tham chiếu bài đăng FOUND |
| match_score | DECIMAL(5,2) | NN | Điểm tương đồng |
| reasons | JSON | NULL | Lý do đề xuất ghép nối |
| status | ENUM | NN, DEFAULT 'POTENTIAL' | Trạng thái ghép nối |
| created_at | DATETIME | NN | Thời điểm tạo kết quả |

**Các trạng thái hợp lệ:**

- POTENTIAL: Ghép nối tiềm năng.
- CONFIRMED: Ghép nối đã được xác nhận.
- REJECTED: Ghép nối bị từ chối.
Ràng buộc dữ liệu:

- Cặp (lost_item_id, found_item_id) phải duy nhất.
- Điểm tương đồng phải nằm trong khoảng từ 0 đến 100.
- lost_item_id và found_item_id không được bằng nhau.
- Cả hai khóa ngoại đều tham chiếu đến items.item_id.

#### 2.8. Bảng claims – Yêu cầu nhận lại đồ vật

**Mục đích:** Quản lý các yêu cầu xác minh quyền sở hữu và nhận lại đồ vật.

| Tên cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
| --- | --- | --- | --- |
| claim_id | BIGINT UNSIGNED | PK | Mã yêu cầu |
| claimant_id | BIGINT UNSIGNED | FK, NN | Người gửi yêu cầu |
| item_id | BIGINT UNSIGNED | FK, NN | Bài đăng được yêu cầu nhận |
| proof_description | TEXT | NN | Bằng chứng xác minh quyền sở hữu |
| status | ENUM | NN, DEFAULT 'PENDING' | Trạng thái yêu cầu |
| submitted_at | DATETIME | NN | Thời điểm gửi |
| reviewed_at | DATETIME | NULL | Thời điểm xét duyệt |
| completed_at | DATETIME | NULL | Thời điểm hoàn tất |

**Các trạng thái hợp lệ:**

- PENDING: Đang chờ xét duyệt.
- APPROVED: Đã được chấp thuận.
- REJECTED: Đã bị từ chối.
- COMPLETED: Đã hoàn tất bàn giao.
Ràng buộc: Cặp (claimant_id, item_id) phải duy nhất, bảo đảm một người dùng chỉ có một Claim đối với cùng một bài đăng.

#### 2.9. Bảng notifications – Thông báo

**Mục đích:** Lưu trữ thông báo gửi đến người dùng khi xảy ra các sự kiện trong hệ thống.

| Tên cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
| --- | --- | --- | --- |
| notification_id | BIGINT UNSIGNED | PK | Mã thông báo |
| user_id | BIGINT UNSIGNED | FK, NN | Người nhận thông báo |
| type | VARCHAR(50) | NN | Loại thông báo |
| message | TEXT | NN | Nội dung thông báo |
| is_read | BOOLEAN | NN, DEFAULT FALSE | Trạng thái đã đọc |
| created_at | DATETIME | NN | Thời điểm tạo |

**Quy tắc:**

- Mỗi thông báo thuộc về một người dùng.
- Thông báo mới mặc định có trạng thái chưa đọc (FALSE).

#### 2.10. Bảng reports – Báo cáo vi phạm

**Mục đích:** Lưu trữ và quản lý các báo cáo vi phạm liên quan đến bài đăng, người dùng hoặc yêu cầu nhận đồ.

| Tên cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
| --- | --- | --- | --- |
| report_id | BIGINT UNSIGNED | PK | Mã báo cáo |
| reporter_id | BIGINT UNSIGNED | FK, NN | Người gửi báo cáo |
| target_type | ENUM('ITEM','USER','CLAIM') | NN | Loại đối tượng bị báo cáo |
| item_id | BIGINT UNSIGNED | FK, NULL | Bài đăng bị báo cáo |
| reported_user_id | BIGINT UNSIGNED | FK, NULL | Người dùng bị báo cáo |
| claim_id | BIGINT UNSIGNED | FK, NULL | Claim bị báo cáo |
| reason | VARCHAR(50) | NN | Lý do báo cáo |
| description | TEXT | NULL | Mô tả chi tiết |
| status | ENUM | NN, DEFAULT 'PENDING' | Trạng thái báo cáo |
| reviewed_by | BIGINT UNSIGNED | FK, NULL | Quản trị viên xử lý |
| reviewed_at | DATETIME | NULL | Thời điểm xử lý |
| created_at | DATETIME | NN | Thời điểm tạo báo cáo |

**Các trạng thái hợp lệ:**

- PENDING: Đang chờ xử lý.
- REVIEWING: Đang được xem xét.
- RESOLVED: Đã giải quyết.
- DISMISSED: Đã bác bỏ.
Ràng buộc quan trọng:

Mỗi báo cáo phải tham chiếu chính xác một đối tượng bị báo cáo.

Trong ba khóa ngoại item_id, reported_user_id và claim_id, chỉ một khóa được phép có giá trị, đồng thời phải phù hợp với target_type.

#### 2.11. Bảng activity_logs – Nhật ký hoạt động

**Mục đích:** Ghi nhận lịch sử thao tác của người dùng và quản trị viên, phục vụ việc kiểm tra và truy vết hoạt động.

| Tên cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
| --- | --- | --- | --- |
| log_id | BIGINT UNSIGNED | PK | Mã nhật ký |
| user_id | BIGINT UNSIGNED | FK, NULL | Người thực hiện thao tác |
| action | VARCHAR(100) | NN | Hành động được thực hiện |
| entity_type | VARCHAR(50) | NN | Loại đối tượng liên quan |
| entity_id | BIGINT UNSIGNED | NULL | Mã đối tượng liên quan |
| details | JSON | NULL | Thông tin chi tiết |
| created_at | DATETIME | NN | Thời điểm thực hiện |

### 3. Quan hệ giữa các bảng (Cardinality)

#### 3.1. Quan hệ một – nhiều (1)

| Bảng cha | Bảng con | Ý nghĩa |
| --- | --- | --- |
| roles | users | Một vai trò có nhiều người dùng |
| users | items | Một người dùng có thể tạo nhiều bài đăng |
| users | claims | Một người dùng có thể gửi nhiều Claim |
| users | notifications | Một người dùng có thể nhận nhiều thông báo |
| users | reports | Một người dùng có thể gửi nhiều báo cáo |
| users | activity_logs | Một người dùng có thể có nhiều nhật ký hoạt động |
| categories | items | Một danh mục có thể chứa nhiều bài đăng |
| locations | items | Một địa điểm có thể liên quan đến nhiều bài đăng |
| items | item_images | Một bài đăng có thể có nhiều hình ảnh |
| items | matches | Một bài đăng có thể tham gia nhiều kết quả ghép nối |
| items | claims | Một bài đăng FOUND có thể nhận nhiều Claim |
| items | reports | Một bài đăng có thể bị báo cáo nhiều lần |
| users | reports | Một người dùng có thể là đối tượng của nhiều báo cáo |
| claims | reports | Một Claim có thể bị báo cáo nhiều lần |
| users | reports | Một quản trị viên có thể xử lý nhiều báo cáo |

Lưu ý:

- Bảng matches tham chiếu bảng items hai lần thông qua lost_item_id và found_item_id.
- Bảng reports có hai quan hệ khác nhau với users: người gửi báo cáo (reporter_id), người dùng bị báo cáo (reported_user_id), đồng thời có quan hệ với người xét duyệt (reviewed_by).

#### 3.2. Quan hệ nhiều – nhiều (M)

Giữa các bài đăng LOST và FOUND tồn tại quan hệ nhiều – nhiều thông qua bảng trung gian matches.

Điều này có nghĩa là:

- Một bài đăng LOST có thể được ghép nối với nhiều bài đăng FOUND.
- Một bài đăng FOUND có thể được ghép nối với nhiều bài đăng LOST.
- Mỗi cặp ghép nối được lưu thành một bản ghi trong bảng matches.

### 4. Các ràng buộc nghiệp vụ liên quan đến cơ sở dữ liệu

#### 4.1. Ràng buộc ghép nối thông minh

Việc kiểm tra các điều kiện ghép nối được thực hiện tại tầng xử lý nghiệp vụ Backend (Service Layer), kết hợp với giao dịch cơ sở dữ liệu khi cần thiết.

Các điều kiện bao gồm:

- matches.lost_item_id phải tham chiếu đến bài đăng có loại LOST.
- matches.found_item_id phải tham chiếu đến bài đăng có loại FOUND.
- Hai bài đăng phải đang ở trạng thái hợp lệ để ghép nối.
- Hai bài đăng phải khác nhau.
- Không được tạo trùng cặp ghép nối.

#### 4.2. Ràng buộc tạo Claim

Một Claim chỉ hợp lệ khi:

- Bài đăng được yêu cầu nhận có loại FOUND.
- Bài đăng đang ở trạng thái cho phép tiếp nhận Claim.
- Người gửi Claim không phải chủ sở hữu bài đăng.

#### 4.3. Ràng buộc xét duyệt Claim

Mỗi bài đăng FOUND chỉ được có tối đa một Claim ở trạng thái APPROVED hoặc COMPLETED.

Khi chấp thuận Claim, hệ thống phải sử dụng:

- Database Transaction: Giao dịch cơ sở dữ liệu.
- Row Lock: Cơ chế khóa bản ghi của Item trong quá trình xử lý.
Ràng buộc duy nhất trên cặp (claimant_id, item_id) không đủ để bảo đảm chỉ có một Claim được chấp thuận cho cùng một bài đăng, vì nhiều người dùng khác nhau vẫn có thể gửi Claim cho bài đăng đó.

#### 4.4. Ràng buộc đồng bộ trạng thái

Trạng thái Item phải được cập nhật phù hợp với quá trình xử lý Claim:

| Tình huống | Trạng thái Item |
| --- | --- |
| Bài đăng mới được tạo | OPEN |
| Có Claim đang chờ xử lý | CLAIM_PENDING |
| Claim được chấp thuận | CLAIMED |
| Hoàn tất bàn giao đồ vật | RETURNED |

#### 4.5. Ràng buộc bảo toàn dữ liệu

Việc xóa hoặc kiểm duyệt bài đăng phải bảo đảm:

- Không làm mất các bản ghi Claim trong lịch sử.
- Không làm mất dữ liệu báo cáo vi phạm.
- Không làm mất nhật ký hoạt động.
- Không phá vỡ tính toàn vẹn tham chiếu giữa các bảng.
Không sử dụng cơ chế xóa dây chuyền mang tính phá hủy đối với các dữ liệu lịch sử quan trọng.

### 5. Kết luận

Thiết kế ERD của FindIT gồm 11 bảng dữ liệu, đáp ứng các nhóm chức năng chính:

- Quản lý tài khoản và phân quyền.
- Quản lý danh mục và địa điểm.
- Quản lý bài đăng đồ vật.
- Quản lý hình ảnh.
- Ghép nối thông minh.
- Xác minh và nhận lại đồ vật.
- Quản lý thông báo.
- Xử lý báo cáo vi phạm.
- Theo dõi nhật ký hoạt động.
Thiết kế xác định rõ khóa chính, khóa ngoại, các ràng buộc dữ liệu và quan hệ giữa các bảng.
