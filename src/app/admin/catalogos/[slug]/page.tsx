import { Suspense } from "react";
import { ConfigurarCatalogo } from "./ConfigurarCatalogo";

export default function Page({ params }: PageProps<"/admin/catalogos/[slug]">) {
  return (
    <Suspense fallback={<main className="p-8 text-slate-600">Carregando…</main>}>
      <Aberto params={params} />
    </Suspense>
  );
}

async function Aberto({ params }: { params: PageProps<"/admin/catalogos/[slug]">["params"] }) {
  const { slug } = await params;
  return <ConfigurarCatalogo slug={slug} />;
}
