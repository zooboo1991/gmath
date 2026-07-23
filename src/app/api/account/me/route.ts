import { NextResponse } from "next/server";
import { toPublicUser } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export async function GET() {
  const user = await getSessionUser();
  return NextResponse.json({ user: user ? toPublicUser(user) : null });
}
