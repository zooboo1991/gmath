"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useState } from "react";
import FormField from "@/components/FormField";
import {
  IconPerson,
  IconGraduationCap,
  IconQrCode,
  IconBank,
  IconClose,
  IconCheck,
  IconFacebook,
} from "@/components/icons";

type Role = "teacher" | "student";
type PayMethod = "qpay" | "bank";
type Screen = "login" | "register" | "reset" | "payment" | "success";

type Program = { id: string; label: string; price: string };

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
  zoom: string;
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
  zoom: "",
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

  const [registerStep, setRegisterStep] = useState<1 | 2 | 3>(1);
  const [role, setRole] = useState<Role | null>(null);
  const [fields, setFields] = useState<FieldData>(emptyFields);
  const [errors, setErrors] = useState<Errors>({});

  const [loginPhone, setLoginPhone] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);

  const [resetPhone, setResetPhone] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);

  const [payMethod, setPayMethod] = useState<PayMethod | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [registrationStatus, setRegistrationStatus] = useState<"active" | "pending" | null>(null);
  const [facebookGroup, setFacebookGroup] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/account/me")
      .then((res) => res.json())
      .then((json) => setSessionUser(json.user))
      .catch(() => setSessionUser(null))
      .finally(() => setSessionLoaded(true));
  }, []);

  // Signed-out visitors get a 401 here, which is fine: the empty set just
  // means every course keeps its "бүртгүүлэх" call to action.
  const refreshEnrolments = () => {
    fetch("/api/account/registrations")
      .then((res) => (res.ok ? res.json() : { registrations: [] }))
      .then((json) => setEnrolledProgramIds(new Set<string>((json.registrations ?? []).map((r: { programId: string }) => r.programId))))
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
    setResetPhone("");
    setResetEmail("");
    setResetPassword("");
    setResetPasswordConfirm("");
    setResetError(null);
    setPayMethod(null);
    setSubmitError(null);
    setRegistrationStatus(null);
    setFacebookGroup(null);
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

  const handleContinueToPassword = () => {
    if (validateInfoFields()) setRegisterStep(3);
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

  const handleReset = async () => {
    setResetError(null);
    if (!PHONE_RE.test(resetPhone.trim())) {
      setResetError("8 оронтой утасны дугаар оруулна уу");
      return;
    }
    if (!EMAIL_RE.test(resetEmail.trim())) {
      setResetError("Бүртгүүлсэн и-мэйл хаягаа зөв оруулна уу");
      return;
    }
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
      setRegistrationStatus(json.registration.status);
      setFacebookGroup(json.facebookGroup ?? null);
      // So the course page they came from now offers to open it.
      setEnrolledProgramIds((ids) => new Set(ids).add(program.id));
      setScreen("success");
    } catch {
      setSubmitError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setSubmitting(false);
    }
  };

  const stepIndex = registerStep;

  // Enter used to do nothing anywhere in this modal, because the fields were
  // never inside a <form>. Routing submit by screen restores the keyboard
  // flow a parent expects (fill phone -> password -> Enter).
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (screen === "login") return void handleLogin();
    if (screen === "reset") return void handleReset();
    if (screen === "register") {
      if (registerStep === 1 && role) setRegisterStep(2);
      else if (registerStep === 2) handleContinueToPassword();
      else if (registerStep === 3) void handleRegisterSubmit();
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

            {program && screen !== "success" && screen !== "payment" && (
              <p className="text-[.85rem] font-semibold text-ink-3 mb-2">
                {program.label} · {program.price}
              </p>
            )}

            {screen === "register" && (
              <div className="flex gap-1.5 my-[18px]">
                {[1, 2, 3].map((n) => (
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

            {screen === "reset" && (
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
                    onClick={() => setScreen("login")}
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
                    <input value={fields.province} onChange={(e) => setField("province", e.target.value)} placeholder="Жишээ: Улаанбаатар" />
                  </FormField>
                  <FormField label="Сум/Дүүрэг" required error={errors.district ? "e" : undefined}>
                    <input value={fields.district} onChange={(e) => setField("district", e.target.value)} placeholder="Жишээ: Баянзүрх" />
                  </FormField>
                </div>
                <FormField
                  label={role === "teacher" ? "Ажилладаг сургууль" : "Сурдаг сургууль"}
                  required
                  error={errors.school ? "e" : undefined}
                >
                  <input value={fields.school} onChange={(e) => setField("school", e.target.value)} placeholder="Сургуулийн нэр" />
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-[18px]">
                  <FormField label="Facebook аккаунт нэр">
                    <input value={fields.facebook} onChange={(e) => setField("facebook", e.target.value)} placeholder="Facebook нэр" />
                  </FormField>
                  <FormField label="Zoom аккаунт нэр">
                    <input value={fields.zoom} onChange={(e) => setField("zoom", e.target.value)} placeholder="Zoom нэр" />
                  </FormField>
                </div>

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
                    onClick={handleContinueToPassword}
                    className="flex-1 font-extrabold rounded-full bg-blue text-white shadow-blue px-[26px] py-4 transition-transform hover:-translate-y-0.5"
                  >
                    Үргэлжлүүлэх →
                  </button>
                </div>
              </div>
            )}

            {screen === "register" && registerStep === 3 && (
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
                    onClick={() => setRegisterStep(2)}
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
                  <button
                    type="button"
                    onClick={() => setPayMethod("qpay")}
                    className={`flex items-center gap-3.5 border-[1.5px] rounded-md px-[18px] py-4 text-left transition-colors ${
                      payMethod === "qpay" ? "border-blue bg-blue-soft" : "border-line-2"
                    }`}
                  >
                    <IconQrCode className="w-[26px] h-[26px] text-blue-strong shrink-0" />
                    <div>
                      <b className="text-[1rem] block">QPay-ээр төлөх</b>
                      <small className="block text-ink-3 font-semibold text-[.85rem]">Банкны апп-аар уншуулж шууд төлнө</small>
                    </div>
                  </button>
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

                {payMethod === "qpay" && (
                  <div className="mt-[18px] text-center bg-bg-soft rounded-md px-6 py-6">
                    <div className="w-[160px] h-[160px] bg-surface border-[1.5px] border-dashed border-line-2 rounded-sm grid place-items-center mx-auto mb-3.5 text-ink-3 text-[.8rem] font-bold">
                      QR код
                    </div>
                    <p className="font-bold text-ink-2">{program?.price} дүнг банкны апп-аараа уншуулж төлнө үү.</p>
                  </div>
                )}
                {payMethod === "bank" && (
                  <div className="mt-[18px] bg-bg-soft rounded-md px-[22px] py-5">
                    {[
                      ["Банк", "Хаан Банк"],
                      ["Дансны дугаар", "5003006508049758"],
                      ["Хүлээн авагч", "Б.Ганбат"],
                      ["Гүйлгээний утга", `${sessionUser?.lastName ?? "Сурагчийн нэр"} — ${program?.label ?? ""}`],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-4 py-1.5 text-[.95rem] font-bold">
                        <span className="text-ink-3 font-semibold">{k}</span>
                        <b className="text-right">{v}</b>
                      </div>
                    ))}
                  </div>
                )}

                {submitError && <p className="text-[.85rem] font-semibold text-red-soft mt-3">{submitError}</p>}

                <div className="mt-[22px]">
                  {payMethod === "qpay" ? (
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => confirmPayment("qpay")}
                      className="w-full font-extrabold rounded-full bg-gold text-gold-ink shadow-gold px-[26px] py-4 transition-transform hover:-translate-y-0.5 hover:bg-gold-strong disabled:opacity-50"
                    >
                      {submitting ? "Шалгаж байна…" : "Төлбөр шалгах →"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={!payMethod || submitting}
                      onClick={() => confirmPayment("bank")}
                      className="w-full font-extrabold rounded-full bg-gold text-gold-ink shadow-gold px-[26px] py-4 transition-transform hover:-translate-y-0.5 hover:bg-gold-strong disabled:opacity-50 disabled:pointer-events-none"
                    >
                      Төлбөр төлсөн →
                    </button>
                  )}
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
