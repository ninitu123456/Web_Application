import { useChat } from "../lib/chat";
import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useNotifications } from "../lib/notifications";
export function Layout() {
  const { user, logout } = useAuth();
  const chat = useChat();
  const notifications = useNotifications();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  return (
    <>
      <a className="skip-link" href="#main">
        Đến nội dung chính
      </a>
      <header className="header">
        <Link className="brand" to="/" aria-label="FindIt — Trang chủ">
          <span className="brand-mark" aria-hidden="true">
            f<span>·</span>
          </span>
          FindIt<span className="brand-dot">.</span>
        </Link>
        <button
          className="mobile-toggle icon-button"
          aria-expanded={open}
          aria-controls="navigation"
          aria-label="Mở điều hướng"
          onClick={() => setOpen(!open)}
        >
          ☰
        </button>
        <nav
          id="navigation"
          className={open ? "navigation open" : "navigation"}
          aria-label="Điều hướng chính"
          onClick={() => setOpen(false)}
        >
          <NavLink to="/" end>
            Khám phá
          </NavLink>
          {user && (
            <>
              <NavLink to="/bai-dang-cua-toi">Bài đăng của tôi</NavLink>
              <NavLink to="/tin-nhan">
                Tin nhắn {chat.unread > 0 ? `(${chat.unread})` : ""}
              </NavLink>
              <NavLink to="/yeu-cau-cua-toi">Yêu cầu đã gửi</NavLink>
            </>
          )}
        </nav>
        <div className="header-actions">
          {user && (
            <Link
              className="notification-bell"
              to="/thong-bao"
              aria-label={
                notifications.error
                  ? "Thông báo — chưa tải được số chưa đọc"
                  : `Thông báo, ${notifications.count} chưa đọc`
              }
            >
              <svg
                aria-hidden="true"
                width="21"
                height="21"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              >
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
              </svg>
              {notifications.count > 0 && (
                <span className="notification-count">
                  {notifications.count > 99 ? "99+" : notifications.count}
                </span>
              )}
            </Link>
          )}
          <Link className="button primary" to="/dang-bai">
            ＋ Đăng bài
          </Link>
          {user ? (
            <details className="account">
              <summary aria-label="Menu tài khoản">
                <span className="avatar">
                  {user.fullName.slice(0, 1).toLocaleUpperCase("vi")}
                </span>
                <span className="account-name">{user.fullName}</span>
                <span aria-hidden="true">⌄</span>
              </summary>
              <div className="account-menu">
                <strong>{user.fullName}</strong>
                <small>{user.email}</small>
                <Link to="/tin-nhan">Tin nhắn</Link>
                <Link to="/ho-so">Hồ sơ cá nhân</Link>
                <Link to="/thong-bao">Thông báo</Link>
                <Link to="/bai-dang-cua-toi">Bài đăng của tôi</Link>
                <Link to="/yeu-cau-cua-toi">Yêu cầu đã gửi</Link>
                <Link to="/bao-cao-cua-toi">Báo cáo của tôi</Link>
                {user.role === "ADMIN" && (
                  <Link to="/quan-tri">Quản trị hệ thống</Link>
                )}
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
          ) : (
            <Link className="login-link" to="/dang-nhap">
              Đăng nhập ↗
            </Link>
          )}
        </div>
      </header>
      <main id="main" className="main" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="footer">
        <Link className="brand" to="/">
          FindIt.
        </Link>
        <p>Mỗi món đồ tìm lại, một niềm vui được trao.</p>
        <span>Kết nối trong khuôn viên trường.</span>
      </footer>
    </>
  );
}
