"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { thumbUrl } from "@/lib/format";

export type ProdutoResumo = { id: string; codigo: string; nome: string; foto_path: string | null };

/** Busca na base inteira por código ou nome; aceita também código de variação (CH.032/4 → CH.032). */
export function BuscaProduto({ rotulo, onEscolher }: { rotulo: string; onEscolher: (p: ProdutoResumo) => void }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<ProdutoResumo[]>([]);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    const termo = q.trim().replace(/[,()%*]/g, " ").trim();
    if (termo.length < 2) return;
    let vivo = true;
    const t = setTimeout(async () => {
      setBuscando(true);
      const { data } = await supabase
        .from("produtos")
        .select("id, codigo, nome, foto_path")
        .or(`codigo.ilike.%${termo}%,nome.ilike.%${termo}%`)
        .order("codigo")
        .limit(25);
      let lista = (data ?? []) as ProdutoResumo[];
      if (lista.length < 5) {
        // Código de variação: CH.032/4, AR.022-6…
        const { data: vs } = await supabase.from("variacoes").select("produto_id").ilike("codigo", `${termo}%`).limit(10);
        const ids = [...new Set((vs ?? []).map((v) => v.produto_id as string))].filter((id) => !lista.some((p) => p.id === id));
        if (ids.length) {
          const { data: ps } = await supabase.from("produtos").select("id, codigo, nome, foto_path").in("id", ids);
          lista = [...lista, ...((ps ?? []) as ProdutoResumo[])];
        }
      }
      if (vivo) {
        setRes(lista.filter((p, i) => lista.findIndex((x) => x.id === p.id) === i));
        setBuscando(false);
      }
    }, 250);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <div className="space-y-1">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={`${rotulo}: código ou nome`}
        className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-marca"
      />
      {buscando && <p className="text-xs text-slate-500">Buscando…</p>}
      {res.length > 0 && q.trim().length >= 2 && (
        <ul className="max-h-64 divide-y overflow-y-auto rounded border border-slate-200 text-xs">
          {res.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => {
                  onEscolher(p);
                  setQ("");
                  setRes([]);
                }}
                className="flex w-full items-center gap-2 p-1.5 text-left hover:bg-amber-50"
              >
                {p.foto_path ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumbUrl(p.foto_path)} alt="" className="h-8 w-8 rounded object-cover" />
                ) : (
                  <span className="h-8 w-8 shrink-0 rounded bg-slate-100" />
                )}
                <span className="min-w-0">
                  <span className="block font-semibold">{p.codigo}</span>
                  <span className="block truncate text-slate-600">{p.nome}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
