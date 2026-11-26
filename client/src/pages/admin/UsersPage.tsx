import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useResource } from "../../lib/hooks";
import { invalidate } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import type { AdminUser } from "../../lib/extended-types";
import {
  Button,
  ConfirmDialog,
  dateLabel,
  EmptyState,
  ErrorState,
  Loading,
  Pagination,
  Select,
  StatusBadge,
} from "../../components/ui";
import {
  AdminTitle,
  MutationError,
  Table,
  useAdminQuery,
  useMutation,
  SearchBox,
} from "./shared";

/** Status change with confirmation, shared by the side panel and detail page. */
function AccountActions({ user }: { user: AdminUser }) {
  const { user: current } = useAuth();
  const mutation = useMutation();
  const [confirm, setConfirm] = useState(false);
  const next = user.accountStatus === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
  const self = current?.id === user.id;
  return (
    <>
      <MutationError error={mutation.error} />
      {self && (
        <p className="notice">
          Đây là tài khoản của bạn. Không thể tự thay đổi trạng thái tài khoản.
        </p>
      )}
      <Button
        variant={next === "SUSPENDED" ? "danger" : "primary"}
        disabled={self || mutation.busy}
        onClick={() => setConfirm(true)}
      >
        {next === "SUSPENDED" ? "Đình chỉ tài khoản" : "Kích hoạt tài khoản"}
      </Button>
      {confirm && (
        <ConfirmDialog
          title={
            next === "SUSPENDED"
              ? "Đình chỉ tài khoản này?"
              : "Kích hoạt tài khoản này?"
          }
          close={() => setConfirm(false)}
          busy={mutation.busy}
          confirm={() => {
            void mutation
              .run(`/admin/users/${user.id}/status`, { status: next })
              .then((success) => {
                if (success) setConfirm(false);
              });
          }}
        >
          {mutation.error ||
            (next === "SUSPENDED"
              ? "Tài khoản sẽ không thể đăng nhập hoặc tiếp tục sử dụng FindIt, kể cả khi đang đăng nhập. Không thể đình chỉ quản trị viên đang hoạt động cuối cùng."
              : "Tài khoản có thể đăng nhập và sử dụng lại hệ thống.")}
        </ConfirmDialog>
      )}
    </>
  );
}
function UserSummary({ user }: { user: AdminUser }) {
  return (
    <>
      <header>
        <span className="avatar">{initial(user.fullName)}</span>
        <div>
          <h2>{user.fullName}</h2>
          <p>{user.email}</p>
        </div>
      </header>
      <div className="badge-row">
        <StatusBadge status={user.role} group="role" />
        <StatusBadge status={user.accountStatus} group="account" />
      </div>
      <dl className="admin-user-stats">
        <div>
          <dt>Bài đăng</dt>
          <dd>{user.stats?.items ?? "—"}</dd>
        </div>
        <div>
          <dt>Bị báo cáo</dt>
          <dd className={user.stats?.reports ? "admin-num-alert" : ""}>
            {user.stats?.reports ?? "—"}
          </dd>
        </div>
        <div>
          <dt>Yêu cầu đã gửi</dt>
          <dd>{user.stats?.claims ?? "—"}</dd>
        </div>
        <div>
          <dt>Tham gia</dt>
          <dd>{dateLabel(user.createdAt)}</dd>
        </div>
      </dl>
    </>
  );
}
const initial = (name: string) =>
  name.trim().slice(0, 1).toLocaleUpperCase("vi") || "?";

export function AdminUsersPage() {
  const filters = useAdminQuery(["accountStatus", "role", "keyword"]);
  const result = useResource<AdminUser[]>("/admin/users", filters.query);
  const chosen = filters.params.get("chon");
  const rows = result.data?.data ?? [];
  const selected = rows.find((user) => String(user.id) === chosen);
  const choose = (id: number | null) => {
    const next = new URLSearchParams(filters.params);
    if (id === null) next.delete("chon");
    else next.set("chon", String(id));
    filters.setParams(next, { replace: true });
  };
  const total = result.data?.pagination?.total;
  return (
    <>
      <AdminTitle title="Người dùng" />
      {total !== undefined && (
        <p className="admin-subtitle">
          {total.toLocaleString("vi-VN")} tài khoản
        </p>
      )}
      <div className="admin-filters">
        <SearchBox
          value={filters.params.get("keyword") || ""}
          change={(value) => filters.change("keyword", value)}
          placeholder="Tìm tên hoặc email…"
        />
        <Select
          label="Vai trò"
          value={filters.params.get("role") || ""}
          onChange={(e) => filters.change("role", e.target.value)}
        >
          <option value="">Tất cả vai trò</option>
          <option value="USER">Người dùng</option>
          <option value="ADMIN">Quản trị viên</option>
        </Select>
        <Select
          label="Trạng thái tài khoản"
          value={filters.params.get("accountStatus") || ""}
          onChange={(e) => filters.change("accountStatus", e.target.value)}
        >
          <option value="">Tất cả trạng thái</option>
          <option value="ACTIVE">Đang hoạt động</option>
          <option value="SUSPENDED">Đã đình chỉ</option>
        </Select>
      </div>
      <div className={`admin-users-layout${selected ? "" : " no-panel"}`}>
        <div>
          {result.loading ? (
            <Loading />
          ) : result.error ? (
            <ErrorState error={result.error} retry={invalidate} />
          ) : rows.length ? (
            <Table
              columns={[
                "Người dùng",
                "Vai trò",
                "Trạng thái",
                "Bài đăng",
                "Bị báo cáo",
                "",
              ]}
            >
              {rows.map((user) => (
                <tr
                  key={user.id}
                  className={user === selected ? "is-selected" : ""}
                >
                  <td>
                    <span className="admin-person">
                      <span className="avatar">{initial(user.fullName)}</span>
                      <span>
                        <strong>{user.fullName}</strong>
                        <small>{user.email}</small>
                      </span>
                    </span>
                  </td>
                  <td>
                    <StatusBadge status={user.role} group="role" />
                  </td>
                  <td>
                    <StatusBadge status={user.accountStatus} group="account" />
                  </td>
                  <td>{user.stats?.items ?? "—"}</td>
                  <td className={user.stats?.reports ? "admin-num-alert" : ""}>
                    {user.stats?.reports ?? "—"}
                  </td>
                  <td>
                    <Button
                      variant="secondary"
                      aria-pressed={user === selected}
                      onClick={() => choose(user === selected ? null : user.id)}
                    >
                      Chi tiết
                    </Button>
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <EmptyState title="Không có tài khoản phù hợp" />
          )}
          <Pagination data={result.data?.pagination} change={filters.page} />
        </div>
        {selected && (
          <aside
            className="admin-card admin-user-panel"
            aria-label={`Chi tiết ${selected.fullName}`}
          >
            <UserSummary user={selected} />
            <AccountActions user={selected} />
            <Link
              className="button secondary"
              to={`/quan-tri/nhat-ky?actorId=${selected.id}`}
            >
              Xem lịch sử hoạt động
            </Link>
            <Link
              className="button secondary"
              to={`/quan-tri/nguoi-dung/${selected.id}`}
            >
              Mở trang chi tiết
            </Link>
            <button
              type="button"
              className="link-button"
              onClick={() => choose(null)}
            >
              Đóng bảng
            </button>
          </aside>
        )}
      </div>
    </>
  );
}
export function AdminUserDetailPage() {
  const { id } = useParams();
  const result = useResource<AdminUser>(`/admin/users/${id}`);
  if (result.loading) return <Loading />;
  if (result.error)
    return <ErrorState error={result.error} retry={invalidate} />;
  const user = result.data?.data;
  if (!user) return null;
  return (
    <>
      <Link className="back-link" to="/quan-tri/nguoi-dung">
        ← Người dùng
      </Link>
      <AdminTitle title={`Tài khoản #${user.id}`} />
      <section className="admin-card admin-user-panel detail">
        <UserSummary user={user} />
        <AccountActions user={user} />
        <Link
          className="button secondary"
          to={`/quan-tri/nhat-ky?actorId=${user.id}`}
        >
          Xem lịch sử hoạt động
        </Link>
      </section>
    </>
  );
}
