import type { Metadata, Viewport } from "next";
import { Gotu, Poppins } from "next/font/google";
import { Suspense } from "react";
import { ClienteGate } from "@/components/ClienteGate";
import { COR_TEMA, MARCA, MARCA_CURTA, SITE_URL, SLOGAN } from "@/lib/site";
import "./globals.css";

// Fontes da marca: corpo (Poppins) e títulos (Gotu), as mesmas do site da empresa.
const corpo = Poppins({ variable: "--font-corpo", subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap" });
const titulo = Gotu({ variable: "--font-titulo-marca", subsets: ["latin"], weight: "400", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${MARCA} – Catálogos`, template: `%s | ${MARCA}` },
  description: `Catálogos interativos da ${MARCA}. Monte seu pedido e envie pelo WhatsApp. ${SLOGAN}`,
  applicationName: MARCA_CURTA,
  appleWebApp: { capable: true, title: MARCA_CURTA, statusBarStyle: "black-translucent" },
  openGraph: { type: "website", locale: "pt_BR", siteName: MARCA },
};

export const viewport: Viewport = {
  themeColor: COR_TEMA,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${corpo.variable} ${titulo.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Suspense fallback={null}>
          <ClienteGate>{children}</ClienteGate>
        </Suspense>
      </body>
    </html>
  );
}
