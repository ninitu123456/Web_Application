import { useEffect, useState } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { useNotifications } from "../../lib/notifications";
import { ErrorState, Modal } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { ApiError } from "../../lib/api";
import "./admin.css";
const navigation = [
  ["", "Tổng quan", "home"],
  ["/bai-dang", "Bài đăng", "box"],
  ["/claims", "Yêu cầu & tranh chấp", "shield"],
  ["/bao-cao", "Báo cáo vi phạm", "alert"],
  ["/nguoi-dung", "Người dùng", "users"],
  ["/danh-muc-dia-diem", "Danh mục & địa điểm", "pin"],
  ["/nhat-ky", "Nhật ký hoạt động", "clock"],
] as const;
function AdminNavigation({ close }: { close?: () => void }) {
  return (
    <nav aria-label="Quản trị">
      {navigation.map(([path, label, icon]) => (
        <NavLink key={path} end={!path} to={`/quan-tri${path}`} onClick={close}>
          <Icon name={icon} />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
export function AdminLayout() {
  const { user, logout } = useAuth();
  const notifications = useNotifications();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [location.pathname]);
  if (user?.role !== "ADMIN")
    return (
      <ErrorState
        error={new ApiError(403, "Khu vực này chỉ dành cho quản trị viên.")}
      />
    );
  const current = navigation.find(([path]) =>
    path
      ? location.pathname.startsWith(`/quan-tri${path}`)
      : location.pathname === "/quan-tri",
  );
  const record = location.pathname.match(/\/(\d+)$/)?.[1];
  return (
    <div className="admin-shell">
      <a className="skip-link" href="#admin-main">
        Đến nội dung chính
      </a>
      <aside className="admin-rail">
        <Link className="brand admin-brand" to="/quan-tri">
          FindIt<span>.</span>
        </Link>
        <span className="admin-label">QUẢN TRỊ</span>
        <AdminNavigation />
        <div className="admin-rail-bottom">
          <Link to="/">
            <Icon name="exit" />
            Về trang người dùng
          </Link>
          <span className="admin-identity">
            <span className="avatar">{user.fullName.slice(0, 1)}</span>
            <span>
              {user.fullName}
              <small>Quản trị viên</small>
            </span>
          </span>
        </div>
      </aside>
      <div className="admin-workspace">
        <header className="admin-topbar">
          <button
            className="icon-button admin-menu-toggle"
            aria-label="Mở điều hướng quản trị"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <Icon name="menu" />
          </button>
          <nav className="admin-breadcrumb" aria-label="Đường dẫn">
            <Link to="/quan-tri">
              <Icon name="home" />
              <span>Trang quản trị</span>
            </Link>
            <span>/</span>
            {record ? (
              <>
                <Link to={`/quan-tri${current?.[0] || ""}${location.search}`}>
                  {current?.[1]}
                </Link>
                <span>/</span>
                <strong>#{record}</strong>
              </>
            ) : (
              <strong>{current?.[1]}</strong>
            )}
          </nav>
          <div className="admin-topbar-actions">
            <Link
              className="notification-bell"
              to="/thong-bao"
              aria-label={
                notifications.error
                  ? "Thông báo — chưa tải được số chưa đọc"
                  : `Thông báo, ${notifications.count} chưa đọc`
              }
            >
              <Icon name="bell" />
              {notifications.count > 0 && (
                <span className="notification-count">
                  {notifications.count > 99 ? "99+" : notifications.count}
                </span>
              )}
            </Link>
            <details className="account">
              <summary aria-label="Menu tài khoản">
                <span className="avatar">{user.fullName.slice(0, 1)}</span>
                <span className="admin-account-name">{user.fullName}</span>
                <span aria-hidden="true">⌄</span>
              </summary>
              <div className="account-menu">
                <strong>{user.fullName}</strong>
                <small>{user.email}</small>
                <Link to="/ho-so">Hồ sơ cá nhân</Link>
                <Link to="/thong-bao">Thông báo</Link>
                <Link to="/">Về trang người dùng</Link>
                <button
                  onClick={() => {
                    logout();
                    navigate("/");
                  }}
                >
                  Đăng xuất
                </button>
              </div>
            </details>
          </div>
        </header>
        <main id="admin-main" className="admin-content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
      {open && (
        <Modal
          className="admin-nav-dialog"
          title="Điều hướng quản trị"
          close={() => setOpen(false)}
        >
          <AdminNavigation close={() => setOpen(false)} />
          <Link
            className="button secondary"
            to="/"
            onClick={() => setOpen(false)}
          >
            Về trang người dùng
          </Link>
        </Modal>
      )}
    </div>
  );
}
