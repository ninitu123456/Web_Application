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
import { ImageCarousel } from "../components/ImageCarousel";
import {
  runImageUploads,
  updateUpload,
  uploadLabels,
  type UploadEntry,
  type UploadUpdate,
} from "../lib/image-uploads";
import { changeItemField } from "../lib/item-form";
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
  const [files, setFiles] = useState<UploadEntry[]>([]);
  const queue = useRef<UploadEntry[]>([]);
  const urls = useRef(new Map<string, string>());
  const [previewSelection, setPreviewSelection] = useState<string>();
  const formRef = useRef<HTMLFormElement>(null);
  function changeQueue(change: (old: UploadEntry[]) => UploadEntry[]) {
    queue.current = change(queue.current);
    setFiles(queue.current);
  }
  const previews = files
    .filter((entry) => entry.status !== "saved")
    .map((entry) => entry.previewUrl);
  const pendingCount = files.filter((entry) => entry.status !== "saved").length;
  const previewImages = [
    ...(saved?.images || []).map((image) => ({
      key: "saved:" + image.id,
      src: image.url,
    })),
    ...files
      .filter((entry) => entry.status !== "saved")
      .map((entry) => ({ key: entry.key, src: entry.previewUrl })),
  ];
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
  useEffect(
    () => () => {
      urls.current.forEach((url) => URL.revokeObjectURL(url));
      urls.current.clear();
    },
    [],
  );
  const set = (key: keyof Fields, value: string) => {
    const next = changeItemField(fields, fieldErrors, key, value);
    setFields(next.fields);
    setFieldErrors(next.errors);
  };
  function dropFile(key: string) {
    const url = urls.current.get(key);
    if (url) URL.revokeObjectURL(url);
    urls.current.delete(key);
    changeQueue((old) => old.filter((entry) => entry.key !== key));
  }
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
    if (
      (saved?.images.length || 0) +
        queue.current.filter((entry) => entry.status !== "saved").length +
        incoming.length >
      5
    ) {
      setError("Mỗi bài đăng có tối đa 5 ảnh, tính cả ảnh đã lưu.");
      return;
    }
    const entries = incoming.map((file) => {
      const key = crypto.randomUUID(),
        previewUrl = URL.createObjectURL(file);
      urls.current.set(key, previewUrl);
      return { key, file, previewUrl, status: "pending" as const, attempt: 0 };
    });
    changeQueue((old) => [...old, ...entries]);
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
      if (current && pendingCount) {
        const itemId = current.id;
        const results = await runImageUploads(
          queue.current,
          async (file) => {
            const data = new FormData();
            data.append("images", file);
            const response = await api<{ id: number; url: string }[]>(
              `/items/${itemId}/images`,
              { method: "POST", body: data },
            );
            return response.data[0];
          },
          (update: UploadUpdate) => {
            changeQueue((old) => updateUpload(old, update));
            if (update.image) {
              const image = update.image;
              setSaved((old) =>
                old
                  ? {
                      ...old,
                      images: [
                        ...old.images.filter(
                          (existing) => existing.id !== image.id,
                        ),
                        image,
                      ],
                    }
                  : old,
              );
            }
          },
        );
        const failure = results.find((result) => !result.success);
        if (failure) {
          if (
            results.some((result) => "uncertain" in result && result.uncertain)
          )
            setUncertain(true);
          throw failure.error;
        }
      }
      invalidate();
      toast(original ? "Đã lưu thay đổi." : "Bài đăng đã sẵn sàng.");
      navigate(`/do-vat/${current!.id}`, { replace: true });
    } catch (e) {
      setError(errorText(e));
      if (current) {
        setSavedMessage(true);
        try {
          await refreshSaved(current.id);
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
      await refreshSaved(saved.id);
      const unresolved = queue.current.some(
        (entry) => entry.status === "uncertain",
      );
      setUncertain(unresolved);
      setError(
        unresolved
          ? "Kết quả upload chưa xác định. Xem bài đăng để đối chiếu; không tự tải lại ảnh này nhằm tránh trùng."
          : "",
      );
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
      const removed = queue.current.find(
        (entry) => entry.image?.id === deleting,
      );
      if (removed) dropFile(removed.key);
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
    <section
      className={`page-section ${wizard && step < 3 ? "form-page" : "narrow"}`}
    >
      <Link
        className="back-link"
        to={original ? `/do-vat/${original.id}` : "/"}
      >
        ← Quay lại
      </Link>
      <h1>{original ? "Chỉnh sửa bài đăng" : "Đăng bài"}</h1>
      {savedMessage && (
        <div className="notice" role="status">
          Nội dung bài #{saved?.id} đã được lưu. Nếu tải ảnh gặp lỗi, kiểm tra
          ảnh đã lưu bên dưới trước khi thử lại.{" "}
          <Link to={`/do-vat/${saved?.id}`}>Xem bài đăng ↗</Link>
        </div>
      )}
      <div className="form-layout">
        <form
          ref={formRef}
          className="panel item-form"
          onSubmit={submit}
          noValidate
        >
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
                label={
                  fields.type === "FOUND" ? "Ngày nhặt được" : "Ngày bị mất"
                }
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
              {saved?.images
                .filter(
                  (image) =>
                    !files.some((entry) => entry.image?.id === image.id),
                )
                .map((image) => (
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
              {files.map((entry, index) => (
                <div
                  key={entry.key}
                  data-upload-key={entry.key}
                  data-upload-status={entry.status}
                >
                  <img src={entry.previewUrl} alt={`Ảnh chọn ${index + 1}`} />
                  {entry.status === "saved" ? (
                    <button
                      type="button"
                      className="image-remove"
                      disabled={busy}
                      onClick={() => setDeleting(entry.image!.id)}
                      aria-label="Xóa ảnh đã lưu"
                    >
                      ×
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="image-remove"
                      disabled={busy || entry.status === "uncertain"}
                      onClick={() => dropFile(entry.key)}
                      aria-label={`Bỏ ảnh chờ tải ${index + 1}`}
                    >
                      ×
                    </button>
                  )}
                  <small role={entry.status === "failed" ? "alert" : "status"}>
                    {uploadLabels[entry.status]}
                  </small>
                  {entry.status === "failed" && (
                    <>
                      <small className="error-text">
                        {errorText(entry.error)}
                      </small>
                      <button
                        type="button"
                        className="button secondary"
                        disabled={busy || uncertain}
                        onClick={() => formRef.current?.requestSubmit()}
                      >
                        Thử lại ảnh lỗi
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
            <Input
              label="Thêm ảnh"
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              multiple
              disabled={busy || (saved?.images.length || 0) + pendingCount >= 5}
              onChange={(e) => {
                chooseFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </section>
          {wizard && step === 3 && (
            <section className="post-preview" aria-label="Xem trước bài đăng">
              <ImageCarousel
                images={previewImages}
                selected={previewSelection}
                onSelect={setPreviewSelection}
              />
              <span className={`badge status-${fields.type.toLowerCase()}`}>
                {fields.type === "FOUND" ? "Nhặt được" : "Bị mất"}
              </span>
              <h2>{fields.title}</h2>
              <dl className="preview-facts">
                <div>
                  <dt>Danh mục</dt>
                  <dd>
                    {
                      categories.data?.data.find(
                        (row) => row.id === Number(fields.categoryId),
                      )?.name
                    }
                  </dd>
                </div>
                {fields.color.trim() && (
                  <div>
                    <dt>Màu sắc</dt>
                    <dd>{fields.color.trim()}</dd>
                  </div>
                )}
                <div>
                  <dt>Địa điểm</dt>
                  <dd>
                    {
                      locations.data?.data.find(
                        (row) => row.id === Number(fields.locationId),
                      )?.name
                    }
                  </dd>
                </div>
                <div>
                  <dt>
                    {fields.type === "FOUND" ? "Ngày nhặt được" : "Ngày bị mất"}
                  </dt>
                  <dd>{fields.eventDate.split("-").reverse().join("/")}</dd>
                </div>
                <div className="preview-description">
                  <dt>Mô tả đồ vật</dt>
                  <dd>{fields.description.trim()}</dd>
                </div>
              </dl>
              <p className="notice">
                <Icon name="shield" /> Nội dung này sẽ hiển thị công khai. Giữ
                lại đặc điểm bí mật để xác minh sở hữu.
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
                  ? pendingCount
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
        {wizard && step < 3 && (
          <aside className="form-preview" aria-label="Thẻ bài đăng xem nhanh">
            <span>XEM NHANH</span>
            <div className="item-card preview-card">
              <div className="card-image">
                {previews[0] ? (
                  <img src={previews[0]} alt="" />
                ) : (
                  <div className="image-fallback">
                    <Icon name="image" width="40" height="40" />
                    <small>Chưa có hình ảnh</small>
                  </div>
                )}
                <span className={`badge status-${fields.type.toLowerCase()}`}>
                  {fields.type === "FOUND" ? "Đồ nhặt được" : "Đồ bị mất"}
                </span>
                <span className="card-punch" aria-hidden="true" />
              </div>
              <div className="card-content">
                <span className="card-meta">
                  {categories.data?.data.find(
                    (row) => row.id === Number(fields.categoryId),
                  )?.name || "Danh mục"}{" "}
                  ·{" "}
                  {fields.eventDate
                    ? fields.eventDate.split("-").reverse().join("/")
                    : "dd/mm/yyyy"}
                </span>
                <h3>{fields.title.trim() || "Tiêu đề bài đăng"}</h3>
                <p className="card-location">
                  <Icon name="pin" />{" "}
                  {locations.data?.data.find(
                    (row) => row.id === Number(fields.locationId),
                  )?.name || "Địa điểm"}
                </p>
                <div className="card-bottom">
                  <span className="badge status-open">Đang mở</span>
                </div>
              </div>
            </div>
            <p>
              Thẻ này sẽ hiện trên trang Khám phá. Ảnh rõ nét và tiêu đề cụ thể
              giúp chủ nhân nhận ra đồ nhanh hơn.
            </p>
          </aside>
        )}
      </div>
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
