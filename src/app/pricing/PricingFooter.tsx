import Link from "next/link";

/**
 * Footer rico do /pricing — 4 colunas (Produto / Empresa / Suporte / Legal)
 * + bloco "selos de confiança" (Stripe Verified, RGPD/LGPD, BR sediada).
 *
 * Padrão Stripe/Linear: rodapé denso em landings públicas é sinal de
 * legitimidade. Em apps logados o footer some — aqui ele agrega.
 *
 * Server component: zero JS no cliente. Só Links do next/router para
 * navegação prefetch nativa.
 */
export default function PricingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-[#E8E0D4] bg-white">
      <div className="max-w-6xl mx-auto px-4 py-12">
        {/* Trust signals */}
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 pb-10 border-b border-[#F0E8DA]">
          <span className="inline-flex items-center gap-2 text-xs text-[#6B5F52]">
            <svg className="w-4 h-4 text-[#2E7268]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            Pagamento processado por Stripe
          </span>
          <span className="inline-flex items-center gap-2 text-xs text-[#6B5F52]">
            <svg className="w-4 h-4 text-[#2E7268]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Conformidade LGPD
          </span>
          <span className="inline-flex items-center gap-2 text-xs text-[#6B5F52]">
            <svg className="w-4 h-4 text-[#C07055]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Empresa brasileira
          </span>
          <span className="inline-flex items-center gap-2 text-xs text-[#6B5F52]">
            <svg className="w-4 h-4 text-[#2E7268]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
            Cartão, PIX e Apple Pay
          </span>
        </div>

        {/* 4 colunas */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 pt-10">
          {/* Produto */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0E0C0A] mb-4">
              Produto
            </h3>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link href="/pricing" className="text-[#6B5F52] hover:text-[#C07055] transition-colors">
                  Planos e preços
                </Link>
              </li>
              <li>
                <Link href="/signup" className="text-[#6B5F52] hover:text-[#C07055] transition-colors">
                  Criar conta grátis
                </Link>
              </li>
              <li>
                <Link href="/login" className="text-[#6B5F52] hover:text-[#C07055] transition-colors">
                  Entrar
                </Link>
              </li>
              <li>
                <a
                  href="https://apps.apple.com/br/app/kindar/id6762701916"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#6B5F52] hover:text-[#C07055] transition-colors inline-flex items-center gap-1"
                >
                  App iOS
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </li>
            </ul>
          </div>

          {/* Empresa */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0E0C0A] mb-4">
              Empresa
            </h3>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link href="/" className="text-[#6B5F52] hover:text-[#C07055] transition-colors">
                  Sobre o Kindar
                </Link>
              </li>
              <li>
                <a
                  href="https://wa.me/5521999605044?text=Oi%20Kindar%21%20Quero%20conversar%20sobre%20o%20produto"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#6B5F52] hover:text-[#C07055] transition-colors"
                >
                  Fale com a gente
                </a>
              </li>
              <li>
                <a
                  href="mailto:contato@kindar.com.br"
                  className="text-[#6B5F52] hover:text-[#C07055] transition-colors"
                >
                  contato@kindar.com.br
                </a>
              </li>
            </ul>
          </div>

          {/* Suporte */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0E0C0A] mb-4">
              Suporte
            </h3>
            <ul className="space-y-2.5 text-sm">
              <li>
                <a
                  href="https://wa.me/5521999605044?text=Oi%20Kindar%21%20Preciso%20de%20ajuda"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#6B5F52] hover:text-[#C07055] transition-colors inline-flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5 text-[#25D366]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  WhatsApp
                </a>
              </li>
              <li>
                <a
                  href="mailto:suporte@kindar.com.br"
                  className="text-[#6B5F52] hover:text-[#C07055] transition-colors"
                >
                  suporte@kindar.com.br
                </a>
              </li>
              <li>
                <Link href="/pricing#faq" className="text-[#6B5F52] hover:text-[#C07055] transition-colors">
                  Perguntas frequentes
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0E0C0A] mb-4">
              Legal
            </h3>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link href="/termos" className="text-[#6B5F52] hover:text-[#C07055] transition-colors">
                  Termos de Uso
                </Link>
              </li>
              <li>
                <Link href="/privacidade" className="text-[#6B5F52] hover:text-[#C07055] transition-colors">
                  Política de Privacidade
                </Link>
              </li>
              <li>
                <Link href="/perfil/excluir" className="text-[#6B5F52] hover:text-[#C07055] transition-colors">
                  Excluir minha conta
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom strip */}
        <div className="mt-10 pt-6 border-t border-[#F0E8DA] flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/kindar-logo.png" alt="" width={24} height={24} className="object-contain" />
            <p className="text-xs text-[#9A8878]">
              © {year} Kindar. Todos os direitos reservados.
            </p>
          </div>
          <p className="text-xs text-[#9A8878]">
            Feito com cuidado no Rio de Janeiro · Brasil
          </p>
        </div>
      </div>
    </footer>
  );
}
