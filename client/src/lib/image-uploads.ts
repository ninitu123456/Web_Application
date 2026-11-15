export type UploadStatus =
  "pending" | "uploading" | "saved" | "failed" | "uncertain";
export interface UploadEntry {
  key: string;
  file: File;
  previewUrl: string;
  status: UploadStatus;
  attempt: number;
  /** Upload progress 0..1 while status is "uploading". */
  progress?: number;
  image?: { id: number; url: string };
  error?: unknown;
}
export type UploadUpdate = {
  key: string;
  attempt: number;
  status: UploadStatus;
  progress?: number;
  image?: UploadEntry["image"];
  error?: unknown;
};
export function updateUpload(entries: UploadEntry[], update: UploadUpdate) {
  return entries.map((entry) =>
    entry.key !== update.key ||
    update.attempt < entry.attempt ||
    // A late progress event must never move a finished upload back.
    (update.attempt === entry.attempt &&
      update.status === "uploading" &&
      entry.status !== "uploading" &&
      entry.status !== "pending" &&
      entry.status !== "failed")
      ? entry
      : { ...entry, ...update },
  );
}
export async function runImageUploads(
  entries: UploadEntry[],
  upload: (
    file: File,
    onProgress: (fraction: number) => void,
  ) => Promise<{ id: number; url: string }>,
  update: (value: UploadUpdate) => void,
) {
  return Promise.all(
    entries
      .filter((entry) => ["pending", "failed"].includes(entry.status))
      .map(async (entry) => {
        const attempt = entry.attempt + 1;
        update({ key: entry.key, attempt, status: "uploading", progress: 0 });
        try {
          const image = await upload(entry.file, (progress) =>
            update({ key: entry.key, attempt, status: "uploading", progress }),
          );
          if (!Number.isSafeInteger(image?.id) || image.id <= 0 || !image.url)
            throw new Error("Unconfirmed image response");
          update({
            key: entry.key,
            attempt,
            status: "saved",
            progress: 1,
            image,
          });
          return { key: entry.key, success: true };
        } catch (error) {
          const status =
            typeof error === "object" && error !== null && "status" in error
              ? Number(error.status)
              : 0;
          // Upload 503 is an admission/configuration refusal in the existing API.
          // Network/500 outcomes can include a committed image: never blindly resend.
          const uncertain = status === 0 || (status >= 500 && status !== 503);
          update({
            key: entry.key,
            attempt,
            status: uncertain ? "uncertain" : "failed",
            error,
          });
          return { key: entry.key, success: false, error, uncertain };
        }
      }),
  );
}
export const uploadLabels: Record<UploadStatus, string> = {
  pending: "Sẵn sàng · tải lên khi đăng bài",
  uploading: "Đang tải lên…",
  saved: "Đã tải xong",
  failed: "Tải ảnh thất bại",
  uncertain: "Chưa xác định kết quả — kiểm tra ảnh đã lưu",
};

// Only acknowledged uploads have a stable server ID. Never infer the outcome
// of pending/failed/uncertain files from counts or unrelated server images.
export function reconcileUploadedImages(
  entries: UploadEntry[],
  images: { id: number }[],
) {
  const ids = new Set(images.map((image) => image.id));
  return entries.filter(
    (entry) =>
      entry.status !== "saved" || (entry.image && ids.has(entry.image.id)),
  );
}
