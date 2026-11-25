"use client";

import { useCallback, useEffect, useState } from "react";
import type { Papel } from "@/components/admin/AdminGate";
import { FiltroVendedora, useVendedoras } from "@/components/admin/FiltroVendedora";
import { Cartao, Painel, tempoAtras } from "@/components/admin/Painel";
import { supabase } from "@/lib/supabase";
import { brl, maskTelefone, waNumero } from "@/lib/format";
import { MARCA } from "@/lib/site";

type ItemCarrinho = { codigo: string | null; descricao: string; quantidade: number; preco_unitario: number | null; observacao: string | null };
type Carrinho = {
  id: string; cliente_nome: string | null; cliente_whatsapp: string | null; ultimo_evento_em: string; criado_em: string;
  recuperacao_enviada_em: string | null; catalogos: { nome: string; slug: string } | null; vendedoras: { nome: string } | null; carrinho_itens: ItemCarrinho[];
};

const PRAZOS = [
  { h: 1, rotulo: "1 hora" },
  { h: 6, rotulo: "6 horas" },
  { h: 24, rotulo: "1 dia" },
  { h: 72, rotulo: "3 dias" },
];

export default function Carrinhos() {
  return (
    <Painel titulo="Carrinhos abandonados">{(papel, vendedora) => <Lista papel={papel} minhaNome={vendedora?.nome ?? null} />}</Painel>
  );
}

function Lista({ papel, minhaNome }: { papel: Papel; minhaNome: string | null }) {
  const vendedoras = useVendedoras(papel);
  const [vend, setVend] = useState("todas");
  const [horas, setHoras] = useState(1);
  const [comContato, setComContato] = useState(true);
  const [lista, setLista] = useState<Carrinho[] | null>(null);

  const carregar = useCallback(async () => {
    const limite = new Date(Date.now() - horas * 3600_000).toISOString();
    let q = supabase
      .from("carrinhos")
      .select("id, cliente_nome, cliente_whatsapp, ultimo_evento_em, criado_em, recuperacao_enviada_em, catalogos(nome, slug), vendedoras(nome), carrinho_itens(codigo, descricao, quantidade, preco_unitario, observacao)")
      .eq("status", "aberto")
      .lt("ultimo_evento_em", limite)
      .order("ultimo_evento_em", { ascending: false })
      .limit(200);
    if (comContato) q = q.not("cliente_whatsapp", "is", null);
    if (vend === "sem") q = q.is("vendedora_id", null);
    else if (vend !== "todas") q = q.eq("vendedora_id", vend);
    const { data } = await q;
    setLista(((data ?? []) as unknown as Carrinho[]).filter((c) => c.carrinho_itens.length > 0));
  }, [horas, comContato, vend]);

  useEffect(() => {
    const t = setTimeout(() => void carregar(), 0);
    return () => clearTimeout(t);
  }, [carregar]);

  function mensagem(c: Carrinho) {
    const itens = c.carrinho_itens.slice(0, 8).map((i) => `• ${i.quantidade}x ${i.descricao}${i.observacao ? ` ("${i.observacao}")` : ""}`);
    if (c.carrinho_itens.length > 8) itens.push(`… e mais ${c.carrinho_itens.length - 8} itens`);
    return [
      `Olá${c.cliente_nome ? `, ${c.cliente_nome.split(" ")[0]}` : ""}! Aqui é ${minhaNome ? `a ${minhaNome.split(" ")[0]}, ` : ""}da ${MARCA} 🙏`,
      `Vi que você montou um pedido no nosso ${c.catalogos?.nome ?? "catálogo"}, mas ele não chegou a ser enviado:`,
      "",
      ...itens,
      "",
      "Posso te ajudar a finalizar? Se quiser, é só responder esta mensagem.",
    ].join("\n");
  }

  async function contatar(c: Carrinho) {
    const agora = new Date().toISOString();
    setLista((l) => l && l.map((x) => (x.id === c.id ? { ...x, recuperacao_enviada_em: agora } : x)));
    await supabase.from("carrinhos").update({ recuperacao_enviada_em: agora }).eq("id", c.id);
  }

  async function descartar(c: Carrinho) {
    setLista((l) => l && l.filter((x) => x.id !== c.id));
    await supabase.from("carrinhos").update({ status: "descartado" }).eq("id", c.id);
  }

  return (
    <div className="space-y-4">
      <Cartao>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-slate-600">Sem atividade há mais de</span>
          <div className="flex rounded-lg bg-slate-100 p-0.5" role="group" aria-label="Tempo sem atividade">
            {PRAZOS.map((p) => (
              <button key={p.h} onClick={() => setHoras(p.h)} aria-pressed={horas === p.h}
                className={`rounded-md px-3 py-1 ${horas === p.h ? "bg-marca text-white" : "hover:bg-slate-200"}`}>{p.rotulo}</button>
            ))}
          </div>
          {papel === "admin" && <FiltroVendedora valor={vend} onChange={setVend} vendedoras={vendedoras} />}
          <label className="ml-auto flex items-center gap-2">
            <input type="checkbox" checked={comContato} onChange={(e) => setComContato(e.target.checked)} />
            Só com WhatsApp informado
          </label>
        </div>
      </Cartao>

      {!lista ? (
        <p className="text-slate-500">Carregando…</p>
      ) : lista.length === 0 ? (
        <Cartao><p className="py-4 text-center text-slate-500">Nenhum carrinho abandonado neste filtro. 🎉</p></Cartao>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {lista.map((c) => {
            const total = c.carrinho_itens.reduce((s, i) => s + i.quantidade * Number(i.preco_unitario ?? 0), 0);
            const unidades = c.carrinho_itens.reduce((s, i) => s + i.quantidade, 0);
            return (
              <Cartao key={c.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{c.cliente_nome ?? "Cliente sem nome"}</p>
                    <p className="text-sm text-slate-600">{c.cliente_whatsapp ? maskTelefone(c.cliente_whatsapp.replace(/^55(?=\d{10,11}$)/, "")) : "sem WhatsApp"}</p>
                    <p className="text-xs text-slate-500">{c.catalogos?.nome} · última atividade {tempoAtras(c.ultimo_evento_em)}</p>
                    {papel === "admin" && <p className="text-xs text-slate-500">Vendedora: {c.vendedoras?.nome ?? "sem vendedora"}</p>}
                  </div>
                  <div className="text-right">
                    <p className="font-semibold tabular-nums">{brl(total)}</p>
                    <p className="text-xs text-slate-500">{c.carrinho_itens.length} itens · {unidades} un.</p>
                  </div>
                </div>
                <ul className="my-3 space-y-0.5 text-xs text-slate-700">
                  {c.carrinho_itens.slice(0, 5).map((i, k) => (
                    <li key={k}>{i.quantidade}× {i.descricao}{i.observacao ? ` (“${i.observacao}”)` : ""}</li>
                  ))}
                  {c.carrinho_itens.length > 5 && <li className="text-slate-500">… e mais {c.carrinho_itens.length - 5}</li>}
                </ul>
                <div className="flex items-center gap-2">
                  {c.cliente_whatsapp && (
                    <a href={`https://wa.me/${waNumero(c.cliente_whatsapp)}?text=${encodeURIComponent(mensagem(c))}`} target="_blank" rel="noopener"
                      onClick={() => void contatar(c)} className="rounded-lg bg-[#25D366] px-3 py-1.5 text-sm font-semibold text-white">
                      Chamar no WhatsApp
                    </a>
                  )}
                  {c.recuperacao_enviada_em && <span className="text-xs text-emerald-700">✓ contatado {tempoAtras(c.recuperacao_enviada_em)}</span>}
                  <button onClick={() => void descartar(c)} className="ml-auto text-xs text-slate-500 underline hover:text-red-600">descartar</button>
                </div>
              </Cartao>
            );
          })}
        </div>
      )}
    </div>
  );
}
