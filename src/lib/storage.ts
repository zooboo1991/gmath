import { getSupabase } from "./supabase";

const BUCKET = "articles";

export async function uploadCoverImage(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `covers/${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await getSupabase()
    .storage.from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false });
  if (error) throw error;

  const { data } = getSupabase().storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
