import { ChatProvider } from "./lib/chat";
import { MessagesPage } from "./pages/MessagesPage";
import { PasswordResetPage } from "./pages/PasswordResetPage";
import { lazy, StrictMode, Suspense, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, Protected } from "./lib/auth";
import { ToastProvider } from "./components/ui";
import { Layout } from "./components/Layout";
import { AccountShell } from "./components/AccountShell";
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
import { SearchFirstPage } from "./pages/SearchFirstPage";
import { AboutPage, ContactPage, NotFoundPage } from "./pages/StaticPages";
import "@fontsource/be-vietnam-pro/400.css";
import "@fontsource/be-vietnam-pro/500.css";
import "@fontsource/be-vietnam-pro/600.css";
import "@fontsource/be-vietnam-pro/700.css";
import "@fontsource/be-vietnam-pro/800.css";
import "@fontsource/caveat/700.css";
import "./styles.css";
import "./redesign.css";
import "./v3.css";
// The home page bundles GSAP; load it on demand so other pages stay light.
const HomePage = lazy(() =>
  import("./pages/HomePage").then((module) => ({ default: module.HomePage })),
);
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
                  <Route
                    index
                    element={
                      <Suspense
                        fallback={
                          <div className="state" role="status">
                            Đang tải trang chủ…
                          </div>
                        }
                      >
                        <HomePage />
                      </Suspense>
                    }
                  />
                  <Route path="kham-pha" element={<ExplorePage />} />
                  <Route path="gioi-thieu" element={<AboutPage />} />
                  <Route path="lien-he" element={<ContactPage />} />
                  <Route
                    path="dang-bai/tim-truoc"
                    element={<SearchFirstPage />}
                  />
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
                        <AccountShell>
                          <MessagesPage />
                        </AccountShell>
                      </Protected>
                    }
                  />
                  <Route path="dang-ky" element={<AuthPage register />} />
                  <Route path="do-vat/:id" element={<ItemDetailPage />} />
                  <Route
                    path="thong-bao"
                    element={
                      <Protected>
                        <AccountShell>
                          <NotificationsPage />
                        </AccountShell>
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
                        <AccountShell>
                          <MyReportsPage />
                        </AccountShell>
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
                        <AccountShell>
                          <MyItemsPage />
                        </AccountShell>
                      </Protected>
                    }
                  />
                  <Route
                    path="yeu-cau-cua-toi"
                    element={
                      <Protected>
                        <AccountShell>
                          <MyClaimsPage />
                        </AccountShell>
                      </Protected>
                    }
                  />
                  <Route path="*" element={<NotFoundPage />} />
                </Route>
              </Routes>
            </NotificationsProvider>
          </ChatProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
