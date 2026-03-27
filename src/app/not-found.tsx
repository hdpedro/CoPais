import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#EEECEA] px-4">
      <div className="text-center max-w-sm">
        <div className="text-6xl mb-4">🏠</div>
        <h1 className="text-4xl font-bold text-[#2D3B3A] mb-2">404</h1>
        <p className="text-lg text-[#7A8C8B] mb-6">
          Pagina nao encontrada.
        </p>
        <Link
          href="/dashboard"
          className="inline-block px-6 py-3 bg-[#D4735A] text-white font-semibold rounded-xl hover:bg-[#d4623b] transition-colors"
        >
          Voltar ao inicio
        </Link>
      </div>
    </div>
  );
}
