/** Uniform title strip for the admin list pages, replacing the old shared navy header + pill bar. */
export default function AdminPageHeader({ title }: { title: string }) {
  return <h1 className="text-[1.35rem] font-extrabold mb-6">{title}</h1>;
}
