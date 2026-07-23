"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function HashScroll() {
  const pathname = usePathname();

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    const el = document.getElementById(hash.slice(1));
    if (!el) return;
    requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth" }));
  }, [pathname]);

  return null;
}
