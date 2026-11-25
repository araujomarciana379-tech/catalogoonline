"use client";

import { useRef, useState } from "react";
import { Cartao } from "./Painel";
import { supabase } from "@/lib/supabase";
import { emLotes } from "@/lib/catalogo-data";
import { lerPlanilha, problemasCsv, type Problema, type ProdutoPlanilha } from "@/lib/planilha";

const LOTE = 60;

/**
 * Importa a planilha base (modelo Vou Pedir): cria/atualiza produtos, variações, preços e mínimos.
 * As fotos da planilha (links do Google) só entram onde ainda não há foto: as fotos já guardadas
 * no Supabase (recortadas do PDF ou copiadas pelo script) não são trocadas pelo link.
 */
export function ImportarPlanilha({ onImportado }: { onImportado: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [lida, setLida] = useState<{ nome: string; produtos: ProdutoPlanilha[]; problemas: Problema[]; codigos: number } | null>(null);
  const [erro, setErro] = useState("");
  const [prog, setProg] = useState<{ feito: number; total: number } | null>(null);
  const [resultado, setResultado] = useState<{ produtos: number; variacoes: number; variacoes_inativadas: number } | null>(null);

  async function escolher(f: File | undefined) {
    if (!f) return;
    setErro("");
    setLida(null);
    setResultado(null);
    try {
      setLida({ nome: f.name, ...(await lerPlanilha(f)) });
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  async function importar() {
    if (!lida) return;
    setErro("");
    const soma = { produtos: 0, variacoes: 0, variacoes_inativadas: 0 };
    setProg({ feito: 0, total: lida.produtos.length });
    try {
      for (let i = 0; i < lida.produtos.length; i += LOTE) {
        const lote = await semSobrescreverFotos(lida.produtos.slice(i, i + LOTE));
        const { data, error } = await supabase.rpc("importar_planilha", { p_produtos: lote });
        if (error) throw new Error(`Erro no lote que começa em ${lote[0].codigo}: ${error.message}`);
        for (const k of Object.keys(soma) as (keyof typeof soma)[]) soma[k] += Number(data?.[k] ?? 0);
        setProg({ feito: Math.min(i + LOTE, lida.produtos.length), total: lida.produtos.length });
      }
      setResultado(soma);
      onImportado();
    } catch (e) {
      setErro(`${e instanceof Error ? e.message : String(e)} (os lotes anteriores já foram gravados; pode importar de novo sem problema)`);
    } finally {
      setProg(null);
    }
  }

  const nVar = lida?.produtos.reduce((s, p) => s + p.variacoes.length, 0) ?? 0;
  return (
    <Cartao titulo="Importar planilha base (.xlsx, modelo Vou Pedir)">
      <p className="mb-3 text-sm text-slate-600">
        Colunas usadas: <code>ID</code>, <code>NAME</code> (santo/cor/tamanho), <code>PRICE</code>, <code>PACKAGE SIZE</code> (mínimo; “LIVRE” = 1),{" "}
        <code>GROUPING KEY</code> (código do produto no catálogo), <code>DESCRIPTION</code>/<code>Apenas descrição</code> e <code>Image 1</code>. Produtos
        novos são criados, os existentes são atualizados (preço, mínimo, nome) e as variações que saíram da planilha ficam inativas.
      </p>
      <input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(e) => void escolher(e.target.files?.[0])} />
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => input.current?.click()} disabled={!!prog} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">
          {lida ? "Escolher outra planilha" : "Escolher planilha…"}
        </button>
        {lida && <span className="text-sm">📋 <strong>{lida.nome}</strong></span>}
      </div>

      {erro && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{erro}</p>}

      {lida && !resultado && (
        <div className="mt-3 space-y-2 text-sm">
          <p>
            <strong>{lida.codigos.toLocaleString("pt-BR")}</strong> códigos → <strong>{lida.produtos.length.toLocaleString("pt-BR")}</strong> produtos
            ({nVar.toLocaleString("pt-BR")} variações).
          </p>
          {lida.problemas.length > 0 && (
            <p className="rounded-lg bg-amber-50 p-2 text-amber-900">
              ⚠️ {lida.problemas.length} problema(s) na planilha (a importação continua mesmo assim).{" "}
              <button onClick={() => baixar(problemasCsv(lida.problemas), "planilha-problemas.csv")} className="font-semibold underline">
                Baixar relatório
              </button>
            </p>
          )}
          {prog ? (
            <div role="status" aria-live="polite">
              <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full rounded-full bg-marca transition-[width]" style={{ width: `${(prog.feito / prog.total) * 100}%` }} />
              </div>
              <p className="mt-1 text-slate-600">Gravando {prog.feito} de {prog.total} produtos… não feche esta aba.</p>
            </div>
          ) : (
            <button onClick={importar} className="rounded-lg bg-marca px-5 py-2 font-semibold text-white hover:bg-marca-hover">
              Importar {lida.produtos.length.toLocaleString("pt-BR")} produtos
            </button>
          )}
        </div>
      )}

      {resultado && (
        <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
          ✅ {resultado.produtos.toLocaleString("pt-BR")} produtos e {resultado.variacoes.toLocaleString("pt-BR")} variações gravados
          {resultado.variacoes_inativadas ? ` (${resultado.variacoes_inativadas} variações que saíram da planilha ficaram inativas)` : ""}.
        </p>
      )}
    </Cartao>
  );
}

/** Tira a foto da planilha de quem já tem foto guardada no Supabase (caminho que não é link). */
async function semSobrescreverFotos(lote: ProdutoPlanilha[]): Promise<ProdutoPlanilha[]> {
  const guardada = (f: string | null) => !!f && !/^https?:/i.test(f);
  const [ps, vs] = await Promise.all([
    emLotes(lote.map((p) => p.codigo), (l) => supabase.from("produtos").select("codigo, foto_path").in("codigo", l)),
    emLotes(lote.flatMap((p) => p.variacoes.map((v) => v.codigo)), (l) => supabase.from("variacoes").select("codigo, foto_path").in("codigo", l)),
  ]);
  const prodComFoto = new Set((ps as { codigo: string; foto_path: string | null }[]).filter((p) => guardada(p.foto_path)).map((p) => p.codigo));
  const varComFoto = new Set((vs as { codigo: string; foto_path: string | null }[]).filter((v) => guardada(v.foto_path)).map((v) => v.codigo));
  return lote.map((p) => ({
    ...p,
    foto: prodComFoto.has(p.codigo) ? "" : p.foto,
    variacoes: p.variacoes.map((v) => ({ ...v, foto: varComFoto.has(v.codigo) ? "" : v.foto })),
  }));
}

function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: nome });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
