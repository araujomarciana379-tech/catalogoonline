import type { Metadata } from "next";
import { Vitrine } from "@/components/Vitrine";
import { metaDestaque } from "@/lib/catalogo-meta";
import { MARCA } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const destaque = await metaDestaque();
  return {
    openGraph: {
      title: `Catálogos ${MARCA}`,
      description: destaque ? `Em destaque: ${destaque.nome}. Conheça todos os nossos catálogos.` : "Conheça nossos catálogos.",
      images: destaque?.capa ? [{ url: destaque.capa, width: 595, height: 842 }] : ["/icons/icon-512.png"],
    },
  };
}

export default function Home() {
  return <Vitrine />;
}
