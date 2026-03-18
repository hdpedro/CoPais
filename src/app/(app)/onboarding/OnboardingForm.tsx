"use client";

import { useState, type FormEvent } from "react";

export default function OnboardingForm() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = e.currentTarget;
    const formData = new FormData(form);

    try {
      const res = await fetch("/api/create-group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.get("name"),
          childName: formData.get("childName"),
          childBirthDate: formData.get("childBirthDate"),
        }),
      });

      const result = await res.json();

      if (!res.ok || result.error) {
        setError(result.error || "Erro ao criar grupo.");
        setLoading(false);
      } else {
        // Full page navigation to avoid any auth token issues
        window.location.href = "/onboarding/convite";
      }
    } catch {
      setError("Erro inesperado. Tente novamente.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl p-6 shadow-sm space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-dark mb-1">Nome da familia</label>
        <input
          type="text"
          name="name"
          required
          placeholder="Ex: Familia Silva"
          className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
        />
      </div>

      <hr className="my-4" />
      <h3 className="text-lg font-semibold text-dark">Adicionar primeira crianca</h3>

      <div>
        <label className="block text-sm font-medium text-dark mb-1">Nome completo da crianca</label>
        <input
          type="text"
          name="childName"
          required
          placeholder="Nome da crianca"
          className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-dark mb-1">Data de nascimento</label>
        <input
          type="date"
          name="childBirthDate"
          required
          className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50"
      >
        {loading ? "Criando..." : "Criar grupo e continuar"}
      </button>
    </form>
  );
}
