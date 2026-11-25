"use client";

import { useCallback, useEffect, useState } from "react";
import type { Papel } from "@/components/admin/AdminGate";
import { FiltroVendedora, useVendedoras } from "@/components/admin/FiltroVendedora";
import { Cartao, Painel, dataHora } from "@/components/admin/Painel";
import { supabase } from "@/lib/supabase";
import { brl, maskTelefone, waNumero } from "@/lib/format";
import { MARCA_CURTA } from "@/lib/site";

type Item = { codigo: string | null; nome?: string; descricao: string; variacao?: string | null; observacao?: string | null; quantidade: number; preco_unitario: number | null };
type Pedido = {
  id: string; numero: number; criado_em: string; cliente_nome: string | null; cliente_whatsapp: string | null;
  itens: Item[]; total: number | null; status: string; observacao: string | null; token: string; catalogos: { nome: string } | null; vendedoras: { nome: string } | null;
};

const STATUS = [
  { v: "novo", rotulo: "Novo", cor: "bg-blue-100 text-blue-800" },
  { v: "em_atendimento", rotulo: "Em atendimento", cor: "bg-amber-100 text-amber-800" },
  { v: "fechado", rotulo: "Fechado", cor: "bg-emerald-100 text-emerald-800" },
  { v: "cancelado", rotulo: "Cancelado", cor: "bg-slate-200 text-slate-600" },
];
const POR_PAGINA = 30;

export default function Pedidos() {
  return (
    <Painel titulo="Pedidos">{(papel) => <Lista papel={papel} />}</Painel>
  );
}

function Lista({ papel }: { papel: Papel }) {
  const vendedoras = useVendedoras(papel);
  const [vend, setVend] = useState("todas");
  const [filtro, setFiltro] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(0);
  const [dados, setDados] = useState<{ lista: Pedido[]; total: number } | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    let q = supabase
      .from("pedidos")
      .select("id, numero, criado_em, cliente_nome, cliente_whatsapp, itens, total, status, observacao, token, catalogos(nome), vendedoras(nome)", { count: "exact" })
      .order("criado_em", { ascending: false })
      .range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1);
    if (filtro !== "todos") q = q.eq("status", filtro);
    if (vend === "sem") q = q.is("vendedora_id", null);
    else if (vend !== "todas") q = q.eq("vendedora_id", vend);
    const b = busca.trim().replace(/[,()%*]/g, "");
    if (b) q = /^\d+$/.test(b) ? q.or(`numero.eq.${b},cliente_whatsapp.ilike.%${b}%`) : q.ilike("cliente_nome", `%${b}%`);
    const { data, count } = await q;
    setDados({ lista: (data ?? []) as unknown as Pedido[], total: count ?? 0 });
  }, [filtro, busca, pagina, vend]);

  useEffect(() => {
    const t = setTimeout(() => void carregar(), 200);
    return () => clearTimeout(t);
  }, [carregar]);

  async function mudarStatus(p: Pedido, status: string) {
    setDados((d) => d && { ...d, lista: d.lista.map((x) => (x.id === p.id ? { ...x, status } : x)) });
    await supabase.from("pedidos").update({ status }).eq("id", p.id);
  }

  /** Exclui de vez (não dá para desfazer): pede confirmação mostrando quantos e quais. */
  async function excluir(ids: string[]) {
    if (!ids.length || !dados) return;
    const nums = dados.lista.filter((p) => ids.includes(p.id)).map((p) => `#${p.numero}`);
    const resumo = nums.length <= 5 ? nums.join(", ") : `${nums.slice(0, 5).join(", ")} e mais ${nums.length - 5}`;
    if (!confirm(`Excluir ${ids.length === 1 ? "o pedido" : `${ids.length} pedidos`} ${resumo}?\n\nIsso não pode ser desfeito. O link do PDF deixa de funcionar.`)) return;
    setErro("");
    const { data, error } = await supabase.from("pedidos").delete().in("id", ids).select("id");
    if (error) return setErro(`Não foi possível excluir: ${error.message}`);
    if ((data?.length ?? 0) < ids.length) setErro("Alguns pedidos não foram excluídos (sem permissão).");
    setMarcados(new Set());
    setAberto(null);
    await carregar();
  }
  const alternar = (id: string) =>
    setMarcados((m) => {
      const n = new Set(m);
      if (!n.delete(id)) n.add(id);
      return n;
    });
  const todosMarcados = !!dados && dados.lista.length > 0 && dados.lista.every((p) => marcados.has(p.id));

  const paginas = dados ? Math.max(1, Math.ceil(dados.total / POR_PAGINA)) : 1;

  return (
    <Cartao>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {[{ v: "todos", rotulo: "Todos" }, ...STATUS].map((s) => (
          <button key={s.v} onClick={() => { setFiltro(s.v); setPagina(0); }} aria-pressed={filtro === s.v}
            className={`rounded-full px-3 py-1 text-sm ${filtro === s.v ? "bg-marca text-white" : "bg-slate-100 hover:bg-slate-200"}`}>
            {s.rotulo}
          </button>
        ))}
        {papel === "admin" && <FiltroVendedora valor={vend} onChange={(v) => { setVend(v); setPagina(0); }} vendedoras={vendedoras} />}
        <input value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(0); }} placeholder="Buscar: nome, nº do pedido ou WhatsApp"
          className="ml-auto w-72 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-marca" />
      </div>

      {erro && <p className="mb-2 rounded bg-red-50 p-2 text-sm text-red-700">{erro}</p>}
      {marcados.size > 0 && (
        <div className="mb-2 flex items-center gap-3 rounded-lg bg-red-50 px-3 py-2 text-sm">
          <span>{marcados.size} selecionado(s)</span>
          <button onClick={() => void excluir([...marcados])} className="rounded-md bg-red-600 px-3 py-1 font-semibold text-white hover:bg-red-700">Excluir selecionados</button>
          <button onClick={() => setMarcados(new Set())} className="text-slate-600 underline">limpar seleção</button>
        </div>
      )}

      {!dados ? (
        <p className="text-slate-500">Carregando…</p>
      ) : dados.lista.length === 0 ? (
        <p className="py-6 text-center text-slate-500">Nenhum pedido encontrado.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-slate-500">
              <th className="w-8 pb-2">
                <input type="checkbox" checked={todosMarcados} onChange={() => setMarcados(todosMarcados ? new Set() : new Set(dados.lista.map((p) => p.id)))} aria-label="Selecionar todos desta página" />
              </th>
              <th className="pb-2">Nº</th><th className="pb-2">Data</th><th className="pb-2">Cliente</th><th className="pb-2">Catálogo</th>{papel === "admin" && <th className="pb-2">Vendedora</th>}
              <th className="pb-2 text-right">Itens</th><th className="pb-2 text-right">Total</th><th className="pb-2">Status</th><th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {dados.lista.map((p) => {
              const st = STATUS.find((s) => s.v === p.status) ?? STATUS[0];
              const semPreco = p.itens.some((i) => i.preco_unitario == null);
              return (
                <FragmentoPedido key={p.id} aberto={aberto === p.id}>
                  <tr className="border-b border-slate-100 align-middle hover:bg-slate-50">
                    <td className="py-2">
                      <input type="checkbox" checked={marcados.has(p.id)} onChange={() => alternar(p.id)} aria-label={`Selecionar pedido ${p.numero}`} />
                    </td>
                    <td className="py-2 font-semibold">#{p.numero}</td>
                    <td className="py-2 text-slate-600">{dataHora(p.criado_em)}</td>
                    <td className="py-2">
                      <p>{p.cliente_nome ?? "—"}</p>
                      {p.cliente_whatsapp && <p className="text-xs text-slate-500">{maskTelefone(p.cliente_whatsapp.replace(/^55(?=\d{10,11}$)/, ""))}</p>}
                    </td>
                    <td className="py-2 text-slate-600">{p.catalogos?.nome ?? "—"}</td>
                    {papel === "admin" && <td className="py-2 text-slate-600">{p.vendedoras?.nome ?? <span className="text-slate-400">—</span>}</td>}
                    <td className="py-2 text-right tabular-nums">{p.itens.length}</td>
                    <td className="py-2 text-right tabular-nums">{p.total != null ? brl(Number(p.total)) : "—"}{semPreco && <span className="block text-[10px] text-slate-400">+ itens sob consulta</span>}</td>
                    <td className="py-2">
                      <select value={p.status} onChange={(e) => void mudarStatus(p, e.target.value)} className={`rounded-full border-0 px-2 py-1 text-xs font-semibold ${st.cor}`} aria-label={`Status do pedido ${p.numero}`}>
                        {STATUS.map((s) => <option key={s.v} value={s.v}>{s.rotulo}</option>)}
                      </select>
                    </td>
                    <td className="space-x-2 whitespace-nowrap py-2 text-right text-xs">
                      <button onClick={() => setAberto(aberto === p.id ? null : p.id)} className="text-marca underline">{aberto === p.id ? "fechar" : "itens"}</button>
                      <a href={`/pedido/${p.id}/pdf?t=${p.token}`} target="_blank" rel="noopener" className="text-marca underline">PDF</a>
                      {p.cliente_whatsapp && (
                        <a href={`https://wa.me/${waNumero(p.cliente_whatsapp)}?text=${encodeURIComponent(`Olá ${p.cliente_nome ?? ""}! Recebemos seu pedido #${p.numero} da ${MARCA_CURTA}.`)}`} target="_blank" rel="noopener" className="text-emerald-700 underline">WhatsApp</a>
                      )}
                      <button onClick={() => void excluir([p.id])} className="text-red-600 underline" aria-label={`Excluir pedido ${p.numero}`}>excluir</button>
                    </td>
                  </tr>
                  {aberto === p.id && (
                    <tr className="bg-slate-50">
                      <td colSpan={10} className="px-3 py-3">
                        <table className="w-full text-xs">
                          <thead><tr className="text-left text-slate-500"><th>Referência</th><th>Qtd</th><th>Nome</th><th>Santo / opção</th><th className="text-right">Preço un.</th></tr></thead>
                          <tbody>
                            {p.itens.map((i, k) => (
                              <tr key={k} className="border-t border-slate-200">
                                <td className="py-1">{i.codigo ?? "—"}</td>
                                <td className="py-1">{i.quantidade}</td>
                                <td className="py-1">{i.nome ?? i.descricao}</td>
                                <td className="py-1">{i.variacao ?? "—"}{i.observacao && <span className="block italic text-slate-500">“{i.observacao}”</span>}</td>
                                <td className="py-1 text-right">{i.preco_unitario != null ? brl(Number(i.preco_unitario)) : "Sob consulta"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {p.observacao && <p className="mt-2 text-xs"><strong>Obs. do cliente:</strong> {p.observacao}</p>}
                      </td>
                    </tr>
                  )}
                </FragmentoPedido>
              );
            })}
          </tbody>
        </table>
      )}

      {dados && dados.total > POR_PAGINA && (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm">
          <button disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)} className="rounded px-2 py-1 hover:bg-slate-100 disabled:opacity-30">‹ anteriores</button>
          <span className="text-slate-500">página {pagina + 1} de {paginas}</span>
          <button disabled={pagina + 1 >= paginas} onClick={() => setPagina((p) => p + 1)} className="rounded px-2 py-1 hover:bg-slate-100 disabled:opacity-30">próximos ›</button>
        </div>
      )}
    </Cartao>
  );
}

function FragmentoPedido({ children }: { aberto: boolean; children: React.ReactNode }) {
  return <>{children}</>;
}
