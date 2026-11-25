"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import type { Papel } from "@/components/admin/AdminGate";
import { FiltroVendedora, useVendedoras, type VendedoraResumo } from "@/components/admin/FiltroVendedora";
import { Cartao, Painel, dataHora, tempoAtras } from "@/components/admin/Painel";
import { supabase } from "@/lib/supabase";
import { maskTelefone, soDigitos, waNumero } from "@/lib/format";

type Cliente = {
  id: string; nome: string | null; whatsapp: string; vendedora_id: string | null; vendedora_fixa: boolean;
  aceite_em: string | null; criado_em: string; ultimo_acesso_em: string;
  vendedoras: { nome: string } | null; pedidos: { count: number }[];
};
const POR_PAGINA = 30;

export default function Clientes() {
  return <Painel titulo="Clientes">{(papel) => <Lista papel={papel} />}</Painel>;
}

function Lista({ papel }: { papel: Papel }) {
  const vendedoras = useVendedoras(papel);
  const [vend, setVend] = useState("todas");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(0);
  const [dados, setDados] = useState<{ lista: Cliente[]; total: number } | null>(null);
  const [editando, setEditando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    let q = supabase
      .from("clientes")
      .select("id, nome, whatsapp, vendedora_id, vendedora_fixa, aceite_em, criado_em, ultimo_acesso_em, vendedoras(nome), pedidos(count)", { count: "exact" })
      .order("ultimo_acesso_em", { ascending: false })
      .range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1);
    if (vend === "sem") q = q.is("vendedora_id", null);
    else if (vend !== "todas") q = q.eq("vendedora_id", vend);
    const b = busca.trim().replace(/[,()%*]/g, "");
    if (b) {
      const d = soDigitos(b);
      q = d.length >= 3 && d.length === b.replace(/[\s()-]/g, "").length ? q.ilike("whatsapp", `%${d}%`) : q.ilike("nome", `%${b}%`);
    }
    const { data, count } = await q;
    setDados({ lista: (data ?? []) as unknown as Cliente[], total: count ?? 0 });
  }, [vend, busca, pagina]);

  useEffect(() => {
    const t = setTimeout(() => void carregar(), 200);
    return () => clearTimeout(t);
  }, [carregar]);

  const paginas = dados ? Math.max(1, Math.ceil(dados.total / POR_PAGINA)) : 1;
  return (
    <Cartao>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {papel === "admin" && <FiltroVendedora valor={vend} onChange={(v) => { setVend(v); setPagina(0); }} vendedoras={vendedoras} />}
        <input value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(0); }} placeholder="Buscar por nome ou WhatsApp"
          className="w-72 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-marca" />
        <span className="ml-auto text-sm text-slate-500">{dados ? `${dados.total.toLocaleString("pt-BR")} cliente(s)` : ""}</span>
      </div>

      {!dados ? (
        <p className="text-slate-500">Carregando…</p>
      ) : dados.lista.length === 0 ? (
        <p className="py-6 text-center text-slate-500">Nenhum cliente encontrado.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-slate-500">
                <th className="pb-2">Cliente</th><th className="pb-2">WhatsApp</th>{papel === "admin" && <th className="pb-2">Vendedora</th>}
                <th className="pb-2 text-right">Pedidos</th><th className="pb-2 pl-6">Último acesso</th><th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {dados.lista.map((c) => (
                <Fragment key={c.id}>
                  <tr className="border-b border-slate-100 align-middle hover:bg-slate-50">
                    <td className="py-2 font-medium">{c.nome ?? <span className="font-normal text-slate-400">sem nome</span>}
                      {!c.aceite_em && <span title="Cliente antigo: ainda não aceitou receber mensagens" className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">sem aceite</span>}
                    </td>
                    <td className="py-2 tabular-nums">{maskTelefone(c.whatsapp)}</td>
                    {papel === "admin" && (
                      <td className="py-2">
                        {c.vendedoras?.nome ?? <span className="text-slate-400">—</span>}
                        {c.vendedora_fixa && <span title="Vendedora fixada manualmente: links de outras vendedoras não trocam" className="ml-1">🔒</span>}
                      </td>
                    )}
                    <td className="py-2 text-right tabular-nums">{c.pedidos?.[0]?.count ?? 0}</td>
                    <td className="py-2 pl-6 text-slate-600" title={dataHora(c.ultimo_acesso_em)}>{tempoAtras(c.ultimo_acesso_em)}</td>
                    <td className="space-x-3 whitespace-nowrap py-2 text-right text-xs">
                      <a href={`https://wa.me/${waNumero(c.whatsapp)}`} target="_blank" rel="noopener" className="text-emerald-700 underline">WhatsApp</a>
                      {papel === "admin" && <button onClick={() => setEditando(editando === c.id ? null : c.id)} className="text-marca underline">{editando === c.id ? "fechar" : "editar"}</button>}
                    </td>
                  </tr>
                  {editando === c.id && (
                    <tr className="bg-slate-50">
                      <td colSpan={papel === "admin" ? 6 : 5} className="px-3 py-3">
                        <Editar c={c} vendedoras={vendedoras} onFeito={() => { setEditando(null); void carregar(); }} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
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

/** Administrador: corrige nome e WhatsApp e escolhe a vendedora do cliente. */
function Editar({ c, vendedoras, onFeito }: { c: Cliente; vendedoras: VendedoraResumo[]; onFeito: () => void }) {
  const [nome, setNome] = useState(c.nome ?? "");
  const [zap, setZap] = useState(maskTelefone(c.whatsapp));
  const [vend, setVend] = useState(c.vendedora_id ?? "");
  const [mover, setMover] = useState(false);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar(automatico: boolean) {
    setErro("");
    setSalvando(true);
    const { error } = await supabase.rpc("admin_alterar_cliente", {
      p_cliente: c.id, p_whatsapp: zap, p_nome: nome, p_vendedora: vend || null, p_automatico: automatico, p_mover_historico: mover,
    });
    setSalvando(false);
    if (error) return setErro(error.message);
    onFeito();
  }

  const campo = "w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-marca focus:outline-none";
  const trocou = (vend || null) !== c.vendedora_id;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm"><span className="mb-1 block font-medium">Nome</span><input className={campo} value={nome} onChange={(e) => setNome(e.target.value)} /></label>
        <label className="text-sm"><span className="mb-1 block font-medium">WhatsApp</span><input className={campo} value={zap} onChange={(e) => setZap(maskTelefone(e.target.value))} inputMode="tel" /></label>
        <label className="text-sm"><span className="mb-1 block font-medium">Vendedora</span>
          <select className={campo} value={vend} onChange={(e) => setVend(e.target.value)}>
            <option value="">Sem vendedora</option>
            {vendedoras.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
          </select>
        </label>
      </div>
      {trocou && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={mover} onChange={(e) => setMover(e.target.checked)} />
          Mover também os pedidos antigos deste cliente para a nova vendedora
        </label>
      )}
      <p className="text-xs text-slate-500">
        {c.vendedora_fixa ? "🔒 Vendedora fixada: o link de outra vendedora não troca. " : "Vendedora automática: vale o último link que o cliente usar. "}
        {trocou ? "Ao trocar a vendedora aqui, ela fica fixada neste cliente." : ""}
      </p>
      {erro && <p role="alert" className="text-sm text-red-600">{erro}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={salvando} onClick={() => void salvar(false)} className="rounded-lg bg-marca px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50">Salvar</button>
        {c.vendedora_fixa && <button disabled={salvando} onClick={() => void salvar(true)} className="text-sm text-slate-600 underline">Salvar e voltar ao automático (último link)</button>}
      </div>
    </div>
  );
}
