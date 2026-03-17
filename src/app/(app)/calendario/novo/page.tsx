import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createCustodyEvent } from "@/actions/calendar";
import Link from "next/link";

export default async function NewEventPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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

  const { data: members } = await supabase
    .from("group_members")
    .select("user_id, profiles(full_name)")
    .eq("group_id", groupId);

  return (
    <div className="max-w-lg mx-auto pb-20">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/calendario" className="text-muted hover:text-dark">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-2xl font-bold text-dark">Novo Evento</h1>
      </div>

      <form action={createCustodyEvent} className="bg-white rounded-xl p-6 shadow-sm space-y-4">
        <input type="hidden" name="groupId" value={groupId} />

        <div>
          <label className="block text-sm font-medium text-dark mb-1">Crianca</label>
          <select name="childId" required
            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary">
            <option value="">Selecione...</option>
            {children?.map((child) => (
              <option key={child.id} value={child.id}>{child.full_name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-dark mb-1">Responsavel</label>
          <select name="responsibleUserId" required
            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary">
            <option value="">Selecione...</option>
            {members?.map((m) => (
              <option key={m.user_id} value={m.user_id}>{(m.profiles as any)?.full_name}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Data inicio</label>
            <input type="date" name="startDate" required
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary" />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Data fim</label>
            <input type="date" name="endDate" required
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-dark mb-1">Tipo</label>
          <select name="custodyType" required
            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary">
            <option value="regular">Regular</option>
            <option value="holiday">Feriado</option>
            <option value="swap">Troca</option>
            <option value="vacation">Ferias</option>
            <option value="special">Especial</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-dark mb-1">Observacoes</label>
          <textarea name="notes" rows={3} placeholder="Observacoes opcionais..."
            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary" />
        </div>

        <button type="submit"
          className="w-full py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary-dark transition-colors">
          Criar Evento
        </button>
      </form>
    </div>
  );
}
