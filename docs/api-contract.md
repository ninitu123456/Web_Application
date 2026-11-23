# FindIt — Hợp đồng API

Tài liệu mô tả toàn bộ endpoint của backend: đường dẫn, quyền truy cập, dữ liệu gửi lên, phản hồi và mã lỗi. Mọi endpoint có tiền tố `/api` (local: `http://127.0.0.1:3001/api`). Quy tắc nghiệp vụ đứng sau từng endpoint xem [quy tắc nghiệp vụ](business-rules.md).

## 1. Quy định chung

### 1.1. Định dạng phản hồi

Thành công:

```json
{
  "success": true,
  "message": "Yêu cầu được thực hiện thành công",
  "data": {}
}
```

Danh sách có phân trang đặt `pagination` ở cấp cao nhất, cạnh `data`:

```json
{
  "success": true,
  "data": [],
  "pagination": { "page": 1, "limit": 10, "total": 0, "totalPages": 0 }
}
```

Lỗi:

```json
{
  "success": false,
  "message": "Thông báo lỗi"
}
```

`message` là tùy chọn với phản hồi thành công. Phản hồi lỗi không bao giờ chứa stack trace hay câu SQL.

### 1.2. Xác thực

Endpoint cần xác thực đọc JWT từ header:

```
Authorization: Bearer <JWT>
```

Vai trò và trạng thái tài khoản được đọc lại từ database ở mỗi request. Các nhóm `/api/auth`, `/api/users`, `/api/items`, `/api/claims`, `/api/notifications`, `/api/reports`, `/api/conversations`, `/api/admin` trả header `Cache-Control: no-store`.

### 1.3. Kiểm tra dữ liệu

- Body và query chỉ chấp nhận các trường được liệt kê; trường lạ hoặc tham số lặp trả `400`.
- ID là số nguyên dương an toàn (≤ `Number.MAX_SAFE_INTEGER`). ID trong phản hồi JSON là số, riêng module nhắn tin trả ID dạng chuỗi.
- Ngày dùng định dạng `YYYY-MM-DD`.
- Phân trang: `page` mặc định 1, `limit` mặc định 10 và tối đa 100. Với danh sách Claim, Match, gợi ý và bài của tôi, `(page - 1) × limit` không vượt quá 100.000. Trang vượt phạm vi trả `200` với `data: []`.
- `type` chỉ nhận `LOST` hoặc `FOUND`; `status` chỉ nhận các giá trị liệt kê trong [yêu cầu](requirements.md#5-trạng-thái-và-quy-ước-dữ-liệu).

### 1.4. Mã trạng thái HTTP

| Mã | Ý nghĩa |
| --- | --- |
| `200 OK` | Thành công |
| `201 Created` | Đã tạo tài nguyên |
| `400 Bad Request` | Dữ liệu hoặc chuyển trạng thái không hợp lệ |
| `401 Unauthorized` | Thiếu JWT hoặc JWT không hợp lệ |
| `403 Forbidden` | Không đủ quyền, xung đột lợi ích, hoặc tài khoản không còn `ACTIVE` |
| `404 Not Found` | Không tìm thấy, hoặc người gọi không được biết tài nguyên tồn tại |
| `409 Conflict` | Trùng dữ liệu hoặc xung đột trạng thái (Claim trùng, quyết định lặp) |
| `429 Too Many Requests` | Vượt rate limit; kèm `Retry-After` và các header `RateLimit` |
| `500 Internal Server Error` | Lỗi không mong muốn |
| `503 Service Unavailable` | Database hoặc dịch vụ email tạm thời không khả dụng |

### 1.5. Dữ liệu riêng tư

- Không trả `proofDescription` cho người không có quyền xem bằng chứng.
- Không trả `private_identifiers`, password hash, lý do quyết định quản trị trong dữ liệu công khai.

## 2. Xác thực

| Phương thức | Endpoint | Quyền | Body | Kết quả |
| --- | --- | --- | --- | --- |
| POST | `/api/auth/register` | Công khai | `fullName`, `email`, `password`, `confirmPassword` | `201` – Tài khoản `USER` |
| POST | `/api/auth/login` | Công khai | `email`, `password` | `200` – JWT và thông tin người dùng |
| POST | `/api/auth/forgot-password` | Công khai | `email` | `200` – Thông báo chung |
| POST | `/api/auth/reset-password` | Công khai | `token`, `password`, `confirmPassword` | `200` – Đã đặt lại mật khẩu |

### 2.1. Đăng ký

```json
{
  "fullName": "Nguyen Van A",
  "email": "user@uit.edu.vn",
  "password": "password123",
  "confirmPassword": "password123"
}
```

- `fullName`: 1–150 ký tự. `email`: tối đa 255 ký tự, được chuẩn hóa về chữ thường.
- `password`: tối thiểu 8 ký tự, tối đa 72 byte UTF-8 (giới hạn của bcrypt); phải trùng `confirmPassword`.

Phản hồi `201`:

```json
{
  "success": true,
  "message": "Đăng ký thành công",
  "data": { "id": 1, "fullName": "Nguyen Van A", "email": "user@uit.edu.vn", "role": "USER" }
}
```

Lỗi: `400` dữ liệu không hợp lệ hoặc mật khẩu xác nhận không khớp; `409` email đã tồn tại.

### 2.2. Đăng nhập

```json
{ "email": "user@uit.edu.vn", "password": "password123" }
```

Phản hồi `200`:

```json
{
  "success": true,
  "message": "Đăng nhập thành công",
  "data": {
    "token": "JWT_TOKEN",
    "user": { "id": 1, "fullName": "Nguyen Van A", "email": "user@uit.edu.vn", "role": "USER" }
  }
}
```

Lỗi: `400` dữ liệu không hợp lệ; `401` sai thông tin đăng nhập hoặc tài khoản không `ACTIVE`.

### 2.3. Quên và đặt lại mật khẩu

- `forgot-password` luôn trả cùng một `message`, dù email có tồn tại hay không. Liên kết gửi qua email có dạng `<FRONTEND_URL>/dat-lai-mat-khau#token=<token>`, hết hạn sau 15 phút.
- `reset-password` nhận `token` (64 ký tự hex) và mật khẩu mới theo quy tắc ở mục 2.1. Thành công làm mọi JWT cũ của tài khoản mất hiệu lực.

Lỗi: `400` dữ liệu không hợp lệ, liên kết sai hoặc đã hết hạn; `503` dịch vụ email chưa được cấu hình.

## 3. Người dùng

| Phương thức | Endpoint | Quyền | Body | Kết quả |
| --- | --- | --- | --- | --- |
| GET | `/api/users/me` | `USER`/`ADMIN` | — | `200` – Hồ sơ của mình |
| PATCH | `/api/users/me` | `USER`/`ADMIN` | `fullName` | `200` – Hồ sơ sau cập nhật |

Hồ sơ có dạng `{ "id", "fullName", "email", "role" }`. Lỗi: `400` dữ liệu không hợp lệ; `401` chưa xác thực.

## 4. Danh mục và địa điểm

| Phương thức | Endpoint | Quyền | Kết quả |
| --- | --- | --- | --- |
| GET | `/api/categories` | Công khai | `200` – Danh mục đang dùng |
| GET | `/api/locations` | Công khai | `200` – Địa điểm đang dùng |

Không nhận query; có query trả `400`.

## 5. Bài đăng

| Phương thức | Endpoint | Quyền | Dữ liệu | Kết quả |
| --- | --- | --- | --- | --- |
| GET | `/api/items` | Công khai | Query tìm kiếm (mục 5.1) | `200` – Danh sách có phân trang |
| GET | `/api/items/mine` | `USER`/`ADMIN` | `page?`, `limit?` | `200` – Bài của tôi, gồm cả bài bị gỡ |
| GET | `/api/items/:id` | Công khai | — | `200` – Chi tiết bài |
| POST | `/api/items` | `USER`/`ADMIN` | Thông tin bài (mục 5.2) | `201` – Bài `OPEN` |
| PATCH | `/api/items/:id` | Chủ bài, khi `OPEN` | Các trường được sửa, trừ `type` | `200` – Bài sau cập nhật |
| PATCH | `/api/items/:id/close` | Chủ bài, khi `OPEN` | — | `200` – Bài `CLOSED` |
| POST | `/api/items/:id/images` | Chủ bài, khi `OPEN` | `multipart/form-data`, trường `images` | `201` – Thông tin ảnh |
| DELETE | `/api/items/:id/images/:imageId` | Chủ bài, khi `OPEN` | — | `200` – Đã xóa ảnh |

Không có endpoint `DELETE /api/items/:id`; bài được đóng hoặc gỡ hiển thị để giữ lịch sử.

### 5.1. Tìm kiếm

| Tham số | Ý nghĩa |
| --- | --- |
| `keyword` | Từ khóa, tối đa 200 ký tự |
| `type` | `LOST` hoặc `FOUND` |
| `category` | ID danh mục |
| `location` | ID địa điểm |
| `status` | `OPEN`, `CLAIM_PENDING`, `CLAIMED`, `RETURNED`, `CLOSED` |
| `dateFrom`, `dateTo` | Khoảng ngày xảy ra; `dateFrom` không sau `dateTo` |
| `sort` | `newest`, `oldest`, `eventDateAsc`, `eventDateDesc` |
| `page`, `limit` | Phân trang |

Ví dụ: `GET /api/items?keyword=airpods&type=LOST&category=1&location=2&page=1&limit=10`

Chỉ trả bài `PUBLIC`; tổng số trang dùng cùng điều kiện. Không có kết quả thì trả `data: []`.

### 5.2. Tạo và sửa bài

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

- Bắt buộc: `title` (tối đa 200 ký tự), `type`, `categoryId`, `locationId`, `eventDate` (không ở tương lai), `description`. Không bắt buộc: `color` (tối đa 80 ký tự).
- `PATCH` nhận ít nhất một trong `title`, `categoryId`, `locationId`, `eventDate`, `description`, `color` (`color: null` để xóa). Không đổi được `type` hay `status` qua `PATCH`.
- Ảnh: tối đa 5 ảnh mỗi bài, mỗi ảnh tối đa 5 MiB.

### 5.3. Dữ liệu bài (`ItemDto`)

```json
{
  "id": 12,
  "userId": 3,
  "categoryId": 1,
  "locationId": 2,
  "title": "AirPods",
  "description": "Mất tai nghe tại khu A",
  "type": "LOST",
  "color": "Trắng",
  "eventDate": "2026-10-15",
  "status": "OPEN",
  "createdAt": "2026-10-15T08:00:00.000Z",
  "updatedAt": "2026-10-15T08:00:00.000Z",
  "category": { "id": 1, "name": "Đồ điện tử" },
  "location": { "id": 2, "name": "Tòa A" },
  "images": [{ "id": 5, "url": "https://res.cloudinary.com/..." }]
}
```

`category`, `location` và `visibility` (`PUBLIC`/`HIDDEN`) chỉ có mặt khi truy vấn tương ứng kèm các thông tin này.

### 5.4. Bài bị gỡ hiển thị

`GET /api/items/:id` cho bài `HIDDEN` trả `404` với người ngoài. Chủ bài hoặc `ADMIN` gửi kèm JWT hợp lệ vẫn đọc được. Gửi JWT không hợp lệ trả `401`. Bài `HIDDEN` không nhận Claim mới và không sửa được nội dung hay ảnh.

## 6. Gợi ý trùng khớp

Cả ba endpoint chỉ dành cho chủ bài (`USER` hoặc `ADMIN` đang `ACTIVE`). Người khác, kể cả `ADMIN` không phải chủ bài, nhận `404`; chưa đăng nhập nhận `401`. Các endpoint chỉ đọc: không tạo Match, Claim, thông báo hay email.

| Phương thức | Endpoint | Query | Kết quả |
| --- | --- | --- | --- |
| GET | `/api/items/:id/suggestions` | `page?`, `limit?`, `visual?` | `200` – Gợi ý hợp nhất (thông tin + hình ảnh) |
| GET | `/api/items/:id/matches` | `page?`, `limit?` | `200` – Ghép nối theo thông tin |
| GET | `/api/items/:id/visual-suggestions` | — | `200` – Gợi ý hình ảnh (API kỹ thuật) |

### 6.1. Gợi ý hợp nhất

`GET /api/items/:id/suggestions?page=1&limit=6&visual=true` là endpoint giao diện dùng. Bài phải `PUBLIC` và đang `OPEN`, `CLAIM_PENDING` hoặc `CLAIMED`.

```json
{
  "success": true,
  "data": {
    "visual": [],
    "information": [],
    "totalUnique": 0
  },
  "visualState": "ready",
  "pagination": { "page": 1, "limit": 6, "total": 0, "totalPages": 0 }
}
```

- Mỗi phần tử gồm `item` (`ItemDto` công khai), `reasons` (`IMAGE`, `INFORMATION` hoặc cả hai), và các trường tùy chọn `similarityBand`, `informationScore`, `informationReasons`.
- Tối đa ba gợi ý hình ảnh được ghim ở đầu. Các bài đó bị loại khỏi danh sách `information` trước khi phân trang. `pagination.total` là số gợi ý `information` còn lại; `totalUnique` là tổng hai nhóm.
- `similarityBand`: `VERY_HIGH` (cosine ≥ 0,85, "Rất giống"), `HIGH` (≥ 0,70, "Khá giống"), còn lại `MEDIUM` ("Có thể liên quan"). Ngưỡng chỉ để hiển thị, chưa được hiệu chỉnh trên ảnh thật. Endpoint này không trả điểm cosine thô.
- `visualState`: `disabled`, `processing`, `ready` hoặc `error`. Giao diện hỏi lại sau 10 giây khi `processing`, 30 giây khi `ready` hoặc `error`.
- AI tắt thì gợi ý theo thông tin vẫn hoạt động. Giao diện luôn kèm cảnh báo "Gợi ý không phải là xác nhận quyền sở hữu."

### 6.2. Ghép nối theo thông tin

```json
{
  "success": true,
  "data": [
    {
      "matchId": 15,
      "itemId": 28,
      "score": 82,
      "reasons": ["Cùng danh mục", "Cùng địa điểm", "Mô tả tương đồng", "Thời gian xảy ra gần nhau"]
    }
  ],
  "pagination": { "page": 1, "limit": 10, "total": 1, "totalPages": 1 }
}
```

Áp dụng cho cả bài `LOST` và `FOUND`. Sắp xếp điểm cao trước (`match_score DESC`, `match_id ASC`).

### 6.3. Gợi ý hình ảnh

`GET /api/items/:id/visual-suggestions` trả tối đa ba bài loại đối diện đang hoạt động, đã có embedding mới nhất cho mọi ảnh. Bài phải đang `OPEN`, `CLAIM_PENDING` hoặc `CLAIMED`.

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

- `cosineScore` là điểm xếp hạng, không phải xác suất. Endpoint chỉ đọc `ai_visual_candidates`, không gọi model CLIP.
- Bật bằng `AI_VISUAL_SUGGESTIONS_ENABLED=true` (backend) và `VITE_AI_VISUAL_SUGGESTIONS_ENABLED=true` (frontend); cả hai mặc định tắt. Khi bảng AI chưa được cài, trả mảng rỗng. Cấu hình production xem [triển khai](deployment.md#gợi-ý-bằng-hình-ảnh-ai).

## 7. Yêu cầu nhận đồ (Claim)

| Phương thức | Endpoint | Quyền | Dữ liệu | Kết quả |
| --- | --- | --- | --- | --- |
| POST | `/api/items/:id/claims` | `USER`/`ADMIN`, trừ chủ bài | `proofDescription` | `201` – Claim `PENDING` |
| GET | `/api/claims/mine` | `USER`/`ADMIN` | `page?`, `limit?` | `200` – Claim đã gửi |
| GET | `/api/items/:id/claims` | Chủ bài `FOUND` hoặc `ADMIN` | `page?`, `limit?` | `200` – Claim của bài |
| PATCH | `/api/claims/:id/approve` | Chủ bài `FOUND` | — | `200` – Claim `APPROVED`, bài `CLAIMED` |
| PATCH | `/api/claims/:id/reject` | Chủ bài `FOUND` | — | `200` – Claim `REJECTED` |
| PATCH | `/api/claims/:id/complete` | Chủ bài `FOUND` | — | `200` – Claim `COMPLETED`, bài `RETURNED` |

`:id` trong `/api/claims/:id/...` là mã Claim.

```json
{ "proofDescription": "Tai nghe của tôi có một vết xước nhỏ ở mặt sau hộp." }
```

- Danh sách sắp xếp mới nhất trước (`submitted_at DESC`, `claim_id DESC`).
- Lỗi: `400` dữ liệu hoặc chuyển trạng thái không hợp lệ; `403` không có quyền; `404` bài hoặc Claim không tồn tại; `409` đã gửi Claim cho bài này hoặc xung đột với Claim đang hoạt động.

```json
{ "success": false, "message": "Người dùng đã gửi yêu cầu nhận đồ cho bài đăng này" }
```

## 8. Nhắn tin

### 8.1. REST API

Mọi endpoint yêu cầu JWT. ID trong module này là chuỗi số.

| Phương thức | Endpoint | Dữ liệu | Kết quả |
| --- | --- | --- | --- |
| GET | `/api/conversations` | `before?`, `limit?` | `200` – Cuộc trò chuyện của tôi |
| POST | `/api/conversations` | `userId` | `201` – Cuộc trò chuyện với người đó (tạo mới hoặc dùng lại) |
| GET | `/api/conversations/unread-count` | — | `200` – `{ "unreadCount": number }` |
| GET | `/api/conversations/:id/messages` | `before?`, `after?`, `limit?` | `200` – Lịch sử tin nhắn |
| POST | `/api/conversations/:id/messages` | `content`, `clientId` | `201` – Tin nhắn vừa gửi |
| POST | `/api/conversations/:id/read` | `messageId` | `200` – Đã đánh dấu đọc tới tin này |

- `limit` mặc định 30, tối đa 100. `before`/`after` là ID tin nhắn dùng để cuộn trang.
- `content`: 1–2.000 ký tự, không chứa ký tự điều khiển. `clientId`: UUID do client sinh; gửi lại cùng `clientId` trả về tin đã có.
- Tin nhắn: `{ "id", "conversationId", "senderId", "clientId", "content", "createdAt" }`.
- Lỗi: `400` dữ liệu không hợp lệ hoặc nhắn cho chính mình; `403` không phải thành viên; `429` vượt 30 tin mỗi phút.

### 8.2. Socket.IO

Client kết nối với `auth: { token: <JWT> }`. Server kiểm tra lại JWT mỗi 15 giây và ngắt kết nối khi JWT không còn hợp lệ.

| Hướng | Sự kiện | Dữ liệu |
| --- | --- | --- |
| Client → server | `conversation:join` | `{ conversationId }` |
| Client → server | `message:send` | `{ conversationId, content, clientId }` |
| Client → server | `message:read` | `{ conversationId, messageId }` |
| Server → client | `message:new` | Tin nhắn mới |
| Server → client | `conversation:updated` | `{ id }` |

Mỗi sự kiện client gửi nhận ack dạng `{ success, data }` hoặc `{ success: false, message }`. Mỗi kết nối gửi tối đa 120 sự kiện mỗi phút.

## 9. Thông báo

| Phương thức | Endpoint | Quyền | Kết quả |
| --- | --- | --- | --- |
| GET | `/api/notifications` | Người nhận | `200` – Danh sách có phân trang (`page?`, `limit?`) |
| GET | `/api/notifications/unread-count` | Người nhận | `200` – `{ "unreadCount": number }` |
| GET | `/api/notifications/:id/target` | Người nhận | `200` – Đích điều hướng |
| PATCH | `/api/notifications/:id/read` | Người nhận | `200` – Đã đọc |
| PATCH | `/api/notifications/read-all` | Người nhận | `200` – Đã đọc tất cả |

Thông báo có dạng:

```json
{
  "id": 10,
  "type": "NEW_MATCH",
  "message": "Có gợi ý ghép nối mới (#15).",
  "isRead": false,
  "createdAt": "2026-10-24T10:00:00Z"
}
```

### 9.1. Đích điều hướng

`GET /api/notifications/:id/target` trả `data` là một trong các dạng:

| `kind` | Trường | Mở tới |
| --- | --- | --- |
| `SUGGESTIONS` | `itemId` | Gợi ý cho bài của người nhận |
| `RECEIVED_CLAIM` | `itemId`, `claimId` | Claim nhận được trên bài `FOUND` |
| `CLAIM_CONTACT` | `itemId`, `claimId` | Bài `FOUND` của Claim đã được chấp thuận |
| `CLAIM_HISTORY` | `claimId`, `page` | Lịch sử Claim của người gửi |

- Endpoint chỉ đọc, không tự đánh dấu đã đọc, không tạo cuộc trò chuyện. Không trả `event_key`, bằng chứng Claim hay điểm AI.
- `404` khi không phải người nhận, sự kiện cũ thiếu dữ liệu đích, hoặc đối tượng không còn hợp lệ hay không còn quyền xem.
- Giao diện mở trang đích, đợi nội dung tải xong rồi mới gọi `PATCH /api/notifications/:id/read`. Điều hướng thất bại thì thông báo vẫn chưa đọc.

## 10. Báo cáo vi phạm

| Phương thức | Endpoint | Quyền | Dữ liệu | Kết quả |
| --- | --- | --- | --- | --- |
| POST | `/api/reports` | `USER`/`ADMIN` | `targetType`, `targetId`, `reason`, `description?` | `201` – Báo cáo `PENDING` |
| GET | `/api/reports/mine` | `USER`/`ADMIN` | `page?`, `limit?` | `200` – Báo cáo đã gửi |

```json
{
  "targetType": "ITEM",
  "targetId": 12,
  "reason": "Thông tin không chính xác",
  "description": "Bài đăng có dấu hiệu cung cấp thông tin sai lệch."
}
```

`targetType`: `ITEM`, `USER` hoặc `CLAIM`. `reason`: 1–50 ký tự. Lỗi `409` khi đã có báo cáo đang mở cho cùng đối tượng. Xử lý báo cáo xem mục 11.8.

## 11. Quản trị

Mọi endpoint dưới `/api/admin` yêu cầu `ADMIN` đang `ACTIVE`: chưa xác thực trả `401`, không đủ quyền trả `403`.

| Phương thức | Endpoint | Dữ liệu | Kết quả |
| --- | --- | --- | --- |
| GET | `/api/admin/dashboard` | — | `200` – Thống kê tổng hợp |
| GET | `/api/admin/users` | `accountStatus?`, `role?`, `page?`, `limit?` | `200` – Danh sách người dùng |
| GET | `/api/admin/users/:id` | — | `200` – Chi tiết người dùng |
| PATCH | `/api/admin/users/:id/status` | `status`: `ACTIVE`/`SUSPENDED` | `200` – Đã cập nhật |
| GET | `/api/admin/items` | `type?`, `status?`, `visibility?`, `page?`, `limit?` | `200` – Danh sách bài |
| GET | `/api/admin/items/:id` | — | `200` – Chi tiết bài |
| PATCH | `/api/admin/items/:id/close` | `reason` | `200` – Đóng bài (mục 11.4) |
| PATCH | `/api/admin/items/:id/visibility` | `visibility`, `reason` | `200` – Gỡ hoặc khôi phục (mục 11.5) |
| GET | `/api/admin/claims` | Bộ lọc (mục 11.1) | `200` – Danh sách Claim |
| PATCH | `/api/admin/claims/:id/resolve` | `decision`, `reason` | `200` – Giải quyết Claim (mục 11.2) |
| GET | `/api/admin/activity-logs` | Bộ lọc (mục 11.3) | `200` – Nhật ký hoạt động |
| GET | `/api/admin/categories` | — | `200` – Mọi danh mục |
| POST | `/api/admin/categories` | `name` | `201` – Đã tạo |
| PATCH | `/api/admin/categories/:id` | `name?`, `isActive?` | `200` – Đã cập nhật |
| DELETE | `/api/admin/categories/:id` | — | `200` – Ngừng sử dụng (`isActive: false`) |
| GET, POST, PATCH, DELETE | `/api/admin/locations[/:id]` | Như danh mục | Như danh mục |
| GET | `/api/admin/reports` | `status?`, `page?`, `limit?` | `200` – Danh sách báo cáo |
| GET | `/api/admin/reports/:id` | — | `200` – Chi tiết báo cáo |
| PATCH | `/api/admin/reports/:id` | `status` | `200` – Đã cập nhật (mục 11.8) |

`PATCH /api/admin/items/:id/status` với body `{ "status": "CLOSED" }` là endpoint cũ, vẫn được giữ để tương thích; giao diện mới dùng `/close` kèm lý do.

### 11.1. Danh sách Claim

| Tham số | Giá trị |
| --- | --- |
| `status` | `PENDING`, `APPROVED`, `REJECTED`, `COMPLETED` |
| `itemId` | ID bài |
| `claimantId` | ID người gửi |
| `sort` | `newest` (mặc định) hoặc `oldest` |
| `page`, `limit` | Phân trang |

Ví dụ: `GET /api/admin/claims?status=PENDING&page=1&limit=10`

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
      "item": { "id": 12, "userId": 3, "title": "AirPods", "type": "FOUND", "status": "CLAIM_PENDING" }
    }
  ],
  "pagination": { "page": 1, "limit": 10, "total": 1, "totalPages": 1 }
}
```

### 11.2. Giải quyết Claim

`PATCH /api/admin/claims/:id/resolve`. `ADMIN` không được là chủ bài và không có Claim nào trên bài đó.

```json
{ "decision": "APPROVE", "reason": "Đã xác minh quyền sở hữu" }
```

- `decision`: `APPROVE` hoặc `REJECT`.
- `reason`: sau khi bỏ khoảng trắng hai đầu dài 1–1.000 ký tự Unicode, không quá 4.000 byte UTF-8. Giới hạn này áp dụng cho mọi trường `reason` trong mục 11.

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

- Chỉ xử lý Claim `PENDING` của bài `FOUND` đang `CLAIM_PENDING`. `APPROVE` chuyển bài sang `CLAIMED` và từ chối các Claim chờ khác; `REJECT` giữ `CLAIM_PENDING` nếu còn Claim chờ, nếu không thì về `OPEN`. Endpoint không hoàn tất bàn giao.
- Lỗi: `400` request không hợp lệ; `403` thiếu quyền hoặc xung đột lợi ích; `404` Claim hoặc bài không tồn tại; `409` Claim không còn `PENDING`, bài sai trạng thái hoặc quyết định lặp lại.

### 11.3. Nhật ký hoạt động

| Tham số | Giá trị |
| --- | --- |
| `action` | Một hành động trong danh sách bên dưới |
| `entityType` | `ITEM`, `CLAIM`, `USER`, `CATEGORY`, `LOCATION`, `REPORT` |
| `entityId`, `actorId` | ID đối tượng, ID người thực hiện |
| `dateFrom`, `dateTo` | Ngày UTC; `dateTo` tính hết ngày; khoảng đảo ngược trả `400` |
| `sort` | `newest` (mặc định) hoặc `oldest` |
| `page`, `limit` | Phân trang |

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

- Hành động: `ITEM_HIDDEN`, `ITEM_RESTORED`, `ITEM_MODERATED_CLOSED`, `CLAIM_ADMIN_RESOLVED`, `CLAIM_APPROVED`, `CLAIM_REJECTED`, `CLAIM_COMPLETED`, `USER_STATUS_CHANGED`, `REPORT_STATUS_CHANGED`, `CATEGORY_CREATED`, `CATEGORY_UPDATED`, `CATEGORY_DISABLED`, `LOCATION_CREATED`, `LOCATION_UPDATED`, `LOCATION_DISABLED`.
- `details` chỉ chứa các trường được phép của từng hành động. `actorId` và `entityId` có thể là `null`. Nhật ký thao tác ảnh không được trả về.

### 11.4. Đóng bài

`PATCH /api/admin/items/:id/close` với `{ "reason": "Bài đăng vi phạm quy định" }`. `ADMIN` không được là chủ bài và không có Claim trên bài đó.

```json
{
  "success": true,
  "data": {
    "item": { "id": 12, "status": "CLOSED" },
    "rejectedClaimCount": 2
  }
}
```

- `item` là `ItemDto` đầy đủ; ví dụ chỉ giữ các trường liên quan.
- Chỉ đóng được bài `OPEN` không có Claim đang hoạt động, hoặc bài `FOUND` đang `CLAIM_PENDING`. Các Claim `PENDING` bị từ chối trước khi bài chuyển `CLOSED`. `CLOSED` không ẩn bài khỏi API công khai.
- Lỗi: `400`, `403` (thiếu quyền hoặc xung đột lợi ích), `404`, `409` (trạng thái không cho phép hoặc thao tác lặp).

### 11.5. Gỡ và khôi phục hiển thị

`PATCH /api/admin/items/:id/visibility`:

```json
{ "visibility": "HIDDEN", "reason": "Nội dung vi phạm" }
```

- `visibility: "PUBLIC"` để khôi phục. Điều kiện về `ADMIN` như mục 11.4.
- Thành công trả `{ "success": true, "data": { "item": ItemDto } }`, trong đó `item.visibility` là giá trị mới.
- Không đổi trạng thái bài hay Claim. Khôi phục không mở lại bài `CLOSED` hoặc `RETURNED`. Lý do chỉ có trong nhật ký quản trị.
- Lỗi: `400`, `403`, `404`, `409` (bài đã ở chế độ được yêu cầu).

### 11.6. Người dùng

`PATCH /api/admin/users/:id/status` với `{ "status": "SUSPENDED" }` khóa tài khoản; `"ACTIVE"` mở khóa. Tài khoản bị khóa nhận `403` ngay ở request tiếp theo.

### 11.7. Danh mục và địa điểm

- `name`: bắt buộc khi tạo, không được trùng. `PATCH` nhận ít nhất một trong `name`, `isActive`.
- `DELETE` không xóa bản ghi, chỉ đặt `isActive: false` để giữ tham chiếu của bài cũ.

### 11.8. Xử lý báo cáo

`PATCH /api/admin/reports/:id` với `{ "status": "REVIEWING" }`. Luồng hợp lệ: `PENDING → REVIEWING → RESOLVED | DISMISSED`; chuyển sai luồng trả `409`. Quyết định đóng bài hay giải quyết Claim không tự đổi trạng thái báo cáo.

## 12. Kiểm tra sức khỏe

`GET /api/health` (hỗ trợ `HEAD`), không cần xác thực.

```json
{
  "success": true,
  "message": "Hệ thống hoạt động bình thường",
  "data": { "status": "ok", "database": "up" }
}
```

- `200` khi kết nối được database; `503` khi không. Phản hồi không chứa chi tiết lỗi database. Header `Cache-Control: no-store`.
- Rate limit theo IP, mặc định 60 request mỗi phút (`RATE_LIMIT_HEALTH_MAX`); vượt quá trả `429`.
