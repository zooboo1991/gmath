/**
 * Level assessment domain types. Kept separate from lib/db.ts so the
 * assessment feature can grow without making that file any longer.
 */

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

export type Problem = {
  id: string;
  level: number;
  difficulty: number;
  topic: string;
  imageUrl: string;
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
    imageUrl: problem.imageUrl,
  };
}

export type Assessment = {
  id: string;
  userId: string;
  status: AssessmentStatus;
  estimatedLevel?: number;
  finalLevel?: number;
  teacherComment?: string;
  gradedSheetPath?: string;
  paymentProvider: string;
  paymentRef?: string;
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
