"use client";

import { useEffect, useState } from "react";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function PushNotificationManager() {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    if (!("Notification" in window) || !("PushManager" in window)) {
      setPermission("unsupported");
      return;
    }

    setPermission(Notification.permission);

    // If already granted, subscribe silently
    if (Notification.permission === "granted") {
      subscribeToPush();
      return;
    }

    // If not denied, show banner after 3 seconds
    if (Notification.permission === "default") {
      const timer = setTimeout(() => setShowBanner(true), 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  async function subscribeToPush() {
    try {
      const registration = await navigator.serviceWorker.ready;

      // Check if already subscribed
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      // Send subscription to server
      const sub = subscription.toJSON();
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          keys: sub.keys,
        }),
      });
    } catch (err) {
      console.error("Push subscription failed:", err);
    }
  }

  async function handleEnable() {
    setShowBanner(false);

    const result = await Notification.requestPermission();
    setPermission(result);

    if (result === "granted") {
      await subscribeToPush();
    }
  }

  function handleDismiss() {
    setShowBanner(false);
    // Don't show again for 7 days
    localStorage.setItem("push-banner-dismissed", Date.now().toString());
  }

  // Don't show if dismissed recently
  useEffect(() => {
    const dismissed = localStorage.getItem("push-banner-dismissed");
    if (dismissed) {
      const daysSince = (Date.now() - parseInt(dismissed)) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) {
        setShowBanner(false);
      }
    }
  }, []);

  if (permission === "unsupported" || permission === "granted" || permission === "denied") {
    return null;
  }

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-40 animate-slide-up sm:left-auto sm:right-4 sm:bottom-4 sm:max-w-sm">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[#2C2C2C]">Ativar notificacoes?</p>
            <p className="text-xs text-[#7A8C8B] mt-0.5">
              Receba avisos de trocas de dia, mensagens do chat e lembretes importantes.
            </p>
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <button
            onClick={handleDismiss}
            className="flex-1 px-3 py-2 text-sm text-[#7A8C8B] font-medium rounded-xl hover:bg-gray-50 transition-colors"
          >
            Agora nao
          </button>
          <button
            onClick={handleEnable}
            className="flex-1 px-3 py-2 bg-[#D4735A] text-white text-sm font-semibold rounded-xl hover:bg-[#D4623E] transition-colors"
          >
            Ativar
          </button>
        </div>
      </div>
    </div>
  );
}
