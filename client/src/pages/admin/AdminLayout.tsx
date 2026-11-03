import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { ErrorState } from "../../components/ui";
import { ApiError } from "../../lib/api";
export function AdminLayout() {
  const { user } = useAuth();
  if (user?.role !== "ADMIN")
    return (
      <ErrorState
        error={new ApiError(403, "Khu vực này chỉ dành cho quản trị viên.")}
      />
    );
  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <span className="eyebrow">KHÔNG GIAN QUẢN TRỊ</span>
        <nav aria-label="Quản trị">
          {[
            ["", "Tổng quan"],
            ["/nguoi-dung", "Người dùng"],
            ["/bai-dang", "Bài đăng"],
            ["/claims", "Yêu cầu nhận đồ và tranh chấp"],
            ["/bao-cao", "Báo cáo vi phạm"],
            ["/danh-muc-dia-diem", "Danh mục & địa điểm"],
            ["/nhat-ky", "Nhật ký hoạt động"],
          ].map(([path, label]) => (
            <NavLink end={path === ""} key={path} to={`/quan-tri${path}`}>
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="admin-content">
        <Outlet />
      </div>
    </div>
  );
}
