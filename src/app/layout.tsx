import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Cormorant_Garamond } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Suspense } from "react";
import { ServiceWorkerRegister } from "./sw-register";
import AuthSessionProvider from "@/components/AuthSessionProvider";
import PWAInstallBanner from "@/components/PWAInstallBanner";
import { WebOnly, NativeInit } from "@/components/NativeShellGuard";
import PostHogAnonymousInit from "@/components/PostHogAnonymousInit";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Kindar - Organize a rotina de quem você cuida",
    template: "%s | Kindar",
  },
  description:
    "Calendário familiar, saúde, atividades, documentos e mais. Organize a rotina das crianças com clareza e tranquilidade. Funciona para qualquer família.",
  keywords: [
    "organização familiar",
    "rotina criança",
    "calendário familiar",
    "app família",
    "coparentalidade",
    "guarda compartilhada",
    "copais",
    "atividades infantis",
  ],
  authors: [{ name: "Kindar" }],
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "Kindar",
    title: "Kindar - Organize a rotina de quem você cuida",
    description:
      "Calendário familiar, saúde, atividades, documentos e mais. Organize a rotina das crianças com clareza e tranquilidade. Gratuito para começar.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Kindar - Organize a rotina de quem você cuida",
    description:
      "Calendário familiar, saúde, atividades, documentos e mais. Organize a rotina das crianças com clareza e tranquilidade.",
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Kindar",
  },
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#EEECEA",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Kindar" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        {/* Splash screens for iOS */}
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className={`${jakarta.variable} ${cormorant.variable} antialiased`}>
        {children}
        <Suspense fallback={null}>
          <PostHogAnonymousInit />
        </Suspense>
        <WebOnly>
          <Analytics />
          <SpeedInsights />
        </WebOnly>
        <AuthSessionProvider />
        <ServiceWorkerRegister />
        <PWAInstallBanner />
        <NativeInit />
      </body>
    </html>
  );
}
