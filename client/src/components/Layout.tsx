import { Icon } from "./Icon";
import { useChat } from "../lib/chat";
import { useEffect, useRef, useState } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useNotifications } from "../lib/notifications";
import { Brand } from "./Brand";

const count = (value: number) => (value > 99 ? "99+" : String(value));

export function Layout() {
  const { user, logout } = useAuth();
  const chat = useChat();
  const notifications = useNotifications();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    setMenu(false);
    setOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent | MouseEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key !== "Escape") return;
        setOpen(false);
        toggleRef.current?.focus();
      } else if (
        !toggleRef.current?.contains(event.target as Node) &&
        !document.getElementById("navigation")?.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", close);
    document.addEventListener("mousedown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("mousedown", close);
    };
  }, [open]);
  useEffect(() => {
    if (!menu) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") setMenu(false);
        return;
      }
      if (!menuRef.current?.contains(event.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menu]);
  if (
    location.pathname === "/quan-tri" ||
    location.pathname.startsWith("/quan-tri/")
  )
    return <Outlet />;
  const bare = [
    "/dang-nhap",
    "/dang-ky",
    "/quen-mat-khau",
    "/dat-lai-mat-khau",
  ].includes(location.pathname);
  if (bare)
    return (
      <main id="main" className="auth-shell" tabIndex={-1}>
        <Outlet />
      </main>
    );
  const home = location.pathname === "/";
  const initial = user?.fullName.trim().slice(0, 1).toLocaleUpperCase("vi");
  return (
    <div className="app-bg">
      <a className="skip-link" href="#main">
        Đến nội dung chính
      </a>
      <header className="header">
        <div className="header-inner">
          <Brand />
          <nav
            id="navigation"
            className={open ? "navigation open" : "navigation"}
            aria-label="Điều hướng chính"
          >
            <NavLink to="/" end>
              Trang chủ
            </NavLink>
            <NavLink to="/kham-pha">Khám phá</NavLink>
            <NavLink to="/gioi-thieu">Giới thiệu</NavLink>
            <NavLink to="/lien-he">Liên hệ</NavLink>
          </nav>
          <div className="header-actions">
            {user ? (
              <>
                <Link className="button primary post-button" to="/dang-bai">
                  <Icon name="plus" width="17" height="17" /> Đăng tin
                </Link>
                <Link
                  className="header-icon"
                  to="/tin-nhan"
                  aria-label={`Tin nhắn, ${chat.unread} chưa đọc`}
                >
                  <Icon name="message" width="20" height="20" />
                  {chat.unread > 0 && (
                    <span className="header-count info">
                      {count(chat.unread)}
                    </span>
                  )}
                </Link>
                <Link
                  className="header-icon"
                  to="/thong-bao"
                  aria-label={
                    notifications.error
                      ? "Thông báo — chưa tải được số chưa đọc"
                      : `Thông báo, ${notifications.count} chưa đọc`
                  }
                >
                  <Icon name="bell" width="20" height="20" />
                  {notifications.count > 0 && (
                    <span className="header-count">
                      {count(notifications.count)}
                    </span>
                  )}
                </Link>
                <div className="account" ref={menuRef}>
                  <button
                    className="account-trigger"
                    aria-haspopup="menu"
                    aria-expanded={menu}
                    aria-label="Menu tài khoản"
                    onClick={() => setMenu((value) => !value)}
                  >
                    <span className="avatar">{initial}</span>
                    <Icon name="chevron" width="16" height="16" />
                  </button>
                  {menu && (
                    <div className="account-menu" role="menu">
                      <div className="account-head">
                        <span className="avatar large">{initial}</span>
                        <div>
                          <strong>{user.fullName}</strong>
                          <small>{user.email}</small>
                        </div>
                      </div>
                      <Link role="menuitem" to="/ho-so">
                        <Icon name="user" /> Hồ sơ của tôi
                      </Link>
                      <Link role="menuitem" to="/bai-dang-cua-toi">
                        <Icon name="box" /> Đồ của tôi
                      </Link>
                      <Link role="menuitem" to="/yeu-cau-cua-toi">
                        <Icon name="shield" /> Yêu cầu nhận đồ
                      </Link>
                      <Link role="menuitem" to="/bao-cao-cua-toi">
                        <Icon name="flag" /> Báo cáo của tôi
                      </Link>
                      {user.role === "ADMIN" && (
                        <Link role="menuitem" to="/quan-tri">
                          <Icon name="grid" /> Quản trị hệ thống
                        </Link>
                      )}
                      <button
                        role="menuitem"
                        className="danger-link"
                        onClick={() => {
                          logout();
                          navigate("/");
                        }}
                      >
                        <Icon name="exit" /> Đăng xuất
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <Link className="button secondary" to="/dang-nhap">
                  Đăng nhập
                </Link>
                <Link className="button primary" to="/dang-ky">
                  Đăng ký
                </Link>
              </>
            )}
            <button
              ref={toggleRef}
              className="mobile-toggle icon-button"
              aria-expanded={open}
              aria-controls="navigation"
              aria-label="Mở điều hướng"
              onClick={() => setOpen((value) => !value)}
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
            <Brand inverse />
            <p>Nền tảng tìm đồ thất lạc thông minh cho cộng đồng sinh viên.</p>
          </div>
          <nav aria-label="Liên kết cuối trang">
            <div>
              <strong>Khám phá</strong>
              <Link to="/kham-pha?type=LOST">Đồ bị mất</Link>
              <Link to="/kham-pha?type=FOUND">Đồ nhặt được</Link>
            </div>
            <div>
              <strong>Tài khoản</strong>
              <Link to="/dang-bai">Đăng tin</Link>
              <Link to={user ? "/yeu-cau-cua-toi" : "/dang-nhap"}>
                Yêu cầu nhận đồ
              </Link>
            </div>
            <div>
              <strong>Hỗ trợ</strong>
              <Link to="/gioi-thieu">Giới thiệu</Link>
              <Link to="/lien-he">Liên hệ</Link>
              <Link to="/gioi-thieu#quy-tac">Quy tắc cộng đồng</Link>
            </div>
          </nav>
        </div>
        <div className="footer-bottom">
          © {new Date().getFullYear()} FindIt · UIT
        </div>
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
        <NavLink className="bottom-post" to="/dang-bai" aria-label="Đăng tin">
          <Icon name="plus" width="24" height="24" />
        </NavLink>
        <NavLink to="/tin-nhan">
          <Icon name="message" />
          Tin nhắn
        </NavLink>
        <NavLink to={user ? "/ho-so" : "/dang-nhap"}>
          <Icon name="user" />
          {user ? "Tài khoản" : "Đăng nhập"}
        </NavLink>
      </nav>
    </div>
  );
}
