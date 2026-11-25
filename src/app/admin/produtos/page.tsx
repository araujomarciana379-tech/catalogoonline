"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Cartao, Painel } from "@/components/admin/Painel";
import { ImportarPlanilha } from "@/components/admin/ImportarPlanilha";
import { supabase } from "@/lib/supabase";
import { brl, thumbUrl } from "@/lib/format";

type Variacao = { id: string; rotulo: string; codigo: string | null; preco: number | null; qtd_minima: number | null; ativo: boolean; ordem: number };
type Produto = {
  id: string; codigo: string; nome: string; preco: number | null; qtd_minima: number; foto_path: string | null; ativo: boolean;
  variacoes: Variacao[];
};

const POR_PAGINA = 50;

export default function Produtos() {
  const [importar, setImportar] = useState(false);
  const [recarga, setRecarga] = useState(0);
  return (
    <Painel somenteAdmin
      titulo="Produtos"
      acoes={
        <button onClick={() => setImportar((v) => !v)} className="rounded-lg bg-marca px-4 py-2 text-sm font-semibold text-white hover:bg-marca-hover">
          {importar ? "Fechar importação" : "Importar planilha (.xlsx)"}
        </button>
      }
    >
      {importar && (
        <div className="mb-4">
          <ImportarPlanilha onImportado={() => setRecarga((n) => n + 1)} />
        </div>
      )}
      <Lista recarga={recarga} />
    </Painel>
  );
}

function Lista({ recarga }: { recarga: number }) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "ativos" | "inativos" | "sem_preco" | "sem_foto">("todos");
  const [pagina, setPagina] = useState(0);
  const [lista, setLista] = useState<Produto[] | null>(null);
  const [total, setTotal] = useState(0);
  const [aberto, setAberto] = useState<string | null>(null);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    let q = supabase
      .from("produtos")
      .select("id, codigo, nome, preco, qtd_minima, foto_path, ativo, variacoes(id, rotulo, codigo, preco, qtd_minima, ativo, ordem)", { count: "exact" })
      .order("codigo")
      .range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1);
    const b = busca.trim().replace(/[%,()]/g, " ");
    if (b) q = q.or(`codigo.ilike.%${b}%,nome.ilike.%${b}%`);
    if (filtro === "ativos") q = q.eq("ativo", true);
    if (filtro === "inativos") q = q.eq("ativo", false);
    if (filtro === "sem_preco") q = q.is("preco", null);
    if (filtro === "sem_foto") q = q.is("foto_path", null);
    const { data, count, error } = await q;
    if (error) return setErro(error.message);
    setErro("");
    setTotal(count ?? 0);
    setLista(((data ?? []) as Produto[]).map((p) => ({ ...p, variacoes: [...p.variacoes].sort((a, b) => a.ordem - b.ordem) })));
  }, [busca, filtro, pagina]);

  useEffect(() => {
    const t = setTimeout(() => void carregar(), 250);
    return () => clearTimeout(t);
  }, [carregar, recarga]);

  async function salvarProduto(id: string, mud: Partial<Produto>) {
    setLista((l) => l?.map((p) => (p.id === id ? { ...p, ...mud } : p)) ?? l);
    const { error } = await supabase.from("produtos").update(mud).eq("id", id);
    if (error) setErro(`Não salvou: ${error.message}`);
  }
  async function salvarVariacao(pid: string, vid: string, mud: Partial<Variacao>) {
    setLista((l) => l?.map((p) => (p.id === pid ? { ...p, variacoes: p.variacoes.map((v) => (v.id === vid ? { ...v, ...mud } : v)) } : p)) ?? l);
    const { error } = await supabase.from("variacoes").update(mud).eq("id", vid);
    if (error) setErro(`Não salvou: ${error.message}`);
  }

  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  return (
    <Cartao>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value);
            setPagina(0);
          }}
          placeholder="Buscar por código ou nome…"
          className="w-72 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-marca focus:outline-none"
        />
        <select
          value={filtro}
          onChange={(e) => {
            setFiltro(e.target.value as typeof filtro);
            setPagina(0);
          }}
          className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
          aria-label="Filtro"
        >
          <option value="todos">Todos</option>
          <option value="ativos">Ativos</option>
          <option value="inativos">Inativos</option>
          <option value="sem_preco">Sem preço</option>
          <option value="sem_foto">Sem foto</option>
        </select>
        <span className="ml-auto text-sm text-slate-500">{total.toLocaleString("pt-BR")} produto(s)</span>
      </div>
      {erro && <p className="mb-2 rounded bg-red-50 p-2 text-sm text-red-700">{erro}</p>}
      {!lista ? (
        <p className="text-slate-500">Carregando…</p>
      ) : !lista.length ? (
        <p className="text-slate-500">Nenhum produto encontrado.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-slate-500">
                <th className="w-12 pb-2" />
                <th className="pb-2 font-medium">Código</th>
                <th className="pb-2 font-medium">Nome</th>
                <th className="pb-2 font-medium">Preço</th>
                <th className="pb-2 font-medium" title="Quantidade mínima (o cliente compra em múltiplos dela)">Mínimo</th>
                <th className="pb-2 font-medium">Variações</th>
                <th className="pb-2 text-center font-medium">Ativo</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <Fragment key={p.id}>
                  <tr className={`border-b border-slate-100 ${p.ativo ? "" : "text-slate-400"}`}>
                    <td className="py-1.5">
                      <div className="h-10 w-10 overflow-hidden rounded bg-slate-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {p.foto_path && <img src={thumbUrl(p.foto_path, 80)} alt="" loading="lazy" className="h-full w-full object-contain" />}
                      </div>
                    </td>
                    <td className="whitespace-nowrap py-1.5 font-mono text-xs">{p.codigo}</td>
                    <td className="min-w-64 py-1.5">
                      <CampoTexto valor={p.nome} onSalvar={(nome) => nome && salvarProduto(p.id, { nome })} />
                    </td>
                    <td className="py-1.5">
                      <CampoNumero valor={p.preco} decimal onSalvar={(preco) => salvarProduto(p.id, { preco })} placeholder="sob consulta" />
                    </td>
                    <td className="py-1.5">
                      <CampoNumero valor={p.qtd_minima} onSalvar={(n) => salvarProduto(p.id, { qtd_minima: Math.max(1, Math.round(n ?? 1)) })} />
                    </td>
                    <td className="py-1.5">
                      {p.variacoes.length ? (
                        <button onClick={() => setAberto(aberto === p.id ? null : p.id)} className="text-marca hover:underline" aria-expanded={aberto === p.id}>
                          {p.variacoes.filter((v) => v.ativo).length} de {p.variacoes.length} {aberto === p.id ? "▴" : "▾"}
                        </button>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-1.5 text-center">
                      <input type="checkbox" checked={p.ativo} onChange={(e) => salvarProduto(p.id, { ativo: e.target.checked })} aria-label={`Ativo ${p.codigo}`} />
                    </td>
                  </tr>
                  {aberto === p.id && (
                    <tr className="bg-slate-50">
                      <td />
                      <td colSpan={6} className="py-2">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-left text-slate-500">
                              <th className="pb-1 font-medium">Variação</th>
                              <th className="pb-1 font-medium">Código</th>
                              <th className="pb-1 font-medium">Preço <span className="font-normal">(vazio = do produto, {brl(p.preco)})</span></th>
                              <th className="pb-1 font-medium">Mínimo <span className="font-normal">(vazio = {p.qtd_minima})</span></th>
                              <th className="pb-1 text-center font-medium">Ativa</th>
                            </tr>
                          </thead>
                          <tbody>
                            {p.variacoes.map((v) => (
                              <tr key={v.id} className={v.ativo ? "" : "text-slate-400"}>
                                <td className="py-0.5">{v.rotulo}</td>
                                <td className="py-0.5 font-mono">{v.codigo}</td>
                                <td className="py-0.5">
                                  <CampoNumero valor={v.preco} decimal onSalvar={(preco) => salvarVariacao(p.id, v.id, { preco })} />
                                </td>
                                <td className="py-0.5">
                                  <CampoNumero valor={v.qtd_minima} onSalvar={(n) => salvarVariacao(p.id, v.id, { qtd_minima: n == null ? null : Math.max(1, Math.round(n)) })} />
                                </td>
                                <td className="py-0.5 text-center">
                                  <input type="checkbox" checked={v.ativo} onChange={(e) => salvarVariacao(p.id, v.id, { ativo: e.target.checked })} aria-label={`Ativa ${v.rotulo}`} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {paginas > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm">
          <button disabled={pagina === 0} onClick={() => setPagina((n) => n - 1)} className="rounded border px-2 py-1 disabled:opacity-40">← Anterior</button>
          <span className="text-slate-500">página {pagina + 1} de {paginas}</span>
          <button disabled={pagina + 1 >= paginas} onClick={() => setPagina((n) => n + 1)} className="rounded border px-2 py-1 disabled:opacity-40">Próxima →</button>
        </div>
      )}
    </Cartao>
  );
}

/** Texto editável no lugar: salva ao sair do campo ou com Enter. */
function CampoTexto({ valor, onSalvar }: { valor: string; onSalvar: (v: string) => void }) {
  const [v, setV] = useState(valor);
  const [orig, setOrig] = useState(valor);
  if (orig !== valor) {
    setOrig(valor);
    setV(valor);
  }
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v.trim() !== valor && onSalvar(v.trim())}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-slate-200 focus:border-marca focus:bg-white focus:outline-none"
    />
  );
}

function CampoNumero({ valor, onSalvar, decimal, placeholder }: { valor: number | null; onSalvar: (v: number | null) => void; decimal?: boolean; placeholder?: string }) {
  const fmt = (n: number | null) => (n == null ? "" : decimal ? Number(n).toFixed(2).replace(".", ",") : String(n));
  const [v, setV] = useState(fmt(valor));
  const [orig, setOrig] = useState(valor);
  if (orig !== valor) {
    setOrig(valor);
    setV(fmt(valor));
  }
  function confirmar() {
    const t = v.trim().replace(/^r\$\s*/i, "");
    const s = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t; // 1.234,56 ou 2.62
    const n = s === "" ? null : Number(s);
    if (n != null && (!Number.isFinite(n) || n < 0)) return setV(fmt(valor));
    const final = n == null ? null : decimal ? Math.round(n * 100) / 100 : Math.round(n);
    if (final !== (valor == null ? null : Number(valor))) onSalvar(final);
    else setV(fmt(valor));
  }
  return (
    <input
      value={v}
      inputMode={decimal ? "decimal" : "numeric"}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className="w-24 rounded border border-slate-200 px-1.5 py-0.5 tabular-nums focus:border-marca focus:outline-none"
    />
  );
}
