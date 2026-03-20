import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createDocument } from "@/actions/documents";

export default async function DocumentsPage() {
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

  const { data: documents } = await supabase
    .from("documents")
    .select("*, children(full_name), profiles!documents_uploaded_by_fkey(full_name)")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false });

  const catLabels: Record<string, string> = {
    personal: "Pessoal",
    health: "Saude",
    education: "Educacao",
    legal: "Legal",
    other: "Outro",
  };

  const catIcons: Record<string, string> = {
    personal: "📄",
    health: "🏥",
    education: "🎓",
    legal: "⚖️",
    other: "📁",
  };

  function formatSize(bytes: number) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  return (
    <div className="space-y-6 pb-20">
      <h1 className="text-2xl font-bold text-dark">Documentos</h1>

      {/* Upload Form */}
      <form action={createDocument} className="bg-white rounded-xl p-4 shadow-sm space-y-3">
        <h3 className="font-semibold text-dark">Enviar documento</h3>
        <input type="hidden" name="groupId" value={groupId} />

        <input type="text" name="name" required placeholder="Nome do documento"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />

        <div className="grid grid-cols-2 gap-3">
          <select name="category" required
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
            {Object.entries(catLabels).map(([k, v]) => (
              <option key={k} value={k}>{catIcons[k]} {v}</option>
            ))}
          </select>
          <select name="childId"
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
            <option value="">Geral</option>
            {children?.map((c) => (
              <option key={c.id} value={c.id}>{c.full_name}</option>
            ))}
          </select>
        </div>

        <input type="file" name="file" required
          className="w-full text-sm text-muted file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20" />

        <button type="submit"
          className="w-full py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark transition-colors">
          Enviar
        </button>
      </form>

      {/* Document List */}
      {documents && documents.length > 0 ? (
        <div className="space-y-2">
          {documents.map((doc) => (
            <a key={doc.id} href={doc.file_url} target="_blank" rel="noopener noreferrer"
              className="block bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{catIcons[doc.category] || "📁"}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-dark text-sm truncate">{doc.name}</p>
                  <p className="text-xs text-muted">
                    {catLabels[doc.category]} {(doc.children as any)?.full_name ? `- ${(doc.children as any).full_name}` : ""}
                  </p>
                  <p className="text-xs text-muted">
                    {(doc.profiles as any)?.full_name} - {new Date(doc.created_at).toLocaleDateString("pt-BR")}
                    {doc.file_size ? ` - ${formatSize(doc.file_size)}` : ""}
                  </p>
                </div>
                <svg className="w-5 h-5 text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </div>
            </a>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl p-8 shadow-sm text-center">
          <p className="text-muted">Nenhum documento enviado ainda.</p>
        </div>
      )}
    </div>
  );
}
