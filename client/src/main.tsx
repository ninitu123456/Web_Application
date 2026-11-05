import { ChatProvider } from "./lib/chat";
import { MessagesPage } from "./pages/MessagesPage";
import { PasswordResetPage } from "./pages/PasswordResetPage";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Link,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { AuthProvider, Protected } from "./lib/auth";
import { ToastProvider } from "./components/ui";
import { Layout } from "./components/Layout";
import { ExplorePage } from "./pages/ExplorePage";
import { AuthPage } from "./pages/AuthPage";
import { ItemDetailPage } from "./pages/ItemDetailPage";
import { ItemFormPage } from "./pages/ItemFormPage";
import { MyItemsPage } from "./pages/MyItemsPage";
import { MyClaimsPage } from "./pages/Claims";
import { NotificationsProvider } from "./lib/notifications";
import { NotificationsPage } from "./pages/NotificationsPage";
import { ProfilePage } from "./pages/ProfilePage";
import { MyReportsPage } from "./pages/MyReportsPage";
import { AdminLayout } from "./pages/admin/AdminLayout";
import { DashboardPage } from "./pages/admin/DashboardPage";
import { AdminUsersPage, AdminUserDetailPage } from "./pages/admin/UsersPage";
import { AdminItemsPage, AdminItemDetailPage } from "./pages/admin/ItemsPage";
import { AdminClaimsPage } from "./pages/admin/ClaimsPage";
import {
  AdminReportsPage,
  AdminReportDetailPage,
} from "./pages/admin/ReportsPage";
import { AdminLookupsPage } from "./pages/admin/LookupsPage";
import { AdminActivityPage } from "./pages/admin/ActivityPage";
import "./styles.css";
function ScrollToTop() {
  const location = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);
  return null;
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <ChatProvider>
            <NotificationsProvider>
              <ScrollToTop />
              <Routes>
                <Route element={<Layout />}>
                  <Route index element={<ExplorePage />} />
                  <Route path="dang-nhap" element={<AuthPage />} />
                  <Route path="quen-mat-khau" element={<PasswordResetPage />} />
                  <Route
                    path="dat-lai-mat-khau"
                    element={<PasswordResetPage reset />}
                  />
                  <Route
                    path="tin-nhan"
                    element={
                      <Protected>
                        <MessagesPage />
                      </Protected>
                    }
                  />
                  <Route path="dang-ky" element={<AuthPage register />} />
                  <Route path="do-vat/:id" element={<ItemDetailPage />} />
                  <Route
                    path="thong-bao"
                    element={
                      <Protected>
                        <NotificationsPage />
                      </Protected>
                    }
                  />
                  <Route
                    path="ho-so"
                    element={
                      <Protected>
                        <ProfilePage />
                      </Protected>
                    }
                  />
                  <Route
                    path="bao-cao-cua-toi"
                    element={
                      <Protected>
                        <MyReportsPage />
                      </Protected>
                    }
                  />
                  <Route
                    path="quan-tri"
                    element={
                      <Protected>
                        <AdminLayout />
                      </Protected>
                    }
                  >
                    <Route index element={<DashboardPage />} />
                    <Route path="nguoi-dung" element={<AdminUsersPage />} />
                    <Route
                      path="nguoi-dung/:id"
                      element={<AdminUserDetailPage />}
                    />
                    <Route path="bai-dang" element={<AdminItemsPage />} />
                    <Route
                      path="bai-dang/:id"
                      element={<AdminItemDetailPage />}
                    />
                    <Route path="claims" element={<AdminClaimsPage />} />
                    <Route path="bao-cao" element={<AdminReportsPage />} />
                    <Route
                      path="bao-cao/:id"
                      element={<AdminReportDetailPage />}
                    />
                    <Route
                      path="danh-muc-dia-diem"
                      element={<AdminLookupsPage />}
                    />
                    <Route path="nhat-ky" element={<AdminActivityPage />} />
                  </Route>
                  <Route
                    path="dang-bai"
                    element={
                      <Protected>
                        <ItemFormPage />
                      </Protected>
                    }
                  />
                  <Route
                    path="do-vat/:id/sua"
                    element={
                      <Protected>
                        <ItemFormPage />
                      </Protected>
                    }
                  />
                  <Route
                    path="bai-dang-cua-toi"
                    element={
                      <Protected>
                        <MyItemsPage />
                      </Protected>
                    }
                  />
                  <Route
                    path="yeu-cau-cua-toi"
                    element={
                      <Protected>
                        <MyClaimsPage />
                      </Protected>
                    }
                  />
                  <Route
                    path="*"
                    element={
                      <div className="state">
                        <h1>Không tìm thấy trang</h1>
                        <Link className="button primary" to="/">
                          Về trang chủ →
                        </Link>
                      </div>
                    }
                  />
                </Route>
              </Routes>
            </NotificationsProvider>
          </ChatProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
