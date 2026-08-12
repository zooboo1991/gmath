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
export type AssessmentTrack = "regular" | "advanced" | "olympiad";

export type QuizTrack = Exclude<AssessmentTrack, "olympiad">;

export const TRACK_LABELS: Record<AssessmentTrack, string> = {
  regular: "Энгийн ангийн тест",
  advanced: "Сонгон ангийн тест",
  olympiad: "Олимпиадын түвшин тогтоолт",
};

export type AssessmentStatus =
  | "awaiting_payment"
  | "paid"
  | "questionnaire_done"
  | "problems_submitted"
  | "grading"
  | "completed";

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
export type Problem = {
  id: string;
  level: number;
  difficulty: number;
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
  track: AssessmentTrack;
  /** Quiz tracks only — the grade the student picked, which chose the question set. */
  quizGrade?: number;
  quizScore?: number;
  quizTotal?: number;
  /** The AI-written recommendation a completed quiz shows. */
  aiRecommendation?: string;
  estimatedLevel?: number;
  finalLevel?: number;
  teacherComment?: string;
  gradedSheetPath?: string;
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
  createdAt: string;
};

/** The shape a student is allowed to see — correctIndex deliberately absent. */
export type PublicQuizQuestion = Omit<QuizQuestion, "correctIndex" | "active" | "createdAt">;

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
