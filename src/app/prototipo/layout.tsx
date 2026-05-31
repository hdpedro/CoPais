import type { ReactNode } from "react";
import { Inter, Instrument_Serif } from "next/font/google";
import "./prototipo.css";

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

export default function PrototipoLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div
        id="proto-root"
        suppressHydrationWarning
        className={`prototipo-root ${inter.variable} ${instrumentSerif.variable}`}
      >
        {children}
      </div>
      {/* Anti-flash: aplica o tema salvo no próprio .prototipo-root antes do
          primeiro paint (o script roda depois que a div acima foi parseada).
          suppressHydrationWarning evita o aviso de mismatch nesse atributo —
          padrão canônico pra scripts de tema. Tudo escopado em /prototipo. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var t=localStorage.getItem('proto-theme');if(t==='dark'){var el=document.getElementById('proto-root');if(el)el.setAttribute('data-proto-theme','dark');}}catch(e){}})();`,
        }}
      />
    </>
  );
}
