import { Icon } from "./Icon";
import { useChat } from "../lib/chat";
import { useState } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useNotifications } from "../lib/notifications";
export function Layout() {
  const { user, logout } = useAuth();
  const chat = useChat();
  const notifications = useNotifications();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  if (
    location.pathname === "/quan-tri" ||
    location.pathname.startsWith("/quan-tri/")
  )
    return <Outlet />;
  const home = location.pathname === "/";
  return (
    <>
      <a className="skip-link" href="#main">
        Đến nội dung chính
      </a>
      <header className="header">
        <div className="header-inner">
          <Link className="brand" to="/" aria-label="FindIt — Trang chủ">
            <span className="brand-mark" aria-hidden="true">
              <Icon name="pin" />
            </span>
            <span>
              FindIt<span className="brand-dot">.</span>
            </span>
          </Link>
          <nav
            id="navigation"
            className={open ? "navigation open" : "navigation"}
            aria-label="Điều hướng chính"
            onClick={() => setOpen(false)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setOpen(false);
                document
                  .querySelector<HTMLButtonElement>(".mobile-toggle")
                  ?.focus();
              }
            }}
          >
            <NavLink to="/" end>
              Trang chủ
            </NavLink>
            <NavLink to="/kham-pha">Khám phá</NavLink>
            {user && (
              <>
                <NavLink to="/bai-dang-cua-toi">Bài của tôi</NavLink>
                <NavLink to="/tin-nhan">
                  Tin nhắn
                  {chat.unread > 0 && (
                    <span className="nav-count">
                      {chat.unread > 99 ? "99+" : chat.unread}
                    </span>
                  )}
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
                <Icon name="bell" width="21" height="21" />
                {notifications.count > 0 && (
                  <span className="notification-count">
                    {notifications.count > 99 ? "99+" : notifications.count}
                  </span>
                )}
              </Link>
            )}
            <Link className="button primary post-button" to="/dang-bai">
              <Icon name="plus" width="17" height="17" /> Đăng bài
            </Link>
            {user ? (
              <details className="account">
                <summary aria-label="Menu tài khoản">
                  <span className="avatar">
                    {user.fullName.slice(0, 1).toLocaleUpperCase("vi")}
                  </span>
                  <span className="account-name">{user.fullName}</span>
                  <Icon name="chevron" width="14" height="14" />
                </summary>
                <div className="account-menu">
                  <strong>{user.fullName}</strong>
                  <small>{user.email}</small>
                  <Link to="/ho-so">Hồ sơ cá nhân</Link>
                  <Link to="/bai-dang-cua-toi">Bài đăng của tôi</Link>
                  <Link to="/yeu-cau-cua-toi">Yêu cầu đã gửi</Link>
                  <Link to="/tin-nhan">Tin nhắn</Link>
                  <Link to="/thong-bao">Thông báo</Link>
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
                Đăng nhập
              </Link>
            )}
            <button
              className="mobile-toggle icon-button"
              aria-expanded={open}
              aria-controls="navigation"
              aria-label="Mở điều hướng"
              onClick={() => {
                const next = !open;
                setOpen(next);
                // The toggle sits after <nav> in DOM order, so move focus into
                // the opened menu; otherwise Tab skips past its links.
                if (next)
                  requestAnimationFrame(() =>
                    document
                      .querySelector<HTMLAnchorElement>("#navigation a")
                      ?.focus(),
                  );
              }}
            >
              <Icon name={open ? "close" : "menu"} />
            </button>
          </div>
        </div>
      </header>
      <main
        id="main"
        className={home ? "main main-wide" : "main"}
        tabIndex={-1}
      >
        <Outlet />
      </main>
      <footer className="footer">
        <div className="footer-inner">
          <div>
            <Link className="brand" to="/">
              FindIt<span className="brand-dot">.</span>
            </Link>
            <p>Tìm và trao trả đồ thất lạc trong khuôn viên trường.</p>
          </div>
          <nav aria-label="Liên kết cuối trang">
            <div>
              <strong>Khám phá</strong>
              <Link to="/kham-pha?type=LOST">Đồ bị mất</Link>
              <Link to="/kham-pha?type=FOUND">Đồ nhặt được</Link>
            </div>
            <div>
              <strong>Đăng bài</strong>
              <Link to="/dang-bai?type=LOST">Báo mất đồ</Link>
              <Link to="/dang-bai?type=FOUND">Báo nhặt được</Link>
            </div>
            <div>
              <strong>Tài khoản</strong>
              {user ? (
                <Link to="/ho-so">Hồ sơ cá nhân</Link>
              ) : (
                <Link to="/dang-nhap">Đăng nhập</Link>
              )}
              <Link to="/bai-dang-cua-toi">Bài của tôi</Link>
            </div>
          </nav>
        </div>
        <div className="footer-bottom">© 2026 FindIt · Đồ án môn học</div>
      </footer>
      <nav className="bottom-nav" aria-label="Điều hướng nhanh">
        <NavLink to="/" end>
          <Icon name="home" />
          Trang chủ
        </NavLink>
        <NavLink to="/kham-pha">
          <Icon name="search" />
          Khám phá
        </NavLink>
        <NavLink className="bottom-post" to="/dang-bai" aria-label="Đăng bài">
          <Icon name="plus" width="24" height="24" />
        </NavLink>
        <NavLink to="/tin-nhan">
          <Icon name="message" />
          Tin nhắn
        </NavLink>
        <NavLink to={user ? "/bai-dang-cua-toi" : "/dang-nhap"}>
          <Icon name="user" />
          {user ? "Của tôi" : "Đăng nhập"}
        </NavLink>
      </nav>
    </>
  );
}
