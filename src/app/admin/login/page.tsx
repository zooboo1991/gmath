"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Нэвтрэхэд алдаа гарлаа");
        return;
      }
      router.push("/admin");
      router.refresh();
    } catch {
      setError("Сүлжээний алдаа гарлаа");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen grid place-items-center bg-bg-soft px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[380px] bg-surface border border-line rounded-lg shadow-md px-8 py-9"
      >
        <h1 className="text-[1.3rem] font-extrabold text-center">Админ нэвтрэх</h1>
        <div className="mt-6">
          <label className="block text-[.9rem] font-extrabold text-ink mb-2">Нууц үг</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-[14px] rounded-xs border-[1.5px] border-line-2 bg-surface-2 text-ink font-semibold focus:outline-none focus:border-blue focus:bg-surface transition-colors"
            placeholder="••••••••"
            autoFocus
          />
        </div>
        {error && <p className="text-[.85rem] font-semibold text-red-soft mt-3">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full mt-6 font-extrabold rounded-full bg-blue text-white shadow-blue px-[26px] py-4 transition-transform hover:-translate-y-0.5 disabled:opacity-50"
        >
          {loading ? "Шалгаж байна…" : "Нэвтрэх"}
        </button>
      </form>
    </main>
  );
}
