"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/* ──────────────────────────────────────────────────────────────
   useInView — true quando o elemento está (perto de) visível.
   Usado pra pausar loops de animação fora da tela (performance).
   ────────────────────────────────────────────────────────────── */
function useInView(ref: React.RefObject<HTMLElement | null>) {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { rootMargin: "140px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return inView;
}

/* ──────────────────────────────────────────────────────────────
   Tema (dark/light) — atributo `data-proto-theme` no <html>.
   ThemeToggle manipula o DOM direto (sem Client Component na raiz
   do layout, que o Turbopack+OneDrive quebrava). Anti-flash via
   script inline no layout.
   ────────────────────────────────────────────────────────────── */
export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Lê o estado já aplicado pelo script anti-flash no #proto-root.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDark(
      document.getElementById("proto-root")?.getAttribute("data-proto-theme") ===
        "dark",
    );
  }, []);

  const toggle = () => {
    setIsDark((prev) => {
      const next = !prev;
      const root = document.getElementById("proto-root");
      if (root) {
        if (next) root.setAttribute("data-proto-theme", "dark");
        else root.removeAttribute("data-proto-theme");
      }
      try {
        localStorage.setItem("proto-theme", next ? "dark" : "light");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Mudar para tema claro" : "Mudar para tema escuro"}
      className="relative inline-flex items-center w-[44px] h-[26px] rounded-full border border-[var(--proto-line-2)] bg-[var(--proto-soft)] px-1 transition-colors"
    >
      <span
        className="proto-toggle-knob grid place-items-center w-[18px] h-[18px] rounded-full bg-[var(--proto-ink)] text-[var(--proto-card)]"
      >
        {isDark ? (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
      </span>
    </button>
  );
}

/* ──────────────────────────────────────────────────────────────
   MobileNav — menu hamburguer (só < md). Dropdown com os links de
   âncora + Entrar. Fecha ao clicar num link ou fora.
   ────────────────────────────────────────────────────────────── */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const links: [string, string][] = [
    ["#produto", "Produto"],
    ["#demo", "Como funciona"],
    ["#whatsapp", "WhatsApp"],
    ["#comparativo", "Comparar"],
    ["#planos", "Planos"],
    ["#faq", "FAQ"],
  ];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [open]);

  return (
    <div ref={ref} className="md:hidden relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Fechar menu" : "Abrir menu"}
        aria-expanded={open}
        className="grid place-items-center w-9 h-9 rounded-lg border border-[var(--proto-line-2)] text-[var(--proto-ink)]"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          {open ? (
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          ) : (
            <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          )}
        </svg>
      </button>
      <div
        className="absolute right-0 top-[46px] w-52 rounded-2xl p-2 origin-top-right transition-all duration-200 bg-[var(--proto-card)] border border-[var(--proto-line-2)] shadow-[0_24px_60px_-20px_rgba(14,12,10,0.45)]"
        style={{
          opacity: open ? 1 : 0,
          transform: open ? "translateY(0) scale(1)" : "translateY(-8px) scale(0.97)",
          pointerEvents: open ? "auto" : "none",
        }}
      >
        {links.map(([href, label]) => (
          <a
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            className="block px-3 py-2.5 rounded-lg text-[14px] font-medium text-[var(--proto-ink)] hover:bg-[var(--proto-soft)] transition-colors"
          >
            {label}
          </a>
        ))}
        <div className="h-px bg-[var(--proto-line)] my-1.5" />
        <Link
          href="/login"
          onClick={() => setOpen(false)}
          className="block px-3 py-2.5 rounded-lg text-[14px] font-medium text-[var(--proto-mute)] hover:bg-[var(--proto-soft)] transition-colors"
        >
          Entrar
        </Link>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   Reveal — IntersectionObserver com entrada premium
   (blur + translate + fade, easing cubic-bezier suave)
   ────────────────────────────────────────────────────────────── */
export function Reveal({
  children,
  delay = 0,
  className = "",
  as: Tag = "div",
  y = 18,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  as?: keyof React.JSX.IntrinsicElements;
  y?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // `armed` só vira true APÓS o mount. Assim o SSR e o primeiro render do
  // client são idênticos (conteúdo visível → sem hydration mismatch e o
  // texto aparece mesmo sem JS). A animação é progressive enhancement.
  const [armed, setArmed] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let io: IntersectionObserver | undefined;

    // Toda a decisão roda num rAF (antes do paint): mantém o setState fora
    // do corpo do effect e não introduz flash pro conteúdo acima da dobra.
    const raf = requestAnimationFrame(() => {
      const reduce = window.matchMedia?.(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      if (reduce || typeof IntersectionObserver === "undefined") {
        setShown(true);
        return;
      }
      const r = el.getBoundingClientRect();
      const inView = r.top < window.innerHeight && r.bottom > 0;
      if (inView) {
        setShown(true);
        return;
      }
      // Abaixo da dobra: esconde e observa pra revelar ao entrar na tela.
      setArmed(true);
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) {
              setShown(true);
              io?.disconnect();
              break;
            }
          }
        },
        { threshold: 0.12, rootMargin: "0px 0px -80px 0px" },
      );
      io.observe(el);
    });

    return () => {
      cancelAnimationFrame(raf);
      io?.disconnect();
    };
  }, []);

  const hidden = armed && !shown;
  const style = {
    transitionDelay: `${delay}ms`,
    transform: hidden ? `translate3d(0, ${y}px, 0)` : "translate3d(0,0,0)",
  } as React.CSSProperties;
  const Element = Tag as unknown as React.ElementType;
  return (
    <Element
      ref={ref as unknown as React.Ref<HTMLDivElement>}
      style={style}
      className={`transition-[opacity,transform,filter] duration-[1100ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
        hidden ? "opacity-0 [filter:blur(6px)]" : "opacity-100 [filter:blur(0)]"
      } ${className}`}
    >
      {children}
    </Element>
  );
}

/* ──────────────────────────────────────────────────────────────
   TiltCard — perspective 3D real seguindo o cursor.
   Combinada com spotlight glow. Não exagera (max 8°).
   ────────────────────────────────────────────────────────────── */
export function TiltCard({
  children,
  className = "",
  glow = "#C07055",
  intensity = 8,
}: {
  children: React.ReactNode;
  className?: string;
  glow?: string;
  intensity?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    const rx = (py - 0.5) * -intensity;
    const ry = (px - 0.5) * intensity;
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
    el.style.setProperty("--rx", `${rx}deg`);
    el.style.setProperty("--ry", `${ry}deg`);
  };
  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  };

  return (
    <div
      style={{ perspective: "1100px" }}
      className={`group relative ${className}`}
    >
      <div
        ref={ref}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        style={
          {
            ["--glow" as string]: glow,
            ["--rx" as string]: "0deg",
            ["--ry" as string]: "0deg",
            transform: "rotateX(var(--rx)) rotateY(var(--ry))",
            transformStyle: "preserve-3d",
            transition: "transform 360ms cubic-bezier(0.22,1,0.36,1)",
          } as React.CSSProperties
        }
        className="relative h-full overflow-hidden rounded-3xl border border-[var(--proto-line)] bg-[var(--proto-card)] will-change-transform"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-px opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          style={{
            background:
              "radial-gradient(440px circle at var(--mx) var(--my), color-mix(in oklab, var(--glow) 16%, transparent), transparent 55%)",
          }}
        />
        <div className="relative" style={{ transform: "translateZ(20px)" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   MagneticCTA — botão com puxão magnético + shimmer
   ────────────────────────────────────────────────────────────── */
export function MagneticCTA({
  href,
  children,
  variant = "primary",
  className = "",
  external = false,
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "ghost" | "light";
  className?: string;
  external?: boolean;
}) {
  const ref = useRef<HTMLAnchorElement>(null);

  const onMove = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = (e.clientX - cx) * 0.16;
    const dy = (e.clientY - cy) * 0.16;
    el.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  const onLeave = () => {
    if (ref.current) ref.current.style.transform = "translate(0,0)";
  };

  const base =
    "proto-shimmer relative inline-flex items-center justify-center gap-2 text-[15px] font-semibold px-7 py-4 rounded-2xl transition-[transform,box-shadow,background,color] duration-300 will-change-transform";
  const styles =
    variant === "primary"
      ? "bg-[var(--proto-ink)] text-[var(--proto-on-ink)] shadow-[0_20px_50px_-15px_rgba(14,12,10,0.55)] hover:shadow-[0_30px_70px_-15px_rgba(192,112,85,0.55)] hover:bg-[var(--proto-terra)] hover:text-white"
      : variant === "light"
      ? "bg-white text-[var(--proto-ink)] shadow-[0_20px_50px_-15px_rgba(255,255,255,0.25)] hover:bg-[var(--proto-cream)]"
      : "border border-[var(--proto-line-2)] text-[var(--proto-ink)] hover:border-[var(--proto-ink)]/40 bg-[var(--proto-card)]/50 backdrop-blur";

  const props = external
    ? { target: "_blank", rel: "noopener noreferrer" as const }
    : {};
  return (
    <Link
      ref={ref}
      href={href}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={`${base} ${styles} ${className}`}
      {...props}
    >
      <span className="relative z-10 inline-flex items-center gap-2">
        {children}
      </span>
    </Link>
  );
}

/* ──────────────────────────────────────────────────────────────
   ScrollProgress — barra do topo com gradient da marca
   ────────────────────────────────────────────────────────────── */
export function ScrollProgress() {
  const [p, setP] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      setP(max > 0 ? (h.scrollTop / max) * 100 : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div
      aria-hidden
      className="fixed top-0 left-0 right-0 h-[2px] z-[60] pointer-events-none"
    >
      <div
        className="h-full origin-left"
        style={{
          width: `${p}%`,
          background:
            "linear-gradient(90deg, #C07055 0%, #E8C5A4 50%, #2E7268 100%)",
          boxShadow: "0 0 12px rgba(192,112,85,0.45)",
          transition: "width 120ms linear",
        }}
      />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   AnimatedCounter — easing in-out até o número final quando entra
   ────────────────────────────────────────────────────────────── */
export function AnimatedCounter({
  to,
  format = "int",
  duration = 1600,
  suffix = "",
  prefix = "",
  decimals = 0,
}: {
  to: number;
  format?: "int" | "br";
  duration?: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setValue(to);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const start = performance.now();
          const tick = (now: number) => {
            // Clamp t to [0,1]: a rAF timestamp can be slightly *before* the
            // `start` captured via performance.now() in the IO callback, making
            // (now - start) negative on the first frame. Without the lower clamp,
            // easeOutCubic 1-(1-t)^3 goes negative → counter flashes "-137".
            const t = Math.max(0, Math.min(1, (now - start) / duration));
            // cubic-bezier(0.22,1,0.36,1) approx via 1 - (1-t)^3
            const eased = 1 - Math.pow(1 - t, 3);
            setValue(to * eased);
            if (t < 1) requestAnimationFrame(tick);
            else setValue(to);
          };
          requestAnimationFrame(tick);
          io.disconnect();
          break;
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [to, duration]);

  const formatted =
    format === "br"
      ? value.toLocaleString("pt-BR", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })
      : Math.round(value).toString();

  return (
    <span ref={ref}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}

/* ──────────────────────────────────────────────────────────────
   AvatarStack — círculos sobrepostos representando famílias
   ────────────────────────────────────────────────────────────── */
export function AvatarStack() {
  const items = [
    { bg: "#C07055", fg: "white", t: "A" },
    { bg: "#2E7268", fg: "white", t: "B" },
    { bg: "#E8C5A4", fg: "#0E0C0A", t: "M" },
    { bg: "#1A1614", fg: "white", t: "C" },
    { bg: "#9A8878", fg: "white", t: "L" },
  ];
  return (
    <div className="flex items-center -space-x-2.5">
      {items.map((a, i) => (
        <span
          key={i}
          className="inline-grid place-items-center w-9 h-9 rounded-full ring-2 ring-white text-[12px] font-bold shadow-sm transition-transform duration-300 hover:-translate-y-1"
          style={{ background: a.bg, color: a.fg, zIndex: items.length - i }}
        >
          {a.t}
        </span>
      ))}
      <span className="ml-3 grid">
        <span className="text-[13px] font-bold text-[var(--proto-ink)]">
          <AnimatedCounter to={1842} format="br" />
          {" "}famílias
        </span>
        <span className="text-[11.5px] text-[var(--proto-mute-2)]">
          meta da beta · número ilustrativo
        </span>
      </span>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   LiveTicker — feed de eventos da família com auto-rotate
   ────────────────────────────────────────────────────────────── */
const TICKER_FRAMES = [
  { time: "07:42", who: "Amanda", text: "Check-in matinal · Manu acordou bem", tone: "terra" },
  { time: "08:15", who: "Vovó Cida", text: "Confirma busca do Lucas às 17h", tone: "teal" },
  { time: "09:03", who: "Kindar IA", text: "Reforço HPV em 12 dias · carteirinha ok", tone: "teal" },
  { time: "10:30", who: "Bruno", text: "Despesa lançada: jaleco · R$ 84,90", tone: "terra" },
  { time: "11:48", who: "Kindar IA", text: "Resumo da semana pronto · 3 trocas, 0 atritos", tone: "teal" },
  { time: "13:20", who: "Amanda", text: "Aprovou despesa do jaleco · split 50/50", tone: "terra" },
];

export function LiveTicker() {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef);

  useEffect(() => {
    if (paused || !inView) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % TICKER_FRAMES.length), 2800);
    return () => clearInterval(id);
  }, [paused, inView]);

  return (
    <div
      ref={rootRef}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="proto-glass rounded-3xl p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="relative flex w-2 h-2">
            <span className="absolute inline-flex w-full h-full rounded-full bg-[var(--proto-teal)] opacity-75 animate-ping" />
            <span className="relative inline-flex w-2 h-2 rounded-full bg-[var(--proto-teal)]" />
          </span>
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--proto-teal)]">
            Ao vivo · hoje
          </span>
        </div>
        <span className="text-[11px] text-[var(--proto-mute-2)]">Família Pereira</span>
      </div>
      <div className="relative h-[78px] overflow-hidden">
        {TICKER_FRAMES.map((f, i) => {
          const offset = (i - idx + TICKER_FRAMES.length) % TICKER_FRAMES.length;
          const visible = offset === 0;
          const above = offset === TICKER_FRAMES.length - 1;
          return (
            <div
              key={i}
              className="absolute inset-0 transition-all duration-[650ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{
                opacity: visible ? 1 : 0,
                transform: visible
                  ? "translateY(0)"
                  : above
                  ? "translateY(-30px)"
                  : "translateY(30px)",
              }}
            >
              <div className="flex items-start gap-3">
                <span className="shrink-0 mt-0.5 px-2 py-0.5 rounded-md bg-[var(--proto-bg)] text-[11px] font-mono text-[var(--proto-mute)] border border-[var(--proto-line)]">
                  {f.time}
                </span>
                <div className="min-w-0">
                  <p
                    className="text-[13px] font-semibold"
                    style={{ color: f.tone === "terra" ? "var(--proto-terra)" : "var(--proto-teal)" }}
                  >
                    {f.who}
                  </p>
                  <p className="text-[13px] text-[var(--proto-mute)] truncate">{f.text}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex items-center gap-1.5">
        {TICKER_FRAMES.map((_, i) => (
          <span
            key={i}
            className="h-1 rounded-full transition-all duration-500"
            style={{
              width: i === idx ? 20 : 6,
              background: i === idx ? "var(--proto-terra)" : "rgba(14,12,10,0.12)",
            }}
          />
        ))}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   ProductTabs — 4 visões do produto com auto-rotate + crossfade.
   Cada tab tem mock distinto. Pausa no hover.
   ────────────────────────────────────────────────────────────── */
const TABS = [
  { id: "calendario", label: "Calendário", icon: "📅" },
  { id: "saude", label: "Saúde", icon: "🩺" },
  { id: "despesas", label: "Despesas", icon: "💸" },
  { id: "chat", label: "Combinados", icon: "💬" },
] as const;

export function ProductTabs() {
  const [active, setActive] = useState<(typeof TABS)[number]["id"]>("calendario");
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef);

  useEffect(() => {
    if (paused || !inView) return;
    // Não resetamos `progress` aqui pra evitar setState síncrono em effect
    // (regra react-hooks/set-state-in-effect). O primeiro tick do rAF já
    // recalcula t≈0 baseado em `start`.
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 6000);
      setProgress(t * 100);
      if (t < 1) raf = requestAnimationFrame(tick);
      else {
        const idx = TABS.findIndex((x) => x.id === active);
        setActive(TABS[(idx + 1) % TABS.length].id);
      }
    };
    let raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, paused, inView]);

  return (
    <div ref={rootRef} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="flex flex-wrap items-center justify-center gap-2 mb-10">
        {TABS.map((t) => {
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setActive(t.id);
                setProgress(0);
              }}
              className={`relative overflow-hidden rounded-full px-5 py-2.5 text-[13px] font-semibold transition-all duration-300 ${
                isActive
                  ? "bg-[var(--proto-ink)] text-[var(--proto-on-ink)]"
                  : "border border-[var(--proto-line-2)] text-[var(--proto-ink)] hover:border-[var(--proto-ink)]/40 bg-[var(--proto-card)]"
              }`}
            >
              <span className="relative z-10 inline-flex items-center gap-2">
                <span aria-hidden>{t.icon}</span>
                {t.label}
              </span>
              {isActive ? (
                <span
                  aria-hidden
                  className="absolute bottom-0 left-0 h-[2px] bg-[var(--proto-terra)]"
                  style={{ width: `${progress}%`, transition: "width 120ms linear" }}
                />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="relative">
        <TabMock active={active} />
      </div>
    </div>
  );
}

function TabMock({ active }: { active: (typeof TABS)[number]["id"] }) {
  return (
    <div className="proto-lightscope proto-device !p-2 sm:!p-2.5">
      <div className="relative h-[400px] sm:h-[440px] rounded-2xl overflow-hidden bg-white">
      {/* Calendário */}
      <Pane visible={active === "calendario"}>
        <CalendarMock />
      </Pane>
      <Pane visible={active === "saude"}>
        <HealthMock />
      </Pane>
      <Pane visible={active === "despesas"}>
        <ExpensesMock />
      </Pane>
      <Pane visible={active === "chat"}>
        <ChatMock />
      </Pane>
      </div>
    </div>
  );
}

function Pane({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  return (
    <div
      className="absolute inset-0 transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0) scale(1)" : "translateY(20px) scale(0.985)",
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      {children}
    </div>
  );
}

/* ─── Mock: Calendário (week view com eixo de horas) ─── */
function CalendarMock() {
  const days = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
  const START = 7;
  const SPAN = 14; // 7h → 21h (headroom pros eventos da noite)
  const hours = [7, 9, 11, 13, 15, 17, 19];
  const topPct = (h: number) => ((h - START) / SPAN) * 100;
  // eventos por dia: hora, duração (h), quem, label
  const events: Record<number, { at: number; dur: number; who: "A" | "B" | "X"; label: string }[]> = {
    0: [{ at: 7, dur: 1, who: "A", label: "Escola" }, { at: 15, dur: 1, who: "A", label: "Inglês" }],
    1: [{ at: 7, dur: 1, who: "A", label: "Escola" }, { at: 17, dur: 1.5, who: "A", label: "Natação" }],
    2: [{ at: 14, dur: 1, who: "B", label: "Pediatra" }, { at: 18, dur: 1, who: "X", label: "Troca de guarda" }],
    3: [{ at: 7, dur: 1, who: "B", label: "Escola" }, { at: 17, dur: 1.5, who: "B", label: "Natação" }],
    4: [{ at: 12, dur: 1.5, who: "B", label: "Almoço vovó" }, { at: 19, dur: 2, who: "B", label: "Cinema" }],
    5: [{ at: 10, dur: 2, who: "A", label: "Parque" }, { at: 16, dur: 2, who: "A", label: "Aniversário" }],
    6: [{ at: 9, dur: 2, who: "A", label: "Futebol" }],
  };
  const evClass = (who: "A" | "B" | "X") =>
    who === "A"
      ? "bg-[var(--proto-terra)]/12 text-[var(--proto-terra)] border-[var(--proto-terra)]/25"
      : who === "B"
      ? "bg-[var(--proto-teal)]/12 text-[var(--proto-teal)] border-[var(--proto-teal)]/25"
      : "bg-[var(--proto-ink)]/8 text-[var(--proto-ink)] border-[var(--proto-ink)]/20";

  return (
    <div className="absolute inset-0 flex flex-col bg-white">
      {/* header (compartilhado) */}
      <div className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-3.5 border-b border-[var(--proto-line)]">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <span className="w-7 h-7 rounded-full bg-[var(--proto-terra)] text-white grid place-items-center text-[11px] font-bold shrink-0">K</span>
          <span className="text-[12.5px] sm:text-[13px] font-bold text-[var(--proto-ink)] truncate">Calendário · Manu</span>
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[var(--proto-teal)]/8 text-[var(--proto-teal)] text-[10px] font-bold tracking-wider">
            <span className="w-1 h-1 rounded-full bg-[var(--proto-teal)] proto-pulse" />
            SINCRONIZADO
          </span>
        </div>
        <span className="text-[10.5px] sm:text-[11px] text-[var(--proto-mute)] shrink-0">Maio 19–25</span>
      </div>

      {/* ── MOBILE: agenda vertical (week grid não cabe em 390px) ── */}
      <div className="sm:hidden flex-1 overflow-hidden px-3 py-2.5 space-y-2.5">
        {days.map((d, i) => {
          const evs = events[i] ?? [];
          if (!evs.length) return null;
          return (
            <div key={d}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[9.5px] font-bold uppercase tracking-widest text-[var(--proto-mute-2)]">{d} {19 + i}</span>
                {i === 2 ? (
                  <span className="text-[8.5px] font-bold uppercase tracking-wider bg-[var(--proto-terra)]/10 text-[var(--proto-terra)] px-1.5 py-0.5 rounded-full">hoje</span>
                ) : null}
              </div>
              <div className="space-y-1">
                {evs.map((e, j) => (
                  <div key={j} className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${evClass(e.who)}`}>
                    <span className="text-[10px] font-mono opacity-70 w-6 shrink-0">{e.at}h</span>
                    <span className="text-[11.5px] font-semibold flex-1 truncate">{e.label}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── DESKTOP: week view com eixo de horas ── */}
      <div className="hidden sm:grid sm:grid-rows-[auto_1fr] flex-1 min-h-0">
        {/* day headers */}
        <div className="grid grid-cols-[40px_1fr] border-b border-[var(--proto-line)]">
          <div />
          <div className="grid grid-cols-7">
            {days.map((d, i) => (
              <div key={d} className="px-2 py-2 flex items-baseline gap-1.5 justify-center">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--proto-mute-2)]">{d}</span>
                <span className={`text-[12px] font-bold ${i === 2 ? "text-[var(--proto-terra)]" : "text-[var(--proto-ink)]"}`}>{19 + i}</span>
              </div>
            ))}
          </div>
        </div>
        {/* time grid */}
        <div className="grid grid-cols-[40px_1fr] overflow-hidden pt-3 pb-2">
          <div className="relative">
            {hours.map((h) => (
              <span key={h} className="absolute right-1.5 -translate-y-1/2 text-[9px] font-medium text-[var(--proto-mute-2)]" style={{ top: `${topPct(h)}%` }}>
                {h}h
              </span>
            ))}
          </div>
          <div className="relative">
            {hours.map((h) => (
              <div key={h} className="absolute left-0 right-0 border-t border-[var(--proto-line)]" style={{ top: `${topPct(h)}%` }} />
            ))}
            <div className="absolute inset-0 grid grid-cols-7 divide-x divide-[var(--proto-line)]">
              {days.map((d, i) => (
                <div key={d} className="relative">
                  {(events[i] ?? []).map((e, j) => (
                    <div
                      key={j}
                      className={`absolute left-1 right-1 px-1.5 py-1 rounded-md border text-[9.5px] font-semibold leading-tight overflow-hidden ${evClass(e.who)}`}
                      style={{ top: `${topPct(e.at)}%`, height: `${(e.dur / SPAN) * 100}%`, minHeight: 18 }}
                    >
                      <span className="block truncate">{e.label}</span>
                      <span className="block opacity-60 text-[8.5px]">{e.at}h</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Mock: Saúde ─── */
function HealthMock() {
  return (
    <div className="absolute inset-0 grid grid-cols-[1.1fr_1fr] bg-white">
      <div className="p-3.5 sm:p-6 border-r border-[var(--proto-line)] flex flex-col">
        <p className="text-[9.5px] sm:text-[10.5px] font-bold uppercase tracking-wider sm:tracking-widest text-[var(--proto-mute-2)]">
          Carteirinha · Manu, 8 anos
        </p>
        <h3 className="proto-serif text-[22px] sm:text-[30px] leading-tight mt-2">
          Em dia · 96% de cobertura
        </h3>
        <div className="mt-4 h-2 rounded-full bg-[var(--proto-bg)] overflow-hidden">
          <div className="h-full rounded-full" style={{ width: "96%", background: "linear-gradient(90deg,#2E7268,#C07055)" }} />
        </div>
        <ul className="mt-5 space-y-2.5">
          {[
            { name: "HPV · 2ª dose", when: "Em 12 dias", tone: "soft" },
            { name: "Hepatite A · reforço", when: "Concluído · 12/04", tone: "done" },
            { name: "Tríplice viral", when: "Concluído · 09/03", tone: "done" },
            { name: "Febre amarela", when: "Concluído · 2024", tone: "done" },
            { name: "dTpa · reforço", when: "Concluído · 2023", tone: "done" },
          ].map((v) => (
            <li key={v.name} className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    v.tone === "done" ? "bg-[var(--proto-teal)]" : "bg-[var(--proto-terra)] proto-pulse"
                  }`}
                />
                <span className="text-[13px] font-semibold text-[var(--proto-ink)]">{v.name}</span>
              </div>
              <span className="text-[12px] text-[var(--proto-mute)]">{v.when}</span>
            </li>
          ))}
        </ul>
        <div className="mt-auto pt-5 flex items-center justify-between border-t border-[var(--proto-line)]">
          <span className="text-[11px] text-[var(--proto-mute)]">Base PNI + SBIm 2026</span>
          <span className="text-[11px] font-bold text-[var(--proto-terra)]">Ver carteirinha →</span>
        </div>
      </div>
      <div className="p-3.5 sm:p-6 bg-[var(--proto-bg)] flex flex-col gap-3 sm:gap-4">
        <div className="rounded-xl sm:rounded-2xl bg-white border border-[var(--proto-line)] p-3.5 sm:p-5">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[var(--proto-terra)]/10 text-[var(--proto-terra)] text-[9px] sm:text-[10px] font-bold uppercase tracking-wider">
            Sugestão calma
          </span>
          <h4 className="mt-3 text-[15px] font-bold leading-snug text-[var(--proto-ink)]">
            HPV está chegando.<br />Quer agendar com a Dra. Lia?
          </h4>
          <p className="mt-2 text-[12.5px] text-[var(--proto-mute)] leading-relaxed">
            Próxima dose recomendada entre 06/06 e 20/06. Sem urgência — só pra
            não perder a janela.
          </p>
          <div className="mt-4 flex gap-2">
            <button type="button" className="text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-[var(--proto-ink)] text-white">
              Agendar
            </button>
            <button type="button" className="text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-[var(--proto-line-2)]">
              Depois
            </button>
          </div>
        </div>
        <div className="rounded-2xl bg-white border border-[var(--proto-line)] p-5">
          <p className="text-[10.5px] font-bold uppercase tracking-widest text-[var(--proto-mute-2)]">
            Alergias registradas
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {["Camarão", "Dipirona", "Pólen"].map((a) => (
              <span key={a} className="text-[11px] px-2.5 py-1 rounded-full bg-[var(--proto-terra)]/10 text-[var(--proto-terra)] font-semibold">
                {a}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-auto rounded-2xl bg-white border border-[var(--proto-line)] p-5 flex items-center justify-between">
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-widest text-[var(--proto-mute-2)]">Próxima consulta</p>
            <p className="mt-1 text-[14px] font-bold text-[var(--proto-ink)]">Pediatra · Dra. Lia</p>
          </div>
          <span className="text-[12px] font-semibold text-[var(--proto-teal)]">06/06 · 15h</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Mock: Despesas ─── */
function ExpensesMock() {
  const rows = [
    { who: "B", title: "Jaleco de ciências", amount: "R$ 84,90", status: "Aprovada", tone: "ok" },
    { who: "A", title: "Mensalidade · maio", amount: "R$ 1.840,00", status: "Aprovada", tone: "ok" },
    { who: "B", title: "Dentista · limpeza", amount: "R$ 230,00", status: "Aguardando", tone: "pending" },
    { who: "A", title: "Material escolar", amount: "R$ 412,50", status: "Aprovada", tone: "ok" },
    { who: "B", title: "Sapatilha de balé", amount: "R$ 159,00", status: "Aprovada", tone: "ok" },
  ];
  return (
    <div className="absolute inset-0 grid grid-rows-[auto_auto_1fr] bg-white">
      <div className="px-6 py-4 border-b border-[var(--proto-line)] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="w-7 h-7 rounded-full bg-[var(--proto-terra)] text-white grid place-items-center text-[11px] font-bold">K</span>
          <span className="text-[13px] font-bold text-[var(--proto-ink)]">Despesas · maio</span>
        </div>
        <span className="text-[11px] text-[var(--proto-mute)]">Split 50/50</span>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:gap-3 px-3 sm:px-6 py-4 sm:py-5 bg-[var(--proto-bg)]">
        <div className="rounded-xl sm:rounded-2xl bg-white border border-[var(--proto-line)] px-2.5 sm:px-4 py-2.5 sm:py-3">
          <p className="text-[9px] sm:text-[10.5px] font-bold uppercase tracking-wider sm:tracking-widest text-[var(--proto-mute-2)]">Total mês</p>
          <p className="text-[13px] sm:text-[20px] font-bold mt-0.5 sm:mt-1">R$ 2.567,40</p>
        </div>
        <div className="rounded-xl sm:rounded-2xl bg-white border border-[var(--proto-line)] px-2.5 sm:px-4 py-2.5 sm:py-3">
          <p className="text-[9px] sm:text-[10.5px] font-bold uppercase tracking-wider sm:tracking-widest text-[var(--proto-mute-2)]">Amanda</p>
          <p className="text-[13px] sm:text-[20px] font-bold mt-0.5 sm:mt-1 text-[var(--proto-terra)]">R$ 1.283,70</p>
        </div>
        <div className="rounded-xl sm:rounded-2xl bg-white border border-[var(--proto-line)] px-2.5 sm:px-4 py-2.5 sm:py-3">
          <p className="text-[9px] sm:text-[10.5px] font-bold uppercase tracking-wider sm:tracking-widest text-[var(--proto-mute-2)]">Bruno</p>
          <p className="text-[13px] sm:text-[20px] font-bold mt-0.5 sm:mt-1 text-[var(--proto-teal)]">R$ 1.283,70</p>
        </div>
      </div>
      <div className="px-6 pb-6 flex flex-col">
        <div className="rounded-2xl border border-[var(--proto-line)] overflow-hidden">
          {rows.map((r, i) => (
            <div
              key={i}
              className={`flex items-center justify-between px-4 py-3 text-[13px] ${
                i > 0 ? "border-t border-[var(--proto-line)]" : ""
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`grid place-items-center w-7 h-7 rounded-full text-[11px] font-bold ${
                    r.who === "A"
                      ? "bg-[var(--proto-terra)]/15 text-[var(--proto-terra)]"
                      : "bg-[var(--proto-teal)]/15 text-[var(--proto-teal)]"
                  }`}
                >
                  {r.who}
                </span>
                <span className="font-semibold text-[var(--proto-ink)]">{r.title}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-[var(--proto-ink)]">{r.amount}</span>
                <span
                  className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                    r.tone === "ok"
                      ? "bg-[var(--proto-teal)]/10 text-[var(--proto-teal)]"
                      : "bg-[var(--proto-terra)]/10 text-[var(--proto-terra)]"
                  }`}
                >
                  {r.status}
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-auto pt-4 flex items-center justify-between text-[12px]">
          <span className="text-[var(--proto-mute)]">Dividido igualmente · sem pendências de acerto</span>
          <span className="font-bold text-[var(--proto-teal)]">Saldo a acertar · R$ 0,00</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Mock: Chat / Combinados ─── */
function ChatMock() {
  return (
    <div className="absolute inset-0 grid grid-cols-[1fr_1.2fr] bg-white">
      <div className="border-r border-[var(--proto-line)] bg-[var(--proto-bg)] p-4">
        <p className="text-[10.5px] font-bold uppercase tracking-widest text-[var(--proto-mute-2)] mb-3 px-2">
          Combinados
        </p>
        {[
          { t: "Festa do Lucas · 02/06", n: "Ambos confirmaram", on: true },
          { t: "Viagem dezembro", n: "Decisão aberta · 2 votos", on: false },
          { t: "Mesada · R$ 50/sem", n: "Vigente desde 01/04", on: false },
        ].map((c, i) => (
          <button
            key={i}
            type="button"
            className={`w-full text-left rounded-xl px-3 py-2.5 transition-colors ${
              c.on ? "bg-white border border-[var(--proto-line)] shadow-sm" : "hover:bg-white/60"
            }`}
          >
            <p className="text-[13px] font-bold text-[var(--proto-ink)]">{c.t}</p>
            <p className="text-[11.5px] text-[var(--proto-mute)]">{c.n}</p>
          </button>
        ))}
      </div>
      <div className="p-5 flex flex-col">
        <div className="flex items-center gap-2 pb-3 border-b border-[var(--proto-line)]">
          <span className="text-[14px] font-bold text-[var(--proto-ink)]">Festa do Lucas · 02/06</span>
          <span className="text-[11px] text-[var(--proto-mute)]">3 participantes</span>
        </div>
        <div className="flex-1 py-4 space-y-3 text-[13px]">
          <div className="flex gap-2">
            <span className="grid place-items-center w-6 h-6 rounded-full bg-[var(--proto-teal)]/15 text-[var(--proto-teal)] text-[10px] font-bold">B</span>
            <div className="rounded-2xl rounded-tl-md bg-[var(--proto-bg)] px-3 py-2 max-w-[80%]">
              Topo levar e buscar 18h. Você cuida do presente?
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <div className="rounded-2xl rounded-tr-md bg-[var(--proto-ink)] text-white px-3 py-2 max-w-[80%]">
              Fechado. Combinei R$ 80, ok?
            </div>
            <span className="grid place-items-center w-6 h-6 rounded-full bg-[var(--proto-terra)]/15 text-[var(--proto-terra)] text-[10px] font-bold">A</span>
          </div>
          <div className="flex justify-center">
            <span className="text-[10.5px] font-bold uppercase tracking-widest text-[var(--proto-teal)] bg-[var(--proto-teal)]/8 px-3 py-1 rounded-full">
              ✓ Combinado registrado
            </span>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--proto-line)] px-3 py-2 flex items-center gap-2 bg-[var(--proto-bg)]">
          <span className="text-[12px] text-[var(--proto-mute-2)]">Escrever uma combinação…</span>
          <span className="ml-auto text-[10.5px] font-bold tracking-widest text-[var(--proto-mute-2)]">↵</span>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   BeforeAfterSlider — slider draggable revelando 2 cenas.
   Suporta mouse, touch e teclado.
   ────────────────────────────────────────────────────────────── */
export function BeforeAfterSlider() {
  const [pct, setPct] = useState(52);
  const dragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const move = (clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const next = Math.max(4, Math.min(96, ((clientX - r.left) / r.width) * 100));
    setPct(next);
  };

  return (
    <div
      ref={containerRef}
      className="proto-lightscope relative aspect-[4/5] sm:aspect-[16/8] rounded-3xl overflow-hidden border border-[var(--proto-line)] bg-white select-none"
      onMouseDown={(e) => {
        dragging.current = true;
        move(e.clientX);
      }}
      onMouseMove={(e) => dragging.current && move(e.clientX)}
      onMouseUp={() => (dragging.current = false)}
      onMouseLeave={() => (dragging.current = false)}
      onTouchStart={(e) => {
        dragging.current = true;
        move(e.touches[0].clientX);
      }}
      onTouchMove={(e) => dragging.current && move(e.touches[0].clientX)}
      onTouchEnd={() => (dragging.current = false)}
    >
      {/* DEPOIS (Kindar) — camada de base (visível à DIREITA do handle).
          A cópia da seção diz "À direita, a mesma semana no Kindar", então o
          Kindar fica na DIREITA e o caos na ESQUERDA (convenção antes→depois). */}
      <div className="absolute inset-0">
        <AfterScene />
        <span className="absolute bottom-4 right-4 z-[5] text-[10.5px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full bg-[var(--proto-teal)] text-white shadow-lg">
          Com Kindar
        </span>
      </div>
      {/* ANTES — recortado por clip-path (visível à ESQUERDA do handle) */}
      <div
        className="absolute inset-0"
        style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }}
      >
        <BeforeScene />
        <span className="absolute bottom-4 left-4 z-[5] text-[10.5px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full bg-[var(--proto-ink)] text-white shadow-lg">
          Antes · grupo no caos
        </span>
      </div>
      {/* Handle */}
      <div
        role="slider"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setPct((p) => Math.max(4, p - 4));
          if (e.key === "ArrowRight") setPct((p) => Math.min(96, p + 4));
        }}
        className="absolute top-0 bottom-0 -translate-x-1/2 w-px bg-white cursor-ew-resize z-10 focus:outline-none"
        style={{ left: `${pct}%`, boxShadow: "0 0 24px rgba(255,255,255,0.6)" }}
      >
        <span className="absolute top-1/2 -translate-y-1/2 -left-5 grid place-items-center w-10 h-10 rounded-full bg-white shadow-xl">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M9 7l-5 5 5 5M15 7l5 5-5 5" stroke="#0E0C0A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
    </div>
  );
}

function BeforeScene() {
  const msgs: { side: "in" | "out"; who?: string; txt: string }[] = [
    { side: "in", who: "Vovó", txt: "Quem busca a Manu hoje??" },
    { side: "out", txt: "Vc não ficou de pagar a natação?" },
    { side: "in", who: "Bruno", txt: "que boleto?? não recebi nada" },
    { side: "out", txt: "mandei dia 3, vou reencaminhar 🙄" },
    { side: "in", who: "Vovó", txt: "GENTE e o ANIVERSÁRIO do Lucas??" },
    { side: "in", who: "Bruno", txt: "q aniversario" },
    { side: "out", txt: "já falei isso semana passada…" },
    { side: "in", who: "Tia Lu", txt: "alguém viu o uniforme dela?" },
  ];
  return (
    <div className="absolute inset-0 flex flex-col" style={{ background: "#ECE5DD" }}>
      {/* header WhatsApp */}
      <div className="flex items-center gap-2.5 px-4 py-2.5" style={{ background: "#075E54" }}>
        <span className="w-8 h-8 rounded-full bg-white/20 grid place-items-center text-white text-[13px] font-bold">M</span>
        <div className="flex-1 min-w-0">
          <p className="text-[12.5px] font-bold text-white leading-tight">Logística da Manu</p>
          <p className="text-[10px] text-white/70 truncate">Vovó, Bruno, Tia Lu, você</p>
        </div>
        <span className="text-[10px] font-bold text-white rounded-full px-1.5 py-0.5" style={{ background: "#25D366" }}>12</span>
      </div>
      {/* mensagens */}
      <div className="flex-1 overflow-hidden px-3 py-3 space-y-2">
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.side === "out" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-lg px-2.5 py-1.5 text-[11.5px] leading-snug shadow-sm ${m.side === "out" ? "rounded-tr-none" : "rounded-tl-none"}`}
              style={{ background: m.side === "out" ? "#DCF8C6" : "#FFFFFF", color: "#0E0C0A" }}
            >
              {m.who ? <span className="block text-[9.5px] font-bold" style={{ color: "#C07055" }}>{m.who}</span> : null}
              {m.txt}
            </div>
          </div>
        ))}
      </div>
      {/* input bar */}
      <div className="px-3 py-2.5 flex items-center gap-2" style={{ background: "#F0F0F0" }}>
        <div className="flex-1 rounded-full bg-white px-3 py-1.5 text-[11px] text-[#9A8878]">Mensagem</div>
        <span className="w-7 h-7 rounded-full grid place-items-center text-white" style={{ background: "#075E54" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M3 20l18-8L3 4v6l12 2-12 2z" /></svg>
        </span>
      </div>
    </div>
  );
}

function AfterScene() {
  return (
    <div className="absolute inset-0 grid grid-rows-[auto_1fr] bg-white">
      <div className="px-6 py-3 border-b border-[var(--proto-line)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-[var(--proto-terra)] text-white grid place-items-center text-[10px] font-bold">K</span>
          <span className="text-[12px] font-bold">Manu · esta semana</span>
        </div>
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[var(--proto-teal)]/8 text-[var(--proto-teal)] text-[9.5px] font-bold tracking-wider">
          <span className="w-1 h-1 rounded-full bg-[var(--proto-teal)] proto-pulse" />
          AO VIVO
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3 p-5">
        <div className="rounded-xl border border-[var(--proto-line)] p-3">
          <p className="text-[9.5px] font-bold uppercase tracking-widest text-[var(--proto-mute-2)]">Hoje</p>
          <p className="text-[12px] font-bold mt-1 text-[var(--proto-ink)]">Amanda · Natação 17h</p>
          <p className="text-[10.5px] text-[var(--proto-mute)] mt-1">Vovó busca · combinado</p>
        </div>
        <div className="rounded-xl border border-[var(--proto-line)] p-3">
          <p className="text-[9.5px] font-bold uppercase tracking-widest text-[var(--proto-mute-2)]">Despesas</p>
          <p className="text-[12px] font-bold mt-1">Natação · pago ✓</p>
          <p className="text-[10.5px] text-[var(--proto-teal)] mt-1">Aprovado 14:32</p>
        </div>
        <div className="rounded-xl border border-[var(--proto-line)] p-3">
          <p className="text-[9.5px] font-bold uppercase tracking-widest text-[var(--proto-mute-2)]">Aniversário</p>
          <p className="text-[12px] font-bold mt-1">02/06 · presente</p>
          <p className="text-[10.5px] text-[var(--proto-mute)] mt-1">R$ 80 · split</p>
        </div>
        <div className="col-span-3 rounded-xl border border-[var(--proto-line)] p-3 bg-[var(--proto-bg)]">
          <p className="text-[9.5px] font-bold uppercase tracking-widest text-[var(--proto-terra)]">Resumo da semana</p>
          <p className="text-[12px] text-[var(--proto-ink)] mt-1 leading-relaxed">
            3 trocas combinadas, 0 esquecimentos. Vacina HPV em 12 dias. Reservar
            tempo dia 02/06 (festa Lucas) e 06/06 (pediatra).
          </p>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   PricingToggle — mensal / anual com cálculo de economia
   ────────────────────────────────────────────────────────────── */
type Period = "monthly" | "yearly";

export function PricingSection() {
  const [period, setPeriod] = useState<Period>("monthly");
  const plans = [
    {
      name: "Grátis",
      desc: "Pra começar e organizar o essencial",
      monthly: 0,
      yearly: 0,
      cta: "Começar grátis",
      ctaStyle: "ghost" as const,
      features: [
        "Calendário compartilhado",
        "Saúde e atividades das crianças",
        "Convite pro coparente e convidados",
        "Histórico recente",
      ],
      highlight: false,
    },
    {
      name: "Harmonia",
      desc: "A família inteira, organizada",
      monthly: 19.9,
      yearly: 16.66,
      cta: "Garantir o Early Bird",
      ctaStyle: "primary" as const,
      badge: "Mais escolhido",
      note: "Early Bird: R$ 14,90/mês vitalício pras primeiras 1.000 famílias",
      features: [
        "Crianças ilimitadas",
        "Calendário de guarda + trocas",
        "Saúde completa + carteirinha de vacina",
        "Assistente no WhatsApp + OCR de receita",
        "Despesas com split e acertos",
        "Convidados ilimitados (avós, babá, advogado)",
        "Histórico ilimitado",
      ],
      highlight: true,
    },
    {
      name: "Premium Jurídico",
      desc: "Pra quem tem processo ativo",
      monthly: 39.9,
      yearly: 31.92,
      cta: "Assinar Premium Jurídico",
      ctaStyle: "ghost" as const,
      features: [
        "Tudo do Harmonia",
        "Export legal em PDF com audit trail",
        "Backup jurídico das conversas",
        "Alertas inteligentes de receita",
        "Suporte prioritário",
      ],
      highlight: false,
    },
  ];

  return (
    <>
      <div className="flex items-center justify-center mb-12">
        <div className="relative inline-flex items-center p-1 rounded-2xl border border-[var(--proto-line-2)] bg-[var(--proto-card)]">
          {(["monthly", "yearly"] as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`relative z-10 px-5 py-2 rounded-xl text-[13px] font-semibold transition-colors ${
                period === p ? "text-[var(--proto-on-ink)]" : "text-[var(--proto-ink)]/70"
              }`}
            >
              {p === "monthly" ? "Mensal" : "Anual"}
              {p === "yearly" ? (
                <span className="ml-2 text-[10.5px] font-bold text-[var(--proto-teal)] bg-[var(--proto-teal)]/12 px-1.5 py-0.5 rounded">
                  até −20%
                </span>
              ) : null}
            </button>
          ))}
          <span
            aria-hidden
            className="absolute top-1 bottom-1 rounded-xl bg-[var(--proto-ink)] transition-all duration-[500ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{
              left: period === "monthly" ? "4px" : "calc(50% + 2px)",
              right: period === "monthly" ? "calc(50% + 2px)" : "4px",
            }}
          />
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        {plans.map((p) => {
          const price = period === "monthly" ? p.monthly : p.yearly;
          const priceStr =
            price === 0
              ? "R$ 0"
              : `R$ ${price.toFixed(2).replace(".", ",")}`;
          return (
            <div
              key={p.name}
              className={`relative h-full p-7 rounded-3xl border transition-all duration-500 ${
                p.highlight
                  ? "bg-[#15110E] text-white border-[#2A211B] shadow-[0_40px_90px_-30px_rgba(192,112,85,0.4)]"
                  : "bg-[var(--proto-card)] border-[var(--proto-line)] hover:-translate-y-1 hover:shadow-[0_30px_70px_-25px_rgba(14,12,10,0.2)]"
              }`}
            >
              {p.highlight ? (
                <span
                  aria-hidden
                  className="absolute -inset-px rounded-3xl pointer-events-none"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(192,112,85,0.5), transparent 50%, rgba(46,114,104,0.4))",
                    WebkitMask:
                      "linear-gradient(#000,#000) content-box, linear-gradient(#000,#000)",
                    WebkitMaskComposite: "xor",
                    maskComposite: "exclude",
                    padding: "1px",
                  }}
                />
              ) : null}
              {p.badge ? (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--proto-terra)] text-white text-[11px] font-bold tracking-wide shadow-lg whitespace-nowrap">
                  <span className="w-1 h-1 rounded-full bg-white proto-pulse" />
                  {p.badge}
                </span>
              ) : null}

              <h3 className="text-[22px] font-bold">{p.name}</h3>
              <p className={`text-[13px] mt-1 ${p.highlight ? "text-white/55" : "text-[var(--proto-mute-2)]"}`}>
                {p.desc}
              </p>

              <div className="mt-7 flex items-baseline gap-1">
                <span className="text-[40px] font-bold tracking-tight">{priceStr}</span>
                <span className={`text-[14px] ${p.highlight ? "text-white/55" : "text-[var(--proto-mute-2)]"}`}>
                  /mês
                </span>
              </div>
              {p.note ? (
                <p className={`text-[11.5px] mt-2 font-semibold leading-snug ${p.highlight ? "text-[var(--proto-peach)]" : "text-[var(--proto-terra)]"}`}>
                  {p.note}
                </p>
              ) : null}
              {period === "yearly" && p.monthly > 0 ? (
                <p className={`text-[11.5px] mt-1 ${p.highlight ? "text-white/55" : "text-[var(--proto-mute-2)]"}`}>
                  Economia de R${" "}
                  {((p.monthly - p.yearly) * 12).toFixed(2).replace(".", ",")}/ano
                </p>
              ) : null}

              <Link
                href="/signup"
                className={`mt-7 inline-flex w-full items-center justify-center gap-1.5 text-[14px] font-semibold px-5 py-3 rounded-xl transition-all ${
                  p.ctaStyle === "primary"
                    ? "bg-[var(--proto-terra)] text-white hover:bg-[var(--proto-terra-deep)]"
                    : p.highlight
                    ? "border border-white/20 text-white hover:bg-white/10"
                    : "border border-[var(--proto-line-2)] text-[var(--proto-ink)] hover:border-[var(--proto-ink)]/40 hover:bg-[var(--proto-bg)]"
                }`}
              >
                {p.cta}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>

              <ul className="mt-8 space-y-3">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[13.5px]">
                    <span
                      className={`shrink-0 mt-0.5 grid place-items-center w-4 h-4 rounded-full ${
                        p.highlight ? "bg-[var(--proto-terra)]/30 text-[var(--proto-peach)]" : "bg-[var(--proto-teal)]/10 text-[var(--proto-teal)]"
                      }`}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                        <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span className={p.highlight ? "text-white/85" : "text-[var(--proto-ink)]/80"}>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ──────────────────────────────────────────────────────────────
   FAQ Accordion
   ────────────────────────────────────────────────────────────── */
const FAQ_ITEMS = [
  {
    q: "O Kindar é só pra pais separados?",
    a: "Não. O Kindar organiza a rotina de qualquer família — casais juntos, separados, monoparentais, homoafetivas, e famílias onde avós ou tutores cuidam. As ferramentas de guarda compartilhada aparecem quando fazem sentido, sem atrapalhar quem não precisa delas.",
  },
  {
    q: "Funciona pra famílias com guarda compartilhada?",
    a: "É o cenário em que mais investimos. Escala de guarda, trocas com histórico, despesas com split e split da própria assinatura. Os dois responsáveis veem a mesma informação em tempo real — sem planilha nem print pra provar combinado.",
  },
  {
    q: "Quem precisa pagar? Avós, babá e advogado também?",
    a: "Não. Só os responsáveis legais (pai, mãe ou tutor com guarda) assinam. Avós, babás, mediadores e advogados entram de graça como convidados, com acesso completo ao plano da família.",
  },
  {
    q: "Quanto custa? E o que é o Early Bird?",
    a: "Tem um plano gratuito pra começar. O Harmonia, com tudo liberado, é R$ 19,90/mês pela família inteira. As primeiras 1.000 famílias garantem o Early Bird: R$ 14,90/mês para sempre — uma vez assinado, o preço nunca muda. Pra quem tem processo ativo, o Premium Jurídico é R$ 39,90/mês.",
  },
  {
    q: "Tem teste grátis?",
    a: "Tem. Ao criar a conta, você ganha 7 dias do Premium Jurídico — o plano mais completo — sem pagar e sem cadastrar cartão. No fim, você escolhe um plano ou fica no Grátis (com limites). Ninguém é cobrado sem avisar.",
  },
  {
    q: "Dá pra dividir o custo com o coparente?",
    a: "Sim, com um clique. Depois de assinar, é só ativar o split da assinatura — o Kindar cria uma despesa recorrente de 50% no módulo de Despesas, com notificação automática. Zero fricção pra rachar.",
  },
  {
    q: "Preciso instalar app? Funciona em tudo?",
    a: "Funciona nos três: app iOS na App Store, Android em breve no Google Play, e versão web em kindar.com.br (que dá pra instalar como PWA). A assinatura vale em todos — pagou num, funciona nos outros — e tudo sincroniza automaticamente.",
  },
  {
    q: "E se a outra pessoa não quiser usar?",
    a: "Você usa sozinho. A organização individual já vale por si; o valor só cresce quando o coparente entra. E o convite é simples — link direto, a pessoa aceita em um toque.",
  },
  {
    q: "Meus dados estão seguros? E a LGPD?",
    a: "Sim. Banco em região brasileira com Row Level Security em todas as tabelas, criptografia em trânsito e em repouso, e conformidade com a LGPD. Você exporta ou apaga tudo a qualquer momento pelo perfil. O chat é imutável por conformidade legal — serve como prova documental se você precisar.",
  },
  {
    q: "Como eu cancelo?",
    a: "No próprio app, em Assinatura. Para assinaturas no iOS, pelos Ajustes do iPhone. Não tem fidelidade nem burocracia — cancelou, acabou.",
  },
];

export function FaqAccordion() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="divide-y divide-[var(--proto-line)] rounded-3xl border border-[var(--proto-line)] bg-[var(--proto-card)] overflow-hidden">
      {FAQ_ITEMS.map((item, i) => {
        const isOpen = open === i;
        return (
          <button
            key={i}
            type="button"
            onClick={() => setOpen(isOpen ? null : i)}
            className="w-full text-left px-7 py-6 group transition-colors hover:bg-[var(--proto-bg)]"
            aria-expanded={isOpen}
          >
            <div className="flex items-center justify-between gap-4">
              <span className="text-[16px] font-semibold text-[var(--proto-ink)]">
                {item.q}
              </span>
              <span
                aria-hidden
                className="shrink-0 grid place-items-center w-9 h-9 rounded-full border border-[var(--proto-line-2)] transition-all duration-300"
                style={{
                  background: isOpen ? "var(--proto-ink)" : "transparent",
                  color: isOpen ? "var(--proto-on-ink)" : "var(--proto-ink)",
                  transform: isOpen ? "rotate(45deg)" : "rotate(0deg)",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
              </span>
            </div>
            <div
              className="grid transition-all duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{
                gridTemplateRows: isOpen ? "1fr" : "0fr",
                marginTop: isOpen ? 14 : 0,
                opacity: isOpen ? 1 : 0,
              }}
            >
              <div className="overflow-hidden">
                <p className="text-[14.5px] leading-relaxed text-[var(--proto-mute)] pr-14">
                  {item.a}
                </p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   Marquee — faixa infinita
   ────────────────────────────────────────────────────────────── */
export function Marquee() {
  const items = [
    "Amanda & Bruno · São Paulo",
    "Casa Mendes · Recife",
    "Família Pereira · Curitiba",
    "Lares Rocha · BH",
    "Casa Tavares · Salvador",
    "Família Lima · Floripa",
    "Casa Ribeiro · Brasília",
    "Família Almeida · Porto Alegre",
    "Casa Vieira · Goiânia",
    "Lares Costa · Manaus",
  ];
  const doubled = [...items, ...items];
  return (
    <div className="relative overflow-hidden py-3 [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
      <div className="flex gap-10 proto-marquee whitespace-nowrap">
        {doubled.map((it, i) => (
          <span
            key={i}
            className="text-[13px] font-medium text-[var(--proto-mute)] flex items-center gap-3"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--proto-terra)]/40" />
            {it}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   ParallaxLayer — translate3d com base no scrollY
   ────────────────────────────────────────────────────────────── */
export function ParallaxLayer({
  children,
  speed = 0.2,
  className = "",
}: {
  children: React.ReactNode;
  speed?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      const r = el.getBoundingClientRect();
      const center = r.top + r.height / 2;
      const offset = (center - window.innerHeight / 2) * -speed;
      el.style.transform = `translate3d(0, ${offset}px, 0)`;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [speed]);
  return (
    <div ref={ref} className={`will-change-transform ${className}`}>
      {children}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   DemoFlow — o "combinado acontecendo" em loop animado.
   Conta a história: Bruno lança despesa → push voa pra Amanda →
   Amanda aprova → fecha nos dois lados. Pausa no hover.
   ────────────────────────────────────────────────────────────── */
const DEMO_STEPS = [
  { label: "Bruno lança a despesa" },
  { label: "Notificação voa pra Amanda" },
  { label: "Amanda recebe e revisa" },
  { label: "Amanda aprova num toque" },
  { label: "Fecha nos dois lares · split 50/50" },
];

export function DemoFlow() {
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef);

  useEffect(() => {
    if (paused || !inView) return;
    const id = setInterval(() => setStep((s) => (s + 1) % DEMO_STEPS.length), 2100);
    return () => clearInterval(id);
  }, [paused, inView]);

  return (
    <div ref={rootRef} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="relative rounded-[28px] border border-[var(--proto-line)] bg-[var(--proto-card)] overflow-hidden">
        {/* fundo com costura dois-lares */}
        <div aria-hidden className="absolute inset-0 proto-twohomes">
          <div className="proto-seam" />
        </div>

        <div className="relative grid sm:grid-cols-2 gap-4 sm:gap-0 p-5 sm:p-8 min-h-[340px]">
          {/* ── LADO BRUNO (teal · Casa B) ── */}
          <div className="sm:pr-8 flex flex-col">
            <HomeTag who="Bruno" sub="Casa do Bruno" tone="teal" />
            <div className="mt-4 flex-1 flex items-center">
              <div
                className="w-full rounded-2xl border border-[var(--proto-line)] bg-[var(--proto-card)] p-4 shadow-sm transition-all duration-500"
                style={{
                  opacity: step >= 0 ? 1 : 0.4,
                  transform: step === 0 ? "scale(1.02)" : "scale(1)",
                  boxShadow: step === 0 ? "0 20px 50px -25px rgba(46,114,104,0.5)" : undefined,
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--proto-teal)]">
                    Nova despesa
                  </span>
                  <span
                    className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full transition-all duration-500"
                    style={{
                      background: step >= 1 ? "color-mix(in oklab, var(--proto-teal) 14%, transparent)" : "var(--proto-soft)",
                      color: step >= 1 ? "var(--proto-teal)" : "var(--proto-mute-2)",
                    }}
                  >
                    {step >= 1 ? "Enviada ✓" : "Rascunho"}
                  </span>
                </div>
                <p className="mt-3 text-[15px] font-bold text-[var(--proto-ink)]">Jaleco de ciências</p>
                <p className="text-[13px] text-[var(--proto-mute)]">Escola · material</p>
                <div className="mt-3 flex items-end justify-between">
                  <span className="font-mono text-[20px] font-bold text-[var(--proto-ink)]">R$ 84,90</span>
                  <span className="text-[11px] text-[var(--proto-mute-2)]">divide 50/50</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── LADO AMANDA (terra · Casa A) ── */}
          <div className="sm:pl-8 flex flex-col">
            <HomeTag who="Amanda" sub="Casa da Amanda" tone="terra" align="right" />
            <div className="mt-4 flex-1 flex items-center">
              <div className="w-full">
                {/* push notification chegando */}
                <div
                  className="rounded-2xl border p-3.5 transition-all duration-500"
                  style={{
                    opacity: step >= 2 ? 1 : 0,
                    transform: step >= 2 ? "translateY(0)" : "translateY(-10px)",
                    borderColor: "var(--proto-line)",
                    background: "var(--proto-card)",
                    boxShadow: step === 2 ? "0 18px 40px -22px rgba(192,112,85,0.5)" : undefined,
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="grid place-items-center w-7 h-7 rounded-lg bg-[var(--proto-terra)] text-white text-[12px] font-bold">K</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-bold text-[var(--proto-ink)] leading-tight">Kindar · agora</p>
                      <p className="text-[12px] text-[var(--proto-mute)] truncate">Bruno lançou “Jaleco” · R$ 84,90</p>
                    </div>
                  </div>
                </div>

                {/* ação aprovar */}
                <div
                  className="mt-3 rounded-2xl border border-[var(--proto-line)] bg-[var(--proto-card)] p-4 transition-all duration-500"
                  style={{ opacity: step >= 3 ? 1 : 0.35 }}
                >
                  {step >= 4 ? (
                    <div className="flex items-center gap-2.5 text-[var(--proto-teal)]">
                      <span className="grid place-items-center w-7 h-7 rounded-full bg-[var(--proto-teal)] text-white" style={{ animation: "demo-pop 500ms ease both" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </span>
                      <span className="text-[14px] font-bold">Aprovado · você paga R$ 42,45</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span
                        className="flex-1 text-center text-[13px] font-bold text-white rounded-xl py-2.5 transition-all duration-300"
                        style={{
                          background: step === 3 ? "var(--proto-terra)" : "var(--proto-mute-2)",
                          transform: step === 3 ? "scale(1.03)" : "scale(1)",
                        }}
                      >
                        Aprovar
                      </span>
                      <span className="px-4 py-2.5 text-[13px] font-semibold text-[var(--proto-mute)] rounded-xl border border-[var(--proto-line-2)]">
                        Recusar
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* selo final unindo os dois lares + confete */}
          <div
            className="absolute left-1/2 bottom-5 -translate-x-1/2 transition-all duration-500"
            style={{
              opacity: step >= 4 ? 1 : 0,
              transform: step >= 4 ? "translate(-50%,0)" : "translate(-50%,10px)",
            }}
          >
            {step === 4 ? <Confetti /> : null}
            <span className="relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold tracking-wide text-white shadow-lg" style={{ background: "linear-gradient(90deg,var(--proto-terra),var(--proto-teal))" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-white proto-pulse" />
              Combinado fechado · registrado nos dois lares
            </span>
          </div>
        </div>
      </div>

      {/* step indicator */}
      <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-[14px] font-semibold text-[var(--proto-ink)]">
          <span className="text-[var(--proto-mute-2)] font-mono text-[12px] mr-2">
            {String(step + 1).padStart(2, "0")}/{String(DEMO_STEPS.length).padStart(2, "0")}
          </span>
          {DEMO_STEPS[step].label}
        </p>
        <div className="flex items-center gap-1.5">
          {DEMO_STEPS.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setStep(i)}
              aria-label={`Passo ${i + 1}`}
              className="h-1.5 rounded-full transition-all duration-500"
              style={{
                width: i === step ? 26 : 7,
                background: i === step ? "var(--proto-terra)" : "var(--proto-line-2)",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function HomeTag({
  who,
  sub,
  tone,
  align = "left",
}: {
  who: string;
  sub: string;
  tone: "terra" | "teal";
  align?: "left" | "right";
}) {
  const color = tone === "terra" ? "var(--proto-terra)" : "var(--proto-teal)";
  return (
    <div className={`flex items-center gap-2.5 ${align === "right" ? "sm:flex-row-reverse sm:text-right" : ""}`}>
      <span className="grid place-items-center w-9 h-9 rounded-full text-white text-[13px] font-bold" style={{ background: color }}>
        {who[0]}
      </span>
      <div className={align === "right" ? "sm:items-end sm:flex sm:flex-col" : ""}>
        <p className="text-[14px] font-bold text-[var(--proto-ink)] leading-tight">{who}</p>
        <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color }}>{sub}</p>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   WOW · AuroraCursor — luz da marca que segue o cursor.
   rAF-throttled, pointer-events none, custo baixo (1 background).
   ────────────────────────────────────────────────────────────── */
export function AuroraCursor() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let px = 0;
    let py = 0;
    const apply = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--ax", `${px - r.left}px`);
      el.style.setProperty("--ay", `${py - r.top}px`);
    };
    const onMove = (e: PointerEvent) => {
      px = e.clientX;
      py = e.clientY;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return <div ref={ref} aria-hidden className="proto-aurora" />;
}

/* ──────────────────────────────────────────────────────────────
   WOW · HeroStage — inclina o conjunto (device + labels) em 3D
   conforme o cursor. Profundidade real via perspective + translateZ.
   ────────────────────────────────────────────────────────────── */
export function HeroStage({
  children,
  left,
  right,
}: {
  children: React.ReactNode;
  left?: React.ReactNode;
  right?: React.ReactNode;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = inner.current;
    const box = outer.current;
    if (!el || !box) return;
    const r = box.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `rotateX(${py * -5}deg) rotateY(${px * 7}deg)`;
  };
  const onLeave = () => {
    if (inner.current) inner.current.style.transform = "rotateX(0deg) rotateY(0deg)";
  };

  return (
    <div
      ref={outer}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className="relative"
      style={{ perspective: "1300px" }}
    >
      {left ? (
        <div className="hidden sm:block" style={{ transform: "translateZ(60px)" }}>
          {left}
        </div>
      ) : null}
      {right ? (
        <div className="hidden sm:block" style={{ transform: "translateZ(60px)" }}>
          {right}
        </div>
      ) : null}
      <div ref={inner} className="proto-tilt-inner">
        {children}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   WOW · Confetti — pequena explosão da marca. Monta quando chamado,
   anima uma vez e some. 18 partículas, transform-only.
   ────────────────────────────────────────────────────────────── */
export function Confetti() {
  const N = 20;
  const colors = ["#C07055", "#2E7268", "#E8C5A4", "#0E0C0A"];
  return (
    <div aria-hidden className="absolute left-1/2 bottom-7 -translate-x-1/2 pointer-events-none" style={{ width: 0, height: 0 }}>
      {Array.from({ length: N }).map((_, i) => {
        const angle = (i / N) * Math.PI * 2;
        const dist = 46 + (i % 5) * 16;
        const dx = Math.cos(angle) * dist;
        const dy = -Math.abs(Math.sin(angle)) * dist - 24;
        const dr = 160 + (i % 7) * 40;
        return (
          <span
            key={i}
            className="proto-confetti"
            style={
              {
                background: colors[i % colors.length],
                ["--dx" as string]: `${dx}px`,
                ["--dy" as string]: `${dy}px`,
                ["--dr" as string]: `${dr}deg`,
                animationDelay: `${(i % 6) * 22}ms`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </div>
  );
}
