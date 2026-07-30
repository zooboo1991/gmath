"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import type { Article } from "@/lib/db";
import RichTextEditor from "./RichTextEditor";
import { IconClose } from "@/components/icons";

type FormState = {
  title: string;
  excerpt: string;
  content: string;
  coverImage: string;
  author: string;
  featured: boolean;
};

export default function ArticleForm({ initialArticle }: { initialArticle?: Article }) {
  const router = useRouter();
  const isEditing = Boolean(initialArticle);

  const [form, setForm] = useState<FormState>({
    title: initialArticle?.title ?? "",
    excerpt: initialArticle?.excerpt ?? "",
    content: initialArticle?.content ?? "",
    coverImage: initialArticle?.coverImage ?? "",
    author: initialArticle?.author ?? "Б.Ганбат багш",
    featured: initialArticle?.featured ?? false,
  });
  const [coverUploading, setCoverUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const uploadCover = async (file: File) => {
    setCoverUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/upload", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Байршуулахад алдаа гарлаа");
        return;
      }
      setForm((f) => ({ ...f, coverImage: json.url }));
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setCoverUploading(false);
    }
  };

  const save = async () => {
    const missing: string[] = [];
    if (!form.title.trim()) missing.push("Гарчиг");
    if (!form.excerpt.trim()) missing.push("Товч танилцуулга");
    if (!form.coverImage.trim()) missing.push("Тэргүүн зураг");
    if (!form.author.trim()) missing.push("Зохиогч");
    if (missing.length > 0) {
      setError(`Дараах талбарыг бөглөнө үү: ${missing.join(", ")}`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const url = isEditing ? `/api/admin/articles/${initialArticle!.id}` : "/api/admin/articles";
      const method = isEditing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Хадгалахад алдаа гарлаа");
        return;
      }
      router.push("/admin?tab=articles");
      router.refresh();
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-soft">
      <header className="sticky top-0 z-10 bg-surface border-b border-line">
        <div className="wrap flex items-center justify-between h-[68px]">
          <Link
            href="/admin?tab=articles"
            className="inline-flex items-center gap-2 font-extrabold text-ink-2 hover:text-ink text-[.92rem]"
          >
            ← Буцах
          </Link>
          <b className="font-extrabold text-[1rem] hidden sm:block">
            {isEditing ? "Нийтлэл засах" : "Шинэ нийтлэл"}
          </b>
          <button
            type="button"
            disabled={saving || coverUploading}
            onClick={save}
            className="font-extrabold rounded-full bg-blue text-white shadow-blue px-6 py-2.5 text-[.92rem] transition-transform hover:-translate-y-0.5 disabled:opacity-50"
          >
            {saving ? "Хадгалж байна…" : "Хадгалах"}
          </button>
        </div>
      </header>

      <div className="wrap max-w-[880px] py-8">
        {error && (
          <p className="bg-[oklch(0.97_0.03_25)] text-red-soft font-semibold text-[.9rem] rounded-md px-4 py-3 mb-5">
            {error}
          </p>
        )}

        <label className="block text-[.8rem] font-extrabold text-ink-3 mb-1.5">Гарчиг</label>
        <input
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="Гарчигаа энд бичнэ үү"
          className="w-full text-[1.9rem] font-extrabold tracking-[-.01em] placeholder:text-ink-3 placeholder:font-medium bg-transparent focus:outline-none mb-5"
        />

        <div className="mb-6">
          {form.coverImage && (
            <div className="relative w-full h-[220px] rounded-md overflow-hidden bg-bg-soft mb-2.5 group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={form.coverImage} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, coverImage: "" }))}
                aria-label="Зураг устгах"
                className="absolute top-2.5 right-2.5 w-9 h-9 rounded-full bg-surface/90 grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <IconClose className="w-4 h-4 text-ink-2" />
              </button>
            </div>
          )}
          <label className="inline-flex items-center gap-2 text-[.85rem] font-extrabold text-blue-strong bg-blue-soft px-4 py-2.5 rounded-full cursor-pointer">
            {coverUploading ? "Байршуулж байна…" : form.coverImage ? "Тэргүүн зураг солих" : "Тэргүүн зураг оруулах"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={coverUploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) uploadCover(file);
              }}
            />
          </label>
        </div>

        <textarea
          value={form.excerpt}
          onChange={(e) => setForm((f) => ({ ...f, excerpt: e.target.value }))}
          placeholder="Товч танилцуулга (жагсаалт, дэлгэрэнгүй хуудсанд харагдана)"
          rows={2}
          className="w-full text-[1.05rem] text-ink-2 font-medium placeholder:text-ink-3 bg-transparent focus:outline-none resize-none border-b border-line pb-4 mb-6"
        />

        <RichTextEditor content={form.content} onChange={(html) => setForm((f) => ({ ...f, content: html }))} />

        <div className="flex flex-wrap items-center gap-6 mt-7">
          <label className="flex flex-col gap-1.5 text-[.85rem] font-extrabold text-ink">
            Зохиогч
            <input
              value={form.author}
              onChange={(e) => setForm((f) => ({ ...f, author: e.target.value }))}
              className="w-[220px] px-3.5 py-2.5 rounded-xs border-[1.5px] border-line-2 bg-surface-2 text-ink font-semibold focus:outline-none focus:border-blue focus:bg-surface"
            />
          </label>
          <label className="flex items-center gap-2.5 font-extrabold text-[.9rem] text-ink cursor-pointer">
            <input
              type="checkbox"
              checked={form.featured}
              onChange={(e) => setForm((f) => ({ ...f, featured: e.target.checked }))}
              className="w-4 h-4"
            />
            Онцлох нийтлэл болгож, жагсаалтын дээд банерт харуулах
          </label>
        </div>
      </div>
    </div>
  );
}
