"use client";

import { useEffect } from "react";

/** Not in the DOM lib yet (still a draft spec) — the two members this app actually uses. */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __installPrompt?: BeforeInstallPromptEvent;
  }
}

/**
 * Silent, site-wide setup for the PWA/push feature — same shape as
 * Analytics.tsx (mounted once in the root layout, renders nothing). Two
 * jobs: register the service worker (needed for both installability and
 * push), and capture the browser's install prompt so a button elsewhere in
 * the tree (Profile page) can trigger it later. Stashed on `window` rather
 * than React context — this is the only place in the app that needs a
 * global outside React state, and it's a one-shot browser event, not
 * something worth a Context provider for.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((err) => console.error("[sw] register failed:", err));
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      window.__installPrompt = event as BeforeInstallPromptEvent;
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  return null;
}
