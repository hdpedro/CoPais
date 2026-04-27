"use client";

import { useState, useTransition } from "react";
import { createCoupon, deactivateCoupon } from "@/actions/admin-coupons";

interface Coupon {
  id: string;
  code: string;
  description: string | null;
  amount_off_brl: number | null;
  percent_off: number | null;
  duration: string;
  duration_months: number | null;
  max_redemptions: number | null;
  current_redemptions: number;
  expires_at: string | null;
  applicable_plan_ids: string[];
  stripe_coupon_id: string | null;
  stripe_promotion_code_id: string | null;
  is_active: boolean;
  created_at: string;
  notes: string | null;
}

export default function CouponsClient({ initialCoupons }: { initialCoupons: Coupon[] }) {
  const [coupons, setCoupons] = useState(initialCoupons);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Form state
  const [form, setForm] = useState({
    code: "",
    description: "",
    discountType: "percent" as "percent" | "amount",
    percentOff: 20,
    amountOffBrl: 500, // cents
    duration: "once" as "forever" | "once" | "repeating",
    durationMonths: 3,
    maxRedemptions: "",
    expiresAt: "",
    notes: "",
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const code = form.code.trim().toUpperCase();

    startTransition(async () => {
      const res = await createCoupon({
        code,
        description: form.description || undefined,
        amountOffBrl: form.discountType === "amount" ? form.amountOffBrl : undefined,
        percentOff: form.discountType === "percent" ? form.percentOff : undefined,
        duration: form.duration,
        durationMonths: form.duration === "repeating" ? form.durationMonths : undefined,
        maxRedemptions: form.maxRedemptions ? parseInt(form.maxRedemptions, 10) : undefined,
        expiresAt: form.expiresAt || undefined,
        notes: form.notes || undefined,
      });

      if (res.error) {
        setMessage({ kind: "err", text: res.error });
      } else {
        setMessage({ kind: "ok", text: `Cupom ${code} criado e sincronizado com Stripe.` });
        setForm({ ...form, code: "", description: "", notes: "" });
        // Optimistic — full page revalidate would also work
        setCoupons((curr) => [
          {
            id: crypto.randomUUID(),
            code,
            description: form.description || null,
            amount_off_brl: form.discountType === "amount" ? form.amountOffBrl : null,
            percent_off: form.discountType === "percent" ? form.percentOff : null,
            duration: form.duration,
            duration_months: form.duration === "repeating" ? form.durationMonths : null,
            max_redemptions: form.maxRedemptions ? parseInt(form.maxRedemptions, 10) : null,
            current_redemptions: 0,
            expires_at: form.expiresAt || null,
            applicable_plan_ids: [],
            stripe_coupon_id: null,
            stripe_promotion_code_id: null,
            is_active: true,
            created_at: new Date().toISOString(),
            notes: form.notes || null,
          },
          ...curr,
        ]);
      }
    });
  }

  function handleDeactivate(id: string) {
    if (!confirm("Desativar este cupom? Ele não poderá mais ser usado em novos checkouts.")) return;
    startTransition(async () => {
      const res = await deactivateCoupon(id);
      if (res.error) setMessage({ kind: "err", text: res.error });
      else {
        setCoupons((curr) => curr.map((c) => (c.id === id ? { ...c, is_active: false } : c)));
      }
    });
  }

  function describe(c: Coupon): string {
    const disc = c.amount_off_brl
      ? `R$ ${(c.amount_off_brl / 100).toFixed(2).replace(".", ",")} off`
      : `${c.percent_off}% off`;
    const dur =
      c.duration === "forever"
        ? "para sempre"
        : c.duration === "once"
          ? "1ª cobrança"
          : `${c.duration_months}× meses`;
    return `${disc} · ${dur}`;
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-stone-900">Cupons</h1>

      {/* Create form */}
      <section className="bg-white rounded-2xl border border-stone-200 p-6">
        <h2 className="text-lg font-bold text-stone-900 mb-4">Criar novo cupom</h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs font-semibold text-stone-600 uppercase">Código</span>
            <input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              placeholder="PROFESSORA20"
              pattern="[A-Z0-9_-]{3,32}"
              required
              className="mt-1 w-full border border-stone-300 rounded-lg px-3 py-2 font-mono uppercase"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-stone-600 uppercase">Descrição (interna)</span>
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Campanha com professoras"
              className="mt-1 w-full border border-stone-300 rounded-lg px-3 py-2"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-stone-600 uppercase">Tipo de desconto</span>
            <select
              value={form.discountType}
              onChange={(e) => setForm({ ...form, discountType: e.target.value as "percent" | "amount" })}
              className="mt-1 w-full border border-stone-300 rounded-lg px-3 py-2"
            >
              <option value="percent">% de desconto</option>
              <option value="amount">R$ fixo de desconto</option>
            </select>
          </label>
          {form.discountType === "percent" ? (
            <label className="block">
              <span className="text-xs font-semibold text-stone-600 uppercase">% off</span>
              <input
                type="number"
                min={1}
                max={100}
                value={form.percentOff}
                onChange={(e) => setForm({ ...form, percentOff: parseInt(e.target.value, 10) })}
                className="mt-1 w-full border border-stone-300 rounded-lg px-3 py-2"
              />
            </label>
          ) : (
            <label className="block">
              <span className="text-xs font-semibold text-stone-600 uppercase">R$ off (cents)</span>
              <input
                type="number"
                min={50}
                value={form.amountOffBrl}
                onChange={(e) => setForm({ ...form, amountOffBrl: parseInt(e.target.value, 10) })}
                className="mt-1 w-full border border-stone-300 rounded-lg px-3 py-2"
              />
              <span className="text-xs text-stone-500">
                = R$ {(form.amountOffBrl / 100).toFixed(2).replace(".", ",")}
              </span>
            </label>
          )}

          <label className="block">
            <span className="text-xs font-semibold text-stone-600 uppercase">Duração</span>
            <select
              value={form.duration}
              onChange={(e) => setForm({ ...form, duration: e.target.value as typeof form.duration })}
              className="mt-1 w-full border border-stone-300 rounded-lg px-3 py-2"
            >
              <option value="once">1ª cobrança apenas</option>
              <option value="repeating">X meses</option>
              <option value="forever">Para sempre</option>
            </select>
          </label>
          {form.duration === "repeating" && (
            <label className="block">
              <span className="text-xs font-semibold text-stone-600 uppercase">Meses</span>
              <input
                type="number"
                min={1}
                max={12}
                value={form.durationMonths}
                onChange={(e) => setForm({ ...form, durationMonths: parseInt(e.target.value, 10) })}
                className="mt-1 w-full border border-stone-300 rounded-lg px-3 py-2"
              />
            </label>
          )}

          <label className="block">
            <span className="text-xs font-semibold text-stone-600 uppercase">
              Limite de usos (vazio = ilimitado)
            </span>
            <input
              type="number"
              min={1}
              value={form.maxRedemptions}
              onChange={(e) => setForm({ ...form, maxRedemptions: e.target.value })}
              className="mt-1 w-full border border-stone-300 rounded-lg px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-stone-600 uppercase">Expira em (opcional)</span>
            <input
              type="date"
              value={form.expiresAt}
              onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
              className="mt-1 w-full border border-stone-300 rounded-lg px-3 py-2"
            />
          </label>

          <label className="block md:col-span-2">
            <span className="text-xs font-semibold text-stone-600 uppercase">Notas (visíveis só para admin)</span>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="mt-1 w-full border border-stone-300 rounded-lg px-3 py-2"
            />
          </label>

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={pending}
              className="bg-stone-900 hover:bg-stone-800 text-white font-semibold px-6 py-2.5 rounded-xl disabled:opacity-60"
            >
              {pending ? "Criando no Stripe…" : "Criar cupom"}
            </button>
            {message && (
              <span
                className={`ml-4 text-sm ${message.kind === "ok" ? "text-emerald-700" : "text-red-700"}`}
              >
                {message.text}
              </span>
            )}
          </div>
        </form>
      </section>

      {/* List */}
      <section className="bg-white rounded-2xl border border-stone-200">
        <div className="p-4 border-b border-stone-100">
          <h2 className="text-lg font-bold text-stone-900">Cupons existentes ({coupons.length})</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-stone-500 bg-stone-50">
            <tr>
              <th className="p-3">Código</th>
              <th className="p-3">Desconto</th>
              <th className="p-3">Usos</th>
              <th className="p-3">Expira</th>
              <th className="p-3">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {coupons.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-stone-500">
                  Nenhum cupom criado ainda
                </td>
              </tr>
            )}
            {coupons.map((c) => (
              <tr key={c.id} className="border-t border-stone-100">
                <td className="p-3 font-mono font-semibold">{c.code}</td>
                <td className="p-3">{describe(c)}</td>
                <td className="p-3">
                  {c.current_redemptions}
                  {c.max_redemptions && <span className="text-stone-400"> / {c.max_redemptions}</span>}
                </td>
                <td className="p-3 text-xs text-stone-600">
                  {c.expires_at ? new Date(c.expires_at).toLocaleDateString("pt-BR") : "—"}
                </td>
                <td className="p-3">
                  <span
                    className={`inline-block text-xs font-semibold px-2 py-1 rounded ${
                      c.is_active
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-stone-200 text-stone-600"
                    }`}
                  >
                    {c.is_active ? "Ativo" : "Inativo"}
                  </span>
                </td>
                <td className="p-3 text-right">
                  {c.is_active && (
                    <button
                      onClick={() => handleDeactivate(c.id)}
                      disabled={pending}
                      className="text-xs font-semibold text-red-700 hover:text-red-800"
                    >
                      Desativar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
