"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * Lê a planilha de um catálogo (.xlsx do modelo Vou Pedir ou .csv) e liga os produtos ao catálogo.
 * Usa a coluna GROUPING KEY (ou ID / codigo). Os produtos sem carrinho vão para a lista "Não posicionados".
 */
export function ImportarListaCatalogo({ catalogoId, onImportado }: { catalogoId: string; onImportado: (ids: string[]) => void | Promise<void> }) {
  const input = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function lerCodigos(arq: File): Promise<string[]> {
    const texto = (v: unknown): string => {
      if (v == null) return "";
      if (typeof v === "object") {
        const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] };
        if (o.richText) return o.richText.map((t) => t.text).join("");
        return texto(o.result ?? o.text);
      }
      return String(v).trim();
    };
    let linhas: string[][];
    if (/\.csv$/i.test(arq.name)) {
      const t = (await arq.text()).replace(/^﻿/, "");
      const sep = (t.split("\n")[0].match(/;/g)?.length ?? 0) >= (t.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
      linhas = t.split(/\r?\n/).map((l) => l.split(sep).map((c) => c.replace(/^"|"$/g, "").trim()));
    } else {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await arq.arrayBuffer());
      linhas = [];
      wb.worksheets[0].eachRow((r) => linhas.push((r.values as unknown[]).slice(1).map(texto)));
    }
    const cab = (linhas[0] ?? []).map((c) => c.toLowerCase().trim());
    let col = cab.indexOf("grouping key");
    if (col < 0) col = cab.indexOf("id");
    if (col < 0) col = cab.findIndex((c) => c === "codigo" || c === "código");
    if (col < 0) col = 0;
    return [...new Set(linhas.slice(1).map((l) => (l[col] ?? "").trim()).filter((c) => c && !/^inserir/i.test(c)))];
  }

  async function importar(arq: File) {
    setOcupado(true);
    setMsg("Lendo planilha…");
    try {
      const codigos = await lerCodigos(arq);
      if (!codigos.length) throw new Error("Nenhum código encontrado na planilha.");
      // A base tem códigos com e sem ponto final ("AD.050-6." / "AD.050-6"): tenta as duas grafias.
      const variantes = [...new Set(codigos.flatMap((c) => [c, c.replace(/\.$/, ""), `${c.replace(/\.$/, "")}.`]))];
      const ids = new Set<string>();
      const achados = new Set<string>();
      for (let i = 0; i < variantes.length; i += 150) {
        const lote = variantes.slice(i, i + 150);
        const [ps, vs] = await Promise.all([
          supabase.from("produtos").select("id, codigo").in("codigo", lote),
          supabase.from("variacoes").select("produto_id, codigo").in("codigo", lote),
        ]);
        for (const p of ps.data ?? []) { ids.add(p.id); achados.add(p.codigo.replace(/\.$/, "")); }
        for (const v of vs.data ?? []) { ids.add(v.produto_id); if (v.codigo) achados.add(v.codigo.replace(/\.$/, "")); }
      }
      const lista = [...ids];
      for (let i = 0; i < lista.length; i += 500) {
        const { error } = await supabase
          .from("catalogo_produtos")
          .upsert(lista.slice(i, i + 500).map((produto_id) => ({ catalogo_id: catalogoId, produto_id })), { onConflict: "catalogo_id,produto_id", ignoreDuplicates: true });
        if (error) throw error;
      }
      const naoAchados = codigos.filter((c) => !achados.has(c.replace(/\.$/, "")));
      await onImportado(lista);
      setMsg(
        `✓ ${lista.length} produto(s) ligados ao catálogo.` +
          (naoAchados.length ? ` ${naoAchados.length} código(s) não estão na base: ${naoAchados.slice(0, 8).join(", ")}${naoAchados.length > 8 ? "…" : ""}` : ""),
      );
    } catch (e) {
      setMsg(`Erro: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setOcupado(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="space-y-1">
      <input ref={input} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && void importar(e.target.files[0])} />
      <button disabled={ocupado} onClick={() => input.current?.click()} className="w-full rounded border border-dashed border-slate-400 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50">
        {ocupado ? "Importando…" : "Importar planilha deste catálogo (.xlsx / .csv)"}
      </button>
      {msg && <p className="text-xs text-slate-600">{msg}</p>}
    </div>
  );
}
