import { NextResponse } from "next/server";
import {
  getPickingState,
  listProblems,
  listSolutions,
  setProblemSkipped,
  upsertSolution,
} from "@/lib/assessment/db";
import {
  MAX_SOLUTION_IMAGES_PER_PROBLEM,
  MAX_SOLUTION_IMAGE_BYTES,
  SIGNED_URL_TTL_SECONDS,
} from "@/lib/assessment/config";
import { requireOwnAssessment, requireStatus } from "@/lib/assessment/guard";
import { toPublicProblem } from "@/lib/assessment/types";
import { createSignedUrl, SOLUTIONS_BUCKET, uploadPrivateImage } from "@/lib/storage";

/**
 * The problems this student committed to solving, each with whatever they
 * have uploaded so far (as short-lived signed URLs — the bucket is private).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireOwnAssessment(id);
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  }

  const [state, allProblems, solutions] = await Promise.all([
    getPickingState(guard.assessment),
    listProblems({ includeInactive: true }),
    listSolutions(id),
  ]);

  // Every problem on the paper, in order, with what the child has done to it.
  // `chosen` keeps its old shape for the submit check; the stepper reads
  // `steps`, which includes the ones marked "бодож чадсангүй" so it can show
  // them as done rather than silently dropping a step.
  const describe = async (entry: { problemId: string; action: string }) => {
    const problem = allProblems.find((p) => p.id === entry.problemId);
    const solution = solutions.find((s) => s.problemId === entry.problemId);
    const urls = await Promise.all(
      (solution?.imagePaths ?? []).map((path) =>
        createSignedUrl(SOLUTIONS_BUCKET, path, SIGNED_URL_TTL_SECONDS)
      )
    );
    return {
      problem: problem ? toPublicProblem(problem) : null,
      imageUrls: urls.filter((u): u is string => Boolean(u)),
      skipped: entry.action === "dont_know",
    };
  };

  const steps = await Promise.all(state.shown.map(describe));
  const chosen = steps.filter((s) => !s.skipped);

  return NextResponse.json({ ok: true, status: guard.assessment.status, steps, chosen });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireOwnAssessment(id);
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  }
  // Once submitted, the work is with the graders — no more edits.
  const step = requireStatus(guard.assessment, ["questionnaire_done"]);
  if (!step.ok) {
    return NextResponse.json({ ok: false, error: "Бодолт илгээгдсэн тул өөрчлөх боломжгүй" }, { status: 409 });
  }

  const formData = await request.formData();
  const problemId = String(formData.get("problemId") ?? "");

  // Uploading against a problem that was never put in front of them would
  // give a grader work that was never assigned.
  const state = await getPickingState(guard.assessment);
  const entry = state.shown.find((c) => c.problemId === problemId);
  if (!entry) {
    return NextResponse.json({ ok: false, error: "Энэ бодлого таных биш байна" }, { status: 400 });
  }

  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ ok: false, error: "Зураг сонгоно уу" }, { status: 400 });
  }

  const existing = (await listSolutions(id)).find((s) => s.problemId === problemId);
  const existingPaths = existing?.imagePaths ?? [];
  if (existingPaths.length + files.length > MAX_SOLUTION_IMAGES_PER_PROBLEM) {
    return NextResponse.json(
      { ok: false, error: `Нэг бодлогод хамгийн ихдээ ${MAX_SOLUTION_IMAGES_PER_PROBLEM} зураг` },
      { status: 400 }
    );
  }
  for (const file of files) {
    if (file.size > MAX_SOLUTION_IMAGE_BYTES) {
      return NextResponse.json({ ok: false, error: "Зургийн хэмжээ 5MB-ээс ихгүй байх ёстой" }, { status: 400 });
    }
  }

  try {
    const uploaded = await Promise.all(
      files.map((file) => uploadPrivateImage(file, SOLUTIONS_BUCKET, `${id}/${problemId}`))
    );
    const paths = [...existingPaths, ...uploaded];
    await upsertSolution(id, problemId, paths);
    // A photo overrides an earlier "бодож чадсангүй": they came back to it.
    if (entry.action === "dont_know") {
      await setProblemSkipped(id, problemId, false);
    }

    const urls = await Promise.all(
      paths.map((path) => createSignedUrl(SOLUTIONS_BUCKET, path, SIGNED_URL_TTL_SECONDS))
    );
    return NextResponse.json({ ok: true, imageUrls: urls.filter((u): u is string => Boolean(u)) });
  } catch (err) {
    if (err instanceof Error && err.message === "unsupported_image_type") {
      return NextResponse.json(
        {
          ok: false,
          // Almost always an iPhone HEIC that the browser could not convert.
          error:
            "Зургийн формат тохирохгүй байна. iPhone бол Тохиргоо → Камер → Формат → «Хамгийн нийцтэй» болгоод дахин зураг аваарай.",
        },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: false, error: "Зураг байршуулахад алдаа гарлаа" }, { status: 500 });
  }
}
