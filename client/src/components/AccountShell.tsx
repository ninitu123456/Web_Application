import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { Icon } from "./Icon";
import { useAuth } from "../lib/auth";
import { useChat } from "../lib/chat";
import { useNotifications } from "../lib/notifications";

const TABS = [
  { to: "/ho-so", icon: "grid", label: "Tổng quan" },
  { to: "/bai-dang-cua-toi", icon: "box", label: "Đồ của tôi" },
  { to: "/yeu-cau-cua-toi", icon: "shield", label: "Yêu cầu nhận đồ" },
  { to: "/da-luu", icon: "heart", label: "Đã lưu" },
  { to: "/tin-nhan", icon: "message", label: "Tin nhắn" },
  { to: "/thong-bao", icon: "bell", label: "Thông báo" },
  { to: "/bao-cao-cua-toi", icon: "flag", label: "Báo cáo của tôi" },
] as const;

/** Header and tab bar shared by every page in the personal area. */
export function AccountShell({
  children,
  hub = false,
}: {
  children: ReactNode;
  hub?: boolean;
}) {
  const { user } = useAuth();
  const chat = useChat();
  const notifications = useNotifications();
  const counts: Record<string, number> = {
    "/tin-nhan": chat.unread,
    "/thong-bao": notifications.count,
  };
  const tabs = (
    <nav className="account-tabs" aria-label="Khu tài khoản">
      {TABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to} end>
          <Icon name={tab.icon} width="17" height="17" />
          {tab.label}
          {counts[tab.to] > 0 && (
            <span className="tab-count">
              {counts[tab.to] > 99 ? "99+" : counts[tab.to]}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );
  return (
    <div className="account-page">
      {hub ? (
        <div className="account-hub glass">
          <div className="hub-cover" aria-hidden="true" />
          <div className="hub-row">
            <span className="hub-avatar">
              {user?.fullName.trim().slice(0, 1).toLocaleUpperCase("vi")}
            </span>
            <div className="hub-name">
              <h1>{user?.fullName}</h1>
              <p>
                {user?.email}
                {user?.role === "ADMIN" && " · Quản trị viên"}
              </p>
            </div>
            <Link className="button secondary" to="/ho-so#cai-dat">
              <Icon name="cog" /> Cài đặt tài khoản
            </Link>
          </div>
          {tabs}
        </div>
      ) : (
        <div className="account-bar glass">{tabs}</div>
      )}
      <div className="account-content">{children}</div>
    </div>
  );
}
