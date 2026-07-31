import { NextResponse } from "next/server";
import { createProblem, listProblems, type ProblemInput } from "@/lib/assessment/db";
import { hasProblemContent, validateProblemInput } from "@/lib/assessment/validateProblem";
import { isAdmin } from "@/lib/session";

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  // Inactive problems stay listed here so the admin can see and restore them.
  return NextResponse.json({ ok: true, problems: await listProblems({ includeInactive: true }) });
}

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }

  const data = await request.json();
  const result = validateProblemInput(data);
  if ("error" in result) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }
  if (!hasProblemContent(result.value.bodyLatex, result.value.imageUrl)) {
    return NextResponse.json(
      { ok: false, error: "Бодлогын эх (LaTeX) эсвэл зургийн аль нэгийг оруулна уу" },
      { status: 400 }
    );
  }

  const problem = await createProblem(result.value as ProblemInput);
  return NextResponse.json({ ok: true, problem });
}
