export default function AdminField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[.85rem] font-extrabold text-ink mb-1.5">{label}</label>
      <div className="[&>input,&>select,&>textarea]:w-full [&>input,&>select,&>textarea]:px-3.5 [&>input,&>select,&>textarea]:py-3 [&>input,&>select,&>textarea]:rounded-xs [&>input,&>select,&>textarea]:border-[1.5px] [&>input,&>select,&>textarea]:border-line-2 [&>input,&>select,&>textarea]:bg-surface-2 [&>input,&>select,&>textarea]:text-ink [&>input,&>select,&>textarea]:font-semibold [&>textarea]:resize-y [&>input:focus,&>select:focus,&>textarea:focus]:outline-none [&>input:focus,&>select:focus,&>textarea:focus]:border-blue [&>input:focus,&>select:focus,&>textarea:focus]:bg-surface">
        {children}
      </div>
    </div>
  );
}
