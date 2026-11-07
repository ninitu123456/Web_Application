import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { api, ApiError, errorText, invalidate } from "../lib/api";
import { useResource } from "../lib/hooks";
import { useAuth } from "../lib/auth";
import { itemFieldErrors, type ItemFields as Fields } from "../lib/item-form";
import { Icon } from "../components/Icon";
import type { Item, ItemType, Lookup } from "../lib/types";
import {
  Button,
  ConfirmDialog,
  ErrorState,
  Input,
  ItemImage,
  Loading,
  Select,
  Textarea,
  useToast,
} from "../components/ui";

const empty: Fields = {
  title: "",
  type: "LOST",
  categoryId: "",
  locationId: "",
  eventDate: "",
  description: "",
  color: "",
};
export function ItemFormPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const original = useResource<Item>(id ? `/items/${id}` : null);
  if (id && original.loading) return <Loading />;
  if (id && original.error)
    return <ErrorState error={original.error} retry={invalidate} />;
  if (
    id &&
    original.data &&
    (original.data.data.userId !== user?.id ||
      original.data.data.visibility === "HIDDEN" ||
      original.data.data.status !== "OPEN")
  )
    return (
      <ErrorState
        error={
          new ApiError(403, "Bạn chỉ có thể sửa bài của mình khi bài đang mở.")
        }
      />
    );
  return (
    <ItemForm
      key={id || "new"}
      original={original.data?.data}
      initialType={params.get("type") === "FOUND" ? "FOUND" : "LOST"}
      navigate={navigate}
    />
  );
}
function ItemForm({
  original,
  initialType,
  navigate,
}: {
  original?: Item;
  initialType: ItemType;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const [fields, setFields] = useState<Fields>(
    original
      ? {
          title: original.title,
          type: original.type,
          categoryId: String(original.categoryId),
          locationId: String(original.locationId),
          eventDate: original.eventDate,
          description: original.description,
          color: original.color || "",
        }
      : { ...empty, type: initialType },
  );
  const [step, setStep] = useState(1);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof Fields, string>>
  >({});
  const stepTitle = useRef<HTMLHeadingElement>(null);
  const [saved, setSaved] = useState<Item | undefined>(original);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const lock = useRef(false);
  const toast = useToast();
  const categories = useResource<Lookup[]>("/categories");
  const locations = useResource<Lookup[]>("/locations");
  const created = !original && Boolean(saved);
  const wizard = !original && !created;
  useEffect(() => {
    stepTitle.current?.focus();
  }, [step]);
  function validateFields(form: HTMLFormElement) {
    const errors = itemFieldErrors(fields);
    setFieldErrors(errors);
    const first = Object.keys(errors)[0];
    if (first) {
      if (wizard) setStep(2);
      requestAnimationFrame(() =>
        form.querySelector<HTMLElement>(`[name="${first}"]`)?.focus(),
      );
      return false;
    }
    return true;
  }
  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);
  const set = (key: keyof Fields, value: string) =>
    setFields((old) => ({ ...old, [key]: value }));
  function chooseFiles(selected: FileList | null) {
    if (!selected) return;
    const incoming = Array.from(selected);
    if (
      incoming.some(
        (file) =>
          !["image/jpeg", "image/png", "image/gif", "image/webp"].includes(
            file.type,
          ) ||
          file.size > 5 * 1024 * 1024 ||
          file.size === 0,
      )
    ) {
      setError(
        "Vui lòng chọn ảnh JPG, PNG, GIF hoặc WebP có nội dung, dung lượng tối đa 5 MiB.",
      );
      return;
    }
    if ((saved?.images.length || 0) + files.length + incoming.length > 5) {
      setError("Mỗi bài đăng có tối đa 5 ảnh, tính cả ảnh đã lưu.");
      return;
    }
    setFiles((old) => [...old, ...incoming]);
    setError("");
  }
  async function refreshSaved(itemId: number) {
    const response = await api<Item>(`/items/${itemId}`);
    setSaved(response.data);
    return response.data;
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || uncertain) return;
    if (wizard && step === 1) {
      setError("");
      setStep(2);
      return;
    }
    if (!validateFields(event.currentTarget)) return;
    if (wizard && step === 2) {
      setError("");
      setStep(3);
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    let current = saved;
    try {
      if (!created) {
        const body: Record<string, unknown> = {
          title: fields.title.trim(),
          description: fields.description.trim(),
          eventDate: fields.eventDate,
          color: fields.color.trim() || null,
        };
        if (!original) {
          body.type = fields.type;
          body.categoryId = Number(fields.categoryId);
          body.locationId = Number(fields.locationId);
        } else {
          // Unchanged inactive references are retained; backend validates only supplied reference fields.
          if (Number(fields.categoryId) !== original.categoryId)
            body.categoryId = Number(fields.categoryId);
          if (Number(fields.locationId) !== original.locationId)
            body.locationId = Number(fields.locationId);
        }
        const result = await api<Item>(
          original ? `/items/${original.id}` : "/items",
          { method: original ? "PATCH" : "POST", body },
        );
        current = result.data;
        setSaved(current);
        setSavedMessage(true);
        // Replace creation URL immediately: a refresh cannot submit a second Item.
        if (!original)
          window.history.replaceState(
            window.history.state,
            "",
            `/do-vat/${current.id}/sua`,
          );
      }
      if (current && files.length) {
        const data = new FormData();
        files.forEach((file) => data.append("images", file));
        await api(`/items/${current.id}/images`, {
          method: "POST",
          body: data,
        });
        setFiles([]);
      }
      invalidate();
      toast(original ? "Đã lưu thay đổi." : "Bài đăng đã sẵn sàng.");
      navigate(`/do-vat/${current!.id}`, { replace: true });
    } catch (e) {
      setError(errorText(e));
      if (current) {
        setSavedMessage(true);
        try {
          const fresh = await refreshSaved(current.id);
          if (fresh.images.length !== current.images.length) setFiles([]);
        } catch {
          setUncertain(true);
        }
      } else if (e instanceof ApiError && (e.status === 0 || e.status >= 500))
        setUncertain(true);
      invalidate();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function verifyImages() {
    if (!saved || lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const fresh = await refreshSaved(saved.id);
      if (fresh.images.length !== saved.images.length) setFiles([]);
      setUncertain(false);
      setError("");
    } catch (e) {
      setError(errorText(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function removeImage() {
    if (!saved || deleting === null || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await api(`/items/${saved.id}/images/${deleting}`, { method: "DELETE" });
      await refreshSaved(saved.id);
      toast("Đã xóa ảnh.");
    } catch (e) {
      setError(errorText(e));
      try {
        await refreshSaved(saved.id);
      } catch {
        /* Surface original error. */
      }
    } finally {
      setDeleting(null);
      lock.current = false;
      setBusy(false);
      invalidate();
    }
  }
  function lookupSelect(
    kind: "categoryId" | "locationId",
    label: string,
    rows: Lookup[] | undefined,
  ) {
    const oldId = original?.[kind];
    const currentLookup =
      kind === "categoryId" ? original?.category : original?.location;
    const inactive = oldId && rows && !rows.some((row) => row.id === oldId);
    return (
      <Select
        label={label}
        name={kind}
        error={fieldErrors[kind]}
        value={fields[kind]}
        onChange={(event) => set(kind, event.target.value)}
        required
        disabled={busy || created || !rows}
      >
        <option value="">Chọn {label.toLowerCase()}</option>
        {inactive && (
          <option value={oldId}>
            {currentLookup?.name || `#${oldId}`} (đã ngừng hoạt động — giá trị
            hiện tại)
          </option>
        )}
        {rows?.map((row) => (
          <option key={row.id} value={row.id}>
            {row.name}
          </option>
        ))}
      </Select>
    );
  }
  return (
    <section className="page-section narrow">
      <Link
        className="back-link"
        to={original ? `/do-vat/${original.id}` : "/"}
      >
        ← Quay lại
      </Link>
      <span className="eyebrow">CHIA SẺ ĐỂ KẾT NỐI</span>
      <h1>{original ? "Chỉnh sửa bài đăng" : "Chia sẻ một món đồ"}</h1>
      <p className="muted">
        Mô tả rõ ràng sẽ giúp mọi người tìm thấy nhau nhanh hơn.
      </p>
      {savedMessage && (
        <div className="notice" role="status">
          Nội dung bài #{saved?.id} đã được lưu. Nếu tải ảnh gặp lỗi, kiểm tra
          ảnh đã lưu bên dưới trước khi thử lại.{" "}
          <Link to={`/do-vat/${saved?.id}`}>Xem bài đăng ↗</Link>
        </div>
      )}
      <form className="panel item-form" onSubmit={submit} noValidate>
        {wizard && (
          <>
            <div className="wizard-heading">
              <h2 ref={stepTitle} tabIndex={-1}>
                {
                  [
                    "Bạn muốn đăng gì?",
                    "Thông tin đồ vật",
                    "Kiểm tra trước khi đăng",
                  ][step - 1]
                }
              </h2>
              <span>{step} / 3</span>
            </div>
            <ol className="wizard-progress" aria-label="Tiến trình đăng bài">
              {["Loại bài & ảnh", "Thông tin", "Xem trước"].map(
                (label, index) => (
                  <li
                    key={label}
                    className={index < step ? "complete" : ""}
                    aria-current={index + 1 === step ? "step" : undefined}
                  >
                    <span>{index + 1}</span>
                    {label}
                  </li>
                ),
              )}
            </ol>
          </>
        )}
        <div hidden={wizard && step !== 1}>
          {!original && (
            <fieldset className="type-choices" disabled={busy || created}>
              <legend>Loại bài đăng</legend>
              {(["LOST", "FOUND"] as const).map((type) => (
                <label
                  key={type}
                  className={fields.type === type ? "selected" : ""}
                >
                  <input
                    type="radio"
                    name="type"
                    value={type}
                    checked={fields.type === type}
                    onChange={() => set("type", type)}
                  />
                  <Icon
                    name={type === "LOST" ? "search" : "box"}
                    width="40"
                    height="40"
                  />
                  <strong>
                    {type === "LOST" ? "Tôi bị mất đồ" : "Tôi nhặt được đồ"}
                  </strong>
                </label>
              ))}
            </fieldset>
          )}
        </div>
        <fieldset hidden={wizard && step !== 2} disabled={busy || created}>
          <legend>Thông tin đồ vật</legend>
          {original && (
            <small className="muted">
              Loại bài đăng được giữ nguyên sau khi tạo.
            </small>
          )}
          <Input
            label="Tiêu đề"
            name="title"
            error={fieldErrors.title}
            value={fields.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="Ví dụ: Nhặt được bình nước màu xanh ở thư viện"
            required
          />
          <div className="form-row">
            {lookupSelect("categoryId", "Danh mục", categories.data?.data)}
            {lookupSelect(
              "locationId",
              fields.type === "FOUND"
                ? "Địa điểm nhặt được"
                : "Địa điểm bị mất",
              locations.data?.data,
            )}
          </div>
          {Boolean(categories.error || locations.error) && (
            <ErrorState
              error={categories.error || locations.error}
              retry={invalidate}
            />
          )}
          <div className="form-row">
            <Input
              label={fields.type === "FOUND" ? "Ngày nhặt được" : "Ngày bị mất"}
              type="date"
              name="eventDate"
              error={fieldErrors.eventDate}
              value={fields.eventDate}
              onChange={(e) => set("eventDate", e.target.value)}
              min="1000-01-01"
              max="9999-12-31"
              required
            />
            <Input
              label="Màu sắc (tùy chọn)"
              name="color"
              error={fieldErrors.color}
              value={fields.color}
              onChange={(e) => set("color", e.target.value)}
            />
          </div>
          <Textarea
            label="Mô tả đồ vật"
            name="description"
            error={fieldErrors.description}
            value={fields.description}
            onChange={(e) => set("description", e.target.value)}
            rows={5}
            required
          />
          <small className="muted">
            Đây là nội dung công khai. Giữ lại đặc điểm bí mật để xác minh khi
            nhận đồ.
          </small>
        </fieldset>
        <section className="image-editor" hidden={wizard && step !== 1}>
          <h2>
            Hình ảnh <span className="muted">(tùy chọn)</span>
          </h2>
          <p className="muted">
            Tối đa 5 ảnh · JPG, PNG, GIF, WebP · Mỗi ảnh tối đa 5 MiB
          </p>
          <div className="image-previews">
            {saved?.images.map((image) => (
              <div key={image.id}>
                <ItemImage src={image.url} title="Ảnh đã lưu" />
                <button
                  type="button"
                  className="image-remove"
                  disabled={busy}
                  onClick={() => setDeleting(image.id)}
                  aria-label="Xóa ảnh đã lưu"
                >
                  ×
                </button>
                <small>Đã lưu</small>
              </div>
            ))}
            {previews.map((url, index) => (
              <div key={url}>
                <img src={url} alt={`Ảnh chờ tải ${index + 1}`} />
                <button
                  type="button"
                  className="image-remove"
                  disabled={busy}
                  onClick={() =>
                    setFiles((old) => old.filter((_, i) => i !== index))
                  }
                  aria-label={`Bỏ ảnh chờ tải ${index + 1}`}
                >
                  ×
                </button>
                <small>Chờ tải lên</small>
              </div>
            ))}
          </div>
          <Input
            label="Thêm ảnh"
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            multiple
            disabled={busy || (saved?.images.length || 0) + files.length >= 5}
            onChange={(e) => {
              chooseFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </section>
        {wizard && step === 3 && (
          <section className="post-preview" aria-label="Xem trước bài đăng">
            {previews.length > 0 && (
              <div className="preview-images">
                {previews.map((url, index) => (
                  <img key={url} src={url} alt={`Ảnh đồ vật ${index + 1}`} />
                ))}
              </div>
            )}
            <span className={`badge status-${fields.type.toLowerCase()}`}>
              {fields.type === "FOUND" ? "Nhặt được" : "Bị mất"}
            </span>
            <h2>{fields.title}</h2>
            <p className="preview-meta">
              <Icon name="pin" />{" "}
              {
                locations.data?.data.find(
                  (row) => row.id === Number(fields.locationId),
                )?.name
              }{" "}
              · {fields.eventDate.split("-").reverse().join("/")}
            </p>
            <p className="muted">
              {
                categories.data?.data.find(
                  (row) => row.id === Number(fields.categoryId),
                )?.name
              }
              {fields.color && ` · ${fields.color}`}
            </p>
            <p className="description">{fields.description}</p>
            <p className="notice">
              <Icon name="shield" /> Nội dung này sẽ hiển thị công khai. Giữ lại
              đặc điểm bí mật để xác minh sở hữu.
            </p>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => setStep(2)}
            >
              Chỉnh sửa thông tin
            </Button>
          </section>
        )}
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        {uncertain && (
          <div className="notice" role="alert">
            Chưa xác định kết quả lưu. Hãy kiểm tra dữ liệu trước khi gửi lại.{" "}
            {saved ? (
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => void verifyImages()}
              >
                Kiểm tra lại ảnh đã lưu
              </Button>
            ) : (
              <Link to="/bai-dang-cua-toi">Kiểm tra Bài đăng của tôi →</Link>
            )}
          </div>
        )}
        <div className="actions">
          {wizard && step > 1 ? (
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setError("");
                setStep(step - 1);
              }}
            >
              ← Quay lại
            </Button>
          ) : (
            <Link
              className="button secondary"
              to={saved ? `/do-vat/${saved.id}` : "/"}
            >
              Quay lại
            </Link>
          )}
          <Button
            disabled={
              busy ||
              uncertain ||
              (!created &&
                (!wizard || step !== 1) &&
                (!categories.data || !locations.data))
            }
          >
            {busy
              ? "Đang lưu…"
              : created
                ? files.length
                  ? "Tải ảnh cho bài đã tạo →"
                  : "Xem bài đã tạo →"
                : original
                  ? "Lưu thay đổi →"
                  : step === 1
                    ? "Tiếp tục →"
                    : step === 2
                      ? "Xem trước →"
                      : "Đăng bài →"}
          </Button>
        </div>
      </form>
      {deleting !== null && (
        <ConfirmDialog
          title="Xóa ảnh này?"
          close={() => setDeleting(null)}
          confirm={() => void removeImage()}
          busy={busy}
        >
          Ảnh sẽ được xóa khỏi bài đăng. Bạn có thể thêm ảnh khác khi bài còn
          mở.
        </ConfirmDialog>
      )}
    </section>
  );
}
