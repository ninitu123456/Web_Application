import { Link } from "react-router-dom";
import { invalidate } from "../../lib/api";
import { useResource } from "../../lib/hooks";
import type {
  ContactMessage,
  ContactTopic,
  HandoverDispute,
} from "../../lib/types";
import {
  Button,
  dateLabel,
  EmptyState,
  ErrorState,
  Loading,
  Pagination,
  Select,
} from "../../components/ui";
import {
  AdminTitle,
  MutationError,
  Table,
  useAdminQuery,
  useMutation,
} from "./shared";

export const CONTACT_TOPICS: Record<ContactTopic, string> = {
  GENERAL: "Câu hỏi chung",
  ACCOUNT: "Tài khoản",
  ITEM: "Bài đăng / đồ vật",
  REPORT: "Báo cáo vi phạm",
  OTHER: "Khác",
};
const time = (value: string) =>
  new Intl.DateTimeFormat("vi-VN", {
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));

export function AdminContactPage() {
  const filters = useAdminQuery(["status"]);
  const query = {
    ...filters.query,
    status: filters.params.get("status") || "NEW",
  };
  const result = useResource<ContactMessage[]>(
    "/admin/contact-messages",
    query,
  );
  const mutation = useMutation();
  return (
    <>
      <AdminTitle title="Hộp thư liên hệ" />
      <p className="muted">
        Tin nhắn gửi từ trang Liên hệ. Trả lời qua email người gửi rồi đánh dấu
        đã xử lý.
      </p>
      <div className="admin-filters">
        <Select
          label="Trạng thái"
          value={query.status}
          onChange={(e) => filters.change("status", e.target.value)}
        >
          <option value="NEW">Chưa xử lý</option>
          <option value="HANDLED">Đã xử lý</option>
        </Select>
      </div>
      <MutationError error={mutation.error} />
      {result.loading ? (
        <Loading />
      ) : result.error ? (
        <ErrorState error={result.error} retry={invalidate} />
      ) : result.data?.data.length ? (
        <Table columns={["Người gửi", "Chủ đề", "Nội dung", "Thời gian", ""]}>
          {result.data.data.map((row) => (
            <tr key={row.id}>
              <td>
                <strong>{row.fullName}</strong>
                <small>
                  <a href={`mailto:${row.email}`}>{row.email}</a>
                </small>
                {row.userId && (
                  <small>
                    <Link to={`/quan-tri/nguoi-dung/${row.userId}`}>
                      Tài khoản #{row.userId}
                    </Link>
                  </small>
                )}
              </td>
              <td>{CONTACT_TOPICS[row.topic]}</td>
              <td>
                <p className="pre-wrap">{row.body}</p>
                {row.itemUrl && (
                  <small>
                    <a href={row.itemUrl} target="_blank" rel="noreferrer">
                      Liên kết đính kèm ↗
                    </a>
                  </small>
                )}
              </td>
              <td>
                {dateLabel(row.createdAt)}
                <small>{time(row.createdAt)}</small>
              </td>
              <td>
                {row.status === "NEW" ? (
                  <Button
                    variant="secondary"
                    disabled={mutation.busy}
                    onClick={() =>
                      void mutation.run(
                        `/admin/contact-messages/${row.id}/handle`,
                      )
                    }
                  >
                    Đánh dấu đã xử lý
                  </Button>
                ) : (
                  <span className="badge status-returned">Đã xử lý</span>
                )}
              </td>
            </tr>
          ))}
        </Table>
      ) : (
        <EmptyState
          title={
            query.status === "NEW"
              ? "Không có liên hệ mới"
              : "Chưa có liên hệ đã xử lý"
          }
        />
      )}
      <Pagination data={result.data?.pagination} change={filters.page} />
    </>
  );
}

export function AdminDisputesPage() {
  const filters = useAdminQuery(["status"]);
  const query = {
    ...filters.query,
    status: filters.params.get("status") || "OPEN",
  };
  const result = useResource<HandoverDispute[]>(
    "/admin/handover-disputes",
    query,
  );
  const mutation = useMutation();
  return (
    <>
      <AdminTitle title="Khiếu nại bàn giao" />
      <p className="muted">
        Khi một bên báo sự cố, xác nhận bàn giao bị khóa. Liên hệ hai bên, sau
        đó đóng khiếu nại để họ tiếp tục.
      </p>
      <div className="admin-filters">
        <Select
          label="Trạng thái"
          value={query.status}
          onChange={(e) => filters.change("status", e.target.value)}
        >
          <option value="OPEN">Đang mở</option>
          <option value="RESOLVED">Đã xử lý</option>
        </Select>
      </div>
      <MutationError error={mutation.error} />
      {result.loading ? (
        <Loading />
      ) : result.error ? (
        <ErrorState error={result.error} retry={invalidate} />
      ) : result.data?.data.length ? (
        <Table
          columns={["Bài đăng / Yêu cầu", "Hai bên", "Lý do", "Lịch hẹn", ""]}
        >
          {result.data.data.map((row) => (
            <tr key={row.claimId}>
              <td>
                <Link to={`/quan-tri/bai-dang/${row.item.id}`}>
                  {row.item.title}
                </Link>
                <small>Yêu cầu #{row.claimId}</small>
              </td>
              <td>
                Người nhặt:{" "}
                <Link to={`/quan-tri/nguoi-dung/${row.owner.id}`}>
                  {row.owner.fullName}
                </Link>
                <small>
                  Người nhận:{" "}
                  <Link to={`/quan-tri/nguoi-dung/${row.claimant.id}`}>
                    {row.claimant.fullName}
                  </Link>
                </small>
              </td>
              <td>
                <p className="pre-wrap">{row.reason}</p>
                <small>
                  {row.disputedBy?.fullName ?? "Một bên"} ·{" "}
                  {dateLabel(row.disputedAt)} {time(row.disputedAt)}
                </small>
              </td>
              <td>
                {row.appointment ? (
                  <>
                    {dateLabel(row.appointment.at)} {time(row.appointment.at)}
                    <small>{row.appointment.place}</small>
                  </>
                ) : (
                  <span className="muted">Chưa hẹn</span>
                )}
              </td>
              <td>
                {row.resolvedAt ? (
                  <span className="badge status-returned">Đã xử lý</span>
                ) : (
                  <Button
                    variant="secondary"
                    disabled={mutation.busy}
                    onClick={() =>
                      void mutation.run(
                        `/admin/handover-disputes/${row.claimId}/resolve`,
                      )
                    }
                  >
                    Đóng khiếu nại
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      ) : (
        <EmptyState
          title={
            query.status === "OPEN"
              ? "Không có khiếu nại đang mở"
              : "Chưa có khiếu nại đã xử lý"
          }
        />
      )}
      <Pagination data={result.data?.pagination} change={filters.page} />
    </>
  );
}
