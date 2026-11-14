export type UploadStatus =
  "pending" | "uploading" | "saved" | "failed" | "uncertain";
export interface UploadEntry {
  key: string;
  file: File;
  previewUrl: string;
  status: UploadStatus;
  attempt: number;
  image?: { id: number; url: string };
  error?: unknown;
}
export type UploadUpdate = {
  key: string;
  attempt: number;
  status: UploadStatus;
  image?: UploadEntry["image"];
  error?: unknown;
};
export function updateUpload(entries: UploadEntry[], update: UploadUpdate) {
  return entries.map((entry) =>
    entry.key !== update.key || update.attempt < entry.attempt
      ? entry
      : { ...entry, ...update },
  );
}
export async function runImageUploads(
  entries: UploadEntry[],
  upload: (file: File) => Promise<{ id: number; url: string }>,
  update: (value: UploadUpdate) => void,
) {
  return Promise.all(
    entries
      .filter((entry) => ["pending", "failed"].includes(entry.status))
      .map(async (entry) => {
        const attempt = entry.attempt + 1;
        update({ key: entry.key, attempt, status: "uploading" });
        try {
          const image = await upload(entry.file);
          if (!Number.isSafeInteger(image?.id) || image.id <= 0 || !image.url)
            throw new Error("Unconfirmed image response");
          update({ key: entry.key, attempt, status: "saved", image });
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
  pending: "Chờ tải lên khi đăng bài",
  uploading: "Đang tải lên…",
  saved: "Đã tải lên",
  failed: "Tải ảnh thất bại",
  uncertain: "Chưa xác định kết quả — kiểm tra ảnh đã lưu",
};
