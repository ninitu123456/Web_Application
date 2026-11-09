# Ảnh minh họa demo FindIt

10 PNG tạo mới bằng built-in `imagegen`, đã kiểm tra trực quan: phone, laptop, headphones, bag, wallet, card, keys, bottle, books, accessory. Không lấy ảnh từ nguồn bên ngoài, không chứa người thật hoặc thông tin cá nhân; thẻ chỉ có chữ DEMO. Đây là ảnh AI minh họa, không khẳng định là ảnh sự việc thật. Không tuyên bố tính độc quyền hoặc gán giấy phép của bên thứ ba.

Prompt chung và 10 subject chính xác được lưu ở `imagePrompt`/`imageSubjects` trong `../seeds/production-demo-data.js`; dùng built-in tool, không CLI fallback. Các file gốc được sao chép nguyên vẹn, không crop/edit. Cùng ảnh được dùng cho nhiều bài cùng loại và bảy cặp thử nghiệm, có thông báo trong mô tả bài.

Chưa upload Cloudinary. Sau khi duyệt, uploader dùng adapter `server/config/cloudinary.js` hiện có và ghi `cloudinary-manifest.json` chứa publicId, URL công khai và SHA256, không chứa secret. File này chỉ được sinh khi upload thật; không điền URL giả hoặc URL local vào production.
