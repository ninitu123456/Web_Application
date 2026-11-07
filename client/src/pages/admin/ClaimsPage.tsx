import { useAuth } from "../../lib/auth";
import { Icon } from "../../components/Icon";
import { statusLabel } from "../../lib/display-labels";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useResource } from "../../lib/hooks";
import { invalidate } from "../../lib/api";
import { findClaimEvidence } from "../../lib/claim-inspection";
import type { AdminClaim } from "../../lib/extended-types";
import type { Claim, Item } from "../../lib/types";
import {
  Button,
  dateLabel,
  EmptyState,
  ErrorState,
  Input,
  ItemImage,
  Loading,
  Modal,
  Pagination,
  Select,
  StatusBadge,
} from "../../components/ui";
import { ReportButton } from "../../components/ReportButton";
import {
  AdminTitle,
  ReasonDialog,
  Table,
  useAdminQuery,
  useMutation,
} from "./shared";
import { RecusalNotice, useRecusal } from "./ItemsPage";
export function AdminClaimsPage() {
  const filters = useAdminQuery(["status", "itemId", "claimantId", "sort"]);
  const result = useResource<AdminClaim[]>("/admin/claims", filters.query);
  const [evidence, setEvidence] = useState<AdminClaim | null>(null);
  const [decision, setDecision] = useState<{
    claim: AdminClaim;
    decision: "APPROVE" | "REJECT";
  } | null>(null);
  return (
    <>
      <AdminTitle title="Yêu cầu & tranh chấp" />
      {filters.params.get("claim") && (
        <p className="notice">
          Báo cáo liên quan đến yêu cầu #{filters.params.get("claim")}. Dùng bộ
          lọc và phân trang để tìm đúng mã yêu cầu trong danh sách.
        </p>
      )}
      <div className="admin-filters">
        <Select
          label="Trạng thái yêu cầu"
          value={filters.params.get("status") || ""}
          onChange={(e) => filters.change("status", e.target.value)}
        >
          <option value="">Tất cả trạng thái</option>
          {["PENDING", "APPROVED", "REJECTED", "COMPLETED"].map((status) => (
            <option key={status} value={status}>
              {statusLabel(status, "claim")}
            </option>
          ))}
        </Select>
        <Input
          label="Mã bài đăng"
          type="number"
          min={1}
          step={1}
          value={filters.params.get("itemId") || ""}
          onChange={(e) => filters.change("itemId", e.target.value)}
        />
        <Input
          label="Mã người gửi"
          type="number"
          min={1}
          step={1}
          value={filters.params.get("claimantId") || ""}
          onChange={(e) => filters.change("claimantId", e.target.value)}
        />
        <Select
          label="Sắp xếp yêu cầu"
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
            "Yêu cầu / Bài đăng",
            "Người gửi",
            "Trạng thái",
            "Thao tác",
          ]}
        >
          {result.data.data.map((claim) => (
            <tr
              key={claim.id}
              className={
                filters.params.get("claim") === String(claim.id)
                  ? "admin-selected-row"
                  : ""
              }
            >
              <td>
                <strong>Yêu cầu nhận đồ #{claim.id}</strong>
                <Link to={`/quan-tri/bai-dang/${claim.itemId}`}>
                  {claim.item.title} ↗
                </Link>
                <small>{dateLabel(claim.submittedAt)} · Bài đăng: </small>
                <span className="admin-item-state">
                  Trạng thái bài:{" "}
                  <StatusBadge status={claim.item.status} group="item" />
                </span>
              </td>
              <td>
                <Link to={`/quan-tri/nguoi-dung/${claim.claimantId}`}>
                  #{claim.claimantId} ↗
                </Link>
              </td>
              <td>
                <StatusBadge status={claim.status} group="claim" />
              </td>
              <td>
                <div className="table-actions">
                  <Button
                    variant="secondary"
                    onClick={() => setEvidence(claim)}
                  >
                    Xem bằng chứng
                  </Button>
                  {claim.status === "PENDING" &&
                    claim.item.type === "FOUND" &&
                    claim.item.status === "CLAIM_PENDING" && (
                      <>
                        <Button
                          onClick={() =>
                            setDecision({ claim, decision: "APPROVE" })
                          }
                        >
                          Chấp thuận yêu cầu
                        </Button>
                        <Button
                          variant="danger"
                          onClick={() =>
                            setDecision({ claim, decision: "REJECT" })
                          }
                        >
                          Từ chối yêu cầu
                        </Button>
                      </>
                    )}
                </div>
              </td>
            </tr>
          ))}
        </Table>
      ) : (
        <EmptyState title="Không có yêu cầu nhận đồ phù hợp" />
      )}
      <Pagination data={result.data?.pagination} change={filters.page} />
      {evidence && (
        <EvidenceDialog claim={evidence} close={() => setEvidence(null)} />
      )}
      {decision && (
        <DecisionDialog
          claim={decision.claim}
          decision={decision.decision}
          close={() => setDecision(null)}
        />
      )}
    </>
  );
}
function EvidenceDialog({
  claim,
  close,
}: {
  claim: AdminClaim;
  close: () => void;
}) {
  return (
    <Modal
      className="claim-inspector"
      title={`Bằng chứng yêu cầu nhận đồ #${claim.id}`}
      close={close}
    >
      <ClaimComparison claim={claim} />
      <p className="fine-print">
        Bằng chứng chỉ hiển thị cho người gửi, chủ bài và quản trị viên có thẩm
        quyền.
      </p>
      <ReportButton
        targetType="CLAIM"
        targetId={claim.id}
        label="Báo cáo yêu cầu này"
      />
    </Modal>
  );
}
function ClaimComparison({ claim }: { claim: AdminClaim }) {
  const { user } = useAuth();
  const scope = `${claim.itemId}:${claim.id}:${user?.id}`;
  const [state, setState] = useState<{
    data?: Claim;
    error?: unknown;
    scope?: string;
  }>({});
  const [attempt, setAttempt] = useState(0);
  const item = useResource<Item>(`/admin/items/${claim.itemId}`);
  useEffect(() => {
    const controller = new AbortController();
    setState({ scope });
    findClaimEvidence(claim.itemId, claim.id, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ data, scope });
      },
      (error) => {
        if (!controller.signal.aborted) setState({ error, scope });
      },
    );
    return () => controller.abort();
  }, [scope, attempt, claim.itemId, claim.id]);
  const evidence = state.scope === scope ? state : {};
  const data = item.data?.data;
  return (
    <>
      <div className="admin-claim-comparison">
        <section className="admin-claim-item">
          <h3>Thông tin bài đăng</h3>
          {item.loading ? (
            <Loading />
          ) : item.error ? (
            <ErrorState error={item.error} retry={invalidate} />
          ) : (
            data && (
              <>
                <div className="admin-claim-summary">
                  <div className="admin-claim-image">
                    <ItemImage src={data.images[0]?.url} title={data.title} />
                  </div>
                  <div>
                    <h3>{data.title}</h3>
                    <div className="badge-row">
                      <StatusBadge status={data.type} group="itemType" />
                      <StatusBadge status={data.status} group="item" />
                    </div>
                    <p>
                      Bài đăng{" "}
                      <Link to={`/quan-tri/bai-dang/${data.id}`}>
                        #{data.id}
                      </Link>{" "}
                      · Chủ bài{" "}
                      <Link to={`/quan-tri/nguoi-dung/${data.userId}`}>
                        #{data.userId}
                      </Link>
                    </p>
                    <p>
                      {data.location?.name} · {dateLabel(data.eventDate)}
                    </p>
                  </div>
                </div>
                <h4>Mô tả công khai</h4>
                <p className="pre-wrap">{data.description}</p>
              </>
            )
          )}
          <p className="admin-claim-sender">
            <Icon name="users" /> Người gửi yêu cầu{" "}
            <Link to={`/quan-tri/nguoi-dung/${claim.claimantId}`}>
              #{claim.claimantId}
            </Link>
          </p>
          <p>
            Trạng thái yêu cầu:{" "}
            <StatusBadge
              status={evidence.data?.status || claim.status}
              group="claim"
            />
          </p>
          <small>Gửi ngày {dateLabel(claim.submittedAt)}</small>
        </section>
        <section className="admin-private-proof">
          <h3>
            <Icon name="shield" /> Bằng chứng sở hữu
          </h3>
          <span className="badge">Thông tin riêng tư</span>
          {evidence.error ? (
            <ErrorState
              error={evidence.error}
              retry={() => setAttempt((old) => old + 1)}
            />
          ) : evidence.data ? (
            <p className="proof pre-wrap">{evidence.data.proofDescription}</p>
          ) : (
            <Loading />
          )}
          <p className="fine-print">
            Chỉ dùng thông tin này để đối chiếu. Không sao chép bằng chứng vào
            nội dung công khai.
          </p>
        </section>
      </div>
    </>
  );
}
function DecisionDialog({
  claim,
  decision,
  close,
}: {
  claim: AdminClaim;
  decision: "APPROVE" | "REJECT";
  close: () => void;
}) {
  const recusal = useRecusal(claim.itemId, claim.item.userId);
  const mutation = useMutation();
  return (
    <ReasonDialog
      wide
      confirmVariant={decision === "REJECT" ? "danger" : "primary"}
      title={`${decision === "APPROVE" ? "Chấp thuận" : "Từ chối"} yêu cầu nhận đồ #${claim.id}`}
      close={close}
      busy={mutation.busy}
      blocked={recusal.loading || recusal.related === true}
      error={mutation.error}
      note={<RecusalNotice {...recusal} />}
      submit={async (reason) => {
        if (
          await mutation.run(`/admin/claims/${claim.id}/resolve`, {
            decision,
            reason,
          })
        )
          close();
      }}
    >
      <ClaimComparison claim={claim} />
      <p className="notice">
        {decision === "APPROVE"
          ? "Yêu cầu được chấp thuận; bài đăng chuyển sang chờ bàn giao. Các yêu cầu đang chờ khác sẽ bị từ chối. Chủ bài vẫn cần xác nhận khi đã bàn giao đồ."
          : "Yêu cầu được từ chối. Bài đăng trở lại trạng thái đang mở nếu không còn yêu cầu chờ duyệt. Lịch sử yêu cầu vẫn được giữ."}
      </p>
    </ReasonDialog>
  );
}
