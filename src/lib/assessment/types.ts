/**
 * Level assessment domain types. Kept separate from lib/db.ts so the
 * assessment feature can grow without making that file any longer.
 */

/**
 * Which of the three assessment tracks this is.
 *  - regular / advanced: the multiple-choice quiz, auto-scored, AI writes the
 *    recommendation. Status walks awaiting_payment → paid → completed.
 *  - olympiad: the original flow — questionnaire, hand-picked problems,
 *    photographed solutions, a teacher grades and concludes.
 */
export type AssessmentTrack = "regular" | "advanced" | "olympiad" | "placement";

export type QuizTrack = Exclude<AssessmentTrack, "olympiad" | "placement">;

export const TRACK_LABELS: Record<AssessmentTrack, string> = {
  // Хуучин мөрүүдийн үр дүнгийн хуудсанд л харагдана — шинэ шалгалт
  // "placement" төрлөөр явна.
  regular: "Энгийн ангийн тест",
  advanced: "Сонгон ангийн тест",
  olympiad: "Олимпиадын түвшин тогтоолт",
  placement: "Түвшин тогтоох шалгалт",
};

export type AssessmentStatus =
  | "awaiting_payment"
  | "paid"
  | "questionnaire_done"
  | "problems_submitted"
  | "grading"
  | "completed"
  /** Voided by the school so the student can sit it again from the start. */
  | "cancelled";

/** What the student chose when a problem was put in front of them. */
export type ProblemAction = "too_easy" | "dont_know" | "solving";

export type Level = {
  id: number;
  name: string;
  description: string;
  scope: string;
  howToAdvance: string;
  recommendedCourseId?: string;
};

/**
 * A problem is written as LaTeX, or scanned as an image, or both (a geometry
 * statement plus its figure). At least one of the two is always present —
 * enforced by the problems_has_content constraint.
 */
/**
 * Which problem bank a problem belongs to, and which one a child is assessed
 * from. C is 5th-6th grade, D is 7th-8th — the year-long programme the child
 * is preparing for, not a difficulty rating (the 1-10 level does that, inside
 * a category).
 */
export const PROBLEM_CATEGORIES = ["C", "D"] as const;
export type ProblemCategory = (typeof PROBLEM_CATEGORIES)[number];

export function isProblemCategory(value: unknown): value is ProblemCategory {
  return value === "C" || value === "D";
}

/**
 * The category a child of this grade is assessed in. Returns undefined outside
 * 5-8, where the site has no answer and the student is asked to choose rather
 * than being quietly filed into the wrong bank.
 */
export function categoryForGrade(grade: number | undefined): ProblemCategory | undefined {
  if (grade === 5 || grade === 6) return "C";
  if (grade === 7 || grade === 8) return "D";
  return undefined;
}

/**
 * The grade as a number, out of whatever a parent typed.
 *
 * `users.grade` is free text and in practice reads "6-р анги" — Number() on
 * that is NaN, which silently made every child gradeless and, for a while,
 * left every invited class without their exam.
 */
export function parseGrade(grade: string | number | undefined | null): number | undefined {
  if (typeof grade === "number") return Number.isFinite(grade) ? grade : undefined;
  const match = String(grade ?? "").match(/\d{1,2}/);
  if (!match) return undefined;
  const value = Number(match[0]);
  return value >= 1 && value <= 12 ? value : undefined;
}

export type Problem = {
  id: string;
  /** Unset on problems entered before the bank was split by category. */
  category?: ProblemCategory;
  /** Both unset on problems entered after the difficulty ladder was removed. */
  level?: number;
  difficulty?: number;
  topic: string;
  /** Mongolian prose with `$...$` / `$$...$$` math, rendered via KaTeX. */
  bodyLatex?: string;
  imageUrl?: string;
  /** Admin-only. Never include this in a response sent to a student. */
  answerKey?: string;
  active: boolean;
  createdAt: string;
};

/** The shape a student is allowed to see — answerKey deliberately absent. */
export type PublicProblem = Omit<Problem, "answerKey" | "active" | "createdAt">;

export function toPublicProblem(problem: Problem): PublicProblem {
  return {
    id: problem.id,
    category: problem.category,
    level: problem.level,
    difficulty: problem.difficulty,
    topic: problem.topic,
    bodyLatex: problem.bodyLatex,
    imageUrl: problem.imageUrl,
  };
}

export type Assessment = {
  id: string;
  userId: string;
  status: AssessmentStatus;
  /** What the sitting was before it was cancelled, so it can be put back. */
  cancelledFrom?: AssessmentStatus;
  track: AssessmentTrack;
  /** Olympiad track only — the problem bank this child is being assessed from. */
  category?: ProblemCategory;
  /** The exam this child sat. Unset on assessments taken before exams existed. */
  examId?: string;
  /** Quiz tracks only — the grade the student picked, which chose the question set. */
  quizGrade?: number;
  quizScore?: number;
  quizTotal?: number;
  /** The AI-written recommendation a completed quiz shows. */
  aiRecommendation?: string;
  estimatedLevel?: number;
  finalLevel?: number;
  teacherComment?: string;
  /** The single scan uploaded before the verdict took several images. Read-only now. */
  gradedSheetPath?: string;
  /** The teacher's marked-up pages, newest last. */
  gradedSheetPaths: string[];
  paymentProvider: string;
  paymentRef?: string;
  /** Set once a QPay invoice exists for this assessment; undefined for the stub provider. */
  paymentInvoiceId?: string;
  paymentQrImage?: string;
  paymentShortUrl?: string;
  amount?: string;
  paidAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type QuestionnaireAnswers = {
  id: string;
  assessmentId: string;
  age?: number;
  grade: string;
  hasCompeted: boolean;
  hasPrepared: boolean;
  achievements: string;
  createdAt: string;
};

/** The questionnaire as the student submits it, before it has an id. */
export type QuestionnaireInput = Omit<QuestionnaireAnswers, "id" | "assessmentId" | "createdAt">;

export type AssessmentProblem = {
  id: string;
  assessmentId: string;
  problemId: string;
  action: ProblemAction;
  shownOrder: number;
  createdAt: string;
};

export type Solution = {
  id: string;
  assessmentId: string;
  problemId: string;
  /** Storage paths in the private "solutions" bucket, not public URLs. */
  imagePaths: string[];
  graderScore?: number;
  graderComment?: string;
  gradedAt?: string;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Quiz (regular / advanced tracks)
// ---------------------------------------------------------------------------

export type QuizQuestion = {
  id: string;
  track: QuizTrack;
  grade: number;
  topic: string;
  /** Mongolian prose with `$...$` math, rendered via MathText — same convention as problems. */
  bodyLatex: string;
  /** Exactly four options, rendered with MathText as well. */
  choices: string[];
  /** Admin-only. Never include this in a response sent to a student. */
  correctIndex: number;
  active: boolean;
  /**
   * Free sample: anyone can try it without signing in or paying, and the paid
   * test never serves it — so the taster can't spoil a real attempt.
   */
  sample: boolean;
  createdAt: string;
};

/** The shape a student is allowed to see — correctIndex deliberately absent. */
export type PublicQuizQuestion = Omit<QuizQuestion, "correctIndex" | "active" | "sample" | "createdAt">;

export function toPublicQuizQuestion(q: QuizQuestion): PublicQuizQuestion {
  return { id: q.id, track: q.track, grade: q.grade, topic: q.topic, bodyLatex: q.bodyLatex, choices: q.choices };
}

export type QuizAnswer = {
  id: string;
  assessmentId: string;
  questionId: string;
  shownOrder: number;
  /** Null until the student submits. */
  chosenIndex?: number;
  isCorrect?: boolean;
  createdAt: string;
};
