import { useEffect, useState } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { useResource } from "../../lib/hooks";
import type { AdminQueue } from "../../lib/extended-types";
import { BrandMark } from "../../components/Brand";
import { ErrorState, Modal } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { ApiError } from "../../lib/api";
import "./admin.css";
const navigation = [
  ["", "Tổng quan", "grid"],
  ["/nguoi-dung", "Người dùng", "users"],
  ["/bai-dang", "Bài đăng", "box"],
  ["/claims", "Yêu cầu nhận đồ", "shield"],
  ["/khieu-nai", "Khiếu nại bàn giao", "alert"],
  ["/bao-cao", "Báo cáo vi phạm", "flag"],
  ["/danh-muc-dia-diem", "Danh mục & địa điểm", "pin"],
  ["/lien-he", "Hộp thư liên hệ", "message"],
  ["/nhat-ky", "Nhật ký hoạt động", "chart"],
] as const;
const QUEUE_KEYS: Record<string, keyof AdminQueue> = {
  "/bao-cao": "reports",
  "/khieu-nai": "disputes",
  "/lien-he": "contacts",
};
function AdminNavigation({
  close,
  queue,
}: {
  close?: () => void;
  queue?: AdminQueue;
}) {
  return (
    <nav aria-label="Quản trị">
      {navigation.map(([path, label, icon]) => {
        const count = queue && QUEUE_KEYS[path] ? queue[QUEUE_KEYS[path]] : 0;
        return (
          <NavLink
            key={path}
            end={!path}
            to={`/quan-tri${path}`}
            onClick={close}
          >
            <Icon name={icon} />
            <span className="admin-nav-label">{label}</span>
            {count > 0 && (
              <span
                className="admin-nav-count"
                aria-label={`${count} cần xử lý`}
              >
                {count > 99 ? "99+" : count}
              </span>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}
export function AdminLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const queueResult = useResource<AdminQueue>(
    user?.role === "ADMIN" ? "/admin/queue" : null,
  );
  const queue = queueResult.data?.data;
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
        <Link
          className="admin-brand"
          to="/quan-tri"
          aria-label="FindIt quản trị"
        >
          <BrandMark size={30} />
          <span>
            Find<b>It</b>
          </span>
        </Link>
        <span className="admin-label">QUẢN TRỊ HỆ THỐNG</span>
        <AdminNavigation queue={queue} />
        <div className="admin-rail-bottom">
          <div className="admin-identity">
            <span className="avatar">{user.fullName.slice(0, 1)}</span>
            <span>
              {user.fullName}
              <small>Quản trị viên</small>
            </span>
            <button
              type="button"
              className="admin-logout"
              aria-label="Đăng xuất"
              title="Đăng xuất"
              onClick={() => {
                logout();
                navigate("/");
              }}
            >
              <Icon name="exit" width="18" height="18" />
            </button>
          </div>
          <Link to="/">
            <Icon name="arrow" className="flip" />
            Về trang người dùng
          </Link>
        </div>
      </aside>
      <div className="admin-workspace">
        <header className={`admin-topbar${record ? " has-record" : ""}`}>
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
          <AdminNavigation close={() => setOpen(false)} queue={queue} />
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
