# FindIt — Quy tắc nghiệp vụ

Tài liệu quy định các ràng buộc nghiệp vụ của FindIt. Mỗi quy tắc có mã `BR-*` cố định để tham chiếu khi phát triển và kiểm thử; quy tắc mới được thêm với số tiếp theo, không đánh số lại quy tắc cũ.

## 1. Xác thực

### `BR-AUTH-01` — Email duy nhất

Mỗi địa chỉ email chỉ thuộc về một tài khoản. Email được chuẩn hóa (bỏ khoảng trắng, chữ thường) trước khi so sánh.

### `BR-AUTH-02` — Không lưu mật khẩu thô

Mật khẩu chỉ được lưu dưới dạng băm bcrypt, không bao giờ lưu hay ghi log văn bản thuần.

### `BR-AUTH-03` — Vai trò mặc định

Tài khoản mới đăng ký luôn có vai trò `USER`.

### `BR-AUTH-04` — Không tự gán ADMIN

Người dùng không thể tự gán vai trò `ADMIN` khi đăng ký.

### `BR-AUTH-05` — Đăng nhập

Đăng nhập chỉ thành công khi email và mật khẩu khớp với một tài khoản `ACTIVE`.

### `BR-AUTH-06` — API được bảo vệ

Các API được bảo vệ yêu cầu header `Authorization: Bearer <JWT>` hợp lệ.

### `BR-AUTH-07` — Từ chối JWT không hợp lệ

- JWT thiếu, sai chữ ký, hết hạn hoặc thuộc phiên đã bị vô hiệu: `401`.
- JWT hợp lệ nhưng tài khoản không còn `ACTIVE`: `403`.

### `BR-AUTH-08` — Đặt lại mật khẩu

- Yêu cầu quên mật khẩu luôn trả cùng một thông báo, dù email có tồn tại hay không.
- Liên kết đặt lại chỉ gửi cho tài khoản `ACTIVE`, dùng một lần và hết hạn sau 15 phút. Database chỉ lưu giá trị băm SHA-256 của token.
- Mỗi tài khoản nhận tối đa một liên kết mới mỗi phút.

### `BR-AUTH-09` — Vô hiệu phiên cũ

Đặt lại mật khẩu thành công sẽ tăng `session_version` của tài khoản, làm mọi JWT phát hành trước đó mất hiệu lực.

## 2. Người dùng

### `BR-USER-01` — Xem hồ sơ

Người dùng xem được hồ sơ của chính mình.

### `BR-USER-02` — Sửa hồ sơ của mình

Người dùng chỉ cập nhật được hồ sơ của chính mình.

### `BR-USER-03` — Không sửa hồ sơ người khác

API hồ sơ không cho phép cập nhật hồ sơ của người dùng khác.

### `BR-USER-04` — Không tự đổi vai trò

Người dùng không thể đổi vai trò của mình qua API cập nhật hồ sơ.

## 3. Phân quyền

### `BR-AUTHZ-01` — Hai vai trò

Hệ thống có hai vai trò: `USER` và `ADMIN`.

### `BR-AUTHZ-02` — API quản trị

Chỉ `ADMIN` được gọi các API dưới `/api/admin`.

### `BR-AUTHZ-03` — Mã lỗi khi thiếu quyền

`USER` gọi API chỉ dành cho `ADMIN` nhận `403 Forbidden`.

### `BR-AUTHZ-04` — ADMIN phải đang hoạt động

Thao tác quản trị chỉ được thực hiện bởi `ADMIN` ở trạng thái `ACTIVE`. Quyền được kiểm tra trước khi kiểm tra dữ liệu đầu vào; thao tác ghi dữ liệu kiểm tra lại quyền trong transaction.

### `BR-AUTHZ-05` — Tránh xung đột lợi ích

`ADMIN` không được dùng quyền quản trị để đóng, gỡ hiển thị bài hoặc giải quyết Claim nếu chính mình là người tạo bài **hoặc** đã gửi Claim cho bài đó. Một `ADMIN` khác phải xử lý. Quyền thông thường của chủ bài không thay đổi.

## 4. Tìm kiếm

### `BR-SEARCH-01` — Bộ lọc tùy chọn

Mọi bộ lọc tìm kiếm đều không bắt buộc.

### `BR-SEARCH-02` — Kết hợp bộ lọc

Có thể kết hợp nhiều bộ lọc trong cùng một yêu cầu.

### `BR-SEARCH-03` — Phân trang

Kết quả tìm kiếm luôn có phân trang.

### `BR-SEARCH-04` — Không có kết quả

Không có bài phù hợp thì trả danh sách rỗng, không trả lỗi.

### `BR-SEARCH-05` — Các tiêu chí lọc

Lọc được theo: từ khóa, loại bài (`LOST`/`FOUND`), danh mục, địa điểm, trạng thái bài, khoảng ngày xảy ra.

### `BR-SEARCH-06` — Sắp xếp

Kết quả sắp xếp được theo thời gian đăng (mới nhất, cũ nhất) hoặc ngày xảy ra (tăng, giảm dần).

### `BR-SEARCH-07` — Chỉ bài công khai

Tìm kiếm công khai và tổng số trang chỉ tính các bài đang hiển thị (`PUBLIC`).

## 5. Ghép nối thông minh

### `BR-MATCH-01` — Chỉ LOST với FOUND

Chỉ so sánh bài `LOST` với bài `FOUND`.

### `BR-MATCH-02` — Không ghép LOST với LOST

Không tạo kết quả ghép nối giữa hai bài `LOST`.

### `BR-MATCH-03` — Không ghép FOUND với FOUND

Không tạo kết quả ghép nối giữa hai bài `FOUND`.

### `BR-MATCH-04` — Không tự ghép

Một bài không được ghép với chính nó.

### `BR-MATCH-05` — Bài không đủ điều kiện

Bài `CLOSED`, `RETURNED` hoặc đang bị gỡ hiển thị (`HIDDEN`) không tham gia ghép nối.

### `BR-MATCH-06` — Công thức điểm

```
điểm = 0.30 × danh mục + 0.20 × địa điểm + 0.20 × ngày + 0.30 × nội dung
```

- Danh mục, địa điểm: trùng = 100, khác = 0.
- Ngày: giảm tuyến tính về 0 khi lệch 30 ngày.
- Nội dung: độ trùng từ (Jaccard) giữa tiêu đề và mô tả.

### `BR-MATCH-07` — Thang điểm

Điểm nằm trong khoảng 0–100; chỉ lưu cặp có điểm từ 50 trở lên.

### `BR-MATCH-08` — Ý nghĩa điểm

Điểm càng cao thì hai bài càng giống nhau. Điểm là độ tương đồng, không phải xác suất đúng chủ.

### `BR-MATCH-09` — Lý do đề xuất

Mỗi kết quả ghép nối kèm danh sách lý do đề xuất.

### `BR-MATCH-10` — Chỉ chủ bài xem gợi ý

Gợi ý ghép nối (theo thông tin và theo hình ảnh) của một bài chỉ trả cho chủ bài. Người khác, kể cả `ADMIN` không phải chủ bài, nhận `404`.

### `BR-MATCH-11` — Gợi ý bằng hình ảnh chỉ để tham khảo

Gợi ý AI so độ tương đồng ảnh để xếp hạng. AI không tự tạo Match, Claim hay xác nhận quyền sở hữu. Tắt AI không làm mất gợi ý theo thông tin.

## 6. Thông báo

### `BR-NOTIFICATION-01` — Người nhận

Mỗi thông báo thuộc về đúng một người dùng.

### `BR-NOTIFICATION-02` — Chỉ xem thông báo của mình

Người dùng chỉ truy cập được thông báo của chính mình.

### `BR-NOTIFICATION-03` — Mặc định chưa đọc

Thông báo mới có trạng thái chưa đọc.

### `BR-NOTIFICATION-04` — Đánh dấu đã đọc

Người dùng đánh dấu được một hoặc tất cả thông báo của mình là đã đọc.

### `BR-NOTIFICATION-05` — Số chưa đọc

Hệ thống cung cấp số thông báo chưa đọc của người dùng đang đăng nhập.

### `BR-NOTIFICATION-06` — Sự kiện tạo thông báo

| Loại | Sự kiện |
| --- | --- |
| `NEW_MATCH` | Có gợi ý ghép nối mới |
| `NEW_CLAIM` | Có Claim mới cho bài của mình |
| `CLAIM_APPROVED` | Claim được chấp thuận |
| `CLAIM_REJECTED` | Claim bị từ chối |
| `CLAIM_COMPLETED` | Hoàn tất bàn giao |

Mỗi sự kiện chỉ tạo một thông báo cho mỗi người nhận.

### `BR-NOTIFICATION-07` — Thông báo quyết định quản trị

Các loại `ITEM_MODERATED_CLOSED`, `ITEM_HIDDEN`, `ITEM_RESTORED` và `CLAIM_ADMIN_RESOLVED` báo cho chủ bài khi quản trị viên xử lý. Thông báo được ghi trong cùng transaction với quyết định.

## 7. Bài đăng đồ vật

### `BR-ITEM-01` — Tạo bài

Phải đăng nhập mới tạo được bài. Bài mới có trạng thái `OPEN` và loại `LOST` hoặc `FOUND`.

### `BR-ITEM-02` — Thông tin bắt buộc

- Bắt buộc: tiêu đề, loại bài, danh mục, địa điểm, ngày xảy ra, mô tả. Không bắt buộc: màu sắc.
- Ngày xảy ra không được ở tương lai.
- Không đổi được loại bài sau khi tạo.

### `BR-ITEM-03` — Sửa và đóng bài

- Chỉ chủ bài được sửa hoặc đóng bài của mình.
- Chỉ sửa nội dung và ảnh khi bài còn `OPEN`.
- Thao tác kiểm duyệt của `ADMIN` được ghi vào nhật ký hoạt động.

### `BR-ITEM-04` — Dữ liệu công khai

Dữ liệu bài trả về công khai không chứa bằng chứng Claim và đặc điểm nhận dạng riêng tư (`private_identifiers`).

### `BR-ITEM-05` — Bài đã kết thúc

Bài `RETURNED` hoặc `CLOSED` không nhận Claim mới và không tham gia ghép nối. Lịch sử liên quan được giữ nguyên.

### `BR-ITEM-06` — ADMIN đóng bài

- `ADMIN` được đóng bài `OPEN` không có Claim đang hoạt động, hoặc bài `FOUND` đang `CLAIM_PENDING` nhất quán với các Claim chờ.
- Khi đóng bài có Claim `PENDING`, **tất cả** Claim đang chờ chuyển sang `REJECTED` (ghi `reviewed_at`), sau đó bài chuyển `CLOSED`.
- Đóng bài, cập nhật Claim, nhật ký và thông báo chạy nguyên tử trong một transaction.
- Giữ nguyên Claim đã từ chối trước đó, bằng chứng, Match và lịch sử.
- Không đóng khi trạng thái không nhất quán, đã có Claim được chấp thuận, hoặc bài đang `CLAIMED`, `RETURNED`, `CLOSED`.

### `BR-ITEM-07` — Ý nghĩa của CLOSED

`CLOSED` **không** đồng nghĩa với ẩn bài. API chi tiết công khai vẫn trả bài `CLOSED`, và tìm kiếm không lọc trạng thái vẫn có thể bao gồm bài đó. Ẩn bài dùng quy trình riêng ở `BR-ITEM-08`.

### `BR-ITEM-08` — Gỡ và khôi phục hiển thị

- `ADMIN` thỏa `BR-AUTHZ-05` được chuyển hiển thị `PUBLIC ↔ HIDDEN`, bắt buộc ghi lý do. Chuyển sang đúng trạng thái hiện tại trả `409`.
- Bài `HIDDEN` không xuất hiện trong tìm kiếm, tổng phân trang hay ghép nối. Người ngoài xem chi tiết hoặc gửi Claim nhận `404`; chỉ chủ bài và `ADMIN` còn xem được.
- Gỡ bài không đổi trạng thái bài và Claim, không xóa bằng chứng, báo cáo, ảnh hay lịch sử. Chủ bài vẫn xử lý được Claim và bàn giao đang có, nhưng không sửa được nội dung hay ảnh.
- Khôi phục giữ trạng thái nghiệp vụ hiện tại, không mở lại bài đã đóng hoặc đã trả, và tính lại ghép nối nếu bài còn đủ điều kiện.
- Nhật ký, thay đổi hiển thị và thông báo chủ bài commit hoặc rollback cùng nhau; hai thao tác đồng thời được tuần tự hóa. Sự kiện `ITEM_HIDDEN`/`ITEM_RESTORED` không bị xóa khi dọn nhật ký.

### `BR-ITEM-09` — Ảnh bài đăng

- Tối đa 5 ảnh mỗi bài, mỗi ảnh tối đa 5 MiB; kiểm tra cả MIME và chữ ký byte.
- Ảnh lưu trên Cloudinary với public ID do server sinh; database chỉ lưu URL và public ID.
- Ảnh bị xóa được dọn qua hàng đợi để không còn file mồ côi khi transaction lỗi.

## 8. Yêu cầu nhận đồ (Claim)

### `BR-CLAIM-01` — Điều kiện gửi Claim

Claim chỉ tạo cho bài `FOUND`. Người gửi phải đăng nhập và không phải chủ bài.

### `BR-CLAIM-02` — Một Claim mỗi người mỗi bài

- Cặp (`claimant_id`, `item_id`) là duy nhất: mỗi người chỉ gửi một Claim cho một bài.
- Chỉ bài `FOUND` đang `OPEN` hoặc `CLAIM_PENDING` và đang hiển thị mới nhận Claim mới.

### `BR-CLAIM-03` — Bằng chứng sở hữu

Claim bắt buộc có bằng chứng sở hữu. Bằng chứng chỉ hiển thị cho người gửi Claim, chủ bài và `ADMIN`.

### `BR-CLAIM-04` — Người xét duyệt

Trong quy trình thông thường, chỉ chủ bài `FOUND` chấp thuận hoặc từ chối Claim `PENDING`. `ADMIN` can thiệp theo `BR-CLAIM-09` và mọi thao tác được ghi nhật ký.

### `BR-CLAIM-05` — Chấp thuận Claim

Mỗi bài `FOUND` có tối đa một Claim `APPROVED` hoặc `COMPLETED`. Khi chấp thuận, trong cùng một transaction:

- Claim được chọn chuyển `APPROVED`.
- Bài chuyển `CLAIMED`.
- Các Claim `PENDING` cạnh tranh chuyển `REJECTED`.

### `BR-CLAIM-06` — Hoàn tất bàn giao

Chỉ Claim `APPROVED` mới hoàn tất được. Khi hoàn tất, trong cùng một transaction: Claim chuyển `COMPLETED`, bài chuyển `RETURNED`.

### `BR-CLAIM-07` — Từ chối Claim

Khi từ chối một Claim: nếu không còn Claim chờ, bài trở về `OPEN`; nếu còn, bài giữ `CLAIM_PENDING`.

### `BR-CLAIM-08` — Không xử lý lặp

Một Claim không được chấp thuận hoặc hoàn tất nhiều lần.

### `BR-CLAIM-09` — ADMIN giải quyết Claim

- Chỉ giải quyết Claim `PENDING` của bài `FOUND` đang `CLAIM_PENDING` nhất quán.
- `APPROVE`: Claim thành `APPROVED`, bài thành `CLAIMED`, mọi Claim `PENDING` cạnh tranh bị từ chối.
- `REJECT`: Claim thành `REJECTED`; bài giữ `CLAIM_PENDING` nếu còn Claim chờ, nếu không thì về `OPEN`.
- Không tự hoàn tất bàn giao; không đảo ngược Claim đã `APPROVED`, `REJECTED`, `COMPLETED`.
- Cập nhật Claim, bài, nhật ký và thông báo chạy nguyên tử.

### `BR-CLAIM-10` — Lý do quyết định quản trị

`reason` sau khi bỏ khoảng trắng hai đầu dài 1–1.000 ký tự Unicode và không quá 4.000 byte UTF-8. Lý do chỉ lưu trong nhật ký để `ADMIN` xem, không xuất hiện trong dữ liệu bài công khai hay nội dung thông báo.

## 9. Báo cáo vi phạm

### `BR-REPORT-01` — Gửi báo cáo

Phải đăng nhập để báo cáo. Mỗi báo cáo trỏ tới đúng một đối tượng `ITEM`, `USER` hoặc `CLAIM`, bắt buộc có lý do (tối đa 50 ký tự); mô tả là tùy chọn. Mỗi người chỉ có một báo cáo đang mở (`PENDING`/`REVIEWING`) cho cùng một đối tượng.

### `BR-REPORT-02` — Người xử lý

Chỉ `ADMIN` được đổi trạng thái báo cáo.

### `BR-REPORT-03` — Luồng trạng thái

```
PENDING → REVIEWING → RESOLVED | DISMISSED
```

Hệ thống ghi lại `ADMIN` xử lý và thời điểm xử lý.

### `BR-REPORT-04` — Độc lập với xử lý bài và Claim

`ADMIN` không cần có báo cáo trước khi đóng bài hay giải quyết Claim. Các quyết định này **không tự động** đổi trạng thái báo cáo.

## 10. Nhắn tin

### `BR-CHAT-01` — Thành viên cuộc trò chuyện

Mỗi cuộc trò chuyện gồm đúng hai người dùng khác nhau; mỗi cặp người dùng chỉ có một cuộc trò chuyện. Chỉ thành viên mới đọc và gửi được tin nhắn.

### `BR-CHAT-02` — Nội dung tin nhắn

Tin nhắn dài 1–2.000 ký tự sau khi bỏ khoảng trắng hai đầu và không chứa ký tự điều khiển. Mỗi tin kèm `clientId` (UUID) để gửi lại không tạo bản trùng.

### `BR-CHAT-03` — Giới hạn tốc độ

Mỗi người dùng gửi tối đa 30 tin nhắn mỗi phút; vượt quá trả `429`.

## 11. Quản trị và nhật ký hoạt động

### `BR-ADMIN-01` — Chức năng quản trị

Chỉ `ADMIN` được: quản lý người dùng, danh mục, địa điểm; kiểm duyệt bài; giải quyết tranh chấp Claim; xử lý báo cáo; xem nhật ký hoạt động; xem thống kê.

### `BR-ADMIN-02` — Ghi nhật ký

Mọi quyết định kiểm duyệt và can thiệp đặc quyền vào Claim được ghi vào `activity_logs`.

### `BR-ADMIN-03` — Mã lỗi

- `401 Unauthorized`: thiếu JWT hoặc JWT không hợp lệ.
- `403 Forbidden`: `USER` gọi API quản trị, hoặc tài khoản không còn `ACTIVE`.

### `BR-ADMIN-04` — Dữ liệu nhật ký được phép trả về

API nhật ký chỉ trả các trường chi tiết được cho phép theo từng loại hành động; không trả JSON thô, bằng chứng sở hữu hay dữ liệu nhạy cảm. Nhật ký thao tác ảnh (`IMAGE_OPERATION_*`, `IMAGE_CLEANUP_*`) không thuộc nhật ký nghiệp vụ.

### `BR-ADMIN-05` — Audit quyết định quản trị

Lý do quyết định chỉ ghi trong bản ghi nhật ký của quyết định; các bản ghi con liên kết tới quyết định đó. Thay đổi Claim, bài, nhật ký và thông báo commit hoặc rollback cùng nhau.

### `BR-ADMIN-06` — Khóa tài khoản

`ADMIN` chuyển tài khoản giữa `ACTIVE` và `SUSPENDED`. Tài khoản bị khóa mất quyền ngay ở request tiếp theo vì vai trò và trạng thái được đọc lại từ database mỗi lần.

### `BR-ADMIN-07` — Ngừng sử dụng danh mục, địa điểm

Danh mục và địa điểm không bị xóa khỏi database; thao tác xóa chỉ đặt `is_active = false` để giữ tham chiếu của bài cũ.

## 12. Trạng thái và transaction

### `BR-STATUS-01` — Loại khác trạng thái

`LOST` và `FOUND` là loại bài, không phải trạng thái bài.

### `BR-STATUS-02` — Luồng trạng thái bài

```
Nhận lại đồ:      OPEN → CLAIM_PENDING → CLAIMED → RETURNED
Hết Claim chờ:    CLAIM_PENDING → OPEN
Đóng bài:         OPEN → CLOSED
ADMIN đóng bài:   OPEN | CLAIM_PENDING → CLOSED   (xem BR-ITEM-06)
```

### `BR-STATUS-03` — Luồng trạng thái Match

```
POTENTIAL → CONFIRMED | REJECTED
```

Chỉ ghép bài khác loại (`LOST` với `FOUND`); mỗi cặp bài chỉ có một bản ghi.

### `BR-STATUS-04` — Luồng trạng thái Claim

```
Được chấp thuận:  PENDING → APPROVED → COMPLETED
Bị từ chối:       PENDING → REJECTED
```

### `BR-CLAIM-VERIFY` — Câu hỏi xác minh

- Chỉ bài `FOUND` có tối đa 3 câu hỏi (≤ 200 ký tự, không trùng). Câu hỏi công khai, câu trả lời (≤ 300 ký tự) chỉ chủ bài thấy.
- Claim phải trả lời đủ mọi câu hỏi. Không đổi câu hỏi khi bài đã có Claim.

### `BR-HANDOVER` — Bàn giao hai phía

- Áp dụng cho Claim `APPROVED`. Một bên đề xuất lịch hẹn (thời gian trong 60 ngày tới, địa điểm), bên còn lại xác nhận. Không đổi lịch khi đã có bên xác nhận bàn giao.
- Mỗi bên bấm xác nhận đã giao/đã nhận; khi đủ hai bên, Claim chuyển `COMPLETED` và bài `RETURNED` (như `complete`).
- Khi có khiếu nại chưa xử lý, mọi xác nhận và `complete` bị chặn (`409`) đến khi `ADMIN` đóng khiếu nại.

### `BR-STATUS-05` — Dùng transaction

Các thao tác sau chạy trong transaction có khóa dòng (`SELECT ... FOR UPDATE`) để tránh race condition:

- Chấp thuận Claim và từ chối Claim cạnh tranh.
- Cập nhật trạng thái bài.
- Tạo thông báo và nhật ký liên quan.
