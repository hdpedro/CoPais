import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminMetrics } from "@/lib/billing/metrics";

// No cache — admin wants live numbers each visit.
export const dynamic = "force-dynamic";

const fmtBrl = (n: number) =>
  `R$ ${n.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
const fmtPct = (n: number) => `${Math.round(n * 1000) / 10}%`;

export default async function AdminMetricsPage() {
  const admin = createAdminClient();
  const [m, funnel] = await Promise.all([
    getAdminMetrics(admin),
    fetchFunnelHealth(admin),
  ]);
  const confirmRate24h = funnel.started_24h > 0
    ? funnel.confirmed_24h / funnel.started_24h
    : 1;
  const stuckRate24h = funnel.started_24h > 0
    ? funnel.stuck_24h / funnel.started_24h
    : 0;
  const funnelHealth: "ok" | "warn" | "bad" =
    funnel.stuck_current >= 3 || stuckRate24h > 0.10
      ? "bad"
      : funnel.stuck_current >= 1 || stuckRate24h > 0.05
        ? "warn"
        : "ok";

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-stone-900">Métricas</h1>

      {/* Top-level KPIs */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="MRR" value={fmtBrl(m.mrr.brl)} sub={`${m.mrr.activeSubs} assinantes ativos`} />
        <KpiCard
          label="Early Bird"
          value={`${m.earlyBird.claimed}/${m.earlyBird.maxSubscribers}`}
          sub={`${m.earlyBird.remaining} vagas (${fmtPct(m.earlyBird.claimRate)})`}
          highlight={m.earlyBird.remaining < 100}
        />
        <KpiCard
          label="Conversão trial→pago (30d)"
          value={fmtPct(m.trial.conversionRate)}
          sub={`${m.trial.convertedTo30d} de ${m.trial.expired30d}`}
        />
        <KpiCard
          label="Crescimento líquido (30d)"
          value={`${m.churn30d.netGrowth >= 0 ? "+" : ""}${m.churn30d.netGrowth}`}
          sub={`${m.churn30d.newCount} novos · ${m.churn30d.canceledCount} churn`}
          highlight={m.churn30d.netGrowth < 0}
        />
      </section>

      {/* Breakdown por tier */}
      <section className="bg-white rounded-2xl border border-stone-200 p-6">
        <h2 className="text-lg font-bold text-stone-900 mb-4">Por tier</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-stone-500">
            <tr>
              <th className="pb-2">Tier</th>
              <th className="pb-2">Assinantes</th>
              <th className="pb-2">MRR</th>
            </tr>
          </thead>
          <tbody>
            {m.byTier.length === 0 && (
              <tr>
                <td colSpan={3} className="py-4 text-stone-500">
                  Nenhum assinante ativo ainda
                </td>
              </tr>
            )}
            {m.byTier.map((t) => (
              <tr key={t.tier} className="border-t border-stone-100">
                <td className="py-2 font-medium capitalize">{t.tier.replace("_", " ")}</td>
                <td className="py-2">{t.activeSubs}</td>
                <td className="py-2">{fmtBrl(t.mrrBrl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Por plan_id (granularidade Early Bird vs regular) */}
      <section className="bg-white rounded-2xl border border-stone-200 p-6">
        <h2 className="text-lg font-bold text-stone-900 mb-4">Por plano (detalhado)</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-stone-500">
            <tr>
              <th className="pb-2">Plan ID</th>
              <th className="pb-2">Assinantes</th>
              <th className="pb-2">MRR</th>
            </tr>
          </thead>
          <tbody>
            {m.byPlanId.map((p) => (
              <tr key={p.planId} className="border-t border-stone-100">
                <td className="py-2 font-mono text-xs">{p.planId}</td>
                <td className="py-2">{p.count}</td>
                <td className="py-2">{fmtBrl(p.mrrBrl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Payment method adoption */}
        <section className="bg-white rounded-2xl border border-stone-200 p-6">
          <h2 className="text-lg font-bold text-stone-900 mb-4">Método de pagamento</h2>
          <ul className="text-sm space-y-2">
            <li className="flex justify-between">
              <span>💳 Cartão</span>
              <span className="font-semibold">{m.paymentMethod.card}</span>
            </li>
            <li className="flex justify-between">
              <span>💸 PIX</span>
              <span className="font-semibold">{m.paymentMethod.pix}</span>
            </li>
            <li className="flex justify-between">
              <span>🍎 Apple IAP</span>
              <span className="font-semibold">{m.paymentMethod.appleIap}</span>
            </li>
            <li className="flex justify-between">
              <span>🤖 Google IAP</span>
              <span className="font-semibold">{m.paymentMethod.googleIap}</span>
            </li>
          </ul>
        </section>

        {/* Onboarding quest distribution */}
        <section className="bg-white rounded-2xl border border-stone-200 p-6">
          <h2 className="text-lg font-bold text-stone-900 mb-4">Quest de onboarding</h2>
          <ul className="text-sm space-y-2">
            <li className="flex justify-between">
              <span>0 passos completos</span>
              <span className="font-semibold">{m.quest.usersWith0}</span>
            </li>
            <li className="flex justify-between">
              <span>1-2 passos</span>
              <span className="font-semibold">{m.quest.usersWith1to2}</span>
            </li>
            <li className="flex justify-between">
              <span>3-4 passos</span>
              <span className="font-semibold">{m.quest.usersWith3to4}</span>
            </li>
            <li className="flex justify-between text-emerald-700 font-semibold">
              <span>5/5 (completo)</span>
              <span>{m.quest.usersWith5}</span>
            </li>
          </ul>
          <p className="text-xs text-stone-500 mt-3">
            Hipótese: usuários com ≥3 passos convertem 3× mais. Monitorar correlação via PostHog.
          </p>
        </section>

        {/* Auto-split adoption */}
        <section className="bg-white rounded-2xl border border-stone-200 p-6">
          <h2 className="text-lg font-bold text-stone-900 mb-4">Split automático</h2>
          <p className="text-3xl font-bold text-stone-900">
            {m.autoSplit.enabled}
            <span className="text-sm font-normal text-stone-500"> / {m.autoSplit.eligible}</span>
          </p>
          <p className="text-xs text-stone-500 mt-1">
            {fmtPct(m.autoSplit.rate)} dos grupos com assinatura ativa usam split 50/50.
          </p>
          <p className="text-xs text-stone-500 mt-3">
            Meta: &gt;40% dos grupos com 2 pais ativam o split (reduz churn e briga de &ldquo;quem paga&rdquo;).
          </p>
        </section>

        {/* Coupons summary */}
        <section className="bg-white rounded-2xl border border-stone-200 p-6">
          <h2 className="text-lg font-bold text-stone-900 mb-4">Cupons</h2>
          <p className="text-sm text-stone-600">
            <strong>{m.coupons.activeCount}</strong> cupons ativos ·{" "}
            <strong>{m.coupons.totalRedemptions}</strong> usos
          </p>
          <a href="/admin/coupons" className="text-sm text-emerald-700 underline mt-2 inline-block">
            Gerenciar →
          </a>
        </section>
      </div>

      {/* Signup funnel health — Tier A observability */}
      <section
        className={`rounded-2xl border p-6 ${
          funnelHealth === "bad"
            ? "bg-rose-50 border-rose-200"
            : funnelHealth === "warn"
              ? "bg-amber-50 border-amber-200"
              : "bg-white border-stone-200"
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-stone-900">Saúde do funil de signup</h2>
          <span
            className={`text-xs font-bold uppercase tracking-wider px-2 py-1 rounded ${
              funnelHealth === "bad"
                ? "bg-rose-600 text-white"
                : funnelHealth === "warn"
                  ? "bg-amber-500 text-white"
                  : "bg-emerald-600 text-white"
            }`}
          >
            {funnelHealth === "bad" ? "Crítico" : funnelHealth === "warn" ? "Atenção" : "Saudável"}
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-2xl font-bold text-stone-900">{funnel.started_24h}</p>
            <p className="text-xs text-stone-500">Iniciados 24h</p>
            <p className="text-[10px] text-stone-400 mt-0.5">{funnel.started_7d} em 7d</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-emerald-700">{funnel.confirmed_24h}</p>
            <p className="text-xs text-stone-500">Confirmados 24h</p>
            <p className="text-[10px] text-stone-400 mt-0.5">
              {fmtPct(confirmRate24h)} taxa
            </p>
          </div>
          <div>
            <p className={`text-2xl font-bold ${funnel.stuck_current > 0 ? "text-rose-700" : "text-stone-900"}`}>
              {funnel.stuck_current}
            </p>
            <p className="text-xs text-stone-500">Travados agora</p>
            <p className="text-[10px] text-stone-400 mt-0.5">Sem confirmar &gt;1h</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-stone-900">{funnel.stuck_24h}</p>
            <p className="text-xs text-stone-500">Stuck rate 24h</p>
            <p className="text-[10px] text-stone-400 mt-0.5">{fmtPct(stuckRate24h)}</p>
          </div>
        </div>
        {funnel.stuck_current > 0 && (
          <p className="text-xs text-stone-600 mt-4">
            Cron <code className="bg-stone-100 px-1 rounded">signup-rescue</code> roda hourly em :15 — confirma + email humano automaticamente.
          </p>
        )}
      </section>

      {/* Trial detail */}
      <section className="bg-white rounded-2xl border border-stone-200 p-6">
        <h2 className="text-lg font-bold text-stone-900 mb-4">Trial de 7 dias</h2>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-2xl font-bold text-stone-900">{m.trial.active}</p>
            <p className="text-xs text-stone-500">ativos agora</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-stone-900">{m.trial.expired30d}</p>
            <p className="text-xs text-stone-500">expiraram nos últimos 30d</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-emerald-700">{m.trial.convertedTo30d}</p>
            <p className="text-xs text-stone-500">converteram ({fmtPct(m.trial.conversionRate)})</p>
          </div>
        </div>
      </section>
    </div>
  );
}

interface FunnelHealth {
  started_24h: number;
  started_7d: number;
  confirmed_24h: number;
  confirmed_7d: number;
  stuck_current: number;
  stuck_24h: number;
}

async function fetchFunnelHealth(admin: ReturnType<typeof createAdminClient>): Promise<FunnelHealth> {
  const fallback: FunnelHealth = {
    started_24h: 0, started_7d: 0, confirmed_24h: 0, confirmed_7d: 0, stuck_current: 0, stuck_24h: 0,
  };
  try {
    const { data, error } = await admin
      .from("v_signup_funnel_health")
      .select("*")
      .maybeSingle();
    if (error || !data) return fallback;
    return {
      started_24h: Number(data.started_24h ?? 0),
      started_7d: Number(data.started_7d ?? 0),
      confirmed_24h: Number(data.confirmed_24h ?? 0),
      confirmed_7d: Number(data.confirmed_7d ?? 0),
      stuck_current: Number(data.stuck_current ?? 0),
      stuck_24h: Number(data.stuck_24h ?? 0),
    };
  } catch {
    return fallback;
  }
}

function KpiCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 ${
        highlight ? "bg-amber-50 border-amber-200" : "bg-white border-stone-200"
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">{label}</p>
      <p className="text-2xl font-bold text-stone-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-stone-500 mt-1">{sub}</p>}
    </div>
  );
}
