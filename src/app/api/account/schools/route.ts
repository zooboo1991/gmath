import { NextResponse } from "next/server";
import { listSchoolSuggestions } from "@/lib/db";

/**
 * Unauthenticated on purpose — used while filling out the registration
 * form, before an account exists. Only ever returns school names (already
 * public, self-reported by other users), nothing else.
 */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  if (query.trim().length < 1 || query.length > 100) {
    return NextResponse.json({ schools: [] });
  }
  const schools = await listSchoolSuggestions(query);
  return NextResponse.json({ schools });
}
