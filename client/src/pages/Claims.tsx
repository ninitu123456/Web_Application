import { useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, errorText, invalidate } from "../lib/api";
import { useResource } from "../lib/hooks";
import type { Claim } from "../lib/types";
import { ReportButton } from "../components/ReportButton";
import {
  Button,
  ConfirmDialog,
  dateLabel,
  EmptyState,
  ErrorState,
  Loading,
  Modal,
  Pagination,
  StatusBadge,
  Textarea,
  useToast,
} from "../components/ui";

export function ClaimModal({
  itemId,
  close,
}: {
  itemId: number;
  close: () => void;
}) {
  const [proof, setProof] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const toast = useToast();
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    if (!proof.trim()) {
      setError("Vui lòng nhập bằng chứng xác minh đồ vật là của bạn.");
      return;
    }
    if (new TextEncoder().encode(proof.trim()).length > 65535) {
      setError("Bằng chứng quá dài. Vui lòng rút ngắn.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await api(`/items/${itemId}/claims`, {
        method: "POST",
        body: { proofDescription: proof.trim() },
      });
      toast("Đã gửi yêu cầu nhận đồ. Theo dõi tại Yêu cầu đã gửi.");
      close();
      invalidate();
    } catch (e) {
      setError(errorText(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal title="Yêu cầu nhận đồ" close={close} busy={busy}>
      <p className="muted">
        Hãy cung cấp đặc điểm riêng mà chỉ chủ sở hữu biết. Bằng chứng chỉ được
        hiển thị cho bạn, chủ bài và quản trị viên có thẩm quyền.
      </p>
      <form onSubmit={submit}>
        <Textarea
          label="Bằng chứng sở hữu"
          placeholder="Ví dụ: chi tiết đặc biệt, vết xước, vật dụng bên trong…"
          rows={5}
          value={proof}
          onChange={(e) => setProof(e.target.value)}
          required
          disabled={busy}
        />
        <p className="fine-print">
          Bạn chỉ có thể gửi một yêu cầu cho bài đăng này, kể cả khi bị từ chối.
        </p>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={close}
          >
            Hủy
          </Button>
          <Button disabled={busy}>
            {busy ? "Đang gửi…" : "Gửi yêu cầu →"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
type Action = "approve" | "reject" | "complete";
const actionLabel: Record<Action, string> = {
  approve: "Chấp thuận",
  reject: "Từ chối",
  complete: "Xác nhận bàn giao",
};
export function ReceivedClaims({
  itemId,
  canAct,
}: {
  itemId: number;
  canAct: boolean;
}) {
  const [page, setPage] = useState(1);
  const result = useResource<Claim[]>(`/items/${itemId}/claims`, {
    page,
    limit: 10,
  });
  const [action, setAction] = useState<{ claim: Claim; type: Action } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const toast = useToast();
  async function perform() {
    if (!action || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await api(`/claims/${action.claim.id}/${action.type}`, {
        method: "PATCH",
      });
      toast("Đã cập nhật yêu cầu và trạng thái bài đăng.");
      setPage(1);
      setAction(null);
      invalidate();
    } catch (e) {
      setError(errorText(e));
      setAction(null);
      invalidate();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section>
      <div className="section-heading">
        <h2>Yêu cầu nhận được</h2>
        <span className="muted">Bằng chứng riêng tư</span>
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {result.loading ? (
        <Loading />
      ) : result.error ? (
        <ErrorState error={result.error} retry={invalidate} />
      ) : result.data?.data.length ? (
        <div className="claim-list">
          {result.data.data.map((claim) => (
            <article className="panel claim-card" key={claim.id}>
              <div className="section-heading">
                <div>
                  <h3>
                    {claim.claimant?.fullName ||
                      `Người gửi #${claim.claimantId}`}
                  </h3>
                  <small className="muted">
                    Gửi ngày {dateLabel(claim.submittedAt)} · Yêu cầu #
                    {claim.id}
                  </small>
                </div>
                <StatusBadge status={claim.status} group="claim" />
              </div>
              <div className="proof">
                <span className="eyebrow">BẰNG CHỨNG SỞ HỮU</span>
                <p>{claim.proofDescription}</p>
              </div>
              <ReportButton
                targetType="CLAIM"
                targetId={claim.id}
                label="Báo cáo yêu cầu này"
              />
              {canAct && (
                <div className="actions">
                  {claim.status === "PENDING" && (
                    <>
                      <Button
                        disabled={busy}
                        variant="secondary"
                        onClick={() => setAction({ claim, type: "reject" })}
                      >
                        Từ chối
                      </Button>
                      <Button
                        disabled={busy}
                        onClick={() => setAction({ claim, type: "approve" })}
                      >
                        Chấp thuận →
                      </Button>
                    </>
                  )}
                  {claim.status === "APPROVED" && (
                    <Button
                      disabled={busy}
                      onClick={() => setAction({ claim, type: "complete" })}
                    >
                      Xác nhận bàn giao →
                    </Button>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState title="Chưa có yêu cầu nhận đồ" />
      )}
      <Pagination data={result.data?.pagination} change={setPage} />
      {action && (
        <ConfirmDialog
          title={`${actionLabel[action.type]} yêu cầu #${action.claim.id}?`}
          close={() => setAction(null)}
          busy={busy}
          confirm={() => void perform()}
        >
          {action.type === "approve"
            ? "Đồ vật sẽ chuyển sang chờ bàn giao. Các yêu cầu đang chờ khác sẽ bị từ chối."
            : action.type === "complete"
              ? "Chỉ xác nhận khi đã trao đồ vật cho đúng người. Đồ vật sẽ chuyển sang đã trao lại."
              : "Người gửi sẽ không thể tạo lại yêu cầu cho bài đăng này."}
        </ConfirmDialog>
      )}
    </section>
  );
}
export function MyClaimsPage() {
  const [params, setParams] = useSearchParams();
  const result = useResource<Claim[]>("/claims/mine", {
    page: params.get("page") || "1",
    limit: 10,
  });
  return (
    <section className="page-section narrow">
      <span className="eyebrow">THEO DÕI KẾT NỐI</span>
      <h1>Yêu cầu đã gửi</h1>
      <p className="muted">
        Xem tiến trình xác minh và nhận lại đồ vật của bạn.
      </p>
      {result.loading ? (
        <Loading />
      ) : result.error ? (
        <ErrorState error={result.error} retry={invalidate} />
      ) : result.data?.data.length ? (
        <div className="claim-list">
          {result.data.data.map((claim) => (
            <article className="panel claim-card" key={claim.id}>
              <div className="section-heading">
                <div>
                  <h2>
                    {claim.item?.visibility === "HIDDEN" ? (
                      claim.item.title
                    ) : (
                      <Link to={`/do-vat/${claim.itemId}`}>
                        {claim.item?.title || `Bài đăng #${claim.itemId}`} ↗
                      </Link>
                    )}
                  </h2>
                  <p className="muted">
                    {claim.item?.location} · {dateLabel(claim.submittedAt)}
                  </p>
                </div>
                <StatusBadge status={claim.status} group="claim" />
              </div>
              {claim.item && (
                <div className="claim-item-state">
                  Trạng thái bài đăng:{" "}
                  <StatusBadge status={claim.item.status} group="item" />
                </div>
              )}
              {claim.item?.visibility === "HIDDEN" && (
                <p className="notice">
                  Bài đăng đã được gỡ khỏi phần công khai. Lịch sử yêu cầu và
                  bằng chứng của bạn vẫn được giữ; hãy theo dõi kết quả tại đây.
                </p>
              )}
              <details className="proof">
                <summary>Bằng chứng bạn đã gửi (riêng tư)</summary>
                <p>{claim.proofDescription}</p>
              </details>
              {claim.status === "PENDING" && (
                <p className="notice">
                  Đang chờ chủ bài kiểm tra bằng chứng. Bạn có thể theo dõi kết
                  quả tại đây hoặc trong Thông báo.
                </p>
              )}
              {claim.status === "REJECTED" && (
                <p className="notice">
                  Yêu cầu đã bị từ chối. Bạn không thể gửi lại yêu cầu cho bài
                  này; hãy tiếp tục tìm kiếm đồ vật phù hợp.
                </p>
              )}
              <ReportButton
                targetType="CLAIM"
                targetId={claim.id}
                label="Báo cáo yêu cầu này"
              />
              {claim.status === "APPROVED" && (
                <p className="notice">
                  Yêu cầu đã được chấp thuận. Chủ bài sẽ xác nhận sau khi bàn
                  giao đồ vật.
                </p>
              )}
              {claim.completedAt && (
                <p className="muted">
                  Đã bàn giao ngày {dateLabel(claim.completedAt)}
                </p>
              )}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState title="Bạn chưa gửi yêu cầu nào">
          <Link className="button secondary" to="/">
            Khám phá đồ vật ↗
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
