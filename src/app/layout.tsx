import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegister } from "./sw-register";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "2Lares - Coparentalidade Inteligente",
    template: "%s | 2Lares",
  },
  description:
    "Organize a rotina dos seus filhos entre dois lares com clareza, respeito e tranquilidade. Calendario compartilhado, chat mediado, controle financeiro e muito mais.",
  keywords: [
    "coparentalidade",
    "guarda compartilhada",
    "organizacao familiar",
    "calendario familiar",
    "copais",
    "dois lares",
    "filhos",
  ],
  authors: [{ name: "2Lares" }],
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "2Lares",
    title: "2Lares - Coparentalidade Inteligente para Familias Modernas",
    description:
      "Organize a rotina dos seus filhos entre dois lares com clareza, respeito e tranquilidade. Gratuito para comecar.",
  },
  twitter: {
    card: "summary_large_image",
    title: "2Lares - Coparentalidade Inteligente",
    description:
      "Organize a rotina dos seus filhos entre dois lares com clareza, respeito e tranquilidade.",
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "2Lares",
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
  themeColor: "#1A3B3A",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
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
        <meta name="apple-mobile-web-app-title" content="2Lares" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        {/* Splash screens for iOS */}
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className={`${geistSans.variable} antialiased`}>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
