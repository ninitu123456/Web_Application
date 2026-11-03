# Rà soát nội dung FindIt

Ngày thực hiện: 03/11/2026.

## Phạm vi và tình trạng ban đầu

Đã đọc `RULES.md`, `README.md`, các tài liệu yêu cầu, nghiệp vụ, ERD và hợp đồng API hiện có trong `docs/` dưới dạng `.docx`. RULES.md nhắc đến các bản `.md` nhưng repository không có những bản đó. Đã kiểm tra Git, lịch sử commit và code hiện tại trước khi sửa.

Repository đã có nhiều thay đổi local, bao gồm frontend chưa được Git theo dõi. Dấu vết SHA-256 của 242 file và bản sao frontend trước chỉnh sửa được lưu trong `.cache/content-review/`. Không khôi phục, ghi đè bằng phiên bản Git hoặc loại bỏ thay đổi local.

| Nhóm màn hình đã rà soát | Nội dung kiểm tra và xử lý |
| --- | --- |
| Trang khám phá, đăng nhập, đăng ký, trang không tồn tại, menu và chân trang | Tiêu đề, mô tả, nhãn bộ lọc, hướng dẫn mật khẩu, lỗi, nút và nhãn hỗ trợ trình đọc màn hình. Giữ nội dung giới thiệu đã rõ nghĩa. |
| Chi tiết bài, tạo/sửa bài, bài đăng của tôi | Loại bài và trạng thái bài, điều kiện sửa, mô tả công khai, giới hạn nhập liệu/ảnh, kết quả lưu chưa xác định, đóng bài, gợi ý đồ vật, trạng thái rỗng. |
| Yêu cầu nhận đồ đã gửi và nhận được | Bằng chứng riêng tư, lỗi nhập bằng chứng, trạng thái yêu cầu, yêu cầu trùng, chấp thuận/từ chối/bàn giao và hậu quả của mỗi hành động. |
| Hồ sơ, thông báo, báo cáo của tôi và modal báo cáo | Nhãn, toast, nội dung hệ thống từ backend, trạng thái báo cáo, lý do/mô tả và giải thích tác dụng của việc gửi báo cáo. |
| Toàn bộ khu vực Admin | Tổng quan, tài khoản, bài đăng, yêu cầu/tranh chấp, báo cáo, danh mục/địa điểm, nhật ký; gồm danh sách, chi tiết, bộ lọc, modal, bảng, badge, lỗi và dữ liệu rỗng. |

## Những vấn đề đã sửa

1. **Thông tin triển khai trong hướng dẫn nhập liệu:** bỏ byte/UTF-8 khỏi câu hiển thị; phân biệt nhập thiếu, quá ngắn và quá dài theo chính điều kiện kiểm tra hiện có.
2. **Thuật ngữ thiếu nhất quán:** dùng “Yêu cầu nhận đồ”, “Bài đăng”, “Đồ bị mất”, “Đồ nhặt được”; đổi “Gợi ý ghép nối” thành “Gợi ý đồ vật”. Tiêu đề đăng nhập và đăng bài nói rõ thao tác.
3. **Lẫn ngữ cảnh trạng thái:** thay từ điển trạng thái phẳng bằng các nhóm dùng chung cho loại bài, bài đăng, yêu cầu, báo cáo, tài khoản và vai trò. Tất cả badge phải chỉ rõ nhóm; bộ lọc và thống kê dùng cùng cơ chế. `PENDING` của báo cáo là “Chờ xem xét”; của yêu cầu nhận đồ là “Chờ duyệt”.
4. **Giá trị nội bộ trong nhật ký:** dịch trạng thái trước/sau, quyết định và nguồn quyết định theo đối tượng; giữ ID, số lượng và lý do Admin nhập. Không xuất thẳng cấu trúc dữ liệu lạ hoặc mã chưa biết.
5. **Câu dành cho lập trình viên trong Admin:** thay giải thích về endpoint, backend, token, API và mã trạng thái bằng quyền xem bằng chứng, điều kiện thao tác và hậu quả thực tế. Bộ lọc nhật ký có giải thích giờ quốc tế và giờ Việt Nam, giữ nguyên cách tính ngày.
6. **Thông báo lỗi nối nguyên từ backend:** `errorText` sử dụng danh sách thông báo đã biết, khớp toàn bộ nội dung và mã HTTP. Phân biệt email trùng, yêu cầu trùng, báo cáo đang xử lý, trạng thái không cho phép, Admin có liên quan, quản trị viên hoạt động cuối cùng và dịch vụ ảnh đang bận. Không hiển thị nguyên `Error.message` hoặc chi tiết phản hồi lạ.
7. **Tiêu đề modal dài trên mobile:** sửa CSS cục bộ để nút đóng giữ ở góc phải, tiêu đề xuống dòng trong phần còn lại. Không thay bố cục toàn website.

## Ví dụ trước/sau

| Trước | Sau |
| --- | --- |
| “Ít nhất 8 ký tự, tối đa 72 byte UTF-8.” | “Sử dụng ít nhất 8 ký tự.” Khi quá dài: “Mật khẩu quá dài. Vui lòng rút ngắn.” |
| “Bằng chứng không được rỗng và tối đa 65.535 byte UTF-8.” | Nhập thiếu: “Vui lòng nhập bằng chứng xác minh đồ vật là của bạn.” Quá dài: “Bằng chứng quá dài. Vui lòng rút ngắn.” |
| “Claim & tranh chấp” | “Yêu cầu nhận đồ và tranh chấp” |
| “Dữ liệu riêng tư được tải từ endpoint có phân quyền.” | “Bằng chứng chỉ hiển thị cho người gửi, chủ bài và quản trị viên.” |
| “Item chuyển sang CLAIMED và các Claim PENDING cạnh tranh sẽ bị từ chối.” | “Bài đăng chuyển sang chờ bàn giao. Các yêu cầu đang chờ khác sẽ bị từ chối.” |
| Backend: “Bạn đã tạo Claim cho Item này” | “Bạn đã gửi yêu cầu nhận đồ cho bài đăng này. Vui lòng kiểm tra trong Yêu cầu đã gửi.” |
| Backend: “Tên đã tồn tại” | “Tên này đã được sử dụng. Vui lòng chọn tên khác.” |
| Nhật ký: `OPEN`, `CLOSED`, `ADMIN_MODERATION` | “Đang mở”, “Đã đóng”, “Quản trị viên đóng bài” |

## Các nguyên tắc được giữ nguyên

- Không đổi backend, API, enum, phân quyền, trạng thái hay quy tắc nghiệp vụ. Chỉ thêm ngữ cảnh nội bộ đường dẫn/phương thức/có phiên vào lỗi frontend để chọn câu hiển thị.
- Giữ nguyên các điều kiện kiểm tra, phép trim, cách đếm và ngưỡng. Các nhóm điều kiện trong form chỉ được tách ra để báo đúng nguyên nhân. Không áp đặt số ký tự thay cho giới hạn byte.
- `client/src/lib/validation.ts` không thay đổi. Hàm kiểm tra lý do quyết định Admin không thay đổi. Giới hạn ảnh vẫn là 5 MiB; giữ đơn vị chính xác vì dung lượng tệp là thông tin cần thiết để chọn ảnh.
- Lỗi 401 ở đăng nhập không được gọi là phiên hết hạn. Lỗi phiên thiếu/không hợp lệ được phân biệt theo ngữ cảnh; chỉ bộ đếm thời gian hết hạn thực sự dùng câu “đã hết hạn”. Lỗi 403 không yêu cầu đăng nhập lại một cách mặc định.
- Lỗi không nhận diện có thông báo dự phòng theo nhóm HTTP; lỗi máy chủ không bị diễn giải thành lỗi nhập liệu. Khi không xác định kết quả ghi, hướng dẫn kiểm tra trước khi gửi lại. Không tự gửi lại yêu cầu.
- Giữ cảnh báo chấp thuận sẽ từ chối các yêu cầu cạnh tranh; chỉ xác nhận bàn giao khi đã trao đồ; giữ giải thích quyền xem bằng chứng.
- “Đóng bài” vẫn là đóng bài, nội dung vẫn có thể xem công khai. Báo cáo vi phạm không tự đóng bài, giải quyết yêu cầu hoặc đình chỉ tài khoản.
- Không sửa nội dung người dùng/Admin nhập, bằng chứng, lý do, tiêu đề hay thông báo đã lưu trong cơ sở dữ liệu. Các từ kỹ thuật nằm trong nội dung nhập thử nghiệm vẫn được giữ nguyên.

## Kiểm chứng thực tế

- `npm.cmd test` trong `client/`: **41/41 ca đạt**; trước chỉnh sửa có 14 ca. Bổ sung kiểm tra phân biệt đăng nhập/phiên/quyền, giữ lỗi nghiệp vụ, không rò SQL/stack trace/secret, ngữ cảnh thao tác ghi và nhãn trạng thái/nhật ký.
- `npm.cmd run typecheck`: đạt. `npm.cmd run build`: đạt, gồm kiểm tra TypeScript; lần build cuối cũng chạy trong luồng browser.
- `npm.cmd run format:check`: đạt sau định dạng các file chỉnh sửa.
- `npm.cmd run test:browser`: **19/19 kiểm thử tích hợp đạt**, gồm luồng trình duyệt Chrome desktop 1440×1000 và mobile 390×844, gọi HTTP thật với MySQL tạm. Runner đã dừng và xóa dữ liệu MySQL tạm, không dùng dịch vụ cơ sở dữ liệu đang cài.
- Luồng browser xác nhận đăng ký, tìm kiếm/phân trang, tạo/sửa bài, phục hồi tải ảnh lỗi, quyền sửa bài, bằng chứng riêng tư, yêu cầu trùng, chấp thuận/bàn giao, thông báo, báo cáo, hồ sơ; Admin dashboard/tài khoản/danh mục/địa điểm/đóng bài/giải quyết tranh chấp/nhật ký và kiểm tra liên quan qua hơn 100 yêu cầu.
- Kiểm tra form thật: mật khẩu 24 chữ `ắ` được chấp nhận; 25 chữ `ắ`, 19 emoji hoặc 73 chữ ASCII bị chặn vì quá dài; 7 emoji bị chặn vì chưa đủ 8 ký tự. Mô tả và bằng chứng vượt giới hạn bằng tiếng Việt/emoji hiển thị lỗi đúng trường. Lý do Admin 1.000 emoji được backend chấp nhận; 1.001 emoji bị chặn.
- Đã mở xem ảnh chụp form mật khẩu mobile, modal chấp thuận desktop, modal quyết định Admin mobile, nhật ký desktop/mobile và báo cáo của tôi mobile. Kiểm thử kiểm tra tràn ngang trang trên các trang Admin và các màn hình người dùng liên quan. Bảng Admin vẫn cuộn ngang như thiết kế hiện có.
- Ảnh chụp nằm trong `.cache/frontend-browser/`, gồm `mobile-password-error.png`, `desktop-approve-warning.png`, `mobile-admin-decision.png`, `desktop-admin-activity.png`, `mobile-admin-activity.png`, `mobile-my-reports.png`.
- Các lần browser đầu phát hiện kỳ vọng câu chữ cũ và tình huống kiểm thử focus chạy cùng lúc tải tài liệu mới. Đã cập nhật kỳ vọng; kiểm thử đình chỉ thực hiện focus trên trang đã đăng nhập và đã mount, tôn trọng thời gian chờ hiện có. Không đổi vòng đời xác thực của ứng dụng.

## Giới hạn kiểm chứng và ghi nhận

- Chưa kiểm thử Safari, Firefox, thiết bị di động vật lý, mạng production hoặc Cloudinary thật. Luồng tích hợp dùng dịch vụ ảnh giả của bộ kiểm thử hiện có.
- Không kích hoạt mọi lỗi backend qua giao diện. Các lỗi hiếm, thông báo lạ và nội dung nhạy cảm được kiểm tra ở lớp ánh xạ bằng unit test.
- Không mô phỏng trực quan mọi tổ hợp trạng thái tải/rỗng/lỗi trên từng trang; đã rà soát code và cơ chế dùng chung, kiểm chứng các luồng chính qua browser.
- Quan sát trong quá trình kiểm thử: khi tải lại trang riêng tư sau khi tài khoản đã bị đình chỉ, giao diện có thể giữ màn hình lỗi có nút “Đăng xuất” thay vì tự chuyển đến trang đăng nhập. Truy cập vẫn bị từ chối. Không sửa hành vi vòng đời phiên này trong đợt chỉnh câu chữ.
- `git diff --check` toàn repository có cảnh báo dòng trống cuối `RULES.md` từ thay đổi local ban đầu; file đó được giữ nguyên. Đối chiếu nội dung bằng SHA-256 xác nhận không thay đổi các file sẵn có ngoài `client/`.
- Chưa commit, push, merge hoặc deploy.
