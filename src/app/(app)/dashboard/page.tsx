import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user!.id)
    .single();

  const firstName = profile?.full_name?.split(" ")[0] || "Pai";

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h2 className="text-2xl font-bold text-dark">
          Ola, {firstName}!
        </h2>
        <p className="text-muted mt-1">Bem-vindo ao CoPais</p>
      </div>

      {/* Status Card */}
      <div className="bg-white rounded-xl p-6 shadow-sm border-l-4 border-primary">
        <p className="text-sm text-muted mb-1">Status da Guarda</p>
        <p className="text-lg font-semibold text-dark">
          Configure seu calendario de guarda
        </p>
        <p className="text-sm text-muted mt-2">
          Adicione uma crianca e convide o outro responsavel para comecar.
        </p>
      </div>

      {/* Quick Actions */}
      <div>
        <h3 className="text-lg font-semibold text-dark mb-3">Acoes Rapidas</h3>
        <div className="grid grid-cols-3 gap-3">
          <QuickAction icon="+" label="Despesa" href="/despesas/nova" />
          <QuickAction icon="📅" label="Calendario" href="/calendario" />
          <QuickAction icon="💬" label="Chat" href="/chat" />
        </div>
      </div>

      {/* Empty State */}
      <div className="bg-white rounded-xl p-8 shadow-sm text-center">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-dark mb-2">
          Convide o outro responsavel
        </h3>
        <p className="text-muted text-sm mb-4">
          Para usar todas as funcionalidades, convide o outro pai/mae ou cuidador.
        </p>
        <button className="px-6 py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary-dark transition-colors">
          Enviar Convite
        </button>
      </div>
    </div>
  );
}

function QuickAction({
  icon,
  label,
  href,
}: {
  icon: string;
  label: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="flex flex-col items-center justify-center gap-2 bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow min-h-[80px]"
    >
      <span className="text-2xl">{icon}</span>
      <span className="text-sm font-medium text-dark">{label}</span>
    </a>
  );
}
