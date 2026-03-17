import Link from "next/link";

const features = [
  { href: "/dashboard", icon: "🏠", label: "Inicio", color: "bg-primary/10" },
  { href: "/calendario", icon: "📅", label: "Calendario", color: "bg-blue-50" },
  { href: "/financeiro", icon: "📊", label: "Financeiro", color: "bg-lime-50" },
  { href: "/despesas", icon: "💰", label: "Despesas", color: "bg-green-50" },
  { href: "/chat", icon: "💬", label: "Chat", color: "bg-purple-50" },
  { href: "/criancas", icon: "👶", label: "Criancas", color: "bg-pink-50" },
  { href: "/saude", icon: "🏥", label: "Saude", color: "bg-red-50" },
  { href: "/documentos", icon: "📄", label: "Documentos", color: "bg-yellow-50" },
  { href: "/acordos", icon: "🤝", label: "Acordos", color: "bg-teal-50" },
  { href: "/eventos", icon: "🎉", label: "Eventos", color: "bg-orange-50" },
  { href: "/escola", icon: "🎒", label: "Escola", color: "bg-indigo-50" },
  { href: "/checkin", icon: "✅", label: "Check-in", color: "bg-emerald-50" },
  { href: "/temas-sensiveis", icon: "🛡️", label: "Temas Sensiveis", color: "bg-gray-50" },
  { href: "/familia", icon: "👥", label: "Familia", color: "bg-sky-50" },
  { href: "/convite/enviar", icon: "✉️", label: "Convidar", color: "bg-cyan-50" },
];

export default function MaisPage() {
  return (
    <div className="pb-20">
      <h1 className="text-2xl font-bold text-dark mb-6">Todas as funcionalidades</h1>
      <div className="grid grid-cols-3 gap-4">
        {features.map((f) => (
          <Link
            key={f.href}
            href={f.href}
            className="flex flex-col items-center justify-center gap-2 bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow min-h-[100px]"
          >
            <div className={`w-12 h-12 ${f.color} rounded-full flex items-center justify-center`}>
              <span className="text-2xl">{f.icon}</span>
            </div>
            <span className="text-xs font-medium text-dark text-center">{f.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
