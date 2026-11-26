import { Link, useSearchParams } from "react-router-dom";
import { useResource } from "../lib/hooks";
import { invalidate } from "../lib/api";
import type { Item, ItemStatus, UserStats } from "../lib/types";
import { itemProgress } from "../components/OverviewWidgets";
import { Icon } from "../components/Icon";
import {
  dateLabel,
  EmptyState,
  ErrorState,
  ItemImage,
  Loading,
  Pagination,
  StatusBadge,
} from "../components/ui";
export function MyItemsPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get("trang-thai") || "";
  const type = params.get("loai") || "";
  const result = useResource<Item[]>("/items/mine", {
    page: params.get("page") || "1",
    limit: 12,
    status: status || undefined,
    type: type || undefined,
  });
  const stats = useResource<UserStats>("/users/me/stats").data?.data;
  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    setParams(next);
  };
  const chips: [string, string, number | undefined][] = [
    ["", "Tất cả", stats?.posts.total],
    ...(
      [
        ["OPEN", "Đang mở"],
        ["CLAIM_PENDING", "Chờ duyệt"],
        ["CLAIMED", "Chờ bàn giao"],
        ["RETURNED", "Đã trao lại"],
        ["CLOSED", "Đã đóng"],
      ] as [ItemStatus, string][]
    ).map(
      ([key, label]) =>
        [key, label, stats?.posts.byStatus?.[key]] as [
          string,
          string,
          number | undefined,
        ],
    ),
  ];
  const total = result.data?.pagination?.total;
  return (
    <section className="page-section my-page">
      <div className="section-heading">
        <div>
          <h1>Đồ của tôi</h1>
          <p className="muted">
            {typeof total === "number"
              ? `${total} bài đăng · sửa, đóng bài và xử lý yêu cầu nhận lại ngay tại đây.`
              : "Sửa, đóng bài và xử lý yêu cầu nhận lại ngay tại đây."}
          </p>
        </div>
        <Link className="button primary" to="/dang-bai">
          <Icon name="plus" width="17" height="17" /> Đăng tin mới
        </Link>
      </div>
      <div className="my-filters">
        <div className="chip-row" role="group" aria-label="Lọc theo trạng thái">
          {chips.map(([key, label, count]) => (
            <button
              key={key || "all"}
              type="button"
              aria-pressed={status === key}
              onClick={() => setFilter("trang-thai", key)}
            >
              {label}
              {count !== undefined && <span>{count}</span>}
            </button>
          ))}
        </div>
        <div className="segmented" role="group" aria-label="Lọc theo loại tin">
          {[
            ["", "Mọi loại"],
            ["LOST", "Bị mất"],
            ["FOUND", "Nhặt được"],
          ].map(([key, label]) => (
            <button
              key={key || "all"}
              type="button"
              aria-pressed={type === key}
              onClick={() => setFilter("loai", key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {result.loading ? (
        <Loading />
      ) : result.error ? (
        <ErrorState error={result.error} retry={invalidate} />
      ) : result.data?.data.length ? (
        <div className="my-list">
          {result.data.data.map((item) => {
            const editable =
              item.status === "OPEN" && item.visibility !== "HIDDEN";
            return (
              <article key={item.id} className="my-row">
                <Link
                  className="my-row-image"
                  to={`/do-vat/${item.id}`}
                  tabIndex={-1}
                  aria-hidden="true"
                >
                  <ItemImage src={item.images[0]?.url} title={item.title} />
                </Link>
                <div className="my-row-body">
                  <div className="badge-row">
                    <StatusBadge status={item.type} group="itemType" />
                    <StatusBadge status={item.status} group="item" />
                    {item.visibility === "HIDDEN" && (
                      <span className="badge">Đã gỡ khỏi công khai</span>
                    )}
                  </div>
                  <h2>
                    <Link to={`/do-vat/${item.id}`}>{item.title}</Link>
                  </h2>
                  <small>
                    {item.location?.name || `Địa điểm #${item.locationId}`} ·{" "}
                    {dateLabel(item.eventDate)} · Bài #{item.id}
                  </small>
                  <p className="card-note">{itemProgress(item)}</p>
                </div>
                <div className="my-item-actions">
                  {item.type === "FOUND" && (
                    <Link
                      className={
                        item.status === "CLAIM_PENDING" ? "primary-action" : ""
                      }
                      to={
                        item.status === "CLAIMED"
                          ? "/yeu-cau-cua-toi?tab=gui-den-toi"
                          : `/do-vat/${item.id}?tab=claims`
                      }
                    >
                      {item.status === "CLAIM_PENDING"
                        ? "Duyệt yêu cầu"
                        : item.status === "CLAIMED"
                          ? "Hẹn bàn giao"
                          : "Yêu cầu nhận đồ"}
                    </Link>
                  )}
                  {editable && (
                    <Link to={`/do-vat/${item.id}/sua`}>Sửa bài</Link>
                  )}
                  <Link
                    to={`/do-vat/${item.id}`}
                    aria-label={`${editable ? "Chi tiết và đóng bài" : "Chi tiết"} ${item.title}`}
                  >
                    {editable ? "Chi tiết / Đóng bài" : "Chi tiết"}
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title={
            status || type
              ? "Không có tin nào khớp bộ lọc"
              : "Bạn chưa có bài đăng nào"
          }
        >
          <Link className="button secondary" to="/dang-bai">
            Đăng bài đầu tiên ↗
          </Link>
        </EmptyState>
      )}
      <Pagination
        data={result.data?.pagination}
        change={(page) => setParams({ page: String(page) })}
      />
    </section>
  );
}
