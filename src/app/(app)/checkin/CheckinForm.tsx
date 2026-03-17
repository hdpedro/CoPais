"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCheckin } from "@/actions/checkin";
import { CHECKIN_CATEGORIES } from "@/lib/constants";

interface CheckinFormProps {
  groupId: string;
  children: { id: string; full_name: string }[];
}

export default function CheckinForm({ groupId, children }: CheckinFormProps) {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [childId, setChildId] = useState(children[0]?.id || "");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !selectedCategory || !childId) return;

    setSubmitting(true);
    const formData = new FormData();
    formData.set("groupId", groupId);
    formData.set("childId", childId);
    formData.set("category", selectedCategory);
    formData.set("title", title);
    formData.set("description", description);

    const result = await createCheckin(formData);
    setSubmitting(false);

    if (result.success) {
      setTitle("");
      setDescription("");
      setSelectedCategory("");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
      router.refresh();
    }
  }

  // Quick templates based on category
  const quickTemplates: Record<string, string[]> = {
    screen_time: ["Ficou 1h na tela", "Ficou 2h na tela", "Ficou 3h na tela", "Ficou 4h na tela"],
    food: ["Comeu bem no almoco", "Comeu hamburguer", "Nao quis jantar", "Comeu frutas"],
    sleep: ["Dormiu cedo (20h)", "Dormiu tarde (22h)", "Teve pesadelo", "Dormiu bem"],
    mood: ["Estava feliz", "Chorou bastante", "Estava irritado", "Dia tranquilo"],
    health: ["Teve febre", "Tomou remedio", "Espirrou muito", "Machucou o joelho"],
    activity: ["Brincou no parque", "Jogou bola", "Fez natacao", "Andou de bicicleta"],
    school: ["Fez toda a licao", "Prova amanha", "Reuniao de pais", "Passeio escolar"],
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl p-4 shadow-sm space-y-4">
      {/* Child selector (if multiple) */}
      {children.length > 1 && (
        <div>
          <label className="block text-sm font-medium text-dark mb-1">Crianca</label>
          <select
            value={childId}
            onChange={(e) => setChildId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            {children.map((c) => (
              <option key={c.id} value={c.id}>{c.full_name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Category pills */}
      <div>
        <label className="block text-sm font-medium text-dark mb-2">Categoria</label>
        <div className="flex flex-wrap gap-2">
          {CHECKIN_CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              type="button"
              onClick={() => setSelectedCategory(cat.value)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm transition-colors ${
                selectedCategory === cat.value
                  ? "bg-primary text-white"
                  : "bg-gray-100 text-dark hover:bg-gray-200"
              }`}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Quick templates */}
      {selectedCategory && quickTemplates[selectedCategory] && (
        <div>
          <label className="block text-xs text-muted mb-1">Rapido:</label>
          <div className="flex flex-wrap gap-1">
            {quickTemplates[selectedCategory].map((tmpl) => (
              <button
                key={tmpl}
                type="button"
                onClick={() => setTitle(tmpl)}
                className={`px-2 py-1 text-xs rounded-lg transition-colors ${
                  title === tmpl
                    ? "bg-primary/10 text-primary border border-primary/30"
                    : "bg-gray-50 text-muted hover:bg-gray-100"
                }`}
              >
                {tmpl}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Title */}
      <div>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="O que aconteceu? Ex: Ficou 4h na tela"
          className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      {/* Description */}
      <div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Detalhes opcionais..."
          rows={2}
          className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
        />
      </div>

      <button
        type="submit"
        disabled={submitting || !title.trim() || !selectedCategory}
        className="w-full py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50"
      >
        {success ? "Registrado!" : submitting ? "Salvando..." : "Registrar Check-in"}
      </button>
    </form>
  );
}
