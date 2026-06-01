import type { Metadata } from "next";
import KindarLandingV2 from "./_landing";

// Preview interna da landing. É exatamente o mesmo componente servido em `/`
// (KindarLandingV2), mantido aqui com `noindex` pra QA/preview sem afetar o
// SEO da home. O wrapper de tema/fontes vem de ./layout.tsx.
export const metadata: Metadata = {
  title: "Kindar — a rotina das crianças num lugar só (preview)",
  robots: { index: false, follow: false },
};

export default function PrototipoPreview() {
  return <KindarLandingV2 />;
}
