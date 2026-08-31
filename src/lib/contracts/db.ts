import { getSupabase } from "../supabase";

/** Word файл доторх нэг таг, түүнийг ямар талбартай холбосон нь. */
export type ContractTag = {
  /** Файлд бичигдсэн хэлбэрээрээ: "сурагчийн_нэр". */
  tag: string;
  /** src/lib/contracts/fields.ts дэх түлхүүр. Хоосон бол гэрээн дээр хоосон зай үлдэнэ. */
  field?: string;
};

export type ContractTemplate = {
  id: string;
  title: string;
  filePath?: string;
  fileName?: string;
  fileSize?: number;
  tags: ContractTag[];
  status: "draft" | "active";
  createdAt: string;
  updatedAt: string;
  /** Энэ гэрээ хамаарах сургалтууд. */
  programIds: string[];
};

type Row = {
  id: string;
  title: string;
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  tags: ContractTag[] | null;
  status: "draft" | "active";
  created_at: string;
  updated_at: string;
};

function fromRow(row: Row, programIds: string[]): ContractTemplate {
  return {
    id: row.id,
    title: row.title,
    filePath: row.file_path ?? undefined,
    fileName: row.file_name ?? undefined,
    fileSize: row.file_size ?? undefined,
    tags: row.tags ?? [],
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    programIds,
  };
}

async function programIdsByTemplate(templateIds: string[]): Promise<Map<string, string[]>> {
  const byTemplate = new Map<string, string[]>();
  if (templateIds.length === 0) return byTemplate;
  const { data, error } = await getSupabase()
    .from("contract_template_programs")
    .select("template_id, program_id")
    .in("template_id", templateIds);
  if (error) throw error;
  for (const row of (data ?? []) as { template_id: string; program_id: string }[]) {
    const list = byTemplate.get(row.template_id) ?? [];
    list.push(row.program_id);
    byTemplate.set(row.template_id, list);
  }
  return byTemplate;
}

export async function listContractTemplates(): Promise<ContractTemplate[]> {
  const { data, error } = await getSupabase()
    .from("contract_templates")
    .select("*")
    .order("created_at", { ascending: false })
    .order("id");
  if (error) throw error;
  const rows = data as Row[];
  const links = await programIdsByTemplate(rows.map((r) => r.id));
  return rows.map((row) => fromRow(row, links.get(row.id) ?? []));
}

export async function findContractTemplate(id: string): Promise<ContractTemplate | undefined> {
  const { data, error } = await getSupabase()
    .from("contract_templates")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return undefined;
  const row = data as Row;
  const links = await programIdsByTemplate([row.id]);
  return fromRow(row, links.get(row.id) ?? []);
}

/** Тухайн сургалтад холбогдсон, ашиглахад бэлэн гэрээнүүд. */
export async function listActiveTemplatesForProgram(programId: string): Promise<ContractTemplate[]> {
  const { data, error } = await getSupabase()
    .from("contract_template_programs")
    .select("template_id")
    .eq("program_id", programId);
  if (error) throw error;
  const ids = (data as { template_id: string }[]).map((r) => r.template_id);
  if (ids.length === 0) return [];

  const { data: rows, error: rowError } = await getSupabase()
    .from("contract_templates")
    .select("*")
    .in("id", ids)
    .eq("status", "active");
  if (rowError) throw rowError;
  const links = await programIdsByTemplate(ids);
  return (rows as Row[]).map((row) => fromRow(row, links.get(row.id) ?? []));
}

export async function createContractTemplate(title: string): Promise<ContractTemplate> {
  const { data, error } = await getSupabase()
    .from("contract_templates")
    .insert({ title })
    .select("*")
    .single();
  if (error) throw error;
  return fromRow(data as Row, []);
}

export async function updateContractTemplate(
  id: string,
  input: Partial<Pick<ContractTemplate, "title" | "filePath" | "fileName" | "fileSize" | "tags" | "status">>
): Promise<ContractTemplate | undefined> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.title !== undefined) patch.title = input.title;
  if (input.filePath !== undefined) patch.file_path = input.filePath || null;
  if (input.fileName !== undefined) patch.file_name = input.fileName || null;
  if (input.fileSize !== undefined) patch.file_size = input.fileSize ?? null;
  if (input.tags !== undefined) patch.tags = input.tags;
  if (input.status !== undefined) patch.status = input.status;

  const { data, error } = await getSupabase()
    .from("contract_templates")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) return undefined;
  const row = data as Row;
  const links = await programIdsByTemplate([row.id]);
  return fromRow(row, links.get(row.id) ?? []);
}

/** Холбоосыг бүхэлд нь солино — сонгосон сургалтуудын жагсаалт нь эх сурвалж. */
export async function setTemplatePrograms(templateId: string, programIds: string[]): Promise<void> {
  const supabase = getSupabase();
  const { error: clearError } = await supabase
    .from("contract_template_programs")
    .delete()
    .eq("template_id", templateId);
  if (clearError) throw clearError;

  const unique = [...new Set(programIds.filter((id) => id.trim()))];
  if (unique.length === 0) return;
  const { error } = await supabase
    .from("contract_template_programs")
    .insert(unique.map((programId) => ({ template_id: templateId, program_id: programId })));
  if (error) throw error;
}

export async function deleteContractTemplate(id: string): Promise<void> {
  const { error } = await getSupabase().from("contract_templates").delete().eq("id", id);
  if (error) throw error;
}
