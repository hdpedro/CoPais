"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "@/actions/auth";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="bg-white rounded-2xl shadow-lg p-8 text-center"><p className="text-muted">Carregando...</p></div>}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const conviteToken = searchParams.get("convite");

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    const result = await signIn(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
    // If login succeeds with invite token, redirect to accept invite
    if (!result?.error && conviteToken) {
      window.location.href = `/convite/${conviteToken}`;
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg p-8">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-dark">2Lares</h1>
        {conviteToken ? (
          <div className="mt-2">
            <p className="text-primary font-medium">Voce foi convidado!</p>
            <p className="text-muted text-sm mt-1">Entre para aceitar o convite</p>
          </div>
        ) : (
          <p className="text-muted mt-2">Entre na sua conta</p>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-error/20 text-error rounded-lg p-3 mb-4 text-sm">
          {error}
        </div>
      )}

      <form action={handleSubmit} className="space-y-4">
        {conviteToken && <input type="hidden" name="convite" value={conviteToken} />}

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-dark mb-1">
            E-mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder="seu@email.com"
            className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-dark"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-dark mb-1">
            Senha
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            placeholder="Sua senha"
            className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-dark"
          />
        </div>

        <div className="text-right">
          <Link href="/forgot-password" className="text-sm text-primary hover:underline">
            Esqueceu a senha?
          </Link>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 px-4 bg-primary text-white font-semibold rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>

      <p className="text-center mt-6 text-sm text-muted">
        Ainda nao tem conta?{" "}
        <Link
          href={conviteToken ? `/signup?convite=${conviteToken}` : "/signup"}
          className="text-primary font-medium hover:underline"
        >
          Criar conta
        </Link>
      </p>
    </div>
  );
}
