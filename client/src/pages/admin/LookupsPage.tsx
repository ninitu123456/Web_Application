import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useResource } from "../../lib/hooks";
import { invalidate } from "../../lib/api";
import type { AdminLookup } from "../../lib/extended-types";
import {
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Input,
  Loading,
  Modal,
} from "../../components/ui";
import { AdminTitle, MutationError, Table, useMutation } from "./shared";
type Kind = "categories" | "locations";
export function AdminLookupsPage() {
  const [params, setParams] = useSearchParams();
  const kind: Kind =
    params.get("tab") === "locations" ? "locations" : "categories";
  return (
    <>
      <AdminTitle title="Danh mục & địa điểm" />
      <div className="tabs" aria-label="Loại dữ liệu">
        <button
          className={kind === "categories" ? "active" : ""}
          onClick={() => setParams({ tab: "categories" })}
        >
          Danh mục
        </button>
        <button
          className={kind === "locations" ? "active" : ""}
          onClick={() => setParams({ tab: "locations" })}
        >
          Địa điểm
        </button>
      </div>
      <LookupManager key={kind} kind={kind} />
    </>
  );
}
function LookupManager({ kind }: { kind: Kind }) {
  const result = useResource<AdminLookup[]>(`/admin/${kind}`);
  const [edit, setEdit] = useState<AdminLookup | "new" | null>(null);
  const [toggle, setToggle] = useState<AdminLookup | null>(null);
  const mutation = useMutation();
  const label = kind === "categories" ? "danh mục" : "địa điểm";
  return (
    <section className="admin-section">
      <div className="section-heading">
        <p className="muted">
          Danh sách gồm cả {label} đang và đã ngừng hoạt động.
        </p>
        <Button onClick={() => setEdit("new")}>Thêm {label}</Button>
      </div>
      {result.loading ? (
        <Loading />
      ) : result.error ? (
        <ErrorState error={result.error} retry={invalidate} />
      ) : result.data?.data.length ? (
        <Table columns={["Tên", "Trạng thái", "Thao tác"]}>
          {result.data.data.map((row) => (
            <tr key={row.id}>
              <td>
                {row.name}
                <small>#{row.id}</small>
              </td>
              <td>
                <span
                  className={`badge ${row.isActive ? "status-active" : ""}`}
                >
                  {row.isActive ? "Đang hoạt động" : "Ngừng hoạt động"}
                </span>
              </td>
              <td>
                <div className="table-actions">
                  <Button
                    variant="secondary"
                    disabled={mutation.busy}
                    onClick={() => setEdit(row)}
                  >
                    Đổi tên
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={mutation.busy}
                    onClick={() => setToggle(row)}
                  >
                    {row.isActive ? "Ngừng hoạt động" : "Bật hoạt động"}
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      ) : (
        <EmptyState title={`Chưa có ${label}`} />
      )}
      <MutationError error={mutation.error} />
      {edit && (
        <LookupDialog
          kind={kind}
          row={edit === "new" ? undefined : edit}
          close={() => setEdit(null)}
        />
      )}
      {toggle && (
        <ConfirmDialog
          title={`${toggle.isActive ? "Ngừng" : "Bật"} hoạt động ${label}?`}
          close={() => setToggle(null)}
          busy={mutation.busy}
          confirm={() => {
            void mutation
              .run(`/admin/${kind}/${toggle.id}`, {
                isActive: !toggle.isActive,
              })
              .then((success) => {
                if (success) setToggle(null);
              });
          }}
        >
          {mutation.error ||
            `“${toggle.name}” sẽ ${toggle.isActive ? "không còn trong lựa chọn cho bài đăng mới" : "có thể được chọn lại"}. Thông tin trên các bài đăng cũ được giữ nguyên.`}
        </ConfirmDialog>
      )}
    </section>
  );
}
function LookupDialog({
  kind,
  row,
  close,
}: {
  kind: Kind;
  row?: AdminLookup;
  close: () => void;
}) {
  const [name, setName] = useState(row?.name || "");
  const [error, setError] = useState("");
  const mutation = useMutation();
  const maximum = kind === "categories" ? 100 : 150;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || name.trim().length > maximum) {
      setError(
        !name.trim() ? "Vui lòng nhập tên." : "Tên quá dài. Vui lòng rút ngắn.",
      );
      return;
    }
    if (
      await mutation.run(
        `/admin/${kind}${row ? `/${row.id}` : ""}`,
        { name: name.trim() },
        row ? "PATCH" : "POST",
      )
    )
      close();
  }
  return (
    <Modal
      title={row ? "Đổi tên" : "Tạo mới"}
      close={close}
      busy={mutation.busy}
    >
      <form onSubmit={(e) => void submit(e)}>
        <Input
          label={kind === "categories" ? "Tên danh mục" : "Tên địa điểm"}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          disabled={mutation.busy}
        />
        <MutationError error={error || mutation.error} />
        <div className="actions">
          <Button
            type="button"
            variant="secondary"
            disabled={mutation.busy}
            onClick={close}
          >
            Hủy
          </Button>
          <Button disabled={mutation.busy}>
            {mutation.busy ? "Đang lưu…" : "Lưu thay đổi"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
