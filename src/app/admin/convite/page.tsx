import { Suspense } from "react";
import { Convite } from "./Convite";

export default function Page({ searchParams }: PageProps<"/admin/convite">) {
  return (
    <Suspense fallback={<main className="p-8 text-slate-600">Carregando…</main>}>
      <Aberto searchParams={searchParams} />
    </Suspense>
  );
}

async function Aberto({ searchParams }: { searchParams: PageProps<"/admin/convite">["searchParams"] }) {
  const { c } = await searchParams;
  return <Convite codigo={typeof c === "string" ? c : ""} />;
}
