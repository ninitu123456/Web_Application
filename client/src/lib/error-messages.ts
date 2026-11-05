export interface ErrorContext {
  path: string;
  authenticated: boolean;
  method: string;
}

// Match complete, known messages and HTTP status. Never echo arbitrary server text.
const messages: Record<number, Record<string, string>> = {
  400: {
    "Mật khẩu xác nhận không khớp": "Mật khẩu xác nhận không khớp.",
    "Liên kết không hợp lệ hoặc đã hết hạn":
      "Liên kết không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu liên kết mới.",
    "Tin nhắn không hợp lệ":
      "Tin nhắn không hợp lệ. Vui lòng kiểm tra và thử lại.",
    "Tin nhắn cần từ 1 đến 2000 ký tự": "Tin nhắn cần từ 1 đến 2000 ký tự.",
    "Không thể nhắn tin với chính mình": "Không thể nhắn tin với chính mình.",
    "Dữ liệu yêu cầu không hợp lệ":
      "Thông tin gửi lên chưa hợp lệ. Vui lòng kiểm tra và thử lại.",
    "Dữ liệu JSON không hợp lệ":
      "Chưa gửi được thông tin. Vui lòng tải lại trang và thử lại.",
    "Dữ liệu tải lên không hợp lệ":
      "Chưa tải được ảnh. Vui lòng kiểm tra ảnh đã chọn và thử lại.",
    "Danh mục không tồn tại hoặc không hoạt động":
      "Danh mục này không còn được sử dụng. Vui lòng chọn danh mục khác.",
    "Địa điểm không tồn tại hoặc không hoạt động":
      "Địa điểm này không còn được sử dụng. Vui lòng chọn địa điểm khác.",
    "Thao tác chỉ hợp lệ khi Item đang mở":
      "Bạn chỉ có thể thực hiện thao tác này khi bài đăng đang mở.",
    "Mỗi Item được phép có tối đa 5 ảnh":
      "Mỗi bài đăng có tối đa 5 ảnh, tính cả ảnh đã lưu.",
    "Trạng thái Item không thể đóng":
      "Không thể đóng bài đăng ở trạng thái hiện tại. Vui lòng tải lại bài để kiểm tra.",
    "Vui lòng chọn ảnh": "Vui lòng chọn ảnh để tải lên.",
    "Nội dung ảnh không hợp lệ": "Ảnh không hợp lệ. Vui lòng chọn ảnh khác.",
    "Chỉ FOUND Item mới nhận Claim":
      "Chỉ bài đăng đồ nhặt được mới nhận yêu cầu nhận đồ.",
    "Chỉ FOUND Item có Claims":
      "Chỉ bài đăng đồ nhặt được mới có danh sách yêu cầu nhận đồ.",
  },
  401: {
    "Thông tin đăng nhập không hợp lệ":
      "Không thể đăng nhập bằng thông tin này. Vui lòng kiểm tra email và mật khẩu.",
  },
  403: {
    "Người dùng hiện không thể nhận tin nhắn":
      "Người dùng hiện không thể nhận tin nhắn.",
    "Không có quyền truy cập": "Bạn không có quyền thực hiện thao tác này.",
    "Không có quyền quản trị": "Thao tác này chỉ dành cho quản trị viên.",
    "Khu vực này chỉ dành cho quản trị viên.":
      "Khu vực này chỉ dành cho quản trị viên.",
    "Bạn chỉ có thể sửa bài của mình khi bài đang mở.":
      "Bạn chỉ có thể sửa bài của mình khi bài đang mở.",
    "Tài khoản không được phép truy cập":
      "Tài khoản này hiện không được phép truy cập FindIt.",
    "Quyền quản trị không còn hiệu lực":
      "Bạn không còn quyền quản trị để thực hiện thao tác này.",
    "ADMIN liên quan phải nhờ quản trị viên khác xử lý":
      "Bạn là chủ bài hoặc đã gửi yêu cầu nhận đồ cho bài này. Vui lòng nhờ quản trị viên khác xử lý.",
    "Không thể Claim Item của chính mình":
      "Bạn không thể gửi yêu cầu nhận đồ cho bài đăng của mình.",
    "Không có quyền báo cáo Claim":
      "Bạn không có quyền báo cáo yêu cầu nhận đồ này.",
    "Không có quyền truy cập thông báo":
      "Bạn không có quyền xem hoặc thay đổi thông báo này.",
  },
  404: {
    "Không tìm thấy cuộc trò chuyện":
      "Không tìm thấy cuộc trò chuyện hoặc bạn không có quyền truy cập.",
    "Không tìm thấy người dùng": "Không tìm thấy người dùng.",
    "Không tìm thấy Item": "Không tìm thấy bài đăng.",
    "Không tìm thấy Claim hoặc Item":
      "Không tìm thấy yêu cầu nhận đồ hoặc bài đăng liên quan.",
    "Không tìm thấy Item hoặc Claim":
      "Không tìm thấy bài đăng hoặc yêu cầu nhận đồ liên quan.",
    "Người dùng không tìm thấy": "Không tìm thấy tài khoản.",
    "Không tìm thấy tài khoản": "Không tìm thấy tài khoản.",
    "Danh mục không tìm thấy": "Không tìm thấy danh mục.",
    "Địa điểm không tìm thấy": "Không tìm thấy địa điểm.",
    "Không tìm thấy đối tượng báo cáo":
      "Không tìm thấy nội dung hoặc tài khoản bạn muốn báo cáo.",
    "Không tìm thấy báo cáo": "Không tìm thấy báo cáo vi phạm.",
    "Không tìm thấy thông báo": "Không tìm thấy thông báo.",
    "Không tìm thấy yêu cầu nhận đồ. Dữ liệu có thể vừa thay đổi; hãy tải lại danh sách.":
      "Không tìm thấy yêu cầu nhận đồ. Dữ liệu có thể vừa thay đổi; hãy tải lại danh sách.",
  },
  409: {
    "Mã tin nhắn đã được sử dụng":
      "Tin nhắn đã được gửi với nội dung khác. Vui lòng kiểm tra lại hội thoại.",
    "Địa chỉ email đã tồn tại trong hệ thống":
      "Email này đã được đăng ký. Vui lòng đăng nhập hoặc dùng email khác.",
    "Tên đã tồn tại": "Tên này đã được sử dụng. Vui lòng chọn tên khác.",
    "Hệ thống phải duy trì ít nhất một ADMIN đang hoạt động":
      "Không thể đình chỉ quản trị viên đang hoạt động cuối cùng.",
    "Không thể tự thay đổi trạng thái tài khoản":
      "Bạn không thể tự thay đổi trạng thái tài khoản của mình.",
    "Trạng thái Item/Claim không cho phép thao tác":
      "Trạng thái bài đăng hoặc yêu cầu nhận đồ hiện không cho phép thao tác này. Vui lòng tải lại để kiểm tra.",
    "Trạng thái hiện tại không cho phép thao tác Claim":
      "Không thể xử lý yêu cầu nhận đồ ở trạng thái hiện tại. Vui lòng tải lại để kiểm tra.",
    "Item không nhận Claim ở trạng thái hiện tại":
      "Bài đăng hiện không nhận yêu cầu nhận đồ.",
    "Item đã có Claim được duyệt":
      "Bài đăng đã có yêu cầu nhận đồ được chấp thuận.",
    "Bạn đã tạo Claim cho Item này":
      "Bạn đã gửi yêu cầu nhận đồ cho bài đăng này. Vui lòng kiểm tra trong Yêu cầu đã gửi.",
    "Claim liên kết với Item không hợp lệ":
      "Yêu cầu nhận đồ không phù hợp với bài đăng liên quan nên chưa thể xử lý.",
    "Bạn đã có báo cáo đang được xử lý cho đối tượng này":
      "Bạn đã gửi báo cáo cho nội dung hoặc tài khoản này. Vui lòng theo dõi trong Báo cáo của tôi.",
    "Trạng thái báo cáo không cho phép thao tác":
      "Không thể xử lý báo cáo ở trạng thái hiện tại. Vui lòng tải lại để kiểm tra.",
  },
  503: {
    "Dịch vụ email tạm thời chưa khả dụng. Vui lòng thử lại sau.":
      "Dịch vụ email tạm thời chưa khả dụng. Vui lòng thử lại sau.",
    "Dịch vụ lưu trữ ảnh chưa được cấu hình":
      "Hiện chưa thể lưu hoặc xóa ảnh. Vui lòng thử lại sau.",
    "Hệ thống xử lý ảnh đang bận":
      "Hệ thống xử lý ảnh đang bận. Vui lòng chờ rồi thử lại.",
    "Tác vụ ảnh đang được xử lý":
      "Ảnh đang được xử lý. Vui lòng kiểm tra ảnh đã lưu trước khi thử lại.",
    "Chưa thể hoàn tất xóa ảnh; tác vụ đã được lưu để thử lại":
      "Chưa xóa xong ảnh. Hệ thống đã ghi nhận và sẽ thử xóa lại; bạn không cần gửi lại thao tác này.",
    "Hệ thống ghép nối đang bận, vui lòng thử lại":
      "Chưa tìm được gợi ý đồ vật vì hệ thống đang bận. Vui lòng thử lại sau.",
    "Chưa tải đủ thông tin để tìm bằng chứng. Vui lòng thử lại sau.":
      "Chưa tải đủ thông tin để tìm bằng chứng. Vui lòng thử lại sau.",
    "Chưa kiểm tra được bạn có liên quan đến bài đăng này hay không. Vui lòng thử lại.":
      "Chưa kiểm tra được bạn có liên quan đến bài đăng này hay không. Vui lòng thử lại.",
  },
};

export function apiErrorText(
  status: number,
  message: string,
  context?: ErrorContext,
): string {
  const known = messages[status];
  if (known && Object.hasOwn(known, message)) return known[message];
  if (status === 401) {
    if (context?.path === "/auth/login")
      return "Không thể đăng nhập bằng thông tin này. Vui lòng kiểm tra email và mật khẩu.";
    return context?.authenticated
      ? "Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại."
      : "Vui lòng đăng nhập để thực hiện thao tác này.";
  }
  const writing = context && !["GET", "HEAD"].includes(context.method);
  const checkSaved = writing ? " Hãy kiểm tra kết quả trước khi gửi lại." : "";
  if (status === 0)
    return `Không kết nối được với FindIt. Vui lòng kiểm tra kết nối mạng và thử lại.${checkSaved}`;
  if (status >= 500)
    return `FindIt tạm thời gặp sự cố. Vui lòng thử lại sau.${checkSaved}`;
  const fallback: Record<number, string> = {
    400: "Chưa thực hiện được yêu cầu. Vui lòng kiểm tra thông tin đã nhập hoặc tải lại nội dung trước khi thử lại.",
    403: "Bạn không có quyền thực hiện thao tác này.",
    404: "Không tìm thấy nội dung bạn cần.",
    409: "Thao tác không còn phù hợp với dữ liệu hiện tại. Vui lòng tải lại để kiểm tra trước khi thử lại.",
    413: "Nội dung hoặc tệp quá lớn. Vui lòng rút ngắn nội dung hoặc chọn tệp nhỏ hơn.",
    422: "Thông tin gửi lên chưa hợp lệ. Vui lòng kiểm tra và thử lại.",
    429: "Bạn thao tác quá nhanh. Vui lòng chờ một lát rồi thử lại.",
  };
  return (
    fallback[status] || "Chưa thực hiện được yêu cầu. Vui lòng thử lại sau."
  );
}
