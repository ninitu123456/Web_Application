# API hỗ trợ FindIt frontend

## Lookup công khai

`GET /api/categories` và `GET /api/locations` không yêu cầu JWT. Chỉ chọn bản ghi `is_active = TRUE`, sắp xếp theo tên rồi ID; DTO chỉ `{ id, name }`, không trả `isActive` hoặc dữ liệu quản trị. Không nhận query; field lạ trả 400. Không có bản ghi trả 200 với `data: []`. Hai API dùng rate limit `/api`, CORS và error envelope hiện hành, `Cache-Control: no-store`.

```json
{"success":true,"data":[{"id":1,"name":"Tên danh mục hoặc địa điểm"}]}
```

## Bài của tài khoản hiện tại

`GET /api/items/mine` yêu cầu JWT ACTIVE USER/ADMIN. Route đặt trước `/:id`. Chỉ nhận `page`, `limit`, mặc định 1/10, limit tối đa 100, offset tối đa 100000 theo validation danh sách hiện hành. Unknown/repeated/malformed query bị từ chối, không nhận `userId`, `ownerId` hoặc tài khoản đích. ID chủ bài luôn lấy từ `request.user.id` sau authentication.

COUNT và truy vấn trang đều có điều kiện `i.user_id = ?`, dùng placeholders. Mỗi trang lấy ảnh theo batch, trả Item DTO công khai hiện có; không có bằng chứng Claim/định danh riêng. Thứ tự `created_at DESC, item_id DESC`. Không đổi semantics danh sách công khai. COUNT và trang dùng truy vấn hiện hành, không có snapshot xuyên request; sau mutation frontend tải lại dữ liệu.

```json
{"success":true,"data":[],"pagination":{"page":1,"limit":10,"total":0,"totalPages":0}}
```

## Sửa tham chiếu ngừng hoạt động

Backend hiện kiểm tra danh mục/địa điểm **chỉ khi trường ID được gửi lên PATCH**. Frontend giữ ID/tên hiện tại lấy từ Item DTO và bỏ qua trường ID không đổi; việc sửa tiêu đề/mô tả không buộc thay tham chiếu cũ. Nếu gửi ID ngừng hoạt động, backend tiếp tục trả 400. Không thay business rules, schema hoặc thuật toán Matching.

## Kiểm thử

- `node --test server/tests/frontend-api.test.js`: DTO, public access, JWT, route order, query/pagination và điều kiện SQL theo chủ bài.
- `npm.cmd run test:integration:isolated`: suite Item xác minh public lookup loại bản ghi inactive, phân trang theo chủ bài với MySQL thật và giữ tham chiếu inactive khi PATCH bỏ trường ID.
- Từ `client/`: `npm.cmd run test:browser` chạy Chrome, backend thật và MySQL cô lập. Xem `client/README.md` về môi trường, storage giả và các giới hạn.
