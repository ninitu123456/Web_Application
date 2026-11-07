import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { api, errorText, invalidate } from "../../lib/api";
import { Button, Modal, Textarea, useToast } from "../../components/ui";
import type { Query } from "../../lib/types";
export function useAdminQuery(keys: string[]) {
  const [params, setParams] = useSearchParams();
  const query: Query = { page: params.get("page") || "1", limit: 10 };
  for (const key of keys) if (params.get(key)) query[key] = params.get(key)!;
  const change = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value.trim()) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next);
  };
  return {
    params,
    query,
    change,
    page: (page: number) => change("page", String(page)),
    reset: () => setParams({}),
  };
}
export function useMutation() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const run = async (path: string, body?: unknown, method = "PATCH") => {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await api(path, { method, body });
      invalidate();
      toast("Đã cập nhật dữ liệu.");
      return true;
    } catch (e) {
      setError(errorText(e));
      invalidate();
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return { busy, error, run };
}
export function MutationError({ error }: { error: string }) {
  return error ? (
    <p className="inline-error" role="alert">
      {error}
    </p>
  ) : null;
}
export function AdminTitle({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <h1>{title}</h1>
      </div>
      {children}
    </div>
  );
}
export function Table({
  columns,
  children,
}: {
  columns: string[];
  children: ReactNode;
}) {
  return (
    <div
      className="table-scroll"
      tabIndex={0}
      aria-label="Bảng dữ liệu có thể cuộn ngang"
    >
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
export function validDecisionReason(value: string) {
  const text = value.trim();
  return (
    !/[\uD800-\uDFFF]/u.test(text) &&
    Array.from(text).length >= 1 &&
    Array.from(text).length <= 1000 &&
    new TextEncoder().encode(text).length <= 4000
  );
}
export function ReasonDialog({
  title,
  children,
  close,
  submit,
  busy,
  error,
  blocked = false,
  note,
  wide = false,
  confirmVariant = "primary",
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  submit: (reason: string) => Promise<void>;
  busy: boolean;
  error: string;
  blocked?: boolean;
  note?: ReactNode;
  wide?: boolean;
  confirmVariant?: "primary" | "danger";
}) {
  const [reason, setReason] = useState("");
  const [validation, setValidation] = useState("");
  function save(event: FormEvent) {
    event.preventDefault();
    if (blocked || busy) return;
    if (!validDecisionReason(reason)) {
      setValidation(
        !reason.trim()
          ? "Vui lòng nhập lý do xử lý."
          : Array.from(reason.trim()).length > 1000 ||
              new TextEncoder().encode(reason.trim()).length > 4000
            ? "Lý do quá dài. Vui lòng rút ngắn còn tối đa 1.000 ký tự."
            : "Lý do có ký tự không hợp lệ. Vui lòng kiểm tra lại.",
      );
      return;
    }
    setValidation("");
    void submit(reason.trim());
  }
  return (
    <Modal
      title={title}
      close={close}
      busy={busy}
      className={wide ? "claim-inspector" : undefined}
    >
      <form onSubmit={save}>
        <div className="decision-context">{children}</div>
        {note}
        <Textarea
          label="Lý do xử lý"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          required
          disabled={busy}
        />
        <MutationError error={validation || error} />
        <div className="actions">
          <Button
            type="button"
            variant="secondary"
            onClick={close}
            disabled={busy}
          >
            Hủy
          </Button>
          <Button variant={confirmVariant} disabled={busy || blocked}>
            {busy ? "Đang xử lý…" : "Xác nhận quyết định"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
