import Link from "next/link";

export default function PricingSuccessPage() {
  return (
    <div className="min-h-screen bg-[#EEECEA] flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-full bg-[#2E7268]/10 flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-[#2E7268]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-[#0E0C0A] mb-2">Assinatura ativada!</h1>
        <p className="text-[#9A8878] mb-8">
          Seu plano Premium esta ativo. Aproveite todas as funcionalidades do Kindar.
        </p>
        <Link
          href="/dashboard"
          className="inline-block w-full py-3 px-4 bg-[#C07055] text-white font-semibold rounded-lg hover:bg-[#A85D47] transition-colors"
        >
          Ir para o Dashboard
        </Link>
      </div>
    </div>
  );
}
