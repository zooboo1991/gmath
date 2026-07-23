"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useProgramRegister } from "@/components/program/ProgramRegister";

export default function LogoutButton() {
  const router = useRouter();
  const { logout } = useProgramRegister();
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    setLoading(true);
    await logout();
    router.push("/");
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className="font-extrabold text-[.92rem] text-ink-3 hover:text-red-soft transition-colors disabled:opacity-50"
    >
      {loading ? "…" : "Гарах"}
    </button>
  );
}
