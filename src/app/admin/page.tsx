"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Cartao, Painel } from "@/components/admin/Painel";
import { supabase } from "@/lib/supabase";
import { brl } from "@/lib/format";

type Metricas = {
  funil: { visitas: number; adicionaram: number; abriram_carrinho: number; finalizaram: number };
  por_dia: { dia: string; visitas: number; pedidos: number }[];
  pedidos: { quantidade: number; valor: number; por_status: Record<string, number> };
  top_produtos: { codigo: string; nome: string; adicoes: number }[];
  top_paginas: { catalogo: string; slug: string; pagina: number; vistas: number }[];
  por_catalogo: { nome: string; slug: string; visitas: number }[];
};

const PERIODOS = [7, 30, 90];

export default function VisaoGeral() {
  const [dias, setDias] = useState(30);
  return (
    <Painel
      titulo="Visão geral"
      acoes={(papel) =>
        papel === "admin" && (
          <div className="flex rounded-lg bg-white p-0.5 shadow-sm" role="group" aria-label="Período">
            {PERIODOS.map((d) => (
              <button key={d} onClick={() => setDias(d)} aria-pressed={dias === d}
                className={`rounded-md px-3 py-1 text-sm ${dias === d ? "bg-marca text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                {d} dias
              </button>
            ))}
          </div>
        )
      }
    >
      {(papel, vendedora) => (papel === "admin" ? <Conteudo dias={dias} /> : <ResumoVendedora nome={vendedora?.nome ?? ""} />)}
    </Painel>
  );
}

/** Resumo da vendedora: só o que é dela (o banco já filtra pedidos, carrinhos e clientes pela conta logada). */
function ResumoVendedora({ nome }: { nome: string }) {
  const [r, setR] = useState<{ clientes: number; pedidos: number; novos: number; valor: number; abandonados: number } | null>(null);
  useEffect(() => {
    let vivo = true;
    (async () => {
      const limite = new Date(Date.now() - 3600_000).toISOString();
      const [cli, ped, novos, val, aband] = await Promise.all([
        supabase.from("clientes").select("id", { count: "exact", head: true }),
        supabase.from("pedidos").select("id", { count: "exact", head: true }),
        supabase.from("pedidos").select("id", { count: "exact", head: true }).eq("status", "novo"),
        supabase.from("pedidos").select("total").neq("status", "cancelado").limit(5000),
        supabase.from("carrinhos").select("id, carrinho_itens(id)").eq("status", "aberto").lt("ultimo_evento_em", limite).not("cliente_whatsapp", "is", null).limit(500),
      ]);
      if (!vivo) return;
      setR({
        clientes: cli.count ?? 0,
        pedidos: ped.count ?? 0,
        novos: novos.count ?? 0,
        valor: ((val.data ?? []) as { total: number | null }[]).reduce((s, p) => s + Number(p.total ?? 0), 0),
        abandonados: ((aband.data ?? []) as unknown as { carrinho_itens: unknown[] }[]).filter((c) => c.carrinho_itens.length > 0).length,
      });
    })();
    return () => {
      vivo = false;
    };
  }, []);
  if (!r) return <p className="text-slate-500">Carregando…</p>;
  return (
    <div className="space-y-4">
      <p className="text-slate-600">Olá, {nome.split(" ")[0]}! Aqui estão os números dos seus clientes.</p>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Indicador rotulo="Meus clientes" valor={r.clientes.toLocaleString("pt-BR")} nota={<Link href="/admin/clientes" className="underline">ver clientes</Link>} />
        <Indicador rotulo="Pedidos" valor={r.pedidos.toLocaleString("pt-BR")} nota={r.novos ? `${r.novos} novo(s) para atender` : "nenhum novo"} />
        <Indicador rotulo="Valor em pedidos" valor={brl(r.valor)} nota="sem os cancelados" />
        <Indicador rotulo="Carrinhos parados" valor={r.abandonados.toLocaleString("pt-BR")} nota={<Link href="/admin/carrinhos" className="underline">chamar no WhatsApp</Link>} />
      </div>
    </div>
  );
}

function Conteudo({ dias }: { dias: number }) {
  const [m, setM] = useState<Metricas | null>(null);
  const [erro, setErro] = useState("");
  useEffect(() => {
    let vivo = true;
    supabase.rpc("admin_metricas", { p_dias: dias }).then(({ data, error }) => {
      if (!vivo) return;
      if (error) setErro(error.message);
      else setM(data as Metricas);
    });
    return () => {
      vivo = false;
    };
  }, [dias]);

  if (erro) return <p className="text-red-600">Erro ao carregar métricas: {erro}</p>;
  if (!m) return <p className="text-slate-500">Carregando…</p>;

  const conversao = m.funil.visitas ? (m.funil.finalizaram / m.funil.visitas) * 100 : 0;
  const ticket = m.pedidos.quantidade ? m.pedidos.valor / m.pedidos.quantidade : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Indicador rotulo="Visitas" valor={m.funil.visitas.toLocaleString("pt-BR")} nota="pessoas que abriram um catálogo" />
        <Indicador rotulo="Pedidos" valor={m.pedidos.quantidade.toLocaleString("pt-BR")} nota={<Link href="/admin/pedidos" className="underline">ver pedidos</Link>} />
        <Indicador rotulo="Valor em pedidos" valor={brl(m.pedidos.valor)} nota={`ticket médio ${brl(ticket)}`} />
        <Indicador rotulo="Conversão" valor={`${conversao.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`} nota="visitas que viraram pedido" />
      </div>

      <Cartao titulo={`Visitas por dia (últimos ${dias} dias)`}>
        <BarrasPorDia dados={m.por_dia} />
      </Cartao>

      <div className="grid gap-4 lg:grid-cols-2">
        <Cartao titulo="Funil">
          <Funil f={m.funil} />
        </Cartao>
        <Cartao titulo="Visitas por catálogo">
          <Tabela
            colunas={["Catálogo", "Visitas"]}
            linhas={m.por_catalogo.map((c) => [c.nome, c.visitas.toLocaleString("pt-BR")])}
            vazio="Sem visitas no período."
          />
        </Cartao>
        <Cartao titulo="Produtos mais adicionados ao carrinho">
          <Tabela
            colunas={["Código", "Produto", "Adições"]}
            linhas={m.top_produtos.map((p) => [p.codigo, p.nome, p.adicoes.toLocaleString("pt-BR")])}
            vazio="Nenhum produto adicionado no período."
          />
        </Cartao>
        <Cartao titulo="Páginas mais vistas">
          <Tabela
            colunas={["Catálogo", "Página", "Vistas"]}
            linhas={m.top_paginas.map((p) => [
              p.catalogo,
              <a key={`${p.slug}${p.pagina}`} href={`/c/${p.slug}?p=${p.pagina}`} target="_blank" rel="noopener" className="text-marca underline">{p.pagina}</a>,
              p.vistas.toLocaleString("pt-BR"),
            ])}
            vazio="Sem páginas vistas no período."
          />
        </Cartao>
      </div>
    </div>
  );
}

function Indicador({ rotulo, valor, nota }: { rotulo: string; valor: string; nota?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{rotulo}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{valor}</p>
      {nota && <p className="mt-0.5 text-xs text-slate-500">{nota}</p>}
    </div>
  );
}

/** Uma série só (visitas): sem legenda, o título nomeia. Barras finas, topo arredondado, dica ao passar o mouse. */
function BarrasPorDia({ dados }: { dados: Metricas["por_dia"] }) {
  const [foco, setFoco] = useState<number | null>(null);
  const max = Math.max(1, ...dados.map((d) => d.visitas));
  const fmt = (dia: string) => new Date(`${dia}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const passo = Math.ceil(dados.length / 8);
  return (
    <div>
      <div className="relative flex h-44 items-end gap-[2px] border-b border-slate-200" onMouseLeave={() => setFoco(null)}>
        {dados.map((d, i) => (
          <div key={d.dia} className="group relative flex h-full flex-1 items-end" onMouseEnter={() => setFoco(i)}>
            <div
              className={`w-full rounded-t-[4px] ${foco === i ? "bg-marca-escuro" : "bg-marca"}`}
              style={{ height: `${(d.visitas / max) * 100}%`, minHeight: d.visitas ? 2 : 0 }}
            />
            {foco === i && (
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs text-white shadow">
                {fmt(d.dia)}: <strong>{d.visitas}</strong> visita(s) · {d.pedidos} pedido(s)
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-[2px] text-[10px] text-slate-400">
        {dados.map((d, i) => (
          <span key={d.dia} className="flex-1 text-center">{i % passo === 0 ? fmt(d.dia) : ""}</span>
        ))}
      </div>
      <p className="mt-1 text-right text-[11px] text-slate-400">máx. {max} visita(s) num dia</p>
    </div>
  );
}

function Funil({ f }: { f: Metricas["funil"] }) {
  const etapas = [
    ["Abriram o catálogo", f.visitas],
    ["Adicionaram produto", f.adicionaram],
    ["Abriram o carrinho", f.abriram_carrinho],
    ["Enviaram o pedido", f.finalizaram],
  ] as const;
  const topo = Math.max(1, f.visitas);
  return (
    <ul className="space-y-2.5">
      {etapas.map(([rotulo, n]) => (
        <li key={rotulo}>
          <div className="mb-0.5 flex justify-between text-sm">
            <span>{rotulo}</span>
            <span className="tabular-nums text-slate-600">
              {n.toLocaleString("pt-BR")} <span className="text-xs text-slate-400">({Math.round((n / topo) * 100)}%)</span>
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-marca" style={{ width: `${(n / topo) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Tabela({ colunas, linhas, vazio }: { colunas: string[]; linhas: React.ReactNode[][]; vazio: string }) {
  if (!linhas.length) return <p className="text-sm text-slate-500">{vazio}</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-xs text-slate-500">
          {colunas.map((c, i) => <th key={c} className={`pb-1 font-medium ${i === colunas.length - 1 ? "text-right" : ""}`}>{c}</th>)}
        </tr>
      </thead>
      <tbody>
        {linhas.map((l, i) => (
          <tr key={i} className="border-b border-slate-100 last:border-0">
            {l.map((c, j) => <td key={j} className={`py-1.5 ${j === l.length - 1 ? "text-right tabular-nums" : ""}`}>{c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
