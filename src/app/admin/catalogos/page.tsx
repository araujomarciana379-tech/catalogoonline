"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Papel } from "@/components/admin/AdminGate";
import { Painel } from "@/components/admin/Painel";
import { supabase } from "@/lib/supabase";
import { imgUrl } from "@/lib/format";

type Cat = {
  id: string; slug: string; nome: string; capa_path: string | null; ativo: boolean; destaque: boolean; ordem: number;
  paginas: { count: number }[];
};

export default function Catalogos() {
  return (
    <Painel somenteAdmin permitirEditor
      titulo="Catálogos"
      acoes={(papel) =>
        papel === "admin" && <Link href="/admin/catalogos/novo" className="rounded-lg bg-marca px-4 py-2 text-sm font-semibold text-white hover:bg-marca-hover">
          + Novo catálogo (PDF)
        </Link>
      }
    >
      {(papel) => <Lista papel={papel} />}
    </Painel>
  );
}

function Lista({ papel }: { papel: Papel }) {
  const [lista, setLista] = useState<Cat[] | null>(null);
  const [erro, setErro] = useState("");
  useEffect(() => {
    supabase
      .from("catalogos")
      .select("id, slug, nome, capa_path, ativo, destaque, ordem, paginas(count)")
      .order("ordem")
      .order("criado_em", { ascending: false })
      .then(({ data, error }) => {
        if (error) setErro(error.message);
        else setLista((data ?? []) as Cat[]);
      });
  }, []);

  if (erro) return <p className="text-red-600">Erro: {erro}</p>;
  if (!lista) return <p className="text-slate-500">Carregando…</p>;
  if (!lista.length) return <p className="text-slate-500">Nenhum catálogo ainda. Crie o primeiro importando um PDF.</p>;

  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {lista.map((c) => (
        <li key={c.id} className="flex gap-3 rounded-xl bg-white p-3 shadow-sm">
          <div className="h-32 w-24 shrink-0 overflow-hidden rounded-md bg-slate-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {c.capa_path && <img src={imgUrl(c.capa_path)} alt="" className="h-full w-full object-cover" />}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="font-semibold leading-tight">{c.nome}</p>
            <p className="text-xs text-slate-500">/c/{c.slug} · {c.paginas[0]?.count ?? 0} página(s)</p>
            <div className="mt-1 flex flex-wrap gap-1 text-[11px] font-semibold">
              {c.ativo ? (
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-800">● Publicado</span>
              ) : (
                <span className="rounded bg-slate-200 px-1.5 py-0.5 text-slate-600">○ Oculto</span>
              )}
              {c.destaque && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">★ Destaque</span>}
            </div>
            <div className="mt-auto flex flex-wrap gap-x-3 gap-y-1 pt-2 text-sm">
              {papel === "admin" && <Link href={`/admin/catalogos/${c.slug}`} className="font-semibold text-marca hover:underline">Configurar</Link>}
              <Link href={`/admin/c/${c.slug}`} className="font-semibold text-marca hover:underline">Carrinhos</Link>
              {c.ativo && <a href={`/c/${c.slug}`} target="_blank" rel="noopener" className="text-slate-500 hover:underline">Ver ↗</a>}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
