import Link from "next/link";

export default function AdminHome() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-stone-900 mb-6">Painel Admin</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-xl">
        <Link
          href="/admin/metrics"
          className="block bg-white rounded-2xl border border-stone-200 p-6 hover:shadow transition"
        >
          <h2 className="text-lg font-bold text-stone-900">Métricas</h2>
          <p className="text-sm text-stone-600 mt-1">
            MRR, Early Bird, conversão de trial, adoção PIX, churn.
          </p>
        </Link>
        <Link
          href="/admin/coupons"
          className="block bg-white rounded-2xl border border-stone-200 p-6 hover:shadow transition"
        >
          <h2 className="text-lg font-bold text-stone-900">Cupons</h2>
          <p className="text-sm text-stone-600 mt-1">
            Criar e gerenciar códigos promocionais sincronizados com Stripe.
          </p>
        </Link>
      </div>
    </div>
  );
}
