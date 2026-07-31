/**
 * Shrinks a photo in the browser before upload.
 *
 * A phone camera shot of a page of working is typically 3-8MB, which both
 * blows the 5MB server limit and is painful on a Mongolian mobile
 * connection. Downscaling to 1600px and re-encoding as JPEG brings a typical
 * photo to a few hundred KB while keeping handwriting legible.
 *
 * Canvas-based, so no extra dependency. Returns the original file untouched
 * if anything goes wrong — a slow upload beats a failed one.
 */

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));

    // Already small enough, and re-encoding would only lose quality.
    if (scale === 1 && file.size <= 1_000_000) {
      bitmap.close();
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    );
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file;
  }
}
