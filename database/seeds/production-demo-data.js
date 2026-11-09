export const marker = 'findit:production-demo:v1';
export const demoOwners = [
  { email: 'lost-owner@demo.findit.invalid', fullName: 'FindIt Demo — Người báo mất' },
  { email: 'found-owner@demo.findit.invalid', fullName: 'FindIt Demo — Người nhặt được' }
];
export const imageSubjects = {
  phone: 'one black unbranded smartphone, back facing camera, two round camera lenses, no case',
  laptop: 'one slim silver unbranded laptop opened halfway, black blank screen, silver keyboard',
  headphones: 'white wireless earbuds in an open rounded white charging case',
  bag: 'one plain black fabric backpack with two straps and front zipper pocket',
  wallet: 'one closed brown leather bifold wallet, no contents visible',
  card: 'one fictional student card on a blue lanyard, card printed ONLY with DEMO and geometric shapes, no photo, no name, no numbers, no institution',
  keys: 'two ordinary silver house keys on a round metal ring with a plain yellow round plastic key tag',
  bottle: 'one plain matte blue reusable water bottle with blue screw lid',
  books: 'one closed plain blue notebook on top of one plain cream textbook, no readable titles',
  accessory: 'one folded compact black umbrella, simple wrist strap'
};
export const imagePrompt = subject => `Use case: photorealistic-natural. Create a single sharp realistic illustrative photograph for a Vietnamese university lost and found DEMO listing. Subject: ${subject}. Whole object fully visible centered on a clean light wood campus library table, generous margins, soft daylight, realistic material texture, square composition, no people, no other objects, no logos, no watermark, no personal information. This is synthetic demo imagery, not a real incident photograph.`;
const electronic = 'Thiết bị điện tử', personal = 'Đồ dùng cá nhân';
// The public labels and private exact keys serve different purposes. Never infer
// ownership from a title prefix when deleting or reusing a record.
const rows = [
  ['phone-01','LOST','điện thoại đen hai camera',electronic,'Thư viện UIT','phone','Đen','Để quên điện thoại trên bàn đọc sách tầng trệt sau buổi học nhóm. Máy có hai camera tròn ở mặt lưng.',1,'phone'],
  ['phone-02','FOUND','điện thoại đen tại thư viện',electronic,'Thư viện UIT','phone','Đen','Nhặt được điện thoại đen hai camera trên bàn đọc gần cửa sổ. Người nhận cần mô tả đặc điểm riêng để đối chiếu.',1,'phone'],
  ['phone-03','LOST','điện thoại đen sau tiết học',electronic,'Tòa nhà A - UIT','phone','Đen','Không thấy điện thoại sau tiết học buổi chiều. Lần cuối sử dụng máy tại hàng ghế cuối phòng học.',4,null],
  ['phone-04','FOUND','điện thoại đen gần ghế đá',electronic,'Khuôn viên UIT','phone','Đen','Thấy điện thoại nằm cạnh ghế đá trong khuôn viên. Đã cất giữ cẩn thận, chờ người báo mất xác minh.',2,null],
  ['laptop-01','LOST','laptop bạc tại khu tự học',electronic,'Thư viện UIT','laptop','Bạc','Để quên laptop vỏ bạc, bàn phím cùng màu ở khu tự học. Khi rời chỗ đã gập máy và không mang theo sạc.',2,'laptop'],
  ['laptop-02','FOUND','laptop bạc ở thư viện',electronic,'Thư viện UIT','laptop','Bạc','Nhặt được laptop bạc trên bàn khu tự học. Máy không kèm sạc; cần mô tả cấu hình và mở khóa để xác minh.',2,'laptop'],
  ['laptop-03','LOST','laptop bạc sau buổi thuyết trình',electronic,'Tòa nhà B - UIT','laptop','Bạc','Có thể đã để máy tính vỏ bạc trên bàn giảng đường sau buổi thuyết trình sáng. Mong người nhặt được liên hệ qua bài đăng.',5,null],
  ['headphones-01','LOST','tai nghe trắng kèm hộp sạc',electronic,'Tòa nhà A - UIT','headphones','Trắng','Làm rơi bộ tai nghe không dây màu trắng trong giờ chuyển phòng. Hộp sạc bo tròn, bên trong có hai tai nghe.',1,'headphones'],
  ['headphones-02','FOUND','tai nghe trắng tại tòa A',electronic,'Tòa nhà A - UIT','headphones','Trắng','Nhặt được hộp tai nghe trắng gần lối cầu thang. Trong hộp còn đủ hai tai nghe, xin mô tả dấu hiệu riêng khi nhận.',1,'headphones'],
  ['headphones-03','LOST','hộp tai nghe trắng tại tòa E',electronic,'Tòa nhà E - UIT','headphones','Trắng','Không tìm thấy bộ tai nghe sau giờ nghỉ trưa. Hộp nhỏ màu trắng, có thể rơi ở hành lang trước phòng học.',6,null],
  ['headphones-04','FOUND','bộ tai nghe trắng gần sân trường',electronic,'Khuôn viên UIT','headphones','Trắng','Nhặt được bộ tai nghe không dây màu trắng còn hộp sạc cạnh lối đi sân trường vào buổi sáng.',3,null],
  ['bag-01','LOST','balo đen có ngăn kéo phía trước',personal,'Tòa nhà B - UIT','bag','Đen','Để quên balo vải đen ở ghế hành lang tòa B. Balo có hai quai đeo và ngăn khóa kéo nhỏ phía trước.',2,'bag'],
  ['bag-02','FOUND','balo đen trên ghế hành lang',personal,'Tòa nhà B - UIT','bag','Đen','Thấy balo vải đen trên ghế hành lang tòa B, có ngăn kéo phía trước. Chưa mở đồ bên trong để giữ riêng tư.',2,'bag'],
  ['bag-03','LOST','balo đen sau giờ học nhóm',personal,'Tòa nhà C - UIT','bag','Đen','Sau buổi học nhóm mới phát hiện thiếu balo đen. Có thể đã để lại ở khu bàn chung tầng trệt tòa C.',4,null],
  ['bag-04','FOUND','balo vải đen gần sảnh tòa E',personal,'Tòa nhà E - UIT','bag','Đen','Nhặt được balo vải đen cạnh ghế chờ ở sảnh. Người nhận vui lòng mô tả đồ bên trong để đối chiếu.',1,null],
  ['wallet-01','LOST','ví da nâu gập đôi',personal,'Tòa nhà A - UIT','wallet','Nâu','Có thể làm rơi ví da nâu gập đôi khi ngồi ở hành lang tòa A. Không công khai giấy tờ hoặc số tiền trong ví.',3,'wallet'],
  ['wallet-02','FOUND','ví nâu ở hành lang tòa A',personal,'Tòa nhà A - UIT','wallet','Nâu','Nhặt được ví da nâu gập đôi dưới ghế hành lang. Đã giữ nguyên hiện trạng, cần xác minh nội dung riêng khi nhận.',3,'wallet'],
  ['wallet-03','FOUND','ví da nâu tại khuôn viên',personal,'Khuôn viên UIT','wallet','Nâu','Thấy một ví da nâu gần lối đi trong khuôn viên vào buổi chiều. Người nhận cần mô tả đặc điểm và đồ bên trong.',5,null],
  ['card-01','LOST','thẻ sinh viên mẫu kèm dây xanh','Giấy tờ và thẻ','Tòa nhà B - UIT','card','Xanh dương','Làm rơi thẻ mẫu có chữ DEMO và dây đeo xanh khi chuyển phòng. Đây là thẻ giả lập, không chứa thông tin cá nhân.',2,null],
  ['card-02','LOST','thẻ DEMO tại khu tự học','Giấy tờ và thẻ','Thư viện UIT','card','Xanh dương','Để quên thẻ sinh viên giả lập kèm dây xanh trên bàn khu tự học. Thẻ chỉ dùng minh họa, không có mã sinh viên thật.',4,null],
  ['keys-01','FOUND','chùm hai chìa khóa móc vàng','Chìa khóa','Tòa nhà C - UIT','keys','Vàng','Nhặt được hai chìa khóa bạc gắn vòng kim loại và móc nhựa tròn màu vàng ở chân cầu thang tòa C.',1,null],
  ['keys-02','FOUND','chìa khóa có thẻ móc tròn vàng','Chìa khóa','Tòa nhà E - UIT','keys','Vàng','Thấy chùm hai chìa khóa với móc tròn màu vàng tại sảnh tòa E. Không có địa chỉ hay số điện thoại trên móc.',5,null],
  ['bottle-01','LOST','bình nước xanh nắp vặn',personal,'Khuôn viên UIT','bottle','Xanh dương','Để quên bình nước xanh dương bề mặt nhám, nắp vặn cùng màu trên ghế đá sau giờ thể dục.',1,'bottle'],
  ['bottle-02','FOUND','bình nước xanh trên ghế đá',personal,'Khuôn viên UIT','bottle','Xanh dương','Nhặt được bình nước xanh dương nắp vặn trên ghế đá. Bình trơn, không có tên hoặc nhãn bên ngoài.',1,'bottle'],
  ['bottle-03','LOST','bình nước xanh tại tòa C',personal,'Tòa nhà C - UIT','bottle','Xanh dương','Có thể để lại bình nước xanh nắp vặn ở khu ghế chờ tầng trệt. Bình không dán nhãn và không kèm túi đựng.',6,null],
  ['books-01','LOST','sổ xanh và sách bìa kem',personal,'Thư viện UIT','books','Xanh dương, kem','Để quên một sổ bìa xanh đặt trên sách bìa kem ở bàn đọc thư viện. Cần đối chiếu nội dung ghi chú khi nhận.',2,'books'],
  ['books-02','FOUND','sổ xanh đặt trên sách bìa kem',personal,'Thư viện UIT','books','Xanh dương, kem','Nhặt được sổ bìa xanh và một cuốn sách bìa kem trên bàn đọc. Giữ nguyên cả hai để người nhận xác minh.',2,'books'],
  ['books-03','FOUND','bộ sách và sổ tại tòa B',personal,'Tòa nhà B - UIT','books','Xanh dương, kem','Thấy sổ bìa xanh đặt cùng sách bìa kem trên ghế cuối giảng đường sau tiết học. Chưa có người quay lại nhận.',4,null],
  ['accessory-01','LOST','ô gấp đen có dây đeo',personal,'Tòa nhà E - UIT','accessory','Đen','Để quên ô gấp màu đen ở khu ghế chờ tòa E sau cơn mưa. Ô nhỏ gọn, có dây đeo cổ tay.',3,null],
  ['accessory-02','FOUND','ô gấp đen gần lối vào tòa C',personal,'Tòa nhà C - UIT','accessory','Đen','Nhặt được ô gấp màu đen có dây đeo cạnh cửa vào tòa C vào buổi sáng. Xin mô tả đặc điểm riêng khi nhận.',6,null]
];
export const fixtures = rows.map(([key,type,subject,category,location,image,color,description,daysAgo,pair]) => ({
  key,type,title:`[DEMO] ${type === 'LOST' ? 'Mất' : 'Nhặt được'} ${subject}`,category,location,image,color,
  description:`${description}\n\n[DỮ LIỆU DEMO FINDIT] Tình huống giả lập, ảnh minh họa tạo bằng AI và có thể dùng chung cho các bài cùng loại. Không phải sự việc thất lạc thật.`,daysAgo,pair
}));
export function eventDate(fixture, anchor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor) || !Number.isFinite(Date.parse(`${anchor}T00:00:00Z`))) throw new Error('Invalid demo anchor date');
  return new Date(Date.parse(`${anchor}T00:00:00Z`) - fixture.daysAgo * 86400000).toISOString().slice(0,10);
}
