import { AuthTriggerButton } from "@/components/program/ProgramRegister";

export default function FinalCta() {
  return (
    <section className="hero-navy section-pad relative overflow-hidden text-white text-center">
      <div className="hero-dotgrid pointer-events-none absolute inset-0 opacity-50" />
      <div className="wrap relative z-[2] max-w-[760px] mx-auto">
        <h2 className="text-[clamp(2rem,4.4vw,3.1rem)] font-extrabold leading-[1.1] tracking-[-.025em] text-balance">
          Хүүхдийнхээ ирээдүйд хөрөнгө оруулаарай
        </h2>
        <div className="mt-[30px]">
          <AuthTriggerButton
            mode="register"
            className="inline-flex items-center justify-center gap-[10px] font-extrabold rounded-full bg-gold text-gold-ink shadow-gold px-[34px] py-[19px] text-[1.075rem] transition-transform hover:bg-gold-strong hover:-translate-y-0.5"
          >
            Одоо бүртгүүлэх <span>→</span>
          </AuthTriggerButton>
        </div>
      </div>
    </section>
  );
}
