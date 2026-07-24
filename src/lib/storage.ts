import { getSupabase } from "./supabase";

const BUCKET = "articles";

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
