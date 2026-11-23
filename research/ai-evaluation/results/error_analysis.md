# Phân tích lỗi — CORe50 / FindIt

Kết quả chạy thật: 91/150 query sai Top 1; trong đó 55 query chọn nhầm một vật thể **cùng danh mục**. 38 query có đáp án ở hạng 2–3 và 53 query nằm ngoài Top 3. “Thất bại” trong hình được định nghĩa là không có đáp án trong Top 3, không đồng nghĩa không có đáp án trong toàn bộ gallery.

| Nhóm | Query | Hạng đúng | Top 3 (cosine; ground truth) |
|---|---|---:|---|
| Top 1 correct | o01_s07 | 1 | o1: 0.9098 (đúng), o2: 0.8718 (sai), o5: 0.8605 (sai) |
| Top 1 correct | o06_s07 | 1 | o6: 0.9287 (đúng), o9: 0.8661 (sai), o46: 0.8577 (sai) |
| Top 1 correct | o11_s03 | 1 | o11: 0.8997 (đúng), o26: 0.8695 (sai), o27: 0.8445 (sai) |
| Correct in Top 3, not Top 1 | o01_s03 | 2 | o2: 0.8887 (sai), o1: 0.8691 (đúng), o4: 0.8621 (sai) |
| Correct in Top 3, not Top 1 | o06_s10 | 3 | o48: 0.8567 (sai), o9: 0.8529 (sai), o6: 0.8479 (đúng) |
| Correct in Top 3, not Top 1 | o11_s10 | 3 | o30: 0.8676 (sai), o27: 0.8622 (sai), o11: 0.8553 (đúng) |
| Missed Top 3 | o03_s03 | 10 | o4: 0.8815 (sai), o2: 0.8541 (sai), o30: 0.8540 (sai) |
| Missed Top 3 | o06_s03 | 45 | o47: 0.8681 (sai), o30: 0.8649 (sai), o28: 0.8502 (sai) |
| Missed Top 3 | o12_s03 | 6 | o11: 0.8668 (sai), o26: 0.8512 (sai), o15: 0.8336 (sai) |

Hình: [retrieval_examples.png](retrieval_examples.png). Các ví dụ được chọn xác định theo ID query, ưu tiên đa dạng danh mục; không chọn dựa trên việc ảnh trông đẹp hay xấu. Có tối đa 3 ví dụ mỗi nhóm, chỉ khi nhóm đó tồn tại trong kết quả.

Điểm positive trung bình 0.8378, negative trung bình 0.7424. Có 7114 negative không thấp hơn positive nhỏ nhất, và 145 positive không cao hơn negative lớn nhất. Đây là số đếm overlap theo miền điểm, không phải xác suất lỗi hoặc AUC.

Các query sử dụng session khác gallery, vì vậy góc chụp, bàn tay che khuất, ánh sáng và background có thể thay đổi đồng thời. Không có nhãn định lượng riêng cho các yếu tố này; benchmark không thể tách tác động nhân quả của từng yếu tố. CLIP học tương đồng ngữ nghĩa nên các vật cùng danh mục có thể gần nhau dù khác object ID. Ảnh 128×128 giới hạn chi tiết chữ, logo, vết xước và đặc điểm nhận diện nhỏ; phóng lên 224×224 không phục hồi thông tin đã mất. Đây là các cơ chế có thể giải thích lỗi, cần đối chiếu hình minh họa và không được xem là nhãn lỗi do AI tự suy ra.

LOST/FOUND là vai trò mô phỏng, không phải bài đăng thất lạc thật. Xem báo cáo chính để biết giới hạn suy rộng và chính sách ngưỡng.

## Quan sát trực tiếp hình minh họa

Các mô tả dưới đây được viết sau khi xem ảnh query và gallery thực tế, không dùng để thay đổi ground truth. Điểm/hạng lấy tự động từ kết quả.

- **o01_s07**, hạng đúng 1, Top 1 o1 (cosine 0.9098): Adapter có phần xanh/trắng và hai chấu hiện khá rõ ở query và gallery, dù hướng cầm và nền thay đổi. Đặc điểm hình dáng và màu lớn vẫn nhìn được ở độ phân giải thấp.
- **o06_s07**, hạng đúng 1, Top 1 o6 (cosine 0.9287): Điện thoại đỏ có màn hình và bàn phím nhìn từ mặt trước trong cả hai ảnh. Nền query sáng hơn và góc cầm thay đổi nhưng các vùng màu, màn hình và bàn phím còn quan sát được.
- **o11_s03**, hạng đúng 1, Top 1 o11 (cosine 0.8997): Kéo kim loại ở query mở hai vòng tay cầm; gallery cùng vật thể cho thấy lưỡi kéo theo hướng thẳng đứng. Vẫn tìm đúng dù tư thế khác; các ứng viên kính có vòng gọng tương tự cũng xuất hiện trong Top 3.
- **o01_s03**, hạng đúng 2, Top 1 o2 (cosine 0.8887): Adapter xanh/trắng được nhìn từ mặt bên, phần chấu và đầu cắm bị khuất so với gallery đúng. Một adapter khác cùng danh mục đứng đầu. Sự khác nhau về góc nhìn là quan sát trực tiếp; không thể tách riêng ảnh hưởng của góc và nền bằng thí nghiệm này.
- **o06_s10**, hạng đúng 3, Top 1 o48 (cosine 0.8567): Điện thoại query ở ngoài trời, còn gallery ở trong nhà. Cả điện thoại và điều khiển từ xa trong Top 3 đều có dạng thân dài và bàn phím; điều khiển từ xa đứng trước điện thoại đúng. Ảnh nhỏ hạn chế việc quan sát rõ ký tự trên phím.
- **o11_s10**, hạng đúng 3, Top 1 o30 (cosine 0.8676): Query kéo được cầm nghiêng trước cây lá ngoài trời, bàn tay che một phần vật thể. Gallery đúng ở nền trong nhà và hướng lưỡi kéo thẳng đứng. Hai ảnh kính được xếp cao hơn; các vòng tay cầm/gọng kính đều có đường cong kim loại, nhưng đây chỉ là gợi ý giải thích về hình dạng.
- **o03_s03**, hạng đúng 10, Top 1 o4 (cosine 0.8815): Query adapter nhỏ được cầm ngang, bàn tay che một phần thân. Hai adapter khác xuất hiện đầu danh sách. Sự giống nhau trong cùng danh mục chưa đủ để nhận diện đúng vật thể cụ thể.
- **o06_s03**, hạng đúng 45, Top 1 o47 (cosine 0.8681): Query điện thoại chủ yếu lộ cạnh mỏng đỏ/đen, không thấy rõ mặt màn hình và bàn phím như gallery đúng. Điều khiển từ xa đen dạng dài đứng đầu. Đây là ví dụ rõ về mất thông tin mặt trước khi thay đổi góc chụp.
- **o12_s03**, hạng đúng 6, Top 1 o11 (cosine 0.8668): Query kéo màu bạc có hai vòng tay cầm lớn; Top 1 là một chiếc kéo khác bằng kim loại. Sự nhầm lẫn xảy ra trong cùng danh mục dù hai vật có khác biệt về cấu trúc và tỉ lệ; chi tiết nhận dạng nhỏ khó đánh giá trên ảnh 128×128.
