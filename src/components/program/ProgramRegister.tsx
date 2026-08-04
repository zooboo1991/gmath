"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import FormField from "@/components/FormField";
import SchoolAutocomplete from "@/components/SchoolAutocomplete";
import {
  IconPerson,
  IconGraduationCap,
  IconQrCode,
  IconBank,
  IconClose,
  IconCheck,
  IconFacebook,
  IconCopy,
} from "@/components/icons";
import { extractCourseCategories, getCourseAudience } from "@/lib/courseTag";
import { DISTRICTS_BY_PROVINCE, PROVINCES, type Province } from "@/lib/mongoliaRegions";
import { staticProgramById } from "@/lib/staticPrograms";

type Role = "teacher" | "student";
type PayMethod = "qpay" | "bank";
type Screen = "login" | "register" | "reset" | "payment" | "qpay-wait" | "success";

// `tag` mirrors what the server uses to build the QPay/bank transfer
// description (course.tag for real courses, the static program's own label
// for yearly programs — see /api/enroll) so the client can compute the same
// "Гүйлгээний утга" text without a round trip.
type Program = { id: string; label: string; price: string; tag: string };

export type SessionUser = {
  id: string;
  role: Role;
  lastName: string;
  firstName: string;
  phone: string;
  email: string;
} | null;

type FieldData = {
  lastName: string;
  firstName: string;
  province: string;
  district: string;
  school: string;
  grade: string;
  phone: string;
  email: string;
  facebook: string;
  password: string;
  passwordConfirm: string;
};

const emptyFields: FieldData = {
  lastName: "",
  firstName: "",
  province: "",
  district: "",
  school: "",
  grade: "",
  phone: "",
  email: "",
  facebook: "",
  password: "",
  passwordConfirm: "",
};

const PHONE_RE = /^[0-9]{8}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,}$/;

type Errors = Partial<Record<keyof FieldData, boolean>>;

type Ctx = {
  sessionUser: SessionUser;
  /** False until /api/account/me has answered, so the header can avoid
   *  rendering "Нэвтрэх" at a visitor who is in fact already signed in. */
  sessionLoaded: boolean;
  /** Programme ids this user is already signed up for, so a course page can
   *  offer to open it instead of selling it to them again. */
  enrolledProgramIds: Set<string>;
  open: (program: Program) => void;
  openLogin: () => void;
  openRegister: () => void;
  logout: () => Promise<void>;
};

const ModalCtx = createContext<Ctx | null>(null);

export function useProgramRegister() {
  const ctx = useContext(ModalCtx);
  if (!ctx) throw new Error("useProgramRegister must be used within ProgramRegisterProvider");
  return ctx;
}

export function RegisterTriggerButton({
  program,
  className,
  children,
}: {
  program: Program;
  className: string;
  children: React.ReactNode;
}) {
  const { open, enrolledProgramIds } = useProgramRegister();

  // Already paid for this one — send them to it rather than through checkout.
  if (enrolledProgramIds.has(program.id)) {
    return (
      <Link href="/profile" className={className}>
        Сургалт харах <span>→</span>
      </Link>
    );
  }

  return (
    <button type="button" onClick={() => open(program)} className={className}>
      {children}
    </button>
  );
}

export function AuthTriggerButton({
  mode,
  className,
  children,
}: {
  mode: "login" | "register";
  className: string;
  children: React.ReactNode;
}) {
  const { openLogin, openRegister } = useProgramRegister();
  return (
    <button type="button" onClick={mode === "login" ? openLogin : openRegister} className={className}>
      {children}
    </button>
  );
}

export default function ProgramRegisterProvider({ children }: { children: React.ReactNode }) {
  const [sessionUser, setSessionUser] = useState<SessionUser>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [enrolledProgramIds, setEnrolledProgramIds] = useState<Set<string>>(new Set());
  const [isOpen, setIsOpen] = useState(false);
  const [program, setProgram] = useState<Program | null>(null);
  const [screen, setScreen] = useState<Screen>("login");

  // 1 role, 2 info, 3 phone OTP, 4 password.
  const [registerStep, setRegisterStep] = useState<1 | 2 | 3 | 4>(1);
  const [role, setRole] = useState<Role | null>(null);
  const [fields, setFields] = useState<FieldData>(emptyFields);
  const [errors, setErrors] = useState<Errors>({});

  const [loginPhone, setLoginPhone] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);

  // 1 phone+email, 2 phone OTP, 3 new password.
  const [resetStep, setResetStep] = useState<1 | 2 | 3>(1);
  const [resetPhone, setResetPhone] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);

  // Shared between the register and reset flows — they're never open at
  // the same time, so one code/cooldown/error is enough for both.
  const [otpCode, setOtpCode] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpCooldown, setOtpCooldown] = useState(0);
  const otpTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [payMethod, setPayMethod] = useState<PayMethod | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [registrationStatus, setRegistrationStatus] = useState<"active" | "pending" | null>(null);
  const [facebookGroup, setFacebookGroup] = useState<string | null>(null);
  const [qpayQr, setQpayQr] = useState<{ registrationId: string; qrImage: string; shortUrl: string } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = (key: string, value: string) => {
    navigator.clipboard.writeText(value).then(() => {
      setCopiedField(key);
      setTimeout(() => setCopiedField((k) => (k === key ? null : k)), 1500);
    });
  };

  useEffect(() => {
    fetch("/api/account/me")
      .then((res) => res.json())
      .then((json) => setSessionUser(json.user))
      .catch(() => setSessionUser(null))
      .finally(() => setSessionLoaded(true));
  }, []);

  // Signed-out visitors get a 401 here, which is fine: the empty set just
  // means every course keeps its "бүртгүүлэх" call to action. Only *active*
  // registrations count as "already enrolled" — a still-pending QPay
  // attempt used to land here too, which turned "Бүртгүүлэх" into "Сургалт
  // харах" for a course the student hadn't actually paid for yet, with no
  // way back into the payment flow to finish or cancel it.
  const refreshEnrolments = () => {
    fetch("/api/account/registrations")
      .then((res) => (res.ok ? res.json() : { registrations: [] }))
      .then((json) =>
        setEnrolledProgramIds(
          new Set<string>(
            (json.registrations ?? [])
              .filter((r: { status: string }) => r.status === "active")
              .map((r: { programId: string }) => r.programId)
          )
        )
      )
      .catch(() => setEnrolledProgramIds(new Set()));
  };

  useEffect(refreshEnrolments, [sessionUser?.id]);

  const resetTransient = () => {
    setRegisterStep(1);
    setRole(null);
    setFields(emptyFields);
    setErrors({});
    setLoginPhone("");
    setLoginPassword("");
    setLoginError(null);
    setResetStep(1);
    setResetPhone("");
    setResetEmail("");
    setResetPassword("");
    setResetPasswordConfirm("");
    setResetError(null);
    setOtpCode("");
    setOtpError(null);
    setOtpCooldown(0);
    if (otpTimerRef.current) clearInterval(otpTimerRef.current);
    setPayMethod(null);
    setSubmitError(null);
    setRegistrationStatus(null);
    setFacebookGroup(null);
    setQpayQr(null);
  };

  const startOtpCooldown = () => {
    if (otpTimerRef.current) clearInterval(otpTimerRef.current);
    setOtpCooldown(60);
    otpTimerRef.current = setInterval(() => {
      setOtpCooldown((s) => {
        if (s <= 1) {
          if (otpTimerRef.current) clearInterval(otpTimerRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  const open = (p: Program) => {
    resetTransient();
    setProgram(p);
    setScreen(sessionUser ? "payment" : "login");
    setIsOpen(true);
  };
  const openLogin = () => {
    resetTransient();
    setProgram(null);
    setScreen("login");
    setIsOpen(true);
  };
  const openRegister = () => {
    resetTransient();
    setProgram(null);
    setScreen("register");
    setIsOpen(true);
  };
  const close = () => setIsOpen(false);

  const logout = async () => {
    await fetch("/api/account/logout", { method: "POST" });
    setSessionUser(null);
  };

  const setField = (name: keyof FieldData, value: string) => {
    const v = name === "phone" ? value.replace(/\D/g, "").slice(0, 8) : value;
    setFields((f) => ({ ...f, [name]: v }));
    setErrors((e) => ({ ...e, [name]: undefined }));
  };

  const validateInfoFields = () => {
    const next: Errors = {};
    if (!fields.lastName.trim()) next.lastName = true;
    if (!fields.firstName.trim()) next.firstName = true;
    if (!fields.province.trim()) next.province = true;
    if (!fields.district.trim()) next.district = true;
    if (!fields.school.trim()) next.school = true;
    if (role === "student" && !fields.grade.trim()) next.grade = true;
    if (!PHONE_RE.test(fields.phone.trim())) next.phone = true;
    if (!EMAIL_RE.test(fields.email.trim())) next.email = true;
    setErrors((e) => ({ ...e, ...next }));
    return Object.keys(next).length === 0;
  };

  const validatePasswordFields = () => {
    const next: Errors = {};
    if (!PASSWORD_RE.test(fields.password)) next.password = true;
    if (fields.passwordConfirm !== fields.password) next.passwordConfirm = true;
    setErrors((e) => ({ ...e, ...next }));
    return Object.keys(next).length === 0;
  };

  const sendOtp = async (phone: string, purpose: "register" | "reset", email?: string) => {
    setOtpError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/account/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, purpose, email }),
      });
      const json = await res.json();
      if (!res.ok) {
        setOtpError(json.error ?? "Код илгээхэд алдаа гарлаа");
        return false;
      }
      startOtpCooldown();
      return true;
    } catch {
      setOtpError("Сүлжээний алдаа гарлаа.");
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const verifyOtpCode = async (phone: string, purpose: "register" | "reset") => {
    if (!/^[0-9]{4}$/.test(otpCode)) {
      setOtpError("4 оронтой кодоо оруулна уу");
      return false;
    }
    setOtpError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/account/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, purpose, code: otpCode }),
      });
      const json = await res.json();
      if (!res.ok) {
        setOtpError(json.error ?? "Код буруу байна");
        return false;
      }
      return true;
    } catch {
      setOtpError("Сүлжээний алдаа гарлаа.");
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const handleContinueToOtp = async () => {
    if (!validateInfoFields()) return;
    setRegisterStep(3);
    await sendOtp(fields.phone, "register");
  };

  const handleVerifyRegisterOtp = async () => {
    if (await verifyOtpCode(fields.phone, "register")) {
      setOtpCode("");
      setRegisterStep(4);
    }
  };

  const afterAuthed = (user: SessionUser) => {
    setSessionUser(user);
    if (program) {
      setScreen("payment");
    } else {
      close();
    }
  };

  const handleLogin = async () => {
    setLoginError(null);
    if (!PHONE_RE.test(loginPhone.trim()) || !loginPassword) {
      setLoginError("Утасны дугаар, нууц үгээ бөглөнө үү");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/account/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: loginPhone.trim(), password: loginPassword }),
      });
      const json = await res.json();
      if (!res.ok) {
        setLoginError(json.error ?? "Нэвтрэхэд алдаа гарлаа");
        return;
      }
      afterAuthed(json.user);
    } catch {
      setLoginError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleContinueToResetOtp = async () => {
    setResetError(null);
    if (!PHONE_RE.test(resetPhone.trim())) {
      setResetError("8 оронтой утасны дугаар оруулна уу");
      return;
    }
    if (!EMAIL_RE.test(resetEmail.trim())) {
      setResetError("Бүртгүүлсэн и-мэйл хаягаа зөв оруулна уу");
      return;
    }
    if (await sendOtp(resetPhone.trim(), "reset", resetEmail.trim())) {
      setResetStep(2);
    }
  };

  const handleVerifyResetOtp = async () => {
    if (await verifyOtpCode(resetPhone.trim(), "reset")) {
      setOtpCode("");
      setResetStep(3);
    }
  };

  const handleReset = async () => {
    setResetError(null);
    if (!PASSWORD_RE.test(resetPassword)) {
      setResetError("Нууц үг том, жижиг үсэг, тоо орсон, дор хаяж 6 тэмдэгт байна");
      return;
    }
    if (resetPassword !== resetPasswordConfirm) {
      setResetError("Нууц үг таарахгүй байна");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/account/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: resetPhone.trim(), email: resetEmail.trim(), newPassword: resetPassword }),
      });
      const json = await res.json();
      if (!res.ok) {
        setResetError(json.error ?? "Алдаа гарлаа");
        return;
      }
      afterAuthed(json.user);
    } catch {
      setResetError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegisterSubmit = async () => {
    if (!validatePasswordFields()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/account/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, ...fields }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.errors) setErrors((e) => ({ ...e, ...json.errors }));
        setSubmitError(json.errors?.phone ?? "Илгээхэд алдаа гарлаа. Дахин оролдоно уу.");
        return;
      }
      afterAuthed(json.user);
    } catch {
      setSubmitError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setSubmitting(false);
    }
  };

  const confirmPayment = async (method: PayMethod) => {
    if (!program) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programId: program.id,
          payMethod: method,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSubmitError(json.error ?? "Илгээхэд алдаа гарлаа. Дахин оролдоно уу.");
        return;
      }
      if (json.paid) {
        setRegistrationStatus(json.registration.status);
        setFacebookGroup(json.facebookGroup ?? null);
        // So the course page they came from now offers to open it.
        setEnrolledProgramIds((ids) => new Set(ids).add(program.id));
        setScreen("success");
        return;
      }
      // QPay invoice created but not yet paid — show the real QR and start
      // checking for it.
      setQpayQr({ registrationId: json.registration.id, qrImage: json.qrImage, shortUrl: json.shortUrl });
      setScreen("qpay-wait");
    } catch {
      setSubmitError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setSubmitting(false);
    }
  };

  const checkQpayPayment = async () => {
    if (!qpayQr || !program) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/enroll/${qpayQr.registrationId}/check`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setSubmitError(json.error ?? "Шалгахад алдаа гарлаа");
        return;
      }
      if (json.paid) {
        setRegistrationStatus(json.registration.status);
        setFacebookGroup(null);
        setEnrolledProgramIds((ids) => new Set(ids).add(program.id));
        setScreen("success");
      } else {
        setSubmitError("Төлбөр хараахан хийгдээгүй байна. Төлөөд дахин шалгана уу.");
      }
    } catch {
      setSubmitError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setSubmitting(false);
    }
  };

  const cancelQpayRegistration = async () => {
    if (!qpayQr || !program) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/enroll/${qpayQr.registrationId}/cancel`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        if (json.paid) {
          // Lost the race with their own payment — treat it as a success.
          setRegistrationStatus("active");
          setFacebookGroup(null);
          setEnrolledProgramIds((ids) => new Set(ids).add(program.id));
          setScreen("success");
          return;
        }
        setSubmitError(json.error ?? "Цуцлахад алдаа гарлаа");
        return;
      }
      setQpayQr(null);
      setPayMethod(null);
      setScreen("payment");
    } catch {
      setSubmitError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setSubmitting(false);
    }
  };

  // Light client-side polling while the QR is on screen, so most students
  // never have to press "Шалгах" themselves. Not the server-side cron QPay's
  // docs warn against — bounded, only runs while this exact screen is open.
  useEffect(() => {
    if (screen !== "qpay-wait" || !qpayQr || !program) return;
    let cancelled = false;
    let attempts = 0;
    const timer = setInterval(async () => {
      attempts += 1;
      if (attempts > 45) {
        clearInterval(timer);
        return;
      }
      try {
        const res = await fetch(`/api/enroll/${qpayQr.registrationId}/check`, { method: "POST" });
        const json = await res.json();
        if (cancelled || !res.ok || !json.paid) return;
        clearInterval(timer);
        setRegistrationStatus(json.registration.status);
        setFacebookGroup(null);
        setEnrolledProgramIds((ids) => new Set(ids).add(program.id));
        setScreen("success");
      } catch {
        // Retried on the next tick.
      }
    }, 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [screen, qpayQr, program]);

  const stepIndex = registerStep;

  // Enter used to do nothing anywhere in this modal, because the fields were
  // never inside a <form>. Routing submit by screen restores the keyboard
  // flow a parent expects (fill phone -> password -> Enter).
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (screen === "login") return void handleLogin();
    if (screen === "reset") {
      if (resetStep === 1) return void handleContinueToResetOtp();
      if (resetStep === 2) return void handleVerifyResetOtp();
      return void handleReset();
    }
    if (screen === "register") {
      if (registerStep === 1 && role) setRegisterStep(2);
      else if (registerStep === 2) void handleContinueToOtp();
      else if (registerStep === 3) void handleVerifyRegisterOtp();
      else if (registerStep === 4) void handleRegisterSubmit();
    }
  };

  // Escape to close, and stop the page behind from scrolling while open —
  // on mobile the background used to scroll away under the modal.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  // QPay's commission bites hardest on the yearly programs' large lump-sum
  // price, so they only ever offer bank transfer.
  const isStaticYearlyProgram = Boolean(program && staticProgramById[program.id]);

  // Mirrors the QPay invoice description built server-side in /api/enroll
  // (phone + category + audience), plus the student's name — QPay invoices
  // don't need that (QPay itself shows the payer's bank name), but a bank
  // transfer is matched back to a student by an admin reading this text by
  // eye, and a name makes that much faster than phone + tag alone.
  const bankCategories = program ? extractCourseCategories(program.tag) : [];
  const bankCategoryLabel = bankCategories.length > 0 ? bankCategories.join(",") : "-";
  const bankAudienceLabel = program && getCourseAudience(program.tag) === "teacher" ? "Багш" : "Сурагч";
  const bankStudentName = `${sessionUser?.lastName ?? ""} ${sessionUser?.firstName ?? ""}`.trim();
  const bankDescription = `${sessionUser?.phone ?? ""} ${bankCategoryLabel} ${bankAudienceLabel}${
    bankStudentName ? ` + ${bankStudentName}` : ""
  }`.trim();

  return (
    <ModalCtx.Provider
      value={{ sessionUser, sessionLoaded, enrolledProgramIds, open, openLogin, openRegister, logout }}
    >
      {children}

      {isOpen && (
        <div
          className="fixed inset-0 bg-[rgba(15,20,40,.6)] backdrop-blur-[3px] flex items-center justify-center z-[200] p-5"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <form
            onSubmit={handleSubmit}
            role="dialog"
            aria-modal="true"
            aria-labelledby="register-modal-title"
            className="bg-surface rounded-lg w-full max-w-[520px] max-h-[88vh] overflow-y-auto shadow-lg px-[30px] py-8"
          >
            <div className="flex items-center justify-between mb-1.5">
              <h3 id="register-modal-title" className="text-[1.35rem] font-extrabold">
                {screen === "success"
                  ? "Амжилттай бүртгэгдлээ"
                  : screen === "login"
                    ? "Нэвтрэх"
                    : screen === "reset"
                      ? "Нууц үг сэргээх"
                      : screen === "qpay-wait"
                        ? "Төлбөр хүлээгдэж байна"
                        : "Бүртгүүлэх"}
              </h3>
              <button
                type="button"
                onClick={close}
                aria-label="Хаах"
                className="w-11 h-11 rounded-full bg-bg-soft grid place-items-center shrink-0"
              >
                <IconClose className="w-4 h-4 text-ink-2" />
              </button>
            </div>

            {program && screen !== "success" && screen !== "payment" && screen !== "qpay-wait" && (
              <p className="text-[.85rem] font-semibold text-ink-3 mb-2">
                {program.label} · {program.price}
              </p>
            )}

            {screen === "register" && (
              <div className="flex gap-1.5 my-[18px]">
                {[1, 2, 3, 4].map((n) => (
                  <i key={n} className={`flex-1 h-1 rounded-sm ${n <= stepIndex ? "bg-blue" : "bg-line-2"}`} />
                ))}
              </div>
            )}

            {screen === "login" && (
              <div className="mt-[18px]">
                <FormField label="Утасны дугаар" required error={loginError ? "e" : undefined}>
                  <input
                    value={loginPhone}
                    onChange={(e) => {
                      setLoginPhone(e.target.value.replace(/\D/g, "").slice(0, 8));
                      setLoginError(null);
                    }}
                    placeholder="99XXXXXX"
                    inputMode="numeric"
                    autoComplete="username"
                  />
                </FormField>
                <FormField label="Нууц үг" required error={loginError ? "e" : undefined}>
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(e) => {
                      setLoginPassword(e.target.value);
                      setLoginError(null);
                    }}
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                </FormField>
                {loginError && <p className="text-[.85rem] font-semibold text-red-soft -mt-3 mb-4">{loginError}</p>}
                <button
                  type="button"
                  onClick={() => {
                    setResetPhone(loginPhone);
                    setResetStep(1);
                    setScreen("reset");
                  }}
                  className="inline-block py-3 -mx-1 px-1 text-[.85rem] font-bold text-blue-strong -mt-1 mb-2"
                >
                  Нууц үгээ мартсан уу?
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleLogin}
                  className="w-full font-extrabold rounded-full bg-blue text-white shadow-blue px-[26px] py-4 transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                >
                  {submitting ? "Шалгаж байна…" : "Нэвтрэх"}
                </button>
                <button
                  type="button"
                  onClick={() => setScreen("register")}
                  className="w-full text-center py-3 text-[.9rem] font-bold text-blue-strong mt-2"
                >
                  Бүртгэлгүй юу? Шинээр бүртгүүлэх
                </button>
              </div>
            )}

            {screen === "reset" && resetStep === 1 && (
              <div className="mt-[18px]">
                <FormField label="Утасны дугаар" required error={resetError ? "e" : undefined}>
                  <input
                    value={resetPhone}
                    onChange={(e) => setResetPhone(e.target.value.replace(/\D/g, "").slice(0, 8))}
                    placeholder="99XXXXXX"
                    inputMode="numeric"
                  />
                </FormField>
                <FormField label="Бүртгүүлсэн и-мэйл хаяг" required error={resetError ? "e" : undefined}>
                  <input
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="name@mail.com"
                  />
                </FormField>
                {resetError && <p className="text-[.85rem] font-semibold text-red-soft mb-3">{resetError}</p>}
                <div className="flex gap-3.5">
                  <button
                    type="button"
                    onClick={() => setScreen("login")}
                    className="btn-ring font-extrabold rounded-full bg-surface-2 text-ink-2 px-[26px] py-4 transition-colors hover:text-ink"
                  >
                    ← Буцах
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleContinueToResetOtp}
                    className="flex-1 font-extrabold rounded-full bg-blue text-white shadow-blue px-[26px] py-4 transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                  >
                    {submitting ? "Илгээж байна…" : "Код авах"}
                  </button>
                </div>
              </div>
            )}

            {screen === "reset" && resetStep === 2 && (
              <div className="mt-[18px]">
                <p className="font-semibold text-ink-2 mb-4">
                  {resetPhone} дугаарт илгээсэн 4 оронтой кодыг оруулна уу.
                </p>
                <FormField label="Баталгаажуулах код" required error={otpError ? "e" : undefined}>
                  <input
                    value={otpCode}
                    onChange={(e) => {
                      setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 4));
                      setOtpError(null);
                    }}
                    placeholder="0000"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                  />
                </FormField>
                {otpError && <p className="text-[.85rem] font-semibold text-red-soft mb-3">{otpError}</p>}
                <button
                  type="button"
                  disabled={otpCooldown > 0 || submitting}
                  onClick={() => sendOtp(resetPhone.trim(), "reset", resetEmail.trim())}
                  className="inline-block py-3 -mx-1 px-1 text-[.85rem] font-bold text-blue-strong -mt-1 mb-2 disabled:opacity-50"
                >
                  {otpCooldown > 0 ? `Дахин илгээх (${otpCooldown}с)` : "Код дахин илгээх"}
                </button>
                <div className="flex gap-3.5">
                  <button
                    type="button"
                    onClick={() => setResetStep(1)}
                    className="btn-ring font-extrabold rounded-full bg-surface-2 text-ink-2 px-[26px] py-4 transition-colors hover:text-ink"
                  >
                    ← Буцах
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleVerifyResetOtp}
                    className="flex-1 font-extrabold rounded-full bg-blue text-white shadow-blue px-[26px] py-4 transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                  >
                    {submitting ? "Шалгаж байна…" : "Баталгаажуулах →"}
                  </button>
                </div>
              </div>
            )}

            {screen === "reset" && resetStep === 3 && (
              <div className="mt-[18px]">
                <FormField
                  label="Шинэ нууц үг"
                  required
                  error={resetError ? "e" : undefined}
                  hint="том, жижиг үсэг, тоо орсон, дор хаяж 6 тэмдэгт"
                >
                  <input
                    type="password"
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                </FormField>
                <FormField label="Шинэ нууц үг давтах" required error={resetError ? "e" : undefined}>
                  <input
                    type="password"
                    value={resetPasswordConfirm}
                    onChange={(e) => setResetPasswordConfirm(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                </FormField>
                {resetError && <p className="text-[.85rem] font-semibold text-red-soft mb-3">{resetError}</p>}
                <div className="flex gap-3.5">
                  <button
                    type="button"
                    onClick={() => setResetStep(2)}
                    className="btn-ring font-extrabold rounded-full bg-surface-2 text-ink-2 px-[26px] py-4 transition-colors hover:text-ink"
                  >
                    ← Буцах
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleReset}
                    className="flex-1 font-extrabold rounded-full bg-blue text-white shadow-blue px-[26px] py-4 transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                  >
                    {submitting ? "Хадгалж байна…" : "Шинэ нууц үг тохируулах"}
                  </button>
                </div>
              </div>
            )}

            {screen === "register" && registerStep === 1 && (
              <div>
                <p className="font-bold text-ink-2 mb-1">Та хэн бэ?</p>
                <div className="grid grid-cols-2 gap-3.5 mt-1.5">
                  <button
                    type="button"
                    onClick={() => setRole("teacher")}
                    className={`border-[1.5px] rounded-md px-4 py-[22px] text-center font-extrabold transition-colors ${
                      role === "teacher" ? "border-blue bg-blue-soft text-blue-strong" : "border-line-2 text-ink hover:border-blue"
                    }`}
                  >
                    <IconPerson className="w-[30px] h-[30px] text-blue-strong mx-auto mb-2.5" />
                    Багш
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole("student")}
                    className={`border-[1.5px] rounded-md px-4 py-[22px] text-center font-extrabold transition-colors ${
                      role === "student" ? "border-blue bg-blue-soft text-blue-strong" : "border-line-2 text-ink hover:border-blue"
                    }`}
                  >
                    <IconGraduationCap className="w-[30px] h-[30px] text-blue-strong mx-auto mb-2.5" />
                    Сурагч
                  </button>
                </div>
                <div className="flex gap-3.5 mt-[26px]">
                  <button
                    type="button"
                    onClick={() => setScreen("login")}
                    className="btn-ring font-extrabold rounded-full bg-surface-2 text-ink-2 px-[26px] py-4 transition-colors hover:text-ink"
                  >
                    ← Буцах
                  </button>
                  <button
                    type="button"
                    disabled={!role}
                    onClick={() => setRegisterStep(2)}
                    className="flex-1 font-extrabold rounded-full bg-blue text-white shadow-blue px-[26px] py-4 transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:pointer-events-none"
                  >
                    Үргэлжлүүлэх →
                  </button>
                </div>
              </div>
            )}

            {screen === "register" && registerStep === 2 && (
              <div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-[18px]">
                  <FormField label="Овог" required error={errors.lastName ? "e" : undefined}>
                    <input value={fields.lastName} onChange={(e) => setField("lastName", e.target.value)} placeholder="Овог" />
                  </FormField>
                  <FormField label="Нэр" required error={errors.firstName ? "e" : undefined}>
                    <input value={fields.firstName} onChange={(e) => setField("firstName", e.target.value)} placeholder="Нэр" />
                  </FormField>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-[18px]">
                  <FormField label="Аймаг/Хот" required error={errors.province ? "e" : undefined}>
                    <select
                      value={fields.province}
                      onChange={(e) => {
                        setField("province", e.target.value);
                        setField("district", "");
                      }}
                    >
                      <option value="">Сонгоно уу</option>
                      {PROVINCES.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Сум/Дүүрэг" required error={errors.district ? "e" : undefined}>
                    <select
                      value={fields.district}
                      onChange={(e) => setField("district", e.target.value)}
                      disabled={!fields.province}
                    >
                      <option value="">{fields.province ? "Сонгоно уу" : "Эхлээд аймаг/хотоо сонгоно уу"}</option>
                      {(DISTRICTS_BY_PROVINCE[fields.province as Province] ?? []).map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </FormField>
                </div>
                <FormField
                  label={role === "teacher" ? "Ажилладаг сургууль" : "Сурдаг сургууль"}
                  required
                  error={errors.school ? "e" : undefined}
                >
                  <SchoolAutocomplete value={fields.school} onChange={(v) => setField("school", v)} />
                </FormField>
                {role === "student" && (
                  <FormField label="Анги" required error={errors.grade ? "e" : undefined}>
                    <select value={fields.grade} onChange={(e) => setField("grade", e.target.value)}>
                      <option value="">Ангиа сонгоно уу</option>
                      {Array.from({ length: 9 }, (_, i) => i + 4).map((g) => (
                        <option key={g} value={`${g}-р анги`}>
                          {g}-р анги
                        </option>
                      ))}
                    </select>
                  </FormField>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-[18px]">
                  <FormField label="Утасны дугаар" required error={errors.phone ? "e" : undefined}>
                    <input value={fields.phone} onChange={(e) => setField("phone", e.target.value)} placeholder="99XXXXXX" inputMode="numeric" />
                  </FormField>
                  <FormField label="Имэйл хаяг" required error={errors.email ? "e" : undefined}>
                    <input value={fields.email} onChange={(e) => setField("email", e.target.value)} placeholder="name@mail.com" />
                  </FormField>
                </div>
                <FormField label="Facebook аккаунт нэр">
                  <input value={fields.facebook} onChange={(e) => setField("facebook", e.target.value)} placeholder="Facebook нэр" />
                </FormField>

                <div className="flex gap-3.5 mt-1.5">
                  <button
                    type="button"
                    onClick={() => setRegisterStep(1)}
                    className="btn-ring font-extrabold rounded-full bg-surface-2 text-ink-2 px-[26px] py-4 transition-colors hover:text-ink"
                  >
                    ← Буцах
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleContinueToOtp}
                    className="flex-1 font-extrabold rounded-full bg-blue text-white shadow-blue px-[26px] py-4 transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                  >
                    {submitting ? "Илгээж байна…" : "Үргэлжлүүлэх →"}
                  </button>
                </div>
              </div>
            )}

            {screen === "register" && registerStep === 3 && (
              <div>
                <p className="font-semibold text-ink-2 mb-4">
                  {fields.phone} дугаарт илгээсэн 4 оронтой кодыг оруулна уу.
                </p>
                <FormField label="Баталгаажуулах код" required error={otpError ? "e" : undefined}>
                  <input
                    value={otpCode}
                    onChange={(e) => {
                      setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 4));
                      setOtpError(null);
                    }}
                    placeholder="0000"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                  />
                </FormField>
                {otpError && <p className="text-[.85rem] font-semibold text-red-soft mb-3">{otpError}</p>}
                <button
                  type="button"
                  disabled={otpCooldown > 0 || submitting}
                  onClick={() => sendOtp(fields.phone, "register")}
                  className="inline-block py-3 -mx-1 px-1 text-[.85rem] font-bold text-blue-strong -mt-1 mb-2 disabled:opacity-50"
                >
                  {otpCooldown > 0 ? `Дахин илгээх (${otpCooldown}с)` : "Код дахин илгээх"}
                </button>

                <div className="flex gap-3.5 mt-1.5">
                  <button
                    type="button"
                    onClick={() => setRegisterStep(2)}
                    className="btn-ring font-extrabold rounded-full bg-surface-2 text-ink-2 px-[26px] py-4 transition-colors hover:text-ink"
                  >
                    ← Буцах
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleVerifyRegisterOtp}
                    className="flex-1 font-extrabold rounded-full bg-blue text-white shadow-blue px-[26px] py-4 transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                  >
                    {submitting ? "Шалгаж байна…" : "Баталгаажуулах →"}
                  </button>
                </div>
              </div>
            )}

            {screen === "register" && registerStep === 4 && (
              <div>
                <FormField
                  label="Нууц үг"
                  required
                  error={errors.password ? "e" : undefined}
                  hint="Том, жижиг үсэг, тоо орсон, дор хаяж 6 тэмдэгт"
                >
                  <input
                    type="password"
                    value={fields.password}
                    onChange={(e) => setField("password", e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                </FormField>
                <FormField label="Нууц үг давтах" required error={errors.passwordConfirm ? "e" : undefined}>
                  <input
                    type="password"
                    value={fields.passwordConfirm}
                    onChange={(e) => setField("passwordConfirm", e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                </FormField>

                {submitError && <p className="text-[.85rem] font-semibold text-red-soft mb-3">{submitError}</p>}

                <div className="flex gap-3.5 mt-1.5">
                  <button
                    type="button"
                    onClick={() => setRegisterStep(3)}
                    className="btn-ring font-extrabold rounded-full bg-surface-2 text-ink-2 px-[26px] py-4 transition-colors hover:text-ink"
                  >
                    ← Буцах
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleRegisterSubmit}
                    className="flex-1 font-extrabold rounded-full bg-blue text-white shadow-blue px-[26px] py-4 transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                  >
                    {submitting ? "Илгээж байна…" : "Бүртгүүлэх"}
                  </button>
                </div>
              </div>
            )}

            {screen === "payment" && (
              <div>
                {sessionUser && (
                  <p className="text-[.85rem] font-semibold text-ink-3 mb-3">
                    {sessionUser.lastName} {sessionUser.firstName} нэрээр бүртгэнэ
                  </p>
                )}
                {program && (
                  <div className="flex items-center justify-between gap-4 bg-blue-soft rounded-md px-5 py-4 mb-5">
                    <span className="font-bold text-ink-2 text-[.95rem]">{program.label}</span>
                    <b className="text-[1.5rem] font-extrabold text-blue-strong shrink-0">{program.price}</b>
                  </div>
                )}
                <p className="font-bold text-ink-2 mb-1">Төлбөрийн хэлбэр сонгоно уу</p>
                <div className="flex flex-col gap-3 mt-1.5">
                  {!isStaticYearlyProgram && (
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => confirmPayment("qpay")}
                      className="flex items-center gap-3.5 border-[1.5px] border-line-2 rounded-md px-[18px] py-4 text-left transition-colors hover:border-blue disabled:opacity-50"
                    >
                      <IconQrCode className="w-[26px] h-[26px] text-blue-strong shrink-0" />
                      <div>
                        <b className="text-[1rem] block">
                          {submitting ? "Түр хүлээнэ үү…" : "QPay-ээр төлөх"}
                        </b>
                        <small className="block text-ink-3 font-semibold text-[.85rem]">Банкны апп-аар уншуулж шууд төлнө</small>
                      </div>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setPayMethod("bank")}
                    className={`flex items-center gap-3.5 border-[1.5px] rounded-md px-[18px] py-4 text-left transition-colors ${
                      payMethod === "bank" ? "border-blue bg-blue-soft" : "border-line-2"
                    }`}
                  >
                    <IconBank className="w-[26px] h-[26px] text-blue-strong shrink-0" />
                    <div>
                      <b className="text-[1rem] block">Дансаар шилжүүлэх</b>
                      <small className="block text-ink-3 font-semibold text-[.85rem]">Дансны дэлгэрэнгүй мэдээлэл харуулна</small>
                    </div>
                  </button>
                </div>

                {payMethod === "bank" && (
                  <div className="mt-[18px] bg-bg-soft rounded-md px-[22px] py-5">
                    {[
                      ["bank", "Банк", "Хаан Банк"],
                      ["account", "Дансны дугаар", "MN19000500 5034904750"],
                      ["recipient", "Хүлээн авагч", "Ганбат"],
                      ["description", "Гүйлгээний утга", bankDescription],
                    ].map(([key, k, v]) => (
                      <div key={key} className="flex items-center justify-between gap-4 py-1.5 text-[.95rem] font-bold">
                        <span className="text-ink-3 font-semibold shrink-0">{k}</span>
                        <span className="flex items-center gap-2 min-w-0">
                          <b className="text-right truncate">{v}</b>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(key, v)}
                            aria-label={`${k} хуулах`}
                            className="shrink-0 text-ink-3 hover:text-blue-strong transition-colors"
                          >
                            {copiedField === key ? (
                              <IconCheck className="w-4 h-4 text-green" strokeWidth={2.8} />
                            ) : (
                              <IconCopy className="w-4 h-4" />
                            )}
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {submitError && <p className="text-[.85rem] font-semibold text-red-soft mt-3">{submitError}</p>}

                {payMethod === "bank" && (
                  <div className="mt-[22px]">
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => confirmPayment("bank")}
                      className="w-full font-extrabold rounded-full bg-gold text-gold-ink shadow-gold px-[26px] py-4 transition-transform hover:-translate-y-0.5 hover:bg-gold-strong disabled:opacity-50 disabled:pointer-events-none"
                    >
                      Төлбөр төлсөн →
                    </button>
                  </div>
                )}
              </div>
            )}

            {screen === "qpay-wait" && qpayQr && (
              <div className="text-center">
                <p className="text-ink-2 font-medium mb-4">
                  {program?.price} дүнгээ доорх QR-ийг банкны апп-аараа уншуулж төлнө үү.
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:image/png;base64,${qpayQr.qrImage}`}
                  alt="QPay QR код"
                  className="w-[220px] h-[220px] mx-auto rounded-sm border border-line"
                />
                {qpayQr.shortUrl && (
                  <a
                    href={qpayQr.shortUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block mt-3 text-[.9rem] font-bold text-blue-strong"
                  >
                    Эсвэл богино холбоосоор нээх →
                  </a>
                )}
                {submitError && <p className="text-[.85rem] font-semibold text-red-soft mt-3">{submitError}</p>}
                <div className="flex gap-3.5 mt-5">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={cancelQpayRegistration}
                    className="btn-ring font-extrabold rounded-full bg-surface-2 text-ink-2 px-[26px] py-4 transition-colors hover:text-ink disabled:opacity-50"
                  >
                    Цуцлах
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={checkQpayPayment}
                    className="flex-1 font-extrabold rounded-full bg-gold text-gold-ink shadow-gold px-[26px] py-4 transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                  >
                    {submitting ? "Шалгаж байна…" : "Төлбөр шалгах →"}
                  </button>
                </div>
              </div>
            )}

            {screen === "success" && (
              <div className="text-center">
                <div className="w-[76px] h-[76px] rounded-full bg-green-soft text-green grid place-items-center mx-auto mb-[22px] animate-pop">
                  <IconCheck className="w-[38px] h-[38px]" strokeWidth={2.6} />
                </div>
                {registrationStatus === "active" ? (
                  <>
                    <h3 className="text-[1.4rem] font-extrabold">Бүртгэл идэвхжлээ!</h3>
                    <p className="text-ink-2 mt-2.5 font-medium">
                      {facebookGroup
                        ? "Сургалтын Facebook группт нэгдээрэй. Холбоосыг профайл хэсгээсээ хэдийд ч дахин олж болно."
                        : "Та одоо профайл хэсгээсээ хичээлийн хуваарь, Facebook группын холбоосыг харах боломжтой."}
                    </p>
                  </>
                ) : (
                  <>
                    <h3 className="text-[1.4rem] font-extrabold">Баярлалаа! Бүртгэл хүлээн авлаа.</h3>
                    <p className="text-ink-2 mt-2.5 font-medium">
                      Админ таны төлбөрийг шалгаж баталгаажуулсны дараа Facebook групп, хуваарийн холбоосыг илгээнэ.
                    </p>
                  </>
                )}

                {facebookGroup && (
                  <a
                    href={facebookGroup}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-2.5 bg-blue-soft text-blue-strong font-extrabold rounded-sm px-5 py-4 mt-5"
                  >
                    <IconFacebook className="w-[18px] h-[18px] shrink-0" />
                    Facebook группт нэгдэх
                  </a>
                )}

                <div className="flex gap-3.5 mt-5">
                  <button
                    type="button"
                    onClick={close}
                    className="btn-ring flex-1 font-extrabold rounded-full bg-surface text-ink px-[26px] py-4 transition-colors hover:text-blue-strong"
                  >
                    Хаах
                  </button>
                  <Link
                    href="/profile"
                    onClick={close}
                    className="flex-1 font-extrabold rounded-full bg-blue text-white shadow-blue px-[26px] py-4 text-center transition-transform hover:-translate-y-0.5"
                  >
                    Профайл харах
                  </Link>
                </div>
              </div>
            )}
          </form>
        </div>
      )}
    </ModalCtx.Provider>
  );
}
