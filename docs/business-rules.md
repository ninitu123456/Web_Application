# FINDIT – QUY TẮC NGHIỆP VỤ (BUSINESS RULES)

> Tài liệu quy định các ràng buộc nghiệp vụ của FindIt. Mỗi quy tắc có mã `BR-*` để thuận tiện tham chiếu khi phát triển và kiểm thử.

## 1. Quy tắc xác thực (Authentication Rules)

### `BR-AUTH-01`

Mỗi địa chỉ email phải là duy nhất trong hệ thống.

### `BR-AUTH-02`

Mật khẩu không được lưu trữ dưới dạng văn bản thuần túy (Plain Text).

### `BR-AUTH-03`

Tài khoản mới đăng ký phải được gán vai trò USER theo mặc định.

### `BR-AUTH-04`

Người dùng không được tự gán vai trò ADMIN trong quá trình đăng ký tài khoản.

### `BR-AUTH-05`

Đăng nhập chỉ thành công khi thông tin xác thực được cung cấp là hợp lệ.

### `BR-AUTH-06`

Các API được bảo vệ yêu cầu người dùng phải cung cấp JWT hợp lệ.

### `BR-AUTH-07`

Hệ thống phải từ chối các yêu cầu sử dụng JWT không hợp lệ hoặc đã hết hạn.

## 2. Quy tắc quản lý người dùng (User Rules)

### `BR-USER-01`

Người dùng được phép xem hồ sơ cá nhân của chính mình.

### `BR-USER-02`

Người dùng chỉ được phép cập nhật hồ sơ cá nhân của chính mình.

### `BR-USER-03`

Người dùng không được phép cập nhật hồ sơ của người dùng khác.

### `BR-USER-04`

Người dùng không được tự thay đổi vai trò của mình thông qua API cập nhật hồ sơ cá nhân.

## 3. Quy tắc phân quyền (Authorization Rules)

### `BR-AUTHZ-01`

Hệ thống hỗ trợ hai vai trò: USER và ADMIN.

### `BR-AUTHZ-02`

Chỉ người dùng có vai trò ADMIN mới được phép truy cập các API quản trị.

### `BR-AUTHZ-03`

Khi người dùng có vai trò USER cố gắng truy cập API chỉ dành cho ADMIN, hệ thống phải trả về mã HTTP 403 Forbidden.

### `BR-AUTHZ-04` — Kiểm tra quyền ADMIN đang hoạt động

Các thao tác quản trị đặc quyền chỉ được thực hiện bởi tài khoản `ADMIN` ở trạng thái `ACTIVE`. Quyền truy cập phải được kiểm tra trước khi kiểm tra schema dữ liệu đầu vào; các thao tác thay đổi dữ liệu phải kiểm tra lại quyền trong giao dịch.

### `BR-AUTHZ-05` — Tránh xung đột lợi ích

ADMIN không được dùng quyền quản trị để đóng Item hoặc giải quyết Claim nếu chính ADMIN đó là người tạo Item **hoặc** đã gửi bất kỳ Claim nào cho Item. Một ADMIN khác phải xử lý. Quyền thông thường của chủ bài đăng và hành vi của các endpoint cũ không thay đổi.

## 4. Quy tắc tìm kiếm (Search Rules)

### `BR-SEARCH-01`

Các bộ lọc tìm kiếm là không bắt buộc.

### `BR-SEARCH-02`

Người dùng có thể kết hợp nhiều bộ lọc trong cùng một yêu cầu tìm kiếm.

### `BR-SEARCH-03`

Kết quả tìm kiếm phải hỗ trợ chức năng phân trang (Pagination).

### `BR-SEARCH-04`

Nếu không tìm thấy kết quả phù hợp, hệ thống phải trả về danh sách rỗng thay vì thông báo lỗi.

### `BR-SEARCH-05`

Hệ thống cho phép lọc các bài đăng đồ vật theo:

- Keyword: Từ khóa tìm kiếm.
- Type: Loại bài đăng (LOST hoặc FOUND).
- Category: Danh mục đồ vật.
- Location: Địa điểm.
- Status: Trạng thái bài đăng.
- Date Range: Khoảng thời gian.

### `BR-SEARCH-06`

Kết quả tìm kiếm có thể được sắp xếp theo các tùy chọn sắp xếp mà hệ thống hỗ trợ.

## 5. Quy tắc ghép nối thông minh (Smart Matching Rules)

### `BR-MATCH-01`

Chức năng Smart Matching chỉ được phép so sánh bài đăng đồ bị mất (LOST) với bài đăng đồ nhặt được (FOUND).

### `BR-MATCH-02`

Hệ thống không được tạo kết quả ghép nối giữa hai bài đăng LOST.

### `BR-MATCH-03`

Hệ thống không được tạo kết quả ghép nối giữa hai bài đăng FOUND.

### `BR-MATCH-04`

Một bài đăng không được ghép nối với chính nó.

### `BR-MATCH-05`

Các bài đăng có trạng thái CLOSED hoặc RETURNED không được tham gia quá trình ghép nối.

### `BR-MATCH-06`

Điểm tương đồng phải được tính dựa trên các tiêu chí:

- Category Similarity: Mức độ tương đồng về danh mục đồ vật.
- Location Similarity: Mức độ tương đồng về địa điểm.
- Date Similarity: Mức độ tương đồng về thời gian.
- Text Similarity: Mức độ tương đồng về nội dung mô tả.

### `BR-MATCH-07`

Điểm ghép nối phải được biểu diễn trên thang điểm từ 0 đến 100.

### `BR-MATCH-08`

Điểm ghép nối càng cao thể hiện mức độ tương đồng giữa bài đăng LOST và FOUND càng lớn.

### `BR-MATCH-09`

Mỗi kết quả ghép nối nên bao gồm thông tin giải thích lý do hệ thống đưa ra đề xuất đó.

## 6. Quy tắc thông báo (Notification Rules)

### `BR-NOTIFICATION-01`

Mỗi thông báo phải thuộc về một người dùng cụ thể.

### `BR-NOTIFICATION-02`

Người dùng chỉ được phép truy cập các thông báo thuộc về tài khoản của chính mình.

### `BR-NOTIFICATION-03`

Thông báo mới được tạo phải có trạng thái ban đầu là chưa đọc.

### `BR-NOTIFICATION-04`

Người dùng được phép đánh dấu thông báo của mình là đã đọc.

### `BR-NOTIFICATION-05`

Hệ thống phải cung cấp số lượng thông báo chưa đọc của người dùng đã xác thực.

### `BR-NOTIFICATION-06`

Hệ thống có thể tạo thông báo khi xảy ra các sự kiện:

- New Match: Phát hiện kết quả ghép nối mới.
- New Claim: Có yêu cầu nhận lại đồ vật mới.
- Claim Approved: Yêu cầu nhận đồ được chấp thuận.
- Claim Rejected: Yêu cầu nhận đồ bị từ chối.
- Claim Completed: Quá trình nhận lại đồ vật được hoàn tất.

### `BR-NOTIFICATION-07` — Thông báo quyết định quản trị

Các sự kiện thông báo cho chủ bài đăng `ITEM_MODERATED_CLOSED` và `CLAIM_ADMIN_RESOLVED` bổ sung cho những thông báo Claim hiện có. Thông báo phải được ghi trong cùng giao dịch với quyết định và các thay đổi dữ liệu liên quan.

## 7. Quy tắc quản lý đồ vật (Item Rules)

### `BR-ITEM-01`

Việc tạo bài đăng đồ vật yêu cầu người dùng phải đăng nhập.

Bài đăng mới phải có:

- Trạng thái ban đầu là OPEN.
- Loại bài đăng là LOST hoặc FOUND.

### `BR-ITEM-02`

Các thông tin bắt buộc khi tạo bài đăng bao gồm:

- Tiêu đề (Title).
- Loại bài đăng (Type).
- Danh mục (Category).
- Địa điểm (Location).
- Ngày xảy ra sự việc (Event Date).
- Mô tả (Description).

Loại bài đăng (LOST hoặc FOUND) không được phép thay đổi sau khi tạo.

### `BR-ITEM-03`

Chỉ chủ sở hữu bài đăng mới được phép chỉnh sửa hoặc đóng bài đăng của mình.

Việc chỉnh sửa thông thường chỉ được thực hiện khi bài đăng có trạng thái OPEN.

Quản trị viên (ADMIN) được phép kiểm duyệt bài đăng, nhưng các thao tác kiểm duyệt phải được ghi nhận vào nhật ký hoạt động (Audit Log).

### `BR-ITEM-04`

Dữ liệu bài đăng được trả về công khai không được chứa:

- Bằng chứng xác minh quyền sở hữu trong Claim.
- Các thông tin nhận dạng riêng tư cần được bảo mật.

### `BR-ITEM-05`

Các bài đăng có trạng thái RETURNED hoặc CLOSED:

- Không được tiếp nhận yêu cầu Claim mới.
- Không được tham gia quá trình Smart Matching.

Hệ thống phải bảo toàn các bản ghi lịch sử liên quan đến bài đăng.

### `BR-ITEM-06` — ADMIN đóng bài đăng

- ADMIN được đóng Item `OPEN` không có Claim đang hoạt động, hoặc Item `FOUND` ở trạng thái `CLAIM_PENDING` nhất quán với các Claim đang chờ.
- Khi đóng Item có Claim `PENDING`, hệ thống phải chuyển **tất cả** Claim đang chờ sang `REJECTED`, ghi `reviewed_at` và chuyển Item sang `CLOSED`.
- Thao tác đóng Item, các cập nhật Claim, nhật ký hoạt động và thông báo phải được thực hiện nguyên tử trong cùng giao dịch.
- Phải bảo toàn Claim đã bị từ chối trước đó, bằng chứng xác minh, các bản ghi Match và lịch sử liên quan.
- Không được đóng theo luồng này khi trạng thái không nhất quán, có Claim đã được chấp thuận, hoặc Item ở trạng thái `CLAIMED`, `RETURNED`, `CLOSED`; không thực hiện lại quyết định đã kết thúc.

### `BR-ITEM-07` — Ý nghĩa của trạng thái CLOSED

`CLOSED` **không** đồng nghĩa ẩn hoặc gỡ nội dung công khai. API chi tiết công khai vẫn có thể trả về Item `CLOSED`, và tìm kiếm không lọc trạng thái vẫn có thể bao gồm Item đó. Quy trình ẩn/gỡ bài đăng (takedown) nằm ngoài phạm vi quy tắc đóng bài này.

### `BR-ITEM-08` — Gỡ và khôi phục hiển thị

- ADMIN đang hoạt động, không là chủ bài và chưa từng gửi Claim cho bài, được chuyển hiển thị `PUBLIC ↔ HIDDEN`, bắt buộc ghi lý do. Thao tác lặp cùng đích trả 409.
- Bài `HIDDEN` không xuất hiện trong tìm kiếm, tổng phân trang hoặc Matching; người ngoài truy cập chi tiết hay gửi Claim mới nhận 404. Chỉ chủ bài và ADMIN còn xem được chi tiết qua xác thực; danh sách riêng của chủ bài giữ lịch sử.
- Gỡ bài không thay đổi trạng thái Item/Claim, bằng chứng, báo cáo, ảnh hoặc lịch sử. Chủ bài vẫn xử lý được Claim/bàn giao đã có; không được sửa nội dung/thêm/xóa ảnh khi đang bị gỡ.
- Khôi phục giữ trạng thái nghiệp vụ hiện tại, không mở lại bài đã đóng/đã trao lại, và tính lại Matching cho bài còn đủ điều kiện.
- Nhật ký riêng tư, hiển thị, thời gian cập nhật và thông báo chủ bài phải cùng commit hoặc rollback. Hai thao tác đồng thời phải được tuần tự hóa. Các sự kiện hiển thị là dữ liệu bền vững, không được xóa bởi việc dọn nhật ký thông thường.

## 8. Quy tắc yêu cầu nhận lại đồ vật (Claim Rules)

### `BR-CLAIM-01`

Yêu cầu nhận lại đồ vật (Claim) chỉ được tạo đối với bài đăng FOUND.

Người gửi Claim phải:

- Đã đăng nhập vào hệ thống.
- Không phải là người tạo bài đăng đồ vật đó.

### `BR-CLAIM-02`

Mỗi cặp claimant_id và item_id phải là duy nhất.

Điều này có nghĩa là một người dùng chỉ được tạo một Claim cho cùng một bài đăng đồ vật.

Chỉ các bài đăng FOUND có trạng thái OPEN hoặc CLAIM_PENDING mới được tiếp nhận Claim mới.

### `BR-CLAIM-03`

Người gửi Claim bắt buộc phải cung cấp bằng chứng xác minh quyền sở hữu đồ vật.

Quyền truy cập bằng chứng chỉ được cấp cho:

- Người gửi Claim.
- Chủ sở hữu bài đăng đồ vật.
- Quản trị viên có thẩm quyền.

### `BR-CLAIM-04`

Trong quy trình thông thường, chỉ chủ sở hữu bài đăng FOUND mới được phép chấp thuận hoặc từ chối các Claim đang ở trạng thái PENDING.

Quản trị viên có thể can thiệp để giải quyết tranh chấp, nhưng mọi hành động phải được ghi lại trong nhật ký hoạt động.

### `BR-CLAIM-05`

Mỗi bài đăng FOUND chỉ được có tối đa một Claim ở trạng thái APPROVED hoặc COMPLETED.

Khi chấp thuận một Claim, hệ thống phải thực hiện đồng thời các thao tác trong cùng một giao dịch cơ sở dữ liệu (Atomic Transaction):

- Chuyển Claim được chọn sang trạng thái APPROVED.
- Chuyển Item sang trạng thái CLAIMED.
- Từ chối các Claim cạnh tranh khác đang ở trạng thái PENDING.

Các thao tác phải được thực hiện nguyên tử, nghĩa là tất cả cùng thành công hoặc tất cả được hoàn tác nếu xảy ra lỗi.

### `BR-CLAIM-06`

Chỉ Claim có trạng thái APPROVED mới được phép hoàn tất.

Khi hoàn tất quá trình bàn giao, hệ thống phải thực hiện đồng thời:

- Chuyển Claim sang trạng thái COMPLETED.
- Chuyển Item sang trạng thái RETURNED.

Hai thao tác phải được thực hiện trong cùng một giao dịch cơ sở dữ liệu.

### `BR-CLAIM-07`

Khi một Claim bị từ chối:

- Nếu không còn Claim nào đang chờ xử lý, Item được chuyển về trạng thái OPEN.
- Nếu vẫn còn Claim khác đang chờ xử lý, Item tiếp tục giữ trạng thái CLAIM_PENDING.

### `BR-CLAIM-08`

Một Claim không được phép chấp thuận hoặc hoàn tất nhiều lần.

Chủ sở hữu bài đăng không được thực hiện các thao tác xét duyệt Claim do chính mình gửi đối với bài đăng của mình.

### `BR-CLAIM-09` — ADMIN giải quyết Claim

- Chỉ giải quyết Claim `PENDING` thuộc Item `FOUND` ở trạng thái `CLAIM_PENDING` nhất quán.
- Quyết định `APPROVE`: chọn một Claim thành `APPROVED`, chuyển Item thành `CLAIMED` và từ chối mọi Claim `PENDING` cạnh tranh.
- Quyết định `REJECT`: từ chối Claim được chọn; Item tiếp tục `CLAIM_PENDING` nếu còn Claim chờ xử lý, nếu không thì trở về `OPEN`.
- Không tự động hoàn tất bàn giao; không đảo ngược Claim `APPROVED`, `REJECTED`, `COMPLETED`; không đặt lại ràng buộc duy nhất giữa người gửi và Item.
- Mọi cập nhật Claim, Item, audit và thông báo liên quan phải được thực hiện nguyên tử.

### `BR-CLAIM-10` — Lý do quyết định quản trị

Quyết định quản trị đặc quyền yêu cầu `reason` sau khi trim có độ dài từ **1 đến 1.000 Unicode code points**, đồng thời không vượt quá **4.000 byte UTF-8**. Lý do chỉ lưu trong audit của quyết định để ADMIN có quyền xem; không đưa vào Item DTO công khai hoặc nội dung thông báo. Văn bản do ADMIN nhập có thể chứa thông tin cá nhân và phải được xử lý tương ứng.

## 9. Quy tắc báo cáo vi phạm (Report Rules)

### `BR-REPORT-01`

Người dùng phải đăng nhập trước khi gửi báo cáo vi phạm.

Mỗi báo cáo phải xác định chính xác một đối tượng thuộc một trong các loại:

- ITEM: Bài đăng đồ vật.
- USER: Tài khoản người dùng.
- CLAIM: Yêu cầu nhận lại đồ vật.

Mỗi báo cáo bắt buộc phải có lý do báo cáo.

### `BR-REPORT-02`

Chỉ quản trị viên (ADMIN) mới được phép:

- Thay đổi trạng thái báo cáo.
- Thực hiện các thao tác kiểm duyệt liên quan đến báo cáo.

### `BR-REPORT-03`

Quy trình chuyển đổi trạng thái báo cáo:

PENDING → REVIEWING → RESOLVED | DISMISSED

**Trong đó:**

- PENDING: Đang chờ xử lý.
- REVIEWING: Đang được xem xét.
- RESOLVED: Đã được giải quyết.
- DISMISSED: Báo cáo đã bị bác bỏ.

Hệ thống phải ghi nhận:

- Quản trị viên thực hiện xử lý.
- Thời điểm xử lý báo cáo.

### `BR-REPORT-04` — Độc lập với xử lý quản trị Item/Claim

Không bắt buộc phải có Report trước khi ADMIN đóng Item hoặc giải quyết Claim. Các quyết định này **không tự động thay đổi** trạng thái Report.

## 10. Quy tắc quản trị và nhật ký hoạt động (Admin and Audit Rules)

### `BR-ADMIN-01`

Chỉ người dùng có vai trò ADMIN mới được phép thực hiện các chức năng quản trị:

- Quản lý người dùng.
- Quản lý danh mục đồ vật.
- Quản lý địa điểm.
- Kiểm duyệt bài đăng.
- Giải quyết tranh chấp.
- Xử lý báo cáo vi phạm.
- Xem nhật ký hoạt động.
- Truy cập Dashboard thống kê.

### `BR-ADMIN-02`

Mọi quyết định kiểm duyệt và thao tác can thiệp đặc quyền vào Claim phải được ghi lại trong bảng nhật ký hoạt động (Activity Log).

### `BR-ADMIN-03`

Hệ thống phải trả về mã HTTP phù hợp:

- 403 Forbidden: Người dùng có vai trò USER cố gắng truy cập API quản trị.
- 401 Unauthorized: JWT không hợp lệ.

### `BR-ADMIN-04` — Dữ liệu nhật ký hoạt động được phép công bố

API đọc Business Activity Log chỉ trả về các trường chi tiết đã được cho phép theo từng loại hành động; không trả về JSON thô, bằng chứng sở hữu hoặc dữ liệu nhạy cảm. Nhật ký thao tác ảnh và nhật ký dọn dẹp ảnh không thuộc danh sách sự kiện nghiệp vụ hiển thị qua API này.

### `BR-ADMIN-05` — Audit quyết định quản trị

Lý do quyết định chỉ được ghi trong nhật ký quyết định; các bản ghi audit con liên kết với quyết định tương ứng. Những thay đổi Claim, Item, audit và thông báo liên quan phải commit hoặc rollback cùng nhau.

## 11. Quy tắc trạng thái và giao dịch cơ sở dữ liệu (Status and Transaction Rules)

### `BR-STATUS-01`

LOST và FOUND là loại bài đăng (Item Type), không phải trạng thái bài đăng (Item Status).

### `BR-STATUS-02`

Quy trình chuyển đổi trạng thái của Item:

Luồng nhận lại đồ vật:

OPEN → CLAIM_PENDING → CLAIMED → RETURNED

Luồng đóng bài đăng:

OPEN → CLOSED

Trường hợp không còn Claim đang chờ xử lý:

CLAIM_PENDING → OPEN

Trong các trường hợp đặc biệt, quản trị viên có thể đóng bài đăng và phải ghi lại thao tác này vào nhật ký hoạt động.

### `BR-STATUS-03`

Quy trình chuyển đổi trạng thái của Match:

POTENTIAL → CONFIRMED | REJECTED

**Trong đó:**

- POTENTIAL: Kết quả ghép nối tiềm năng.
- CONFIRMED: Kết quả ghép nối đã được xác nhận.
- REJECTED: Kết quả ghép nối bị từ chối.

Quy tắc bổ sung:

- Chỉ ghép nối các bài đăng có loại đối lập (LOST với FOUND).
- Mỗi cặp bài đăng được ghép nối phải là duy nhất, không được tạo bản ghi trùng lặp.

### `BR-STATUS-04`

Quy trình chuyển đổi trạng thái của Claim:

Trường hợp được chấp thuận:

PENDING → APPROVED → COMPLETED

Trường hợp bị từ chối:

PENDING → REJECTED

### `BR-STATUS-05`

Hệ thống phải sử dụng giao dịch cơ sở dữ liệu (Database Transaction) để bảo vệ tính toàn vẹn dữ liệu khi thực hiện:

- Chấp thuận Claim.
- Xử lý các Claim cạnh tranh cho cùng một đồ vật.
- Cập nhật trạng thái Item.
- Tạo và cập nhật các thông báo liên quan.

Việc sử dụng Transaction nhằm ngăn ngừa các tình huống xung đột dữ liệu do nhiều yêu cầu được xử lý đồng thời (Race Condition).

---


