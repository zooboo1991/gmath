import { getSupabase } from "./supabase";

/**
 * Шинэ сурагчийн эхлэлийн гурван алхам.
 *
 * Алхмуудын нэр кодод сууна, зөвхөн "хийсэн эсэх" нь өгөгдөл — тестүүд,
 * гэрээний талбаруудтай ижил зарчим. Ингэснээр алхам нэмэх, үг солиход
 * миграци хэрэггүй.
 */
export const ONBOARDING_STEPS = ["facebook", "schedule", "zoom"] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export function isOnboardingStep(value: unknown): value is OnboardingStep {
  return typeof value === "string" && (ONBOARDING_STEPS as readonly string[]).includes(value);
}

/** Алхмын нэрээр "хийсэн эсэх". Мөр байхгүй бол хийгээгүй. */
export type OnboardingState = Partial<Record<OnboardingStep, boolean>>;

/**
 * Нэг сурагчийн бүх сургалт дээрх төлөв, сургалтын id-гаар.
 *
 * Профайлын хуудас нэг л удаа дуудна — сургалт тус бүрд тусдаа асуулга
 * явуулах шаардлагагүй.
 */
export async function listOnboardingByProgram(
  userId: string
): Promise<Record<string, OnboardingState>> {
  const { data, error } = await getSupabase()
    .from("course_onboarding_steps")
    .select("program_id, step, done")
    .eq("user_id", userId);
  if (error) throw error;

  const byProgram: Record<string, OnboardingState> = {};
  for (const row of (data ?? []) as { program_id: string; step: OnboardingStep; done: boolean }[]) {
    (byProgram[row.program_id] ??= {})[row.step] = row.done;
  }
  return byProgram;
}

/**
 * Нэг алхмыг тэмдэглэх, эсвэл тэмдэглэгээг буцаах.
 *
 * Upsert тул хэдэн ч удаа дарж болно — сурагч санамсаргүй хоёр удаа дарахад
 * алдаа гарах ёсгүй.
 */
export async function markOnboardingStep(input: {
  userId: string;
  programId: string;
  step: OnboardingStep;
  done: boolean;
}): Promise<void> {
  const { error } = await getSupabase().from("course_onboarding_steps").upsert(
    {
      user_id: input.userId,
      program_id: input.programId,
      step: input.step,
      done: input.done,
      marked_at: new Date().toISOString(),
    },
    { onConflict: "user_id,program_id,step" }
  );
  if (error) throw error;
}
