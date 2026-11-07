# FINDIT – ĐẶC TẢ HỢP ĐỒNG API (API CONTRACT)

**Quy định chung về định dạng phản hồi API**

**Phản hồi thành công (Success)**

```json
{
  "success": true,
  "message": "Yêu cầu được thực hiện thành công",
  "data": {}
}
```

**Phản hồi lỗi (Error)**

```json
{
  "success": false,
  "message": "Thông báo lỗi"
}
```

### 1. API xác thực (Authentication API)

#### 1.1. Đăng ký tài khoản (Register)

**Endpoint:** POST /api/auth/register

**Yêu cầu xác thực:** Không yêu cầu.

Dữ liệu gửi lên (Request):

```json
{
  "fullName": "Nguyen Van A",
  "email": "user@uit.edu.vn",
  "password": "password123"
}
```

**Phản hồi thành công:**

**Mã trạng thái:** 201 Created

```json
{
  "success": true,
  "message": "Đăng ký thành công",
  "data": {
    "id": 1,
    "fullName": "Nguyen Van A",
    "email": "user@uit.edu.vn",
    "role": "USER"
  }
}
```

**Các lỗi có thể xảy ra:**

- 400 Bad Request: Dữ liệu yêu cầu không hợp lệ.
- 409 Conflict: Địa chỉ email đã tồn tại trong hệ thống.

#### 1.2. Đăng nhập (Login)

**Endpoint:** POST /api/auth/login

**Yêu cầu xác thực:** Không yêu cầu.

**Dữ liệu gửi lên:**

```json
{
  "email": "user@uit.edu.vn",
  "password": "password123"
}
```

**Phản hồi thành công:**

**Mã trạng thái:** 200 OK

```json
{
  "success": true,
  "message": "Đăng nhập thành công",
  "data": {
    "token": "JWT_TOKEN",
    "user": {
      "id": 1,
      "fullName": "Nguyen Van A",
      "email": "user@uit.edu.vn",
      "role": "USER"
    }
  }
}
```

**Các lỗi có thể xảy ra:**

- 400 Bad Request: Dữ liệu yêu cầu không hợp lệ.
- 401 Unauthorized: Xác thực không thành công.

### 2. API quản lý người dùng (User API)

Tất cả API trong phần này yêu cầu gửi JWT trong HTTP Header:

Authorization: Bearer <JWT>

#### 2.1. Lấy thông tin hồ sơ người dùng hiện tại

**Endpoint:** GET /api/users/me

**Yêu cầu xác thực:** Bắt buộc.

Vai trò được phép truy cập:

- USER
- ADMIN
**Phản hồi thành công:**

**Mã trạng thái:** 200 OK

```json
{
  "success": true,
  "data": {
    "id": 1,
    "fullName": "Nguyen Van A",
    "email": "user@uit.edu.vn",
    "role": "USER"
  }
}
```

**Lỗi có thể xảy ra:**

- 401 Unauthorized: Chưa xác thực hoặc JWT không hợp lệ.

#### 2.2. Cập nhật hồ sơ người dùng hiện tại

**Endpoint:** PATCH /api/users/me

**Yêu cầu xác thực:** Bắt buộc.

Vai trò được phép truy cập:

- USER
- ADMIN
**Dữ liệu gửi lên:**

```json
{
  "fullName": "Nguyen Van B"
}
```

**Phản hồi thành công:**

**Mã trạng thái:** 200 OK

```json
{
  "success": true,
  "message": "Cập nhật hồ sơ thành công",
  "data": {
    "id": 1,
    "fullName": "Nguyen Van B",
    "email": "user@uit.edu.vn",
    "role": "USER"
  }
}
```

**Các lỗi có thể xảy ra:**

- 400 Bad Request: Dữ liệu cập nhật không hợp lệ.
- 401 Unauthorized: Chưa xác thực hoặc JWT không hợp lệ.

### 3. API tìm kiếm (Search API)

#### 3.1. Tìm kiếm bài đăng đồ vật

**Endpoint:** GET /api/items

**Yêu cầu xác thực:** Không bắt buộc đối với chức năng tìm kiếm.

Các tham số truy vấn (Query Parameters)

| Tham số | Ý nghĩa |
| --- | --- |
| keyword | Từ khóa tìm kiếm |
| type | Loại bài đăng LOST hoặc FOUND |
| category | Danh mục đồ vật |
| location | Địa điểm |
| status | Trạng thái bài đăng |
| dateFrom | Ngày bắt đầu |
| dateTo | Ngày kết thúc |
| sort | Tiêu chí sắp xếp |
| page | Số trang hiện tại |
| limit | Số lượng kết quả trên mỗi trang |

**Ví dụ yêu cầu:**

`GET /api/items?keyword=airpods&type=LOST&category=electronics&location=A&page=1&limit=10`

**Phản hồi thành công:**

**Mã trạng thái:** 200 OK

```json
{
  "success": true,
  "data": [
    {
      "id": 12,
      "title": "Mất tai nghe AirPods",
      "type": "LOST",
      "status": "OPEN"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 24,
    "totalPages": 3
  }
}
```

Trường hợp không tìm thấy bài đăng phù hợp

Hệ thống phải trả về danh sách rỗng thay vì thông báo lỗi.

```json
{
  "success": true,
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 0,
    "totalPages": 0
  }
}
```

### 4. API ghép nối thông minh (Smart Matching API)

#### 4.1. Lấy danh sách ghép nối của một bài đăng

**Endpoint:** GET /api/items/:id/matches

**Yêu cầu xác thực:** Bắt buộc.

**Vai trò:**

- USER
- ADMIN
**Ví dụ yêu cầu:**

`GET /api/items/12/matches`

**Phản hồi thành công:**

**Mã trạng thái:** 200 OK

```json
{
  "success": true,
  "data": [
    {
      "matchId": 15,
      "itemId": 28,
      "score": 82,
      "reasons": [
        "Cùng danh mục",
        "Cùng địa điểm",
        "Mô tả tương đồng",
        "Thời gian xảy ra gần nhau"
      ]
    }
  ]
}
```

**Các lỗi có thể xảy ra:**

- 401 Unauthorized: Chưa xác thực hoặc JWT không hợp lệ.
- 404 Not Found: Không tìm thấy tài nguyên được yêu cầu.

### 4.2. Gợi ý tương đồng hình ảnh (AI Visual Suggestions)

**Endpoint:** `GET /api/items/:id/visual-suggestions`

**Xác thực và quyền:** Bắt buộc JWT hợp lệ của người dùng `ACTIVE`. Chỉ chủ sở hữu bài LOST đang hoạt động (`OPEN`, `CLAIM_PENDING`, `CLAIMED`) được đọc gợi ý; bài không tồn tại, không thuộc người gọi, sai loại hoặc không hoạt động đều trả `404` chung để tránh tiết lộ bản ghi.

**Feature flags:** Backend `AI_VISUAL_SUGGESTIONS_ENABLED=true` và frontend `VITE_AI_VISUAL_SUGGESTIONS_ENABLED=true`; cả hai mặc định tắt. Backend chỉ cho bật với `NODE_ENV=development|test`, `DB_HOST=127.0.0.1`, cổng khác `3306`/`3311` và `FINDIT_ISOLATED_DATADIR` dưới `%TEMP%\findit-mysql-*\data`. Ứng dụng xác minh `@@datadir` và `@@port` khi khởi động. Không tự chạy migration. Chỉ bật preview trên cơ sở dữ liệu cô lập đã có migrations 014–016 và dữ liệu gợi ý. Tuỳ chọn `VITE_AI_VISUAL_SUGGESTIONS_PREVIEW_FIXTURE=true` chỉ hiện nhãn điểm mẫu trong preview, mặc định tắt và không thay đổi API.

**Phản hồi:** `200 OK`, tối đa ba FOUND đang hoạt động và đã có embedding mới nhất cho mọi ảnh. Ứng viên thiếu embedding hiện hành, sai model/revision, sai trạng thái hoặc không còn truy cập được sẽ bị loại. Khi các bảng AI chưa được cài, trả mảng rỗng; các lỗi database khác vẫn theo xử lý lỗi chung.

```json
{
  "success": true,
  "data": [
    {
      "itemId": 28,
      "title": "Túi màu xanh",
      "description": "Nhặt được gần thư viện",
      "color": "Xanh",
      "eventDate": "2026-11-01",
      "category": "Đồ dùng cá nhân",
      "location": "Thư viện",
      "thumbnailUrl": "https://res.cloudinary.com/example/image/upload/item.jpg",
      "cosineScore": 0.734
    }
  ]
}
```

`cosineScore` là điểm xếp hạng tương đồng hình ảnh, không phải xác suất hay mức độ chắc chắn. API chỉ đọc `ai_visual_candidates`; không gọi CLIP, không ghi Match/Notification/Claim, không tự khởi động worker.

### 5. API thông báo (Notification API)

Tất cả API thông báo đều yêu cầu người dùng phải xác thực.

#### 5.1. Lấy danh sách thông báo

**Endpoint:** GET /api/notifications

**Yêu cầu xác thực:** Bắt buộc.

**Phản hồi thành công:**

**Mã trạng thái:** 200 OK

```json
{
  "success": true,
  "data": [
    {
      "id": 10,
      "type": "NEW_MATCH",
      "message": "Đã tìm thấy một bài đăng có khả năng trùng khớp với đồ vật bạn bị mất.",
      "isRead": false,
      "createdAt": "2026-10-24T10:00:00Z"
    }
  ]
}
```

#### 5.2. Đánh dấu một thông báo là đã đọc

**Endpoint:** PATCH /api/notifications/:id/read

**Yêu cầu xác thực:** Bắt buộc.

**Phản hồi thành công:**

**Mã trạng thái:** 200 OK

```json
{
  "success": true,
  "message": "Đã đánh dấu thông báo là đã đọc"
}
```

**Các lỗi có thể xảy ra:**

- 401 Unauthorized: Chưa xác thực.
- 403 Forbidden: Không có quyền truy cập thông báo.
- 404 Not Found: Không tìm thấy thông báo.

#### 5.3. Đánh dấu tất cả thông báo là đã đọc

**Endpoint:** PATCH /api/notifications/read-all

**Yêu cầu xác thực:** Bắt buộc.

**Phản hồi thành công:**

**Mã trạng thái:** 200 OK

```json
{
  "success": true,
  "message": "Đã đánh dấu tất cả thông báo là đã đọc"
}
```

#### 5.4. Lấy số lượng thông báo chưa đọc

**Endpoint:** GET /api/notifications/unread-count

**Yêu cầu xác thực:** Bắt buộc.

**Phản hồi thành công:**

**Mã trạng thái:** 200 OK

```json
{
  "success": true,
  "data": {
    "unreadCount": 5
  }
}
```

### 6. Các mã trạng thái HTTP thông dụng

| Mã HTTP | Ý nghĩa |
| --- | --- |
| 200 OK | Yêu cầu được xử lý thành công |
| 201 Created | Tài nguyên mới đã được tạo thành công |
| 400 Bad Request | Dữ liệu yêu cầu không hợp lệ |
| 401 Unauthorized | Chưa xác thực hoặc JWT không hợp lệ |
| 403 Forbidden | Người dùng không có quyền thực hiện thao tác |
| 404 Not Found | Không tìm thấy tài nguyên |
| 409 Conflict | Xung đột dữ liệu hoặc tài nguyên |
| 500 Internal Server Error | Lỗi nội bộ máy chủ |

### 7. API quản lý đồ vật (Item API)

Đây là phần API được bổ sung theo thỏa thuận của nhóm.

Quy định chung:

- Tất cả thao tác ghi dữ liệu đều yêu cầu JWT.
- API xem danh sách và chi tiết công khai không được tiết lộ thông tin định danh riêng tư hoặc bằng chứng xác minh quyền sở hữu.
- Trường id sử dụng kiểu số.

#### 7.1. Danh sách API

| Phương thức | Endpoint | Quyền truy cập | Dữ liệu yêu cầu | Kết quả |
| --- | --- | --- | --- | --- |
| GET | /api/items/:id | Công khai | Không có | 200 – Chi tiết đồ vật |
| POST | /api/items | USER/ADMIN | Thông tin bài đăng | 201 – Tạo bài trạng thái OPEN |
| PATCH | /api/items/:id | Chủ bài, chỉ khi OPEN | Các trường được phép sửa, trừ type | 200 – Cập nhật thành công |
| PATCH | /api/items/:id/close | Chủ bài hoặc ADMIN | Không có | 200 – Chuyển sang CLOSED |
| POST | /api/items/:id/images | Chủ bài, chỉ khi OPEN | multipart images | 201 – Thông tin ảnh |
| DELETE | /api/items/:id/images/:imageId | Chủ bài, chỉ khi OPEN | Không có | 200 – Xóa ảnh thành công |

Dữ liệu khi tạo bài đăng:

```json
{
  "title": "AirPods",
  "type": "LOST",
  "categoryId": 1,
  "locationId": 2,
  "eventDate": "2026-10-15",
  "description": "Mất tai nghe tại khu A",
  "color": "Trắng"
}
```

Trong đó color là trường không bắt buộc.

#### 7.2. Các trường dữ liệu Item

Dữ liệu JSON của Item bao gồm:

- id: Mã bài đăng.
- title: Tiêu đề.
- type: Loại bài đăng.
- categoryId: Mã danh mục.
- locationId: Mã địa điểm.
- eventDate: Ngày xảy ra sự việc.
- description: Mô tả.
- color: Màu sắc.
- status: Trạng thái.
- images: Danh sách hình ảnh.
- createdAt: Thời điểm tạo.
Thông tin định danh riêng tư không được xuất hiện trong phản hồi công khai.

Hệ thống không cung cấp endpoint DELETE /api/items/:id. Thay vào đó, việc đóng hoặc kiểm duyệt bài đăng được sử dụng nhằm bảo toàn lịch sử dữ liệu.

### 8. API yêu cầu nhận lại đồ vật (Claim API)

Tất cả Claim API đều yêu cầu JWT.

Quy định chung:

- Trường proofDescription chứa bằng chứng xác minh quyền sở hữu và phải được bảo mật.
- Tham số :id trong các endpoint xét duyệt là mã Claim.
| Phương thức | Endpoint | Quyền truy cập | Dữ liệu yêu cầu | Kết quả |
| --- | --- | --- | --- | --- |
| POST | /api/items/:id/claims | USER/ADMIN, trừ chủ bài | proofDescription | 201 – Claim PENDING |
| GET | /api/claims/mine | Đã xác thực | page?, limit? | 200 – Claim đã gửi |
| GET | /api/items/:id/claims | Chủ bài FOUND hoặc ADMIN | page?, limit? | 200 – Danh sách Claim |
| PATCH | /api/claims/:id/approve | Chủ bài FOUND | Không có | 200 – APPROVED |
| PATCH | /api/claims/:id/reject | Chủ bài FOUND | Không có | 200 – REJECTED |
| PATCH | /api/claims/:id/complete | Chủ bài FOUND | Không có | 200 – COMPLETED, Item RETURNED |

Ví dụ dữ liệu gửi Claim:

```json
{
  "proofDescription": "Tai nghe của tôi có một vết xước nhỏ ở mặt sau hộp."
}
```

### 9. API báo cáo vi phạm (Report API)

| Phương thức | Endpoint | Quyền truy cập | Dữ liệu yêu cầu | Kết quả |
| --- | --- | --- | --- | --- |
| POST | /api/reports | Đã xác thực | targetType, targetId, reason, description? | 201 – PENDING |
| GET | /api/reports/mine | Người gửi báo cáo | Không có | 200 – Báo cáo của mình |
| GET | /api/admin/reports | ADMIN | status, page, limit | 200 – Danh sách có phân trang |
| PATCH | /api/admin/reports/:id | ADMIN | status | 200 – Cập nhật báo cáo |

Dữ liệu tạo báo cáo:

```json
{
  "targetType": "ITEM",
  "targetId": 12,
  "reason": "Thông tin không chính xác",
  "description": "Bài đăng có dấu hiệu cung cấp thông tin sai lệch."
}
```

Trong đó description không bắt buộc.

Trạng thái xử lý báo cáo được đề cập trong hợp đồng:

- REVIEWING: Đang xem xét.
- RESOLVED: Đã giải quyết.
- DISMISSED: Đã bác bỏ.

### 10. API quản trị hệ thống (Admin API)

Tất cả endpoint trong phần này chỉ dành cho ADMIN.

Người dùng có vai trò USER truy cập các endpoint này phải nhận mã lỗi 403 Forbidden.

| Phương thức | Endpoint | Dữ liệu yêu cầu | Kết quả |
| --- | --- | --- | --- |
| GET | /api/admin/dashboard | Không có | 200 – Thống kê tổng hợp |
| GET | /api/admin/users | page, limit | 200 – Danh sách người dùng |
| PATCH | /api/admin/users/:id/status | status: ACTIVE/SUSPENDED | Cập nhật trạng thái |
| GET | /api/admin/items | filters, page, limit | 200 – Danh sách bài đăng |
| PATCH | /api/admin/items/:id/close | reason | 200 – Đóng bài |
| PATCH | /api/admin/items/:id/visibility | visibility: PUBLIC/HIDDEN, reason | 200 – Gỡ/khôi phục hiển thị |
| GET | /api/admin/claims | status?, itemId?, claimantId?, page?, limit?, sort? | 200 – Danh sách Claim |
| PATCH | /api/admin/claims/:id/resolve | decision, reason | Xử lý tranh chấp |
| GET | /api/admin/categories | Không có | 200 – Danh mục |
| POST | /api/admin/categories | name | 201 – Tạo danh mục |
| PATCH | /api/admin/categories/:id | name?, isActive? | 200 – Cập nhật |
| GET | /api/admin/locations | Không có | 200 – Địa điểm |
| POST | /api/admin/locations | name | 201 – Tạo địa điểm |
| PATCH | /api/admin/locations/:id | name?, isActive? | 200 – Cập nhật |
| GET | /api/admin/activity-logs | action?, entityType?, entityId?, actorId?, dateFrom?, dateTo?, page?, limit?, sort? | 200 – Nhật ký hoạt động |

Giải thích các tham số:

- page: Trang hiện tại.
- limit: Số bản ghi mỗi trang.
- filters: Các điều kiện lọc.
- reason: Lý do thực hiện thao tác.
- decision: Quyết định xử lý, nhận giá trị APPROVE hoặc REJECT.
- name: Tên danh mục hoặc địa điểm.
- isActive: Trạng thái kích hoạt.

### 11. Quy định chung về kiểm tra dữ liệu và phản hồi

#### 11.1. Quy định kiểm tra dữ liệu (Validation)

- Trường type chỉ nhận LOST hoặc FOUND.
- Không được thay đổi status thông qua API PATCH Item thông thường.
- Tham số category và location trong GET /api/items là mã định danh (ID), không phải tên.
- type và status sử dụng các giá trị liệt kê (Enum).
- Trường title trong API tương ứng với cột items.title trong cơ sở dữ liệu, đại diện cho khái niệm item_name trong thiết kế ban đầu.
- Các bộ lọc ngày tháng sử dụng định dạng ISO YYYY-MM-DD.

#### 11.2. Ví dụ phản hồi tạo Item thành công

```json
{
  "success": true,
  "message": "Tạo bài đăng thành công",
  "data": {
    "id": 12,
    "title": "AirPods",
    "type": "LOST",
    "status": "OPEN",
    "categoryId": 1,
    "locationId": 2,
    "eventDate": "2026-10-15"
  }
}
```

#### 11.3. Ví dụ lỗi trùng Claim

```json
{
  "success": false,
  "message": "Người dùng đã gửi yêu cầu nhận đồ cho bài đăng này"
}
```

#### 11.4. Quy định xử lý lỗi

- 400: Dữ liệu đầu vào hoặc chuyển đổi trạng thái không hợp lệ.
- 401: Thiếu JWT hoặc JWT không hợp lệ.
- 403: Không có quyền thực hiện thao tác.
- 404: Không tìm thấy tài nguyên.
- 409: Claim trùng hoặc xung đột với Claim đang hoạt động.
- 500: Lỗi máy chủ không mong muốn.
Yêu cầu bảo mật:

- Không được cung cấp bằng chứng xác minh riêng tư cho người dùng không có quyền.
- Các API phân trang phải sử dụng trường pagination ở cấp cao nhất của phản hồi, thống nhất với Search API.

### 12. API quản trị Claim và kiểm duyệt Item (Admin Moderation API)

**Yêu cầu xác thực chung:** JWT của tài khoản `ADMIN` đang `ACTIVE`. Các endpoint dưới đây trả `401` nếu chưa xác thực, `403` nếu không đủ quyền. Trường ID phải là số nguyên dương an toàn; trường không được định nghĩa trong request bị từ chối (`400`).

#### 12.1. Lấy danh sách Claim quản trị

**Endpoint:** `GET /api/admin/claims`

**Yêu cầu xác thực:** `ACTIVE ADMIN`.

**Tham số truy vấn (không bắt buộc):**

| Tham số | Giá trị / ý nghĩa |
| --- | --- |
| `status` | `PENDING`, `APPROVED`, `REJECTED`, `COMPLETED` |
| `itemId` | ID bài đăng |
| `claimantId` | ID người gửi Claim |
| `page`, `limit` | Phân trang |
| `sort` | `newest` (mặc định) hoặc `oldest` |

**Ví dụ yêu cầu:** `GET /api/admin/claims?status=PENDING&page=1&limit=10&sort=newest`

**Phản hồi thành công:** `200 OK`

```json
{
  "success": true,
  "data": [
    {
      "id": 15,
      "itemId": 12,
      "claimantId": 7,
      "status": "PENDING",
      "submittedAt": "2026-11-02T08:00:00Z",
      "reviewedAt": null,
      "completedAt": null,
      "item": {
        "id": 12,
        "userId": 3,
        "title": "AirPods",
        "type": "FOUND",
        "status": "CLAIM_PENDING"
      }
    }
  ],
  "pagination": { "page": 1, "limit": 10, "total": 1, "totalPages": 1 }
}
```

**Các lỗi có thể xảy ra:** `400` tham số không hợp lệ; `401` chưa xác thực; `403` không phải ACTIVE ADMIN.

#### 12.2. ADMIN giải quyết Claim

**Endpoint:** `PATCH /api/admin/claims/:id/resolve`

**Yêu cầu xác thực:** `ACTIVE ADMIN`, không phải chủ bài đăng và không có Claim nào trên bài đăng đó.

**Dữ liệu gửi lên:**

```json
{
  "decision": "APPROVE",
  "reason": "Đã xác minh quyền sở hữu"
}
```

`decision` nhận `APPROVE` hoặc `REJECT`. `reason` được loại khoảng trắng đầu/cuối, dài 1–1.000 Unicode code points và không quá 4.000 byte UTF-8.

**Phản hồi thành công:** `200 OK`

```json
{
  "success": true,
  "data": {
    "claim": {
      "id": 15,
      "itemId": 12,
      "claimantId": 7,
      "status": "APPROVED",
      "submittedAt": "2026-11-02T08:00:00Z",
      "reviewedAt": "2026-11-02T09:00:00Z",
      "completedAt": null
    },
    "item": { "id": 12, "status": "CLAIMED" },
    "autoRejectedClaimCount": 2
  }
}
```

**Các lỗi có thể xảy ra:** `400` request không hợp lệ; `401` chưa xác thực; `403` thiếu quyền hoặc xung đột lợi ích; `404` Claim/Item không tồn tại; `409` Claim không còn `PENDING`, Item không ở trạng thái hợp lệ hoặc quyết định lặp lại.

**Quy tắc kết quả:** Chỉ xử lý Claim `PENDING` trên Item `FOUND/CLAIM_PENDING` nhất quán. `APPROVE` chuyển Claim thành `APPROVED`, Item thành `CLAIMED`, đồng thời từ chối Claim `PENDING` cạnh tranh. `REJECT` giữ `CLAIM_PENDING` nếu còn Claim chờ, nếu không chuyển Item về `OPEN`. API này không hoàn tất bàn giao.

#### 12.3. Lấy nhật ký hoạt động quản trị

**Endpoint:** `GET /api/admin/activity-logs`

**Yêu cầu xác thực:** `ACTIVE ADMIN`.

**Tham số truy vấn (không bắt buộc):**

| Tham số | Giá trị / ý nghĩa |
| --- | --- |
| `action` | Loại hành động được hỗ trợ |
| `entityType` | `ITEM`, `CLAIM`, `USER`, `CATEGORY`, `LOCATION`, `REPORT` |
| `entityId`, `actorId` | ID đối tượng / người thực hiện |
| `dateFrom`, `dateTo` | Ngày UTC `YYYY-MM-DD` |
| `page`, `limit` | Phân trang |
| `sort` | `newest` (mặc định) hoặc `oldest` |

**Ví dụ yêu cầu:** `GET /api/admin/activity-logs?entityType=CLAIM&page=1&limit=10`

**Phản hồi thành công:** `200 OK`

```json
{
  "success": true,
  "data": [
    {
      "id": 101,
      "actorId": 2,
      "action": "CLAIM_ADMIN_RESOLVED",
      "entityType": "CLAIM",
      "entityId": 15,
      "createdAt": "2026-11-02T09:00:00Z",
      "details": {}
    }
  ],
  "pagination": { "page": 1, "limit": 10, "total": 1, "totalPages": 1 }
}
```

`details` thay đổi theo `action`; ví dụ trên chỉ minh họa cấu trúc, không khẳng định `details` của sự kiện này luôn rỗng. `actorId` và `entityId` có thể là `null`. Các hành động được trả về gồm `ITEM_MODERATED_CLOSED`, `CLAIM_ADMIN_RESOLVED`, `CLAIM_APPROVED`, `CLAIM_REJECTED`, `CLAIM_COMPLETED`, `USER_STATUS_CHANGED`, `REPORT_STATUS_CHANGED`, `CATEGORY_CREATED/UPDATED/DISABLED`, `LOCATION_CREATED/UPDATED/DISABLED`. Các sự kiện nội bộ `IMAGE_OPERATION_*`, `IMAGE_CLEANUP_*` không nằm trong danh sách.

**Các lỗi có thể xảy ra:** `400` bộ lọc/ngày không hợp lệ; `401` chưa xác thực; `403` không phải ACTIVE ADMIN. Khoảng ngày đảo ngược trả `400`; `dateTo` tính đến hết ngày UTC.

#### 12.4. ADMIN đóng bài đăng

**Endpoint:** `PATCH /api/admin/items/:id/close`

**Yêu cầu xác thực:** `ACTIVE ADMIN`, không phải chủ bài đăng và không có Claim nào trên bài đăng đó.

**Dữ liệu gửi lên:**

```json
{
  "reason": "Bài đăng vi phạm quy định"
}
```

`reason` có cùng giới hạn như mục 12.2.

**Phản hồi thành công:** `200 OK`

```json
{
  "success": true,
  "data": {
    "item": {
      "id": 12,
      "status": "CLOSED"
    },
    "rejectedClaimCount": 2
  }
}
```

`item` là `ItemDto` đầy đủ; ví dụ chỉ minh họa các trường liên quan đến thao tác đóng.

**Các lỗi có thể xảy ra:** `400` dữ liệu không hợp lệ; `401` chưa xác thực; `403` thiếu quyền hoặc xung đột lợi ích; `404` Item không tồn tại; `409` trạng thái không cho phép đóng hoặc thao tác lặp lại.

**Quy tắc kết quả:** Chỉ hỗ trợ `OPEN` không có Claim đang hoạt động hoặc `FOUND/CLAIM_PENDING` với Claim chờ. Claim `PENDING` được từ chối, ghi thời gian xét duyệt, sau đó Item chuyển `CLOSED`. Dữ liệu lịch sử vẫn được giữ. `CLOSED` không đồng nghĩa ẩn nội dung khỏi API công khai.

#### 12.4. Gỡ/khôi phục hiển thị bài đăng

`PATCH /api/admin/items/:id/visibility` nhận `{ "visibility": "HIDDEN", "reason": "Nội dung vi phạm" }` hoặc `visibility: "PUBLIC"` để khôi phục. Lý do có cùng giới hạn Unicode như 12.2. Chỉ `ACTIVE ADMIN` không là chủ bài và chưa từng gửi Claim trên bài được thao tác. Thành công trả `200` với `{ success: true, data: { item: ItemDto } }`; Item DTO có thêm `visibility: PUBLIC | HIDDEN`.

Các lỗi: `400` sai input/query; `401` chưa xác thực; `403` thiếu quyền/xung đột lợi ích; `404` không tồn tại; `409` bài đã ở chế độ được yêu cầu. Không thay đổi trạng thái Item/Claim; hiển thị, nhật ký lý do riêng tư và thông báo chủ bài phải nguyên tử. Khôi phục không mở lại bài CLOSED/RETURNED.

`GET /api/admin/items` hỗ trợ bộ lọc `visibility=PUBLIC|HIDDEN`, mặc định trả cả hai. Tìm kiếm công khai và Matching chỉ gồm bài PUBLIC, tổng phân trang dùng cùng điều kiện. `GET /api/items/:id` cho bài HIDDEN trả 404 với người ngoài; Bearer token hợp lệ của chủ bài hoặc ADMIN cho phép đọc riêng. Token được gửi nhưng không hợp lệ trả 401. Bài HIDDEN không nhận Claim mới hoặc sửa nội dung/ảnh, nhưng lịch sử và bàn giao hiện có vẫn được giữ. Lý do gỡ/khôi phục chỉ có trong nhật ký ADMIN.

### 13. API kiểm tra sức khỏe hệ thống (Health API)

#### 13.1. Kiểm tra khả năng sẵn sàng của database

**Endpoint:** `GET /api/health` (hỗ trợ `HEAD`)

**Yêu cầu xác thực:** Không yêu cầu.

**Dữ liệu gửi lên:** Không có.

**Phản hồi:** `200 OK` nếu sẵn sàng; `503 Service Unavailable` nếu không sẵn sàng. Giữ nguyên cấu trúc phản hồi đã triển khai; không công khai chi tiết lỗi database. Header `Cache-Control: no-store`.

**Các lỗi có thể xảy ra:** `429 Too Many Requests` khi vượt giới hạn yêu cầu theo IP (mặc định 60/phút), trả về error envelope chuẩn cùng `Retry-After` và các header `RateLimit`.

### 14. Quy định phân trang cho Claim và Matching API

Các endpoint dưới đây **đã có trong hợp đồng**, được cập nhật tham số và cấu trúc phản hồi:

| Phương thức | Endpoint | Quyền truy cập | Query parameters | Kết quả |
| --- | --- | --- | --- | --- |
| GET | `/api/claims/mine` | Người dùng đã xác thực | `page`, `limit` | `200` – Claim của mình có phân trang |
| GET | `/api/items/:id/claims` | Chủ bài FOUND hoặc ADMIN có quyền | `page`, `limit` | `200` – Claim của Item có phân trang |
| GET | `/api/items/:id/matches` | Người dùng đã xác thực có quyền | `page`, `limit` | `200` – Match có phân trang |

**Tham số truy vấn:** `page=1`, `limit=10` mặc định; `limit` tối đa 100; `(page - 1) × limit` không quá 100.000. Chỉ chấp nhận `page` và `limit`; tham số lặp, không hợp lệ, không an toàn hoặc không được hỗ trợ trả `400`.

**Ví dụ yêu cầu:** `GET /api/claims/mine?page=1&limit=10`

**Phản hồi thành công:** `200 OK`

```json
{
  "success": true,
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 0,
    "totalPages": 0
  }
}
```

Khi có dữ liệu, `data` vẫn là mảng DTO hiện có của từng endpoint. Trang trống hoặc vượt phạm vi trả `200` với `data: []`. Item không tồn tại trả `404`. Thứ tự Claim: mới nhất trước (`submitted_at DESC`, `claim_id DESC`); Match: điểm cao trước (`match_score DESC`, `match_id ASC`).

