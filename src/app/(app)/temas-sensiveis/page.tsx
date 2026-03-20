import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createSensitiveNote } from "@/actions/sensitive";

export default async function TemasRelevantesPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", user.id);

  if (!memberships || memberships.length === 0) redirect("/onboarding");
  const groupId = memberships[0].group_id;

  const { data: children } = await supabase
    .from("children")
    .select("id, full_name")
    .eq("group_id", groupId);

  const { data: notes } = await supabase
    .from("sensitive_notes")
    .select("*, children(full_name), profiles!sensitive_notes_created_by_fkey(full_name)")
    .eq("group_id", groupId)
    .order("is_urgent", { ascending: false })
    .order("created_at", { ascending: false });

  const topicLabels: Record<string, string> = {
    gender_violence: "Violencia de Genero",
    sexual_violence: "Violencia Sexual",
    bullying: "Bullying",
    mental_health: "Saude Mental",
    substance_abuse: "Uso de Substancias",
    safety: "Seguranca",
    other: "Outro",
  };

  const topicIcons: Record<string, string> = {
    gender_violence: "🛡️",
    sexual_violence: "⚠️",
    bullying: "🚫",
    mental_health: "🧠",
    substance_abuse: "💊",
    safety: "🔒",
    other: "📝",
  };

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h1 className="text-2xl font-bold text-dark">Temas Sensiveis</h1>
        <p className="text-sm text-muted mt-1">
          Espaco seguro para compartilhar conteudos importantes sobre protecao e bem-estar das criancas.
        </p>
      </div>

      {/* Safety Notice */}
      <div className="bg-secondary/5 border border-secondary/20 rounded-xl p-4">
        <p className="text-sm text-dark font-medium">Espaco seguro e privado</p>
        <p className="text-xs text-muted mt-1">
          Este espaco e exclusivo para compartilhar informacoes sobre temas sensiveis como violencia, bullying e seguranca.
          As informacoes aqui sao visiveis apenas pelos membros do grupo familiar.
        </p>
      </div>

      {/* New Note Form */}
      <form action={createSensitiveNote} className="bg-white rounded-xl p-4 shadow-sm space-y-3">
        <h3 className="font-semibold text-dark">Compartilhar informacao</h3>
        <input type="hidden" name="groupId" value={groupId} />

        <select name="topic" required
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
          <option value="">Tema...</option>
          {Object.entries(topicLabels).map(([k, v]) => (
            <option key={k} value={k}>{topicIcons[k]} {v}</option>
          ))}
        </select>

        <input type="text" name="title" required placeholder="Titulo"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />

        <textarea name="content" required rows={4} placeholder="Descreva a situacao, compartilhe um artigo ou informacao importante..."
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />

        <div className="grid grid-cols-2 gap-3">
          <select name="childId"
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
            <option value="">Crianca (opcional)</option>
            {children?.map((c) => (
              <option key={c.id} value={c.id}>{c.full_name}</option>
            ))}
          </select>
          <input type="url" name="sourceUrl" placeholder="Link (opcional)"
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>

        <label className="flex items-center gap-2 text-sm text-dark">
          <input type="checkbox" name="isUrgent" className="rounded border-gray-300 text-secondary focus:ring-secondary" />
          <span className="text-secondary font-medium">Marcar como urgente</span>
        </label>

        <button type="submit"
          className="w-full py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark transition-colors">
          Compartilhar
        </button>
      </form>

      {/* Notes List */}
      {notes && notes.length > 0 ? (
        <div className="space-y-3">
          {notes.map((note) => (
            <div key={note.id} className={`bg-white rounded-xl p-4 shadow-sm ${note.is_urgent ? "border-l-4 border-secondary" : ""}`}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{topicIcons[note.topic] || "📝"}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-dark text-sm">{note.title}</h3>
                      {note.is_urgent && (
                        <span className="text-xs bg-secondary/10 text-secondary px-2 py-0.5 rounded-full font-medium">Urgente</span>
                      )}
                    </div>
                    <p className="text-xs text-muted">
                      {topicLabels[note.topic]} {(note.children as any)?.full_name ? `- ${(note.children as any).full_name}` : ""}
                    </p>
                  </div>
                </div>
                <span className="text-xs text-muted">{new Date(note.created_at).toLocaleDateString("pt-BR")}</span>
              </div>
              <p className="text-sm text-muted ml-8">{note.content}</p>
              {note.source_url && (
                <a href={note.source_url} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-primary ml-8 mt-1 inline-block hover:underline">
                  Ver fonte
                </a>
              )}
              <p className="text-xs text-muted mt-2 ml-8">Por {(note.profiles as any)?.full_name}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl p-8 shadow-sm text-center">
          <p className="text-muted">Nenhum conteudo compartilhado ainda.</p>
          <p className="text-sm text-muted mt-1">Compartilhe artigos, informacoes e preocupacoes importantes.</p>
        </div>
      )}
    </div>
  );
}
