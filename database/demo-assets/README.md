# Ảnh minh họa demo FindIt

10 PNG tạo mới bằng built-in `imagegen`, đã kiểm tra trực quan: phone, laptop, headphones, bag, wallet, card, keys, bottle, books, accessory. Không lấy ảnh từ nguồn bên ngoài, không chứa người thật hoặc thông tin cá nhân; thẻ chỉ có chữ DEMO. Đây là ảnh AI minh họa, không khẳng định là ảnh sự việc thật. Không tuyên bố tính độc quyền hoặc gán giấy phép của bên thứ ba.

Prompt chung và 10 subject chính xác được lưu ở `imagePrompt`/`imageSubjects` trong `../seeds/production-demo-data.js`; dùng built-in tool, không CLI fallback. Các file gốc được sao chép nguyên vẹn, không crop/edit. Cùng ảnh được dùng cho nhiều bài cùng loại và bảy cặp thử nghiệm, có thông báo trong mô tả bài.

Đã upload Cloudinary production `n7vjm6qn` ngày 2026-11-09 sau phê duyệt riêng. Uploader dùng adapter `server/config/cloudinary.js` hiện có; `cloudinary-manifest.json` chứa publicId, URL thật và SHA256 nguồn/delivery, không chứa secret. Cả 10 URL đã GET thành công và hash bytes khớp nguồn. Không điền URL giả hoặc URL local vào production.
