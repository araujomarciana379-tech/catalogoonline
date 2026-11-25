import type { Metadata } from "next";
import { Suspense } from "react";
import { CatalogoView } from "@/components/CatalogoView";
import { metaCatalogo } from "@/lib/catalogo-meta";

export async function generateMetadata({ params }: PageProps<"/c/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const c = await metaCatalogo(slug);
  if (!c) return { title: "Catálogo" };
  const descricao = c.descricao ?? "Toque nos produtos, monte seu pedido e envie pelo WhatsApp.";
  return {
    title: c.nome,
    description: descricao,
    openGraph: {
      title: c.nome,
      description: descricao,
      url: `/c/${slug}`,
      images: c.capa ? [{ url: c.capa, width: 595, height: 842, alt: `Capa: ${c.nome}` }] : ["/icons/icon-512.png"],
    },
  };
}

export default function Page({ params }: PageProps<"/c/[slug]">) {
  return (
    <Suspense fallback={<main className="flex min-h-dvh items-center justify-center bg-marca-escuro text-white/80">Carregando…</main>}>
      <Aberto params={params} />
    </Suspense>
  );
}

async function Aberto({ params }: { params: PageProps<"/c/[slug]">["params"] }) {
  const { slug } = await params;
  return <CatalogoView slug={slug} />;
}
