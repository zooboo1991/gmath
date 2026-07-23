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
        className={`[&>input]:w-full [&>select]:w-full [&>input]:px-4 [&>select]:px-4 [&>input]:py-[14px] [&>select]:py-[14px] [&>input]:rounded-xs [&>select]:rounded-xs [&>input]:border-[1.5px] [&>select]:border-[1.5px] [&>input]:bg-surface-2 [&>select]:bg-surface-2 [&>input]:text-ink [&>select]:text-ink [&>input]:font-semibold [&>select]:font-semibold [&>input]:transition-colors [&>select]:transition-colors [&>input:focus]:outline-none [&>select:focus]:outline-none [&>input:focus]:bg-surface [&>select:focus]:bg-surface [&>input:focus]:border-blue [&>select:focus]:border-blue ${
          error ? "[&>input]:border-red-soft [&>select]:border-red-soft" : "[&>input]:border-line-2 [&>select]:border-line-2"
        }`}
      >
        {children}
      </div>
      {error && <p className="text-[.82rem] font-bold text-red-soft mt-1.5">Талбарыг зөв бөглөнө үү</p>}
    </div>
  );
}
