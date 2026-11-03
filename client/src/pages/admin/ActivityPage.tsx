import { activityDetailLabel } from "../../lib/display-labels";
import { useResource } from "../../lib/hooks";
import { invalidate } from "../../lib/api";
import type { ActivityLog } from "../../lib/extended-types";
import {
  dateLabel,
  EmptyState,
  ErrorState,
  Input,
  Loading,
  Pagination,
  Select,
} from "../../components/ui";
import { AdminTitle, Table, useAdminQuery } from "./shared";
const actions: Record<string, string> = {
  ITEM_MODERATED_CLOSED: "Đóng bài đăng",
  CLAIM_ADMIN_RESOLVED: "Giải quyết tranh chấp yêu cầu nhận đồ",
  CLAIM_APPROVED: "Chấp thuận yêu cầu nhận đồ",
  CLAIM_REJECTED: "Từ chối yêu cầu nhận đồ",
  CLAIM_COMPLETED: "Hoàn tất bàn giao",
  USER_STATUS_CHANGED: "Đổi trạng thái tài khoản",
  REPORT_STATUS_CHANGED: "Đổi trạng thái báo cáo",
  CATEGORY_CREATED: "Tạo danh mục",
  CATEGORY_UPDATED: "Cập nhật danh mục",
  CATEGORY_DISABLED: "Ngừng danh mục",
  LOCATION_CREATED: "Tạo địa điểm",
  LOCATION_UPDATED: "Cập nhật địa điểm",
  LOCATION_DISABLED: "Ngừng địa điểm",
};
const entities: Record<string, string> = {
  ITEM: "Bài đăng",
  CLAIM: "Yêu cầu nhận đồ",
  USER: "Tài khoản",
  CATEGORY: "Danh mục",
  LOCATION: "Địa điểm",
  REPORT: "Báo cáo",
};
const detailLabels: Record<string, string> = {
  previousStatus: "Trạng thái trước",
  status: "Trạng thái sau",
  reason: "Lý do",
  source: "Nguồn quyết định",
  rejectedClaimCount: "Số yêu cầu nhận đồ bị từ chối",
  itemId: "Bài đăng",
  decision: "Quyết định",
  autoRejectedClaimCount: "Số yêu cầu nhận đồ tự động bị từ chối",
  decisionLogId: "Nhật ký quyết định",
  automatic: "Tự động",
};
export function AdminActivityPage() {
  const filters = useAdminQuery([
    "action",
    "entityType",
    "entityId",
    "actorId",
    "dateFrom",
    "dateTo",
    "sort",
  ]);
  const result = useResource<ActivityLog[]>(
    "/admin/activity-logs",
    filters.query,
  );
  return (
    <>
      <AdminTitle title="Nhật ký hoạt động" />
      <p className="muted">
        Ngày lọc tính theo giờ quốc tế (UTC), chậm hơn giờ Việt Nam 7 tiếng.
        Thời gian trong bảng hiển thị theo giờ Việt Nam.
      </p>
      <div className="admin-filters">
        <Select
          label="Hành động"
          value={filters.params.get("action") || ""}
          onChange={(e) => filters.change("action", e.target.value)}
        >
          <option value="">Tất cả hành động</option>
          {Object.entries(actions).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Select
          label="Loại đối tượng"
          value={filters.params.get("entityType") || ""}
          onChange={(e) => filters.change("entityType", e.target.value)}
        >
          <option value="">Tất cả đối tượng</option>
          {Object.entries(entities).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Input
          label="Mã đối tượng"
          type="number"
          min={1}
          step={1}
          value={filters.params.get("entityId") || ""}
          onChange={(e) => filters.change("entityId", e.target.value)}
        />
        <Input
          label="Mã người thực hiện"
          type="number"
          min={1}
          step={1}
          value={filters.params.get("actorId") || ""}
          onChange={(e) => filters.change("actorId", e.target.value)}
        />
        <Input
          label="Từ ngày (giờ quốc tế)"
          type="date"
          min="1000-01-01"
          max={filters.params.get("dateTo") || "9999-12-31"}
          value={filters.params.get("dateFrom") || ""}
          onChange={(e) => filters.change("dateFrom", e.target.value)}
        />
        <Input
          label="Đến ngày (giờ quốc tế)"
          type="date"
          min={filters.params.get("dateFrom") || "1000-01-01"}
          max="9999-12-31"
          value={filters.params.get("dateTo") || ""}
          onChange={(e) => filters.change("dateTo", e.target.value)}
        />
        <Select
          label="Thứ tự nhật ký"
          value={filters.params.get("sort") || "newest"}
          onChange={(e) => filters.change("sort", e.target.value)}
        >
          <option value="newest">Mới nhất</option>
          <option value="oldest">Cũ nhất</option>
        </Select>
      </div>
      {result.loading ? (
        <Loading />
      ) : result.error ? (
        <ErrorState error={result.error} retry={invalidate} />
      ) : result.data?.data.length ? (
        <Table
          columns={[
            "Hành động",
            "Đối tượng / Người thực hiện",
            "Thời gian",
            "Chi tiết",
          ]}
        >
          {result.data.data.map((log) => (
            <tr key={log.id}>
              <td>
                <strong>{actions[log.action] || "Hành động khác"}</strong>
                <small>Nhật ký #{log.id}</small>
              </td>
              <td>
                {entities[log.entityType] || "Đối tượng khác"}{" "}
                {log.entityId ? `#${log.entityId}` : ""}
                <small>
                  {log.actorId ? `Tài khoản #${log.actorId}` : "Hệ thống"}
                </small>
              </td>
              <td>
                {dateLabel(log.createdAt)}
                <small>
                  {new Intl.DateTimeFormat("vi-VN", {
                    timeStyle: "medium",
                    timeZone: "Asia/Ho_Chi_Minh",
                  }).format(new Date(log.createdAt))}
                </small>
              </td>
              <td>
                <dl className="log-details">
                  {Object.entries(log.details)
                    .filter(([key]) => key in detailLabels)
                    .map(([key, value]) => (
                      <div key={key}>
                        <dt>{detailLabels[key]}</dt>
                        <dd className="pre-wrap">
                          {activityDetailLabel(key, value, log.entityType)}
                        </dd>
                      </div>
                    ))}
                </dl>
                {Object.keys(log.details).length === 0 && (
                  <span className="muted">Không có chi tiết bổ sung</span>
                )}
              </td>
            </tr>
          ))}
        </Table>
      ) : (
        <EmptyState title="Không có nhật ký phù hợp" />
      )}
      <Pagination data={result.data?.pagination} change={filters.page} />
    </>
  );
}
