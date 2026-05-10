/**
 * Landing — badges das lojas (App Store + Google Play).
 *
 * Variantes:
 *  - "default": badges grandes (44px h), pra hero/CTA final
 *  - "compact": badges pequenos (36px h), pra footer / espaços densos
 *
 * Apple: link ativo pra ficha oficial pt-BR.
 * Google Play: visualmente presente mas desabilitado, com selo "Em breve".
 *   Quando o Google aprovar, basta trocar `GOOGLE_PLAY_URL` por uma string
 *   válida e o badge passa a ser clicável automaticamente.
 *
 * Server component (sem "use client") — badges estáticos não precisam JS.
 * O PostHog autocapture cobre os cliques.
 */

const APPLE_APP_STORE_URL =
  "https://apps.apple.com/br/app/kindar/id6762701916";
const GOOGLE_PLAY_URL: string | null = null; // null = aguardando aprovação

const SIZE = {
  default: { h: "h-[44px]", px: "px-4", topGap: "gap-0", topText: "text-[10px]", bottomText: "text-[16px] leading-tight", iconSize: "w-6 h-6" },
  compact: { h: "h-[36px]", px: "px-3", topGap: "gap-0", topText: "text-[8px]", bottomText: "text-[13px] leading-tight", iconSize: "w-5 h-5" },
} as const;

type Variant = keyof typeof SIZE;

function AppleLogo({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

function GooglePlayLogo({ className }: { className: string }) {
  // Triângulo do Google Play em 4 cores (azul, vermelho, amarelo, verde),
  // mesma paleta usada pelo badge oficial.
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3.609 1.814L13.792 12 3.61 22.186a1.001 1.001 0 0 1-.61-.92V2.734c0-.388.227-.722.61-.92z" fill="#34A853" />
      <path d="M14.5 12.7l2.96-2.96 4.05 2.34c.95.55.95 1.95 0 2.5l-3.86 2.23-3.15-3.15v-.96z" fill="#FBBC04" />
      <path d="M3.609 1.814a.999.999 0 0 1 1.005.013l13.79 7.927-3.904 3.946L3.609 1.814z" fill="#4285F4" />
      <path d="M3.609 22.186l10.89-11.886 3.904 3.946L4.614 22.173a.999.999 0 0 1-1.005.013z" fill="#EA4335" />
    </svg>
  );
}

function AppleBadge({ variant }: { variant: Variant }) {
  const s = SIZE[variant];
  return (
    <a
      href={APPLE_APP_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Baixar Kindar na App Store"
      className={`group inline-flex ${s.h} items-center ${s.px} gap-2.5 rounded-xl bg-black text-white hover:bg-[#1a1a1a] transition-colors shadow-sm hover:shadow-md`}
    >
      <AppleLogo className={s.iconSize} />
      <span className={`flex flex-col ${s.topGap} text-left`}>
        <span className={`${s.topText} font-medium uppercase tracking-wider text-white/80`}>
          Baixar na
        </span>
        <span className={`${s.bottomText} font-semibold tracking-tight`}>App Store</span>
      </span>
    </a>
  );
}

function GooglePlayBadge({ variant }: { variant: Variant }) {
  const s = SIZE[variant];
  const isLive = typeof GOOGLE_PLAY_URL === "string" && GOOGLE_PLAY_URL.length > 0;

  const inner = (
    <>
      <GooglePlayLogo className={s.iconSize} />
      <span className={`flex flex-col ${s.topGap} text-left`}>
        <span className={`${s.topText} font-medium uppercase tracking-wider text-white/70`}>
          {isLive ? "Disponível no" : "Em breve no"}
        </span>
        <span className={`${s.bottomText} font-semibold tracking-tight`}>Google Play</span>
      </span>
    </>
  );

  if (isLive) {
    return (
      <a
        href={GOOGLE_PLAY_URL as string}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Baixar Kindar no Google Play"
        className={`group inline-flex ${s.h} items-center ${s.px} gap-2.5 rounded-xl bg-black text-white hover:bg-[#1a1a1a] transition-colors shadow-sm hover:shadow-md`}
      >
        {inner}
      </a>
    );
  }

  return (
    <span
      role="img"
      aria-label="Kindar — em breve no Google Play, aguardando aprovação"
      title="Em breve no Google Play — aguardando aprovação"
      className={`relative inline-flex ${s.h} items-center ${s.px} gap-2.5 rounded-xl bg-black/85 text-white/90 cursor-default select-none`}
    >
      {inner}
    </span>
  );
}

export default function AppStoreBadges({
  variant = "default",
  className = "",
}: {
  variant?: Variant;
  className?: string;
}) {
  return (
    <div className={`inline-flex flex-wrap items-center justify-center gap-3 ${className}`}>
      <AppleBadge variant={variant} />
      <GooglePlayBadge variant={variant} />
    </div>
  );
}
