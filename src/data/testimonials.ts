/**
 * Testimonials shown on the landing page.
 *
 * Substitua por quotes reais conforme forem coletados (NPS, entrevistas,
 * App Store reviews, posts em redes sociais com permissão). Manter:
 *   - 3 a 6 quotes
 *   - cada uma com `author` (primeiro nome + cidade ou primeiro nome + cargo)
 *     e `role` (descrição curta para credibilidade)
 *   - tom natural, sem jargão de marketing
 *   - diversidade de personas (mãe separada, pai casado, profissional,
 *     família LGBT+, avó guardiã, etc.)
 *
 * O componente <LandingSocialProof /> mostra os 3 primeiros itens; se
 * quiser exibir mais, ajuste o componente também.
 */

export interface Testimonial {
  quote: string;
  author: string;
  role: string;
  /** Optional avatar URL. Falls back to initials circle if absent. */
  avatarUrl?: string;
  /** True if this is real (delete placeholder once you have real ones). */
  verified?: boolean;
}

export const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "Era caos no WhatsApp com meu ex. Agora a agenda da minha filha está em um lugar só — até a avó dela acompanha.",
    author: "Mariana, São Paulo",
    role: "Mãe · separada · 1 filha",
  },
  {
    quote:
      "A IA que lê receita médica salvou minha vida. Meu filho tem asma e eu sempre esquecia o que a pediatra prescreveu.",
    author: "Carlos, Belo Horizonte",
    role: "Pai · casado · 2 filhos",
  },
  {
    quote:
      "Como advogada, uso o export legal. Cliente entrega PDF com histórico de comunicação e acordos e o processo anda mais rápido.",
    author: "Dra. Juliana",
    role: "Advogada de família",
  },
];
