"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "@/actions/auth";
import SocialLoginButtons from "@/components/SocialLoginButtons";
import KindarLogo from "@/components/KindarLogo";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="bg-white rounded-2xl shadow-lg p-8 text-center min-h-[500px] flex items-center justify-center"><p className="text-muted">Carregando...</p></div>}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const conviteToken = searchParams.get("convite");
  const urlError = searchParams.get("error");

  const [error, setError] = useState<string | null>(
    urlError && urlError !== "auth"
      ? decodeURIComponent(urlError)
      : urlError === "auth"
        ? "Erro de autenticação. Tente novamente."
        : null
  );
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  // Client-side session recovery: check cookies first, then localStorage backup.
  // Safari clears cookies but keeps localStorage — this is the recovery path.
  useEffect(() => {
    const supabase = createClient();
    const dest = conviteToken ? `/convite/${conviteToken}` : "/dashboard";

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        router.replace(dest);
        return;
      }

      // Cookies are gone — try restoring from localStorage backup
      try {
        const backup = localStorage.getItem("kindar-auth-backup");
        if (backup) {
          const { access_token, refresh_token } = JSON.parse(backup);
          if (access_token && refresh_token) {
            const { data, error } = await supabase.auth.setSession({
              access_token,
              refresh_token,
            });
            if (!error && data.session?.user) {
              // Session restored! Cookies are now set via setAll.
              // Use window.location for full server-side reload so
              // middleware sees the fresh cookies.
              window.location.href = dest;
              return;
            }
            // setSession failed — tokens expired or invalid
            console.warn("[Kindar] Session recovery failed:", error?.message);
          }
          // Backup tokens were expired/invalid — clean up
          localStorage.removeItem("kindar-auth-backup");
        }
      } catch {
        // localStorage not available or corrupt — clean up
        try { localStorage.removeItem("kindar-auth-backup"); } catch {}
      }

      setChecking(false);
    });
  }, [router, conviteToken]);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    const result = await signIn(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
    if (!result?.error && conviteToken) {
      window.location.href = `/convite/${conviteToken}`;
    }
  }

  if (checking) {
    return (
      <div className="bg-white rounded-2xl shadow-lg p-8 text-center min-h-[500px] flex items-center justify-center">
        <p className="text-muted">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg p-8">
      <div className="flex flex-col items-center mb-8">
        <KindarLogo size={64} background="sand" />
        <h1 className="mt-4 text-2xl font-light text-[#0E0C0A] tracking-tight">Kindar</h1>
        <p className="mt-1 text-xs text-[#9A8878] tracking-widest uppercase">dois lares &middot; uma s&oacute; rotina</p>
      </div>

      {conviteToken && (
        <div className="text-center mb-6">
          <p className="text-[#C07055] font-medium">Voce foi convidado!</p>
          <p className="text-[#9A8878] text-sm mt-1">Entre para aceitar o convite</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-error/20 text-error rounded-lg p-3 mb-4 text-sm">
          {error}
        </div>
      )}

      <SocialLoginButtons
        redirectPath={conviteToken ? `/convite/${conviteToken}` : undefined}
        label="Entrar"
      />

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-[#E8E0D4]" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-white px-4 text-[#9A8878]">ou entre com e-mail</span>
        </div>
      </div>

      <form action={handleSubmit} className="space-y-4">
        {conviteToken && <input type="hidden" name="convite" value={conviteToken} />}

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-[#0E0C0A] mb-1">
            E-mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder="seu@email.com"
            className="w-full px-4 py-3 rounded-lg border border-[#E8E0D4] focus:outline-none focus:ring-2 focus:ring-[#C07055]/40 focus:border-[#C07055] text-[#0E0C0A] bg-white"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-[#0E0C0A] mb-1">
            Senha
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            placeholder="Sua senha"
            className="w-full px-4 py-3 rounded-lg border border-[#E8E0D4] focus:outline-none focus:ring-2 focus:ring-[#C07055]/40 focus:border-[#C07055] text-[#0E0C0A] bg-white"
          />
        </div>

        <div className="flex items-center justify-between">
          <label htmlFor="rememberMe" className="flex items-center gap-2 cursor-pointer select-none">
            <input
              id="rememberMe"
              name="rememberMe"
              type="checkbox"
              defaultChecked
              className="h-4 w-4 rounded border-[#E8E0D4] text-[#C07055] focus:ring-[#C07055]/40 accent-[#C07055]"
            />
            <span className="text-sm text-[#2C2C2C]">Lembrar-me</span>
          </label>
          <Link href="/forgot-password" className="text-sm text-[#C07055] hover:underline">
            Esqueceu a senha?
          </Link>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 px-4 bg-[#C07055] text-white font-semibold rounded-lg hover:bg-[#A85D47] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>

      <p className="text-center mt-6 text-sm text-[#9A8878]">
        Ainda nao tem conta?{" "}
        <Link
          href={conviteToken ? `/signup?convite=${conviteToken}` : "/signup"}
          className="text-[#C07055] font-medium hover:underline"
        >
          Criar conta
        </Link>
      </p>
    </div>
  );
}
