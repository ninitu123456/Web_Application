// Shrinks large photos before upload so posting works on mobile data.
// GIFs (possibly animated) and already-small images are returned unchanged.
// Any failure falls back to the original file: compression is best effort.
const MAX_EDGE = 1920;
const SKIP_BELOW_BYTES = 900 * 1024;
const QUALITY = 0.85;

export async function compressImage(file: File): Promise<File> {
  if (file.type === "image/gif" || file.size <= SKIP_BELOW_BYTES) return file;
  if (typeof createImageBitmap !== "function") return file;
  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return file;
    }
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const type = file.type === "image/png" ? "image/webp" : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, type, QUALITY),
    );
    if (!blob || blob.size === 0 || blob.size >= file.size) return file;
    const extension = type === "image/webp" ? "webp" : "jpg";
    const name = file.name.replace(/\.[^.]+$/, "") + "." + extension;
    return new File([blob], name, { type, lastModified: file.lastModified });
  } catch {
    return file;
  }
}
