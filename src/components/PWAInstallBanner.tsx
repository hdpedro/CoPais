"use client";

import { useState, useEffect } from "react";

/**
 * Shows a banner on iOS Safari prompting the user to "Add to Home Screen"
 * so the app runs in standalone mode (no URL bar).
 *
 * Only shows when:
 * - Running on iOS (iPhone/iPad)
 * - NOT already in standalone mode (already installed)
 * - User hasn't dismissed it before (stored in localStorage)
 */
export default function PWAInstallBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Check if already in standalone mode (installed PWA)
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;

    if (isStandalone) return;

    // Check if iOS
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (!isIOS) return;

    // Check if user dismissed before
    const dismissed = localStorage.getItem("kindar-pwa-dismissed");
    if (dismissed) return;

    // Show banner after a short delay
    const timer = setTimeout(() => setShow(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  function handleDismiss() {
    setShow(false);
    localStorage.setItem("kindar-pwa-dismissed", "1");
  }

  if (!show) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[9999] animate-slide-up">
      <div className="mx-4 mb-4 bg-white rounded-2xl shadow-2xl border border-[#E8E0D4] p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-12 h-12 bg-[#EEECEA] rounded-xl flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L12 16M12 2L8 6M12 2L16 6" stroke="#C07055" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M4 14V18C4 19.1046 4.89543 20 6 20H18C19.1046 20 20 19.1046 20 18V14" stroke="#C07055" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[#0E0C0A] font-semibold text-sm">Instalar Kindar</p>
            <p className="text-[#9A8878] text-xs mt-0.5 leading-relaxed">
              Toque em{" "}
              <svg className="inline-block w-4 h-4 -mt-0.5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L12 16M12 2L8 6M12 2L16 6" stroke="#007AFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M4 14V18C4 19.1046 4.89543 20 6 20H18C19.1046 20 20 19.1046 20 18V14" stroke="#007AFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>{" "}
              e depois em <strong>&quot;Adicionar a Tela de Inicio&quot;</strong> para usar sem barra de endereco.
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#EEECEA] transition-colors"
            aria-label="Fechar"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4L12 12M12 4L4 12" stroke="#9A8878" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
