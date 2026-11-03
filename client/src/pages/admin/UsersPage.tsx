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
} from "./shared";
export function AdminUsersPage() {
  const filters = useAdminQuery(["accountStatus", "role"]);
  const result = useResource<AdminUser[]>("/admin/users", filters.query);
  return (
    <>
      <AdminTitle title="Người dùng" />
      <div className="admin-filters">
        <Select
          label="Trạng thái tài khoản"
          value={filters.params.get("accountStatus") || ""}
          onChange={(e) => filters.change("accountStatus", e.target.value)}
        >
          <option value="">Tất cả trạng thái</option>
          <option value="ACTIVE">Đang hoạt động</option>
          <option value="SUSPENDED">Đã đình chỉ</option>
        </Select>
        <Select
          label="Vai trò"
          value={filters.params.get("role") || ""}
          onChange={(e) => filters.change("role", e.target.value)}
        >
          <option value="">Tất cả vai trò</option>
          <option value="USER">Người dùng</option>
          <option value="ADMIN">Quản trị viên</option>
        </Select>
      </div>
      {result.loading ? (
        <Loading />
      ) : result.error ? (
        <ErrorState error={result.error} retry={invalidate} />
      ) : result.data?.data.length ? (
        <Table columns={["Người dùng", "Vai trò", "Trạng thái", "Thao tác"]}>
          {result.data.data.map((user) => (
            <tr key={user.id}>
              <td>
                <strong>{user.fullName}</strong>
                <small>{user.email}</small>
              </td>
              <td>
                <StatusBadge status={user.role} group="role" />
              </td>
              <td>
                <StatusBadge status={user.accountStatus} group="account" />
              </td>
              <td>
                <Link to={`/quan-tri/nguoi-dung/${user.id}`}>
                  Xem chi tiết ↗
                </Link>
              </td>
            </tr>
          ))}
        </Table>
      ) : (
        <EmptyState title="Không có tài khoản phù hợp" />
      )}
      <Pagination data={result.data?.pagination} change={filters.page} />
    </>
  );
}
export function AdminUserDetailPage() {
  const { id } = useParams();
  const { user: current } = useAuth();
  const result = useResource<AdminUser>(`/admin/users/${id}`);
  const mutation = useMutation();
  const [confirm, setConfirm] = useState(false);
  if (result.loading) return <Loading />;
  if (result.error)
    return <ErrorState error={result.error} retry={invalidate} />;
  const user = result.data?.data;
  if (!user) return null;
  const next = user.accountStatus === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
  const self = current?.id === user.id;
  return (
    <>
      <Link className="back-link" to="/quan-tri/nguoi-dung">
        ← Người dùng
      </Link>
      <AdminTitle title={`Tài khoản #${user.id}`} />
      <section className="panel">
        <h2>{user.fullName}</h2>
        <p>{user.email}</p>
        <div className="badge-row">
          <StatusBadge status={user.role} group="role" />
          <StatusBadge status={user.accountStatus} group="account" />
        </div>
        <dl className="summary-list">
          <div>
            <dt>Ngày tạo</dt>
            <dd>{dateLabel(user.createdAt)}</dd>
          </div>
          <div>
            <dt>Cập nhật</dt>
            <dd>{dateLabel(user.updatedAt)}</dd>
          </div>
        </dl>
        <MutationError error={mutation.error} />
        {self && (
          <p className="notice">
            Đây là tài khoản của bạn. Không thể tự thay đổi trạng thái tài
            khoản.
          </p>
        )}
        <Button
          variant={next === "SUSPENDED" ? "danger" : "primary"}
          disabled={self || mutation.busy}
          onClick={() => setConfirm(true)}
        >
          {next === "SUSPENDED" ? "Đình chỉ tài khoản" : "Kích hoạt tài khoản"}
        </Button>
      </section>
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
              .run(`/admin/users/${id}/status`, { status: next })
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
