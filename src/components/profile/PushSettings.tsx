"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { IconBell, IconCheckCircle } from "@/components/icons";
import type { BeforeInstallPromptEvent } from "@/components/ServiceWorkerRegister";

/** VAPID applicationServerKey wants a Uint8Array — subscribe() rejects the raw base64url string. */
function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

const noSubscribe = () => () => {};

// Same useSyncExternalStore pattern already used for the ticking clock
// elsewhere on this page (see useNow() below in ProfileClient.tsx): reads a
// client-only value with a safe SSR snapshot, no useEffect+setState pair
// needed for values that don't change on their own.
function useSupported(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => "serviceWorker" in navigator && "PushManager" in window,
    () => false
  );
}
function useStandalone(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () =>
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as { standalone?: boolean }).standalone === true,
    () => false
  );
}
function useIsIos(): boolean {
  return useSyncExternalStore(noSubscribe, () => /iPhone|iPad|iPod/i.test(navigator.userAgent), () => false);
}
function useInitiallyPermissionDenied(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => typeof Notification !== "undefined" && Notification.permission === "denied",
    () => false
  );
}
/** The one flag that genuinely changes after mount — beforeinstallprompt can fire late, so this really does subscribe. */
function useCanInstall(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener("beforeinstallprompt", onChange);
      return () => window.removeEventListener("beforeinstallprompt", onChange);
    },
    () => Boolean(window.__installPrompt),
    () => false
  );
}

/**
 * Profile page card for the two PWA asks: install to home screen, and turn
 * on push. Entirely opt-in — nothing here runs or prompts until the
 * student taps a button, per the "don't ask for permission on first load"
 * rule (a reflexive first-load "Block" is hard to walk back).
 */
export default function PushSettings() {
  const supported = useSupported();
  const standalone = useStandalone();
  const ios = useIsIos();
  const initiallyPermissionDenied = useInitiallyPermissionDenied();
  const canInstall = useCanInstall();

  const [subscribed, setSubscribed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // null = "no runtime override yet, trust the external-store snapshot";
  // subscribe() sets this directly once the user actually answers the
  // permission prompt, since that outcome can't be read as a live store.
  const [deniedOverride, setDeniedOverride] = useState<boolean | null>(null);
  const permissionDenied = deniedOverride ?? initiallyPermissionDenied;

  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(Boolean(sub)))
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [supported]);

  const install = async () => {
    const prompt = window.__installPrompt as BeforeInstallPromptEvent | undefined;
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice;
    window.__installPrompt = undefined;
  };

  const subscribe = async () => {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setDeniedOverride(permission === "denied");
        return;
      }
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) {
        setError("Тохиргоо дутуу байна. Дараа дахин оролдоно уу.");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!res.ok) throw new Error();
      setSubscribed(true);
    } catch {
      setError("Идэвхжүүлэхэд алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setBusy(false);
    }
  };

  const unsubscribe = async () => {
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setSubscribed(false);
    } catch {
      setError("Унтраахад алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setBusy(false);
    }
  };

  if (!supported || checking) return null;
  // Nothing left to offer once both are done — install prompt already fired and was answered, or app is already installed.
  if (standalone && subscribed) return null;

  const showInstall = !standalone && (canInstall || ios);

  return (
    <div className="card-flat px-5 py-4 flex flex-col gap-3.5">
      {showInstall && (
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <b className="font-extrabold text-[.92rem] block">Апп болгож суулгах</b>
            <span className="text-ink-3 font-semibold text-[.82rem]">
              Гар утасныхаа нүүр хуудсанд нэмээд, апп шиг хурдан нээж хэрэглээрэй.
            </span>
          </div>
          {canInstall ? (
            <button
              type="button"
              onClick={install}
              className="text-[.85rem] font-extrabold text-white bg-blue px-4 py-2.5 rounded-full shrink-0"
            >
              Суулгах
            </button>
          ) : (
            <span className="text-ink-3 font-semibold text-[.82rem] shrink-0">
              Safari-ийн Share → &quot;Add to Home Screen&quot;
            </span>
          )}
        </div>
      )}

      {!subscribed && (
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2.5">
            <IconBell className="w-4 h-4 text-ink-3 shrink-0" />
            <div>
              <b className="font-extrabold text-[.92rem] block">Мэдэгдэл идэвхжүүлэх</b>
              <span className="text-ink-3 font-semibold text-[.82rem]">
                {permissionDenied
                  ? "Мэдэгдэл хориглогдсон байна — browser-ийн тохиргооноос зөвшөөрнө үү."
                  : "Шинэ мэдэгдэл ирэхэд browser-аар мэдэгдэнэ."}
              </span>
            </div>
          </div>
          <button
            type="button"
            disabled={busy || permissionDenied}
            onClick={subscribe}
            className="text-[.85rem] font-extrabold text-white bg-blue px-4 py-2.5 rounded-full disabled:opacity-50 shrink-0"
          >
            {busy ? "…" : "Идэвхжүүлэх"}
          </button>
        </div>
      )}

      {subscribed && (
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-[.85rem] font-extrabold text-green">
            <IconCheckCircle className="w-4 h-4" /> Мэдэгдэл идэвхтэй
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={unsubscribe}
            className="text-[.82rem] font-extrabold text-ink-2 bg-surface-2 px-4 py-2 rounded-full disabled:opacity-50 shrink-0"
          >
            {busy ? "…" : "Унтраах"}
          </button>
        </div>
      )}

      {error && <p className="text-[.82rem] font-semibold text-red-soft">{error}</p>}
    </div>
  );
}
