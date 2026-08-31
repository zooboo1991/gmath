import { getSupabase } from "./supabase";

const BUCKET = "articles";

/** Public: problem images are not sensitive and are shown to every student. */
export const PROBLEMS_BUCKET = "problems";
/** Private: a student's handwritten work, and the teacher's graded scan. */
export const SOLUTIONS_BUCKET = "solutions";
export const GRADED_SHEETS_BUCKET = "graded-sheets";
/** Private: a lesson's notes PDF, for students registered on that course. */
export const LESSON_NOTES_BUCKET = "lesson-notes";

/** Гэрээний Word загварууд. Хувийн — нийтийн URL байхгүй. */
export const CONTRACTS_BUCKET = "contracts";

type ImageSignature = {
  mime: string;
  ext: string;
  check: (buf: Buffer) => boolean;
};

// Deliberately excludes SVG: SVG is XML/markup (can embed <script>), not a
// fixed-format bitmap, so it can't be verified by a byte signature the way
// these formats can — allowing it would let an attacker upload script
// content disguised as an "image" to a publicly-served bucket.
const SIGNATURES: ImageSignature[] = [
  {
    mime: "image/png",
    ext: "png",
    check: (b) =>
      b.length >= 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a,
  },
  {
    mime: "image/jpeg",
    ext: "jpg",
    check: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: "image/gif",
    ext: "gif",
    check: (b) => b.length >= 6 && (b.toString("ascii", 0, 6) === "GIF87a" || b.toString("ascii", 0, 6) === "GIF89a"),
  },
  {
    mime: "image/webp",
    ext: "webp",
    check: (b) => b.length >= 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP",
  },
];

function detectImageType(buffer: Buffer): { mime: string; ext: string } | null {
  const sig = SIGNATURES.find((s) => s.check(buffer));
  return sig ? { mime: sig.mime, ext: sig.ext } : null;
}

/**
 * Uploads to an arbitrary bucket and returns the storage *path* rather than a
 * public URL — for private buckets (student solutions, graded sheets) there
 * is no public URL, and the caller mints a signed one per view instead.
 * Shares the byte-signature check above, so the same formats are allowed and
 * SVG stays rejected.
 */
export async function uploadPrivateImage(
  file: File,
  bucket: string,
  prefix: string
): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const detected = detectImageType(buffer);
  if (!detected) {
    throw new Error("unsupported_image_type");
  }

  const path = `${prefix}/${crypto.randomUUID()}.${detected.ext}`;
  const { error } = await getSupabase()
    .storage.from(bucket)
    .upload(path, buffer, { contentType: detected.mime, upsert: false });
  if (error) throw error;
  return path;
}

/** Short-lived URL for one private object. Returns null if it can't be signed. */
export async function createSignedUrl(
  bucket: string,
  path: string,
  expiresInSeconds: number
): Promise<string | null> {
  const { data, error } = await getSupabase().storage.from(bucket).createSignedUrl(path, expiresInSeconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/** Public-bucket upload for problem images, which are not sensitive. */
export async function uploadProblemImage(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const detected = detectImageType(buffer);
  if (!detected) {
    throw new Error("unsupported_image_type");
  }

  const path = `problems/${crypto.randomUUID()}.${detected.ext}`;
  const { error } = await getSupabase()
    .storage.from(PROBLEMS_BUCKET)
    .upload(path, buffer, { contentType: detected.mime, upsert: false });
  if (error) throw error;

  const { data } = getSupabase().storage.from(PROBLEMS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadCoverImage(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const detected = detectImageType(buffer);
  if (!detected) {
    throw new Error("unsupported_image_type");
  }

  const path = `covers/${crypto.randomUUID()}.${detected.ext}`;
  const { error } = await getSupabase()
    .storage.from(BUCKET)
    .upload(path, buffer, { contentType: detected.mime, upsert: false });
  if (error) throw error;

  const { data } = getSupabase().storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * A one-shot URL the browser can PUT a file straight to.
 *
 * Lesson notes go up this way instead of through a route handler because a
 * serverless request body is capped at 4.5 MB on Vercel, and a scanned set of
 * notes is routinely larger — even after the client-side shrink. The path is
 * generated here, never accepted from the caller, so an upload cannot be aimed
 * at an existing object or at another bucket's key space.
 */
export async function createNoteUploadUrl(): Promise<{ path: string; signedUrl: string; token: string }> {
  const path = `notes/${crypto.randomUUID()}.pdf`;
  const { data, error } = await getSupabase().storage.from(LESSON_NOTES_BUCKET).createSignedUploadUrl(path);
  if (error) throw error;
  return { path, signedUrl: data.signedUrl, token: data.token };
}

/** Deletes one private object — used when a lesson's notes are replaced or removed. */
export async function removeStorageObject(bucket: string, path: string): Promise<void> {
  const { error } = await getSupabase().storage.from(bucket).remove([path]);
  if (error) throw error;
}

/** The shape createNoteUploadUrl hands out. Anything else stored in a lesson is not a note we wrote. */
export function isLessonNotePath(value: unknown): value is string {
  return typeof value === "string" && /^notes\/[0-9a-f-]{36}\.pdf$/i.test(value);
}

/**
 * Гэрээний Word загварыг браузераас шууд Storage руу тавих нэг удаагийн URL.
 *
 * Хичээлийн тэмдэглэлтэй ижил шалтгаанаар: замыг сервер өөрөө үүсгэдэг тул
 * дуудагч байгаа объект руу эсвэл өөр bucket-ийн түлхүүрийн орон зай руу
 * байршуулж чадахгүй.
 */
export async function createContractUploadUrl(): Promise<{ path: string; signedUrl: string; token: string }> {
  const path = `templates/${crypto.randomUUID()}.docx`;
  const { data, error } = await getSupabase().storage.from(CONTRACTS_BUCKET).createSignedUploadUrl(path);
  if (error) throw error;
  return { path, signedUrl: data.signedUrl, token: data.token };
}

/** The shape createContractUploadUrl hands out — anything else is not a template we wrote. */
export function isContractTemplatePath(value: unknown): value is string {
  return typeof value === "string" && /^templates\/[0-9a-f-]{36}\.docx$/i.test(value);
}

/** Хувийн bucket-аас файлыг сервер талдаа буулгаж авна (гэрээ бөглөхөд). */
export async function downloadStorageObject(bucket: string, path: string): Promise<Buffer> {
  const { data, error } = await getSupabase().storage.from(bucket).download(path);
  if (error) throw error;
  return Buffer.from(await data.arrayBuffer());
}
