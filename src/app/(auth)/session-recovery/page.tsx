"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/client";

const LS_KEY = "kindar-auth-backup";

function RecoveryHandler() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/dashboard";

  useEffect(() => {
    const supabase = createClient();

    (async () => {
      // 1. Check if session already exists in cookies
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        window.location.href = next;
        return;
      }

      // 2. Try to restore from localStorage backup
      try {
        const backup = localStorage.getItem(LS_KEY);
        if (backup) {
          const { access_token, refresh_token } = JSON.parse(backup);
          if (access_token && refresh_token) {
            const { data, error } = await supabase.auth.setSession({
              access_token,
              refresh_token,
            });
            if (!error && data.session?.user) {
              // Success! Update backup with fresh tokens
              localStorage.setItem(
                LS_KEY,
                JSON.stringify({
                  access_token: data.session.access_token,
                  refresh_token: data.session.refresh_token,
                })
              );
              // Full page navigation so middleware sees fresh cookies
              window.location.href = next;
              return;
            }
          }
          // Tokens invalid — clean up
          localStorage.removeItem(LS_KEY);
        }
      } catch {
        try { localStorage.removeItem(LS_KEY); } catch {}
      }

      // 3. No recovery possible — go to login
      window.location.href = "/login";
    })();
  }, [next]);

  return (
    <div className="bg-white rounded-2xl shadow-lg p-8 text-center min-h-[300px] flex flex-col items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#C07055] mb-4" />
      <p className="text-[#9A8878] text-sm">Restaurando sua sessão...</p>
    </div>
  );
}

export default function SessionRecoveryPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center min-h-[300px] flex flex-col items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#C07055] mb-4" />
          <p className="text-[#9A8878] text-sm">Carregando...</p>
        </div>
      }
    >
      <RecoveryHandler />
    </Suspense>
  );
}
