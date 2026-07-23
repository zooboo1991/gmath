import { AuthTriggerButton } from "@/components/program/ProgramRegister";

export default function FinalCta() {
  return (
    <section className="section-pad relative overflow-hidden text-white text-center bg-[radial-gradient(110%_110%_at_50%_-10%,oklch(0.42_0.10_256_/_.9),transparent_60%),linear-gradient(160deg,var(--color-navy),var(--color-navy-deep))]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(255,255,255,.05)_1px,transparent_1px)] bg-[length:26px_26px] opacity-50" />
      <div className="wrap relative z-[2] max-w-[760px] mx-auto">
        <h2 className="text-[clamp(2rem,4.4vw,3.1rem)] font-extrabold leading-[1.1] tracking-[-.025em] text-balance">
          Хүүхдийнхээ ирээдүйд хөрөнгө оруулаарай
        </h2>
        <div className="mt-[30px]">
          <AuthTriggerButton
            mode="register"
            className="inline-flex items-center justify-center gap-[10px] font-extrabold rounded-full bg-gold text-[oklch(0.32_0.06_70)] shadow-gold px-[34px] py-[19px] text-[1.075rem] transition-transform hover:bg-gold-strong hover:-translate-y-0.5"
          >
            Одоо бүртгүүлэх <span>→</span>
          </AuthTriggerButton>
        </div>
      </div>
    </section>
  );
}
