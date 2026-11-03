import { statusLabel } from "../../lib/display-labels";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useResource } from "../../lib/hooks";
import { invalidate } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { adminHasClaim } from "../../lib/claim-inspection";
import type { Item } from "../../lib/types";
import {
  Button,
  dateLabel,
  EmptyState,
  ErrorState,
  ItemImage,
  Loading,
  Pagination,
  Select,
  StatusBadge,
} from "../../components/ui";
import {
  AdminTitle,
  ReasonDialog,
  Table,
  useAdminQuery,
  useMutation,
} from "./shared";
export function AdminItemsPage() {
  const filters = useAdminQuery(["type", "status"]);
  const result = useResource<Item[]>("/admin/items", filters.query);
  return (
    <>
      <AdminTitle title="Bài đăng" />
      <div className="admin-filters">
        <Select
          label="Loại bài"
          value={filters.params.get("type") || ""}
          onChange={(e) => filters.change("type", e.target.value)}
        >
          <option value="">Tất cả loại bài</option>
          <option value="LOST">Đồ bị mất</option>
          <option value="FOUND">Đồ nhặt được</option>
        </Select>
        <Select
          label="Trạng thái bài"
          value={filters.params.get("status") || ""}
          onChange={(e) => filters.change("status", e.target.value)}
        >
          <option value="">Tất cả trạng thái</option>
          {["OPEN", "CLAIM_PENDING", "CLAIMED", "RETURNED", "CLOSED"].map(
            (status) => (
              <option key={status} value={status}>
                {statusLabel(status, "item")}
              </option>
            ),
          )}
        </Select>
      </div>
      {result.loading ? (
        <Loading />
      ) : result.error ? (
        <ErrorState error={result.error} retry={invalidate} />
      ) : result.data?.data.length ? (
        <Table columns={["Bài đăng", "Loại", "Trạng thái", "Thao tác"]}>
          {result.data.data.map((item) => (
            <tr key={item.id}>
              <td>
                <strong>{item.title}</strong>
                <small>
                  #{item.id} · Chủ bài #{item.userId}
                </small>
              </td>
              <td>
                <StatusBadge status={item.type} group="itemType" />
              </td>
              <td>
                <StatusBadge status={item.status} group="item" />
              </td>
              <td>
                <Link to={`/quan-tri/bai-dang/${item.id}`}>Kiểm tra ↗</Link>
              </td>
            </tr>
          ))}
        </Table>
      ) : (
        <EmptyState title="Không có bài đăng phù hợp" />
      )}
      <Pagination data={result.data?.pagination} change={filters.page} />
    </>
  );
}
export function useRecusal(
  itemId: number | undefined,
  ownerId: number | undefined,
) {
  const { user } = useAuth();
  const scope = `${itemId}:${ownerId}:${user?.id}`;
  const [state, setState] = useState<{
    related?: boolean;
    error?: unknown;
    loading: boolean;
    scope?: string;
  }>({ loading: true });
  useEffect(() => {
    const controller = new AbortController();
    if (!itemId || !user) return;
    if (ownerId === user.id) {
      setState({ related: true, loading: false, scope });
      return;
    }
    setState({ loading: true, scope });
    adminHasClaim(itemId, user.id, controller.signal).then(
      (related) => {
        if (!controller.signal.aborted)
          setState({ related, loading: false, scope });
      },
      (error: unknown) => {
        if (!controller.signal.aborted)
          setState({ error, loading: false, scope });
      },
    );
    return () => controller.abort();
  }, [itemId, ownerId, user?.id, scope]);
  return state.scope === scope ? state : { loading: true };
}
export function RecusalNotice({
  related,
  error,
  loading,
}: {
  related?: boolean;
  error?: unknown;
  loading: boolean;
}) {
  return loading ? (
    <p className="fine-print">
      Đang kiểm tra bạn có liên quan đến bài đăng này hay không…
    </p>
  ) : related ? (
    <p className="notice">
      Bạn là chủ bài hoặc đã gửi yêu cầu nhận đồ cho bài này. Cần quản trị viên
      khác xử lý.
    </p>
  ) : error ? (
    <p className="notice">
      Chưa kiểm tra được bạn có liên quan đến bài đăng này hay không. Hệ thống
      sẽ kiểm tra quyền của bạn khi xử lý quyết định.
    </p>
  ) : null;
}
export function AdminItemDetailPage() {
  const { id } = useParams();
  const result = useResource<Item>(`/admin/items/${id}`);
  const item = result.data?.data;
  const recusal = useRecusal(item?.id, item?.userId);
  const mutation = useMutation();
  const [open, setOpen] = useState(false);
  if (result.loading) return <Loading />;
  if (result.error)
    return <ErrorState error={result.error} retry={invalidate} />;
  if (!item) return null;
  const eligible =
    item.status === "OPEN" ||
    (item.type === "FOUND" && item.status === "CLAIM_PENDING");
  return (
    <>
      <Link className="back-link" to="/quan-tri/bai-dang">
        ← Bài đăng
      </Link>
      <AdminTitle title={`Bài đăng #${item.id}`} />
      <section className="panel">
        <h2>{item.title}</h2>
        <div className="badge-row">
          <StatusBadge status={item.type} group="itemType" />
          <StatusBadge status={item.status} group="item" />
        </div>
        <div className="admin-item-images">
          {item.images.map((image) => (
            <ItemImage key={image.id} src={image.url} title={item.title} />
          ))}
        </div>
        <p className="pre-wrap">{item.description}</p>
        <dl className="summary-list">
          <div>
            <dt>Chủ bài</dt>
            <dd>
              <Link to={`/quan-tri/nguoi-dung/${item.userId}`}>
                Tài khoản #{item.userId} ↗
              </Link>
            </dd>
          </div>
          <div>
            <dt>Danh mục / địa điểm</dt>
            <dd>
              {item.category?.name} / {item.location?.name}
            </dd>
          </div>
          <div>
            <dt>Ngày xảy ra</dt>
            <dd>{dateLabel(item.eventDate)}</dd>
          </div>
        </dl>
        <p className="notice">
          Đóng bài không xóa hoặc ẩn nội dung công khai. Nếu bài đăng đồ nhặt
          được đang chờ xác minh, tất cả yêu cầu nhận đồ đang chờ duyệt sẽ bị từ
          chối.
        </p>
        <RecusalNotice {...recusal} />
        <div className="actions">
          <Link className="button secondary" to={`/do-vat/${item.id}`}>
            Xem công khai ↗
          </Link>
          {item.type === "FOUND" && (
            <Link
              className="button secondary"
              to={`/quan-tri/claims?itemId=${item.id}`}
            >
              Xem yêu cầu nhận đồ
            </Link>
          )}
          <Button
            variant="danger"
            disabled={
              !eligible ||
              recusal.related === true ||
              recusal.loading ||
              mutation.busy
            }
            onClick={() => setOpen(true)}
          >
            Đóng bài có lý do
          </Button>
        </div>
      </section>
      {open && (
        <ReasonDialog
          title="Xác nhận đóng bài"
          close={() => setOpen(false)}
          busy={mutation.busy}
          error={mutation.error}
          submit={async (reason) => {
            if (await mutation.run(`/admin/items/${item.id}/close`, { reason }))
              setOpen(false);
          }}
        >
          Bài đăng sẽ ngừng nhận yêu cầu và gợi ý đồ vật liên quan. Các yêu cầu
          nhận đồ đang chờ duyệt sẽ bị từ chối. Nội dung vẫn có thể xem công
          khai.
        </ReasonDialog>
      )}
    </>
  );
}
