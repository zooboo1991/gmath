export default function FormField({
  label,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-[18px]">
      <label className="block text-[.9rem] font-extrabold text-ink mb-2">
        {label} {required && <span className="text-red-soft">*</span>}
        {hint && <span className="text-ink-3 font-semibold"> ({hint})</span>}
      </label>
      <div
        className={`[&>input,&>select]:w-full [&>input,&>select]:px-4 [&>input,&>select]:py-[14px] [&>input,&>select]:rounded-xs [&>input,&>select]:border-[1.5px] [&>input,&>select]:bg-surface-2 [&>input,&>select]:text-ink [&>input,&>select]:font-semibold [&>input,&>select]:transition-colors [&>input:focus,&>select:focus]:outline-none [&>input:focus,&>select:focus]:bg-surface [&>input:focus,&>select:focus]:border-blue ${
          error ? "[&>input,&>select]:border-red-soft" : "[&>input,&>select]:border-line-2"
        }`}
      >
        {children}
      </div>
      {error && <p className="text-[.82rem] font-bold text-red-soft mt-1.5">Талбарыг зөв бөглөнө үү</p>}
    </div>
  );
}
