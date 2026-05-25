/**
 * Feature comparison matrix — server-rendered table contrasting Grátis,
 * Harmonia and Premium Jurídico across the 6-7 decision-critical features.
 * No JS needed; pure markup + Tailwind.
 */

interface Row {
  label: string;
  free: string | boolean;
  harmonia: string | boolean;
  juridico: string | boolean;
  note?: string;
}

const ROWS: Row[] = [
  { label: "Crianças no grupo", free: "1", harmonia: "Ilimitado", juridico: "Ilimitado" },
  { label: "Convidados grátis (avós, babá, advogado, mediador)", free: "Ilimitado", harmonia: "Ilimitado", juridico: "Ilimitado" },
  { label: "Histórico de dados", free: "30 dias", harmonia: "Ilimitado", juridico: "Ilimitado" },
  { label: "Calendário + agenda de guarda", free: "Básico", harmonia: "Completo", juridico: "Completo" },
  { label: "Despesas compartilhadas", free: "Básico", harmonia: "Completo + split", juridico: "Completo + split" },
  { label: "Chat da família com IA mediadora", free: false, harmonia: true, juridico: true },
  { label: "Saúde completa (consultas, vacinas, medicamentos)", free: false, harmonia: true, juridico: true },
  { label: "OCR de receita médica + inferência clínica", free: false, harmonia: true, juridico: true },
  { label: "IA assistente Kindar", free: false, harmonia: true, juridico: true },
  { label: "Sincroniza iOS + Android + Web", free: true, harmonia: true, juridico: true },
  { label: "Export legal (PDF com audit trail)", free: false, harmonia: false, juridico: true, note: "Aceito em processos" },
  { label: "Backup jurídico automático", free: false, harmonia: false, juridico: true },
  { label: "Alertas inteligentes de receita (alergia cruzada, interação)", free: false, harmonia: false, juridico: true },
  { label: "Suporte prioritário", free: false, harmonia: true, juridico: "VIP" },
  { label: "Indique e ganhe (1 mês grátis por cada amigo)", free: true, harmonia: true, juridico: true },
];

function Cell({ value }: { value: string | boolean }) {
  if (typeof value === "boolean") {
    return value ? (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-emerald-100 text-emerald-700">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </span>
    ) : (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-stone-100 text-stone-400">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </span>
    );
  }
  return <span className="text-sm font-medium text-stone-700">{value}</span>;
}

export default function FeatureMatrix() {
  return (
    <section className="max-w-6xl mx-auto px-4 pb-16">
      <h2 className="text-2xl font-bold text-stone-900 mb-6 text-center">
        Compare os três planos lado a lado
      </h2>

      <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-stone-50 border-b border-stone-200">
              <tr>
                <th className="p-4 text-xs font-semibold uppercase tracking-wider text-stone-500 w-1/2">
                  O que tem
                </th>
                <th className="p-4 text-center text-sm font-bold text-stone-900 w-1/6">Grátis</th>
                <th className="p-4 text-center text-sm font-bold text-[#C07055] w-1/6 bg-[#C07055]/5">
                  Harmonia
                </th>
                <th className="p-4 text-center text-sm font-bold text-amber-700 w-1/6">
                  Prem. Jurídico
                </th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, i) => (
                <tr key={row.label} className={i % 2 === 0 ? "bg-white" : "bg-stone-50/50"}>
                  <td className="p-4">
                    <p className="text-sm text-stone-900">{row.label}</p>
                    {row.note && <p className="text-xs text-stone-500 mt-0.5">{row.note}</p>}
                  </td>
                  <td className="p-4 text-center"><Cell value={row.free} /></td>
                  <td className="p-4 text-center bg-[#C07055]/5"><Cell value={row.harmonia} /></td>
                  <td className="p-4 text-center"><Cell value={row.juridico} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-center text-xs text-stone-500 mt-4">
        Todos os planos: 7 dias de degustação Premium Jurídico no signup. Cancele quando quiser, sem multa.
      </p>
    </section>
  );
}
