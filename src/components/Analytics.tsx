"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Fires a beacon per page view for the admin "Хандалт" tab. Admin pages are
 * skipped so the teacher's own visits don't inflate the numbers they're
 * looking at.
 */
export default function Analytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin")) return;

    const body = JSON.stringify({ path: pathname, referrer: document.referrer || null });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
    } else {
      fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(
        () => {}
      );
    }
  }, [pathname]);

  return null;
}
