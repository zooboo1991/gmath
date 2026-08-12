/**
 * Browser-side downscaling for cover images, run before upload.
 *
 * A photo straight off a phone is routinely 4–10 MB, and a serverless function
 * request body is capped at 4.5 MB by the platform — above that the request
 * never reaches our route, so the reply isn't JSON and the form used to show
 * "Сүлжээний алдаа гарлаа" for what is really "your picture is too big".
 * Shrinking here avoids the cliff entirely, and a cover is displayed at most
 * 1600px wide anyway, so nothing visible is lost.
 *
 * Returns the original file untouched when it's already small, when the format
 * isn't one canvas can re-encode (or decoding fails), or when the "smaller"
 * result isn't actually smaller.
 */

const MAX_WIDTH = 1600;
const QUALITY = 0.85;
/** Below this, re-encoding costs quality for no real gain. */
const SKIP_BELOW_BYTES = 1_200_000;

export async function downscaleImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  if (file.size <= SKIP_BELOW_BYTES) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_WIDTH / bitmap.width);
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY)
    );
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    // A format the browser can't decode — let the server answer, it validates
    // the bytes properly and returns a readable message.
    return file;
  }
}

/** Hard stop below the platform's request-body cap, with room for form overhead. */
export const MAX_UPLOAD_BYTES = 4_000_000;

export function formatMb(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(1)}MB`;
}
