import { NextResponse } from "next/server";
import { getPickingState, listProblems, listSolutions, upsertSolution } from "@/lib/assessment/db";
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

  const chosen = await Promise.all(
    state.chosen.map(async (entry) => {
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
      };
    })
  );

  return NextResponse.json({ ok: true, status: guard.assessment.status, chosen });
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

  // Uploading against a problem they answered "Амархан" to (or never saw)
  // would put work in front of a grader that was never assigned.
  const state = await getPickingState(guard.assessment);
  if (!state.chosen.some((c) => c.problemId === problemId)) {
    return NextResponse.json({ ok: false, error: "Энэ бодлогыг та сонгоогүй байна" }, { status: 400 });
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

    const urls = await Promise.all(
      paths.map((path) => createSignedUrl(SOLUTIONS_BUCKET, path, SIGNED_URL_TTL_SECONDS))
    );
    return NextResponse.json({ ok: true, imageUrls: urls.filter((u): u is string => Boolean(u)) });
  } catch (err) {
    if (err instanceof Error && err.message === "unsupported_image_type") {
      return NextResponse.json(
        { ok: false, error: "Зөвхөн PNG, JPG, GIF, WEBP форматын зураг оруулна уу" },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: false, error: "Зураг байршуулахад алдаа гарлаа" }, { status: 500 });
  }
}
