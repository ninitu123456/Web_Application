# FindIt

Backend quản lý Lost & Found: Express 5 / ESM, MySQL 8, JWT, Cloudinary và `node:test`.

- [Hướng dẫn backend](server/README.md), [database](database/README.md).
- Phase 1–6: [Auth/User](server/AUTH.md), [Item/Search](server/ITEMS.md), [Matching](server/MATCHING.md), [Claim](server/CLAIMS.md), [Notification/Report](server/NOTIFICATIONS-REPORTS.md), [Admin](server/ADMIN.md).
- Phase 7: [bảo mật, cấu hình và hướng dẫn kiểm thử](server/SECURITY.md).

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run test:integration:isolated
# Hoặc toàn bộ regression:
npm.cmd run test:regression
```

Integration chỉ chạy với MySQL instance tạm do runner tạo, không dùng dịch vụ MySQL đang cài. Đặt `MYSQLD_PATH` nếu cần chỉ định executable MySQL >= 8.0.16. Cloudinary được thay bằng storage giả trong test.

Frontend chưa triển khai. Backend đã bổ sung bốn API Admin Claim/dispute/activity logs và moderation `/close`; `/status` legacy vẫn được hỗ trợ, chỉ đóng OPEN. Resolve chỉ áp dụng Claim PENDING. CLOSED kết thúc hoạt động, chưa ẩn nội dung công khai. Xem [Admin API](server/ADMIN.md) để biết contract, privacy và giới hạn.
