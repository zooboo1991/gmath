import { NextResponse } from "next/server";
import { createUser, linkPendingRegistrationsToUser, toPublicUser } from "@/lib/db";
import { logAdminAction } from "@/lib/adminLog";
import { isAdmin } from "@/lib/session";
import { isTooLong, MAX_LEN } from "@/lib/validate";

const PHONE_RE = /^[0-9]{8}$/;
const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,}$/;

/**
 * Admin creating an account by hand — phone + password only, no OTP (the
 * admin already knows who this is, unlike a self-registering stranger). The
 * rest of the profile (name, email, school, ...) starts blank; the student
 * fills it in themselves from the profile edit page, which already requires
 * all of it before it'll save (see /api/account/profile).
 */
export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }

  const data = await request.json().catch(() => ({}));
  const phone = typeof data.phone === "string" ? data.phone.trim() : "";
  const password = typeof data.password === "string" ? data.password : "";
  const role = data.role === "teacher" ? "teacher" : "student";

  const errors: Record<string, string> = {};
  if (!PHONE_RE.test(phone)) errors.phone = "8 оронтой утасны дугаар оруулна уу";
  if (!PASSWORD_RE.test(password) || isTooLong(password, MAX_LEN.password)) {
    errors.password = "Нууц үг том, жижиг үсэг, тоо орсон, дор хаяж 6 тэмдэгт байна";
  }
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ ok: false, errors }, { status: 400 });
  }

  let user;
  try {
    user = await createUser(
      {
        role,
        lastName: "",
        firstName: "",
        province: "",
        district: "",
        school: "",
        phone,
        email: "",
      },
      password
    );
  } catch (err) {
    if ((err as Error)?.message === "phone_taken") {
      return NextResponse.json({ ok: false, errors: { phone: "Энэ дугаараар бүртгэл үүссэн байна" } }, { status: 409 });
    }
    throw err;
  }

  // Same as self-registration — attaches any registration admin added by
  // phone before this account existed.
  await linkPendingRegistrationsToUser(user.phone, user.id);

  await logAdminAction(request, { actionType: "user.create", targetId: user.id, details: { phone, role } });

  return NextResponse.json({ ok: true, user: toPublicUser(user) });
}
