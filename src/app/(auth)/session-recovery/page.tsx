"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import { getPersistenceClient } from "@/lib/supabase/persistence";

function RecoveryHandler() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/dashboard";

  useEffect(() => {
    (async () => {
      // 1. Check if SSR client already has session in cookies
      const ssrClient = createClient();
      const { data: { session: cookieSession } } = await ssrClient.auth.getSession();
      if (cookieSession?.user) {
        window.location.href = next;
        return;
      }

      // 2. Try persistence client (reads from localStorage, same as Hospeda app)
      const persistClient = getPersistenceClient();
      const { data: { session: lsSession } } = await persistClient.auth.getSession();

      if (lsSession?.access_token && lsSession?.refresh_token) {
        // Found session in localStorage! Restore to cookies via SSR client.
        const { data, error } = await ssrClient.auth.setSession({
          access_token: lsSession.access_token,
          refresh_token: lsSession.refresh_token,
        });

        if (!error && data.session?.user) {
          // Also update persistence client with fresh tokens
          await persistClient.auth.setSession({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          });
          // Full navigation so middleware sees fresh cookies
          window.location.href = next;
          return;
        }
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
