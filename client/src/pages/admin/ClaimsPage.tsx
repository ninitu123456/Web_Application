import { statusLabel } from "../../lib/display-labels";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useResource } from "../../lib/hooks";
import { invalidate } from "../../lib/api";
import { findClaimEvidence } from "../../lib/claim-inspection";
import type { AdminClaim } from "../../lib/extended-types";
import type { Claim } from "../../lib/types";
import {
  Button,
  dateLabel,
  EmptyState,
  ErrorState,
  Input,
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
      <AdminTitle title="Yêu cầu nhận đồ và tranh chấp" />
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
            <tr key={claim.id}>
              <td>
                <strong>Yêu cầu nhận đồ #{claim.id}</strong>
                <Link to={`/quan-tri/bai-dang/${claim.itemId}`}>
                  {claim.item.title} ↗
                </Link>
                <small>
                  {dateLabel(claim.submittedAt)} · Bài đăng:{" "}
                  {statusLabel(claim.item.status, "item")}
                </small>
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
                          Duyệt tranh chấp
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() =>
                            setDecision({ claim, decision: "REJECT" })
                          }
                        >
                          Từ chối tranh chấp
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
  const [state, setState] = useState<{ data?: Claim; error?: unknown }>({});
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({});
    findClaimEvidence(claim.itemId, claim.id, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ data });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setState({ error });
      },
    );
    return () => controller.abort();
  }, [claim.id, claim.itemId, attempt]);
  return (
    <Modal title={`Bằng chứng yêu cầu nhận đồ #${claim.id}`} close={close}>
      {state.error ? (
        <ErrorState
          error={state.error}
          retry={() => setAttempt((old) => old + 1)}
        />
      ) : state.data ? (
        <>
          <p className="fine-print">
            Bằng chứng chỉ hiển thị cho người gửi, chủ bài và quản trị viên.
            Người gửi #{state.data.claimantId}.
          </p>
          <p className="proof pre-wrap">{state.data.proofDescription}</p>
          <ReportButton
            targetType="CLAIM"
            targetId={state.data.id}
            label="Báo cáo yêu cầu này"
          />
        </>
      ) : (
        <>
          <p className="muted">Đang tìm bằng chứng của yêu cầu nhận đồ…</p>
          <Loading />
        </>
      )}
    </Modal>
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
      title={`${decision === "APPROVE" ? "Duyệt" : "Từ chối"} tranh chấp yêu cầu nhận đồ #${claim.id}`}
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
      {decision === "APPROVE"
        ? "Yêu cầu được chấp thuận; bài đăng chuyển sang chờ bàn giao. Các yêu cầu đang chờ khác sẽ bị từ chối. Chủ bài vẫn cần xác nhận khi đã bàn giao đồ."
        : "Yêu cầu được từ chối. Bài đăng trở lại trạng thái đang mở nếu không còn yêu cầu chờ duyệt. Lịch sử yêu cầu vẫn được giữ."}
    </ReasonDialog>
  );
}
