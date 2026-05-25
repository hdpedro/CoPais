import Link from "next/link";
import { EVENTS } from "@/lib/analytics";
import PageViewTracker from "@/components/analytics/PageViewTracker";

export default function PricingCancelPage() {
  return (
    <>
      <PageViewTracker
        event={EVENTS.CHECKOUT_CANCELED}
        properties={{ source: "stripe_cancel_url", provider: "stripe" }}
      />
      <PricingCancelContent />
    </>
  );
}

function PricingCancelContent() {
  return (
    <div className="min-h-screen bg-[#EEECEA] flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-full bg-[#C07055]/10 flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-[#C07055]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-[#0E0C0A] mb-2">Pagamento cancelado</h1>
        <p className="text-[#9A8878] mb-8 leading-relaxed">
          Tudo certo — nenhuma cobrança foi feita. Você pode voltar e tentar de novo quando quiser.
        </p>
        <div className="space-y-3">
          <Link
            href="/pricing"
            className="block w-full py-3 px-4 bg-[#C07055] text-white font-semibold rounded-lg hover:bg-[#A85D47] transition-colors"
          >
            Tentar novamente
          </Link>
          <Link
            href="/dashboard"
            className="block w-full py-3 px-4 text-[#9A8878] font-medium border border-[#E8E0D4] rounded-lg hover:bg-[#F5EFE6] transition-colors"
          >
            Voltar ao app
          </Link>
        </div>
      </div>
    </div>
  );
}
