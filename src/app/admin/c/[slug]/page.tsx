import { Suspense } from "react";
import { EditorPagina } from "./EditorPagina";

export default function Page({ params }: PageProps<"/admin/c/[slug]">) {
  return (
    <Suspense fallback={<main className="p-8 text-slate-600">Carregando…</main>}>
      <Aberto params={params} />
    </Suspense>
  );
}

async function Aberto({ params }: { params: PageProps<"/admin/c/[slug]">["params"] }) {
  const { slug } = await params;
  return <EditorPagina slug={slug} />;
}
