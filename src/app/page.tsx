import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Inter, Instrument_Serif } from "next/font/google";
import { createClient } from "@/lib/supabase/server";
import { getLandingStats } from "@/lib/landing-stats";
import { EVENTS } from "@/lib/analytics";
import PageViewTracker from "@/components/analytics/PageViewTracker";
import KindarLandingV2 from "./prototipo/_landing";
import "./prototipo/prototipo.css";

// Fontes da landing (escopadas no #proto-root via CSS variables — o
// prototipo.css aplica tudo dentro de .prototipo-root, sem afetar o resto
// do app, que segue com Jakarta/Cormorant do RootLayout).
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-prototipo-sans",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["italic", "normal"],
  display: "swap",
  variable: "--font-prototipo-serif",
});

// Revalida a cada 30s pra manter o contador Early Bird fresco sem martelar
// o Postgres a cada view anônima.
export const revalidate = 30;

export default async function Home() {
  // Usuário logado vai direto pro dashboard — landing é só pra anônimo.
  const cookieStore = await cookies();
  const hasAuthCookie = cookieStore
    .getAll()
    .some((c) => c.name.includes("auth-token") || c.name.includes("sb-"));

  if (hasAuthCookie) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      redirect("/dashboard");
    }
  }

  const landingStats = await getLandingStats();

  return (
    <>
      <PageViewTracker
        event={EVENTS.LANDING_VIEWED}
        properties={{
          active_families: landingStats.activeFamilies,
        }}
      />
      <div
        id="proto-root"
        suppressHydrationWarning
        className={`prototipo-root ${inter.variable} ${instrumentSerif.variable}`}
      >
        <KindarLandingV2 />
      </div>
      {/* Anti-flash: aplica o tema salvo no #proto-root antes do primeiro
          paint (o script roda depois que a div acima foi parseada). */}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var t=localStorage.getItem('proto-theme');if(t==='dark'){var el=document.getElementById('proto-root');if(el)el.setAttribute('data-proto-theme','dark');}}catch(e){}})();`,
        }}
      />
    </>
  );
}
