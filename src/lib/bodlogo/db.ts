import { getSupabase } from "../supabase";
import { fetchAllRows } from "../fetchAll";
import { problemFromRow, type ProblemRow } from "../assessment/db";
import type { Problem, ProblemCategory } from "../assessment/types";

/**
 * Бодлого хувилах систем (bodlogo)-оос ирсэн бодлогууд.
 *
 * Тэр систем сурах бичгээс бодлого уншиж, загвар болгож, нэг загвараас олон
 * хувилбар үүсгэдэг. Багш загварыг нэг удаа батлахад түүний бүх хувилбар
 * батлагдсанд тооцогдож ирнэ — тиймээс энд нэг дор хэдэн зуун мөр буудаг.
 *
 * Эдгээр нь бодлогын банк БИШ, банкны өмнөх хүлээлгийн сан. Багш эндээс
 * сонгож байж `problems` руу татна: нэг загвараас 20 хувилбар гардаг тул
 * бүгдийг нь банкинд оруулах нь утгагүй, мөн гаднаас ирдэг зам тул түлхүүр
 * алдагдсан ч хүүхдийн шалгалтад юу ч орох ёсгүй.
 */

export type BodlogoAnswerType = "integer" | "decimal" | "fraction" | "int_set" | "quantity";

export const BODLOGO_ANSWER_TYPES: readonly BodlogoAnswerType[] = [
  "integer",
  "decimal",
  "fraction",
  "int_set",
  "quantity",
];

/** AI багшийн нэг алхам. `valueKey` нь тухайн алхмын завсрын утгын нэр. */
export type BodlogoTutorStep = { title: string; text: string; valueKey: string | null };

/** Түгээмэл буруу хариу — яагаад ингэж алдсаныг оношилж, чиглүүлнэ. */
export type BodlogoCommonError = {
  value: string;
  display: string;
  diagnosis: string;
  nudge: string;
};

export type BodlogoTutor = {
  steps: BodlogoTutorStep[];
  hints: string[] | null;
  commonErrors: BodlogoCommonError[];
};

export type BodlogoProblem = {
  id: string;
  externalId: string;
  templateId: string;
  familyId: string;
  grade: number;
  topic?: string;
  /** 1 хялбар, 2 үрийн түвшин, 3 хүнд. `Problem.level` (1-10)-тэй өөр утгатай. */
  level: 1 | 2 | 3;
  bodyLatex: string;
  solutionMn: string;
  answerType: BodlogoAnswerType;
  answerValue: string;
  answerDisplay: string;
  answerUnit?: string;
  answerTolerance?: number;
  tags: string[];
  tutor?: BodlogoTutor;
  /** Банк руу татсан бол тэр бодлогын id. Хоосон бол хүлээж байна. */
  takenProblemId?: string;
  takenAt?: string;
  createdAt: string;
};

type Row = {
  id: string;
  external_id: string;
  template_id: string;
  family_id: string;
  grade: number;
  topic: string | null;
  level: number;
  body_latex: string;
  solution_mn: string;
  answer_type: string;
  answer_value: string;
  answer_display: string;
  answer_unit: string | null;
  answer_tolerance: number | string | null;
  tags: string[] | null;
  tutor: unknown;
  taken_problem_id: string | null;
  taken_at: string | null;
  created_at: string;
};

function isInvalidUuidError(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "22P02";
}

/**
 * `tutor` нь gmath-ын бичээгүй өгөгдөл — bodlogo талаас ирдэг JSON. Хэлбэр нь
 * зөрвөл унагаахын оронд орхино: энэ талбар одоогоор зөвхөн хадгалагддаг тул
 * нэг бодлогын tutor эвдэрсэн нь бүх жагсаалтыг уншихад саад болох ёсгүй.
 */
function tutorFromJson(value: unknown): BodlogoTutor | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const raw = value as Record<string, unknown>;
  const steps = Array.isArray(raw.steps) ? raw.steps : [];
  const commonErrors = Array.isArray(raw.common_errors) ? raw.common_errors : [];
  return {
    steps: steps.flatMap((step) => {
      if (typeof step !== "object" || step === null) return [];
      const one = step as Record<string, unknown>;
      if (typeof one.title !== "string" || typeof one.text !== "string") return [];
      return [
        {
          title: one.title,
          text: one.text,
          valueKey: typeof one.value_key === "string" ? one.value_key : null,
        },
      ];
    }),
    hints: Array.isArray(raw.hints)
      ? raw.hints.filter((hint): hint is string => typeof hint === "string")
      : null,
    commonErrors: commonErrors.flatMap((entry) => {
      if (typeof entry !== "object" || entry === null) return [];
      const one = entry as Record<string, unknown>;
      const fields = ["value", "display", "diagnosis", "nudge"] as const;
      if (fields.some((field) => typeof one[field] !== "string")) return [];
      return [
        {
          value: one.value as string,
          display: one.display as string,
          diagnosis: one.diagnosis as string,
          nudge: one.nudge as string,
        },
      ];
    }),
  };
}

function fromRow(row: Row): BodlogoProblem {
  const tolerance = row.answer_tolerance;
  return {
    id: row.id,
    externalId: row.external_id,
    templateId: row.template_id,
    familyId: row.family_id,
    grade: row.grade,
    topic: row.topic ?? undefined,
    level: (row.level === 1 || row.level === 3 ? row.level : 2) as 1 | 2 | 3,
    bodyLatex: row.body_latex,
    solutionMn: row.solution_mn,
    answerType: (BODLOGO_ANSWER_TYPES as readonly string[]).includes(row.answer_type)
      ? (row.answer_type as BodlogoAnswerType)
      : "integer",
    answerValue: row.answer_value,
    answerDisplay: row.answer_display,
    answerUnit: row.answer_unit ?? undefined,
    answerTolerance: tolerance === null ? undefined : Number(tolerance),
    tags: row.tags ?? [],
    tutor: tutorFromJson(row.tutor),
    takenProblemId: row.taken_problem_id ?? undefined,
    takenAt: row.taken_at ?? undefined,
    createdAt: row.created_at,
  };
}

export type BodlogoProblemInput = {
  externalId: string;
  templateId: string;
  familyId: string;
  grade: number;
  topic: string | null;
  level: number;
  bodyLatex: string;
  solutionMn: string;
  answerType: BodlogoAnswerType;
  answerValue: string;
  answerDisplay: string;
  answerUnit: string | null;
  answerTolerance: number | null;
  tags: string[];
  tutor: unknown;
};

/**
 * `external_id`-аар давхардуулахгүй бичнэ.
 *
 * bodlogo-гийн publish командыг дахин дахин ажиллуулж болдог тул ижил бодлого
 * дахин ирэх нь хэвийн — шинэ мөр үүсгэхгүй, байгааг нь шинэчилнэ.
 *
 * Багш аль хэдийн банк руу татсан мөрийг ч шинэчилнэ (эх, бодолт нь
 * сайжирсан байж болно), гэхдээ `taken_problem_id`-г хөндөхгүй — татсан
 * гэдэг баримтыг гаднаас ирсэн өгөгдөл буцаах ёсгүй.
 */
export async function upsertBodlogoProblem(input: BodlogoProblemInput): Promise<BodlogoProblem> {
  const { data, error } = await getSupabase()
    .from("bodlogo_problems")
    .upsert(
      {
        external_id: input.externalId,
        template_id: input.templateId,
        family_id: input.familyId,
        grade: input.grade,
        topic: input.topic,
        level: input.level,
        body_latex: input.bodyLatex,
        solution_mn: input.solutionMn,
        answer_type: input.answerType,
        answer_value: input.answerValue,
        answer_display: input.answerDisplay,
        answer_unit: input.answerUnit,
        answer_tolerance: input.answerTolerance,
        tags: input.tags,
        tutor: input.tutor ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "external_id" }
    )
    .select("*")
    .single();
  if (error) throw error;
  return fromRow(data as Row);
}

/**
 * Бүх ирсэн бодлого. PostgREST 1000 мөрөөр таслах тул хуудаслана — нэг
 * загвараас 20 хувилбар гардаг энэ хүснэгт тэр хязгаарыг хурдан давна.
 */
export async function listBodlogoProblems(
  opts: { onlyPending?: boolean; grade?: number } = {}
): Promise<BodlogoProblem[]> {
  const rows = await fetchAllRows<Row>(() => {
    let query = getSupabase()
      .from("bodlogo_problems")
      .select("*")
      .order("grade")
      .order("level")
      .order("id");
    if (opts.onlyPending) query = query.is("taken_problem_id", null);
    if (opts.grade !== undefined) query = query.eq("grade", opts.grade);
    return query;
  });
  return rows.map(fromRow);
}

export async function findBodlogoProblemById(id: string): Promise<BodlogoProblem | undefined> {
  const { data, error } = await getSupabase()
    .from("bodlogo_problems")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (isInvalidUuidError(error)) return undefined;
    throw error;
  }
  return data ? fromRow(data as Row) : undefined;
}

/** Анги → C (5-6) / D (7-8). Бусад ангид таамаглахгүй — багш өөрөө сонгоно. */
export function defaultCategoryForGrade(grade: number): ProblemCategory | undefined {
  if (grade === 5 || grade === 6) return "C";
  if (grade === 7 || grade === 8) return "D";
  return undefined;
}

export type TakeResult =
  | { ok: true; problem: Problem }
  | { ok: false; reason: "not_found" | "already_taken" };

/**
 * Хүлээлгийн сангийн нэг мөрийг бодлогын банк руу татна.
 *
 * Хариултын НЭГЖ банк руу явахгүй: "25%" гэсэн асуултын хариу нь 25 бөгөөд
 * сурагч яг түүнийг бичнэ. Нэгж нь асуултын нэг хэсэг тул эхэд нь үлдэнэ —
 * хариултын түлхүүрт нэмбэл зөв бичсэн хүүхэд буруу гэж үнэлэгдэнэ.
 */
export async function takeBodlogoProblemIntoBank(
  id: string,
  options: { category: ProblemCategory; active: boolean }
): Promise<TakeResult> {
  const entry = await findBodlogoProblemById(id);
  if (!entry) return { ok: false, reason: "not_found" };
  if (entry.takenProblemId) return { ok: false, reason: "already_taken" };

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("problems")
    .insert({
      topic: entry.topic ?? "",
      category: options.category,
      body_latex: entry.bodyLatex,
      answer_key: entry.answerValue,
      active: options.active,
      bodlogo_external_id: entry.externalId,
    })
    .select("*")
    .single();
  if (error) {
    // Ижил хувилбар аль хэдийн банкинд байвал unique индекс барина. Хоёр таб
    // зэрэг дарсан тохиолдол — алдаа биш, "аль хэдийн татсан" гэж хэлнэ.
    if ((error as { code?: string }).code === "23505") {
      return { ok: false, reason: "already_taken" };
    }
    throw error;
  }
  const problem = problemFromRow(data as ProblemRow);

  // Тэмдэглэгээ нь бодлого үүссэний ДАРАА. Эсрэгээр нь хийвэл банкны insert
  // унахад мөр "татагдсан" гэж үлдэж, дахин татах боломжгүй болно.
  const { error: markError } = await supabase
    .from("bodlogo_problems")
    .update({ taken_problem_id: problem.id, taken_at: new Date().toISOString() })
    .eq("id", entry.id);
  if (markError) throw markError;

  return { ok: true, problem };
}

/**
 * Нэг гэр бүлээс аль хэдийн татсан бодлогуудын external_id.
 *
 * bodlogo тал нэг гэр бүлийн (үр + түүний хялбар/хүнд ах дүү) хувилбаруудыг
 * нэг шалгалтад давхардуулахгүй байх үүргийг gmath-д даалгасан. Багш татах
 * үед энэ жагсаалтаар сануулга харуулна.
 */
export async function listTakenFamilyIds(): Promise<Set<string>> {
  const rows = await fetchAllRows<{ family_id: string }>(() =>
    getSupabase()
      .from("bodlogo_problems")
      .select("family_id")
      .not("taken_problem_id", "is", null)
      .order("id")
  );
  return new Set(rows.map((row) => row.family_id));
}
