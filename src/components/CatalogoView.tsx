"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { carregarCatalogo, listarCatalogos } from "@/lib/catalogo-data";
import { useAdmin } from "@/lib/admin";
import { CartProvider, useCart } from "@/lib/cart";
import { imgUrl, waNumero } from "@/lib/format";
import type { CatalogoCompleto, Hotspot, Pagina } from "@/lib/types";
import { CartDrawer } from "./CartDrawer";
import { Paginas, type PaginasHandle } from "./Paginas";
import { ProductSheet, type OpcaoProduto } from "./ProductSheet";
import { SeloCarrinho } from "./SeloCarrinho";

export function CatalogoView({ slug }: { slug: string }) {
  const [data, setData] = useState<CatalogoCompleto | null>(null);
  const [estado, setEstado] = useState<"carregando" | "ok" | "naoEncontrado" | "erro">("carregando");

  useEffect(() => {
    let vivo = true;
    carregarCatalogo(slug)
      .then((d) => {
        if (!vivo) return;
        setData(d);
        setEstado(d ? "ok" : "naoEncontrado");
      })
      .catch((e) => {
        console.error("Falha ao carregar catálogo", e);
        if (vivo) setEstado("erro");
      });
    return () => {
      vivo = false;
    };
  }, [slug]);

  if (estado === "carregando") return <Centro>Carregando catálogo…</Centro>;
  if (estado === "naoEncontrado")
    return (
      <Centro>
        Catálogo não encontrado. <Link href="/" className="underline">Ver catálogos</Link>
      </Centro>
    );
  if (estado === "erro" || !data) return <Centro>Não foi possível carregar o catálogo. Tente novamente.</Centro>;

  return (
    <CartProvider slug={slug}>
      <Viewer data={data} />
    </CartProvider>
  );
}

function Centro({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-dvh items-center justify-center gap-1 bg-marca-escuro p-6 text-center text-white/80">{children}</main>;
}

type Sheet =
  | { tipo: "produto"; hotspotId: string; produtoId: string; fotoReserva: string; variacaoId: string | null }
  | { tipo: "foto"; src: string; titulo: string }
  | null;

/** Página inicial vinda do link (?p=5). Só roda no cliente: o Viewer monta depois do fetch. */
function paginaDoLink(paginas: Pagina[]): number {
  const n = Number(new URLSearchParams(window.location.search).get("p"));
  const idx = paginas.findIndex((p) => p.numero === n);
  return idx >= 0 ? idx : 0;
}

function Viewer({ data }: { data: CatalogoCompleto }) {
  const { catalogo, paginas, produtos, variacoes, hotspots } = data;
  const { totalItens, track } = useCart();
  const flipRef = useRef<PaginasHandle>(null);
  const router = useRouter();
  const [seguinte, setSeguinte] = useState<{ slug: string; nome: string } | null>(null);
  useEffect(() => {
    let vivo = true;
    listarCatalogos()
      .then((l) => {
        const i = l.findIndex((c) => c.slug === catalogo.slug);
        if (vivo && i >= 0 && l[i + 1]) setSeguinte({ slug: l[i + 1].slug, nome: l[i + 1].nome });
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [catalogo.slug]);
  const proximo = useMemo(() => (seguinte ? { nome: seguinte.nome, abrir: () => router.push(`/c/${seguinte.slug}`) } : undefined), [seguinte, router]);
  const [inicio] = useState(() => paginaDoLink(paginas));
  const [pagina, setPagina] = useState(inicio);
  const [retrato, setRetrato] = useState(true);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [carrinho, setCarrinho] = useState(false);
  const [busca, setBusca] = useState(false);
  const [destacar, setDestacar] = useState(false);
  // Só admin e vendedora enxergam as áreas clicáveis; para o cliente a área é invisível (só aparece o selo 🛒).
  const { estado: acesso } = useAdmin();
  const equipe = acesso.tipo === "admin" || acesso.tipo === "vendedora";
  const [menu, setMenu] = useState(false);
  const [ajuda, setAjuda] = useState(false);
  const [aviso, setAviso] = useState("");

  const hotPorPagina = useMemo(() => {
    const m = new Map<string, Hotspot[]>();
    for (const h of hotspots) m.set(h.pagina_id, [...(m.get(h.pagina_id) ?? []), h]);
    return m;
  }, [hotspots]);

  useEffect(() => {
    track("abriu_catalogo");
  }, [track]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(""), 2500);
    return () => clearTimeout(t);
  }, [aviso]);

  const onPage = useCallback(
    (i: number) => {
      setPagina(i);
      const p = paginas[i];
      if (!p) return;
      track("viu_pagina", p.numero);
      // Mantém o link apontando para a página atual (para compartilhar).
      const url = new URL(window.location.href);
      if (i === 0) url.searchParams.delete("p");
      else url.searchParams.set("p", String(p.numero));
      window.history.replaceState(null, "", url);
    },
    [paginas, track],
  );

  function irParaNumero(numero: number) {
    const idx = paginas.findIndex((x) => x.numero === numero);
    if (idx >= 0) flipRef.current?.goTo(idx);
  }

  function clicar(h: Hotspot, p: Pagina) {
    const produto = produtos.find((x) => x.id === h.produto_id);
    if (h.tipo === "comprar" && produto) setSheet({ tipo: "produto", hotspotId: h.id, produtoId: produto.id, fotoReserva: imgUrl(p.imagem_path), variacaoId: h.variacao_id });
    else if (h.tipo === "foto") {
      track("clicou_foto", p.numero, produto?.id);
      setSheet({ tipo: "foto", src: imgUrl(produto?.foto_path || p.imagem_path), titulo: produto?.nome ?? `Página ${p.numero}` });
    } else if (h.tipo === "link" && h.url) window.open(h.url, "_blank", "noopener,noreferrer");
    else if (h.tipo === "pagina" && h.pagina_destino != null) irParaNumero(h.pagina_destino);
  }

  async function compartilhar() {
    // O ?v= (vendedora de quem está compartilhando) não vai junto: cada cliente fica com a vendedora do próprio link.
    const link = new URL(window.location.href);
    link.searchParams.delete("v");
    const url = link.toString();
    const title = catalogo.nome;
    try {
      if (navigator.share) {
        await navigator.share({ title, text: `Confira o catálogo ${title}`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setAviso("Link copiado!");
    } catch {
      /* usuário cancelou o compartilhamento */
    }
  }

  const rotulo: Record<Hotspot["tipo"], string> = { comprar: "Adicionar ao pedido", foto: "Ver foto", link: "Abrir link", pagina: "Ir para a página" };
  // Produtos oferecidos pelo carrinho tocado: um só, ou vários tamanhos/versões (hotspot_opcoes).
  const opcoesAbertas: OpcaoProduto[] = (() => {
    if (sheet?.tipo !== "produto") return [];
    const extras = data.opcoes.filter((o) => o.hotspot_id === sheet.hotspotId);
    const lista = extras.length ? extras.map((o) => ({ id: o.produto_id, rotulo: o.rotulo })) : [{ id: sheet.produtoId, rotulo: "" }];
    return lista.flatMap(({ id, rotulo }) => {
      const produto = produtos.find((x) => x.id === id);
      return produto ? [{ produto, rotulo, variacoes: variacoes.filter((v) => v.produto_id === id) }] : [];
    });
  })();
  const produtoAberto = opcoesAbertas[0]?.produto ?? null;
  const iconeBtn = "relative flex h-10 w-10 items-center justify-center rounded-full text-white transition hover:bg-white/15";
  const contador =
    !retrato && pagina > 0 && pagina + 1 < paginas.length ? `${pagina + 1}–${pagina + 2} / ${paginas.length}` : `${pagina + 1} / ${paginas.length}`;
  const fecharMenu = () => setMenu(false);
  const itemMenu = "flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-800 hover:bg-slate-100";

  return (
    <main className="flex h-dvh flex-col bg-white text-slate-900">
      <header className="relative z-30 grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center bg-marca-escuro px-2 text-white">
        <Link href="/" className="flex items-center gap-2 justify-self-start rounded-full p-1 hover:bg-white/10" aria-label="Todos os catálogos" title="Todos os catálogos">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="" className="h-8 w-8 rounded-full" />
          <span className="text-sm font-semibold">Início</span>
        </Link>
        <div className="flex items-center gap-1 sm:gap-3">
          <button onClick={compartilhar} className={iconeBtn} aria-label="Compartilhar">
            <Icone d="M18 8a3 3 0 100-6 3 3 0 000 6zM6 15a3 3 0 100-6 3 3 0 000 6zM18 22a3 3 0 100-6 3 3 0 000 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
          </button>
          <span className="min-w-16 text-center text-xs font-bold tabular-nums sm:text-sm" aria-live="polite" aria-label="Página atual">{contador}</span>
          <button
            onClick={() => {
              track("abriu_carrinho");
              setCarrinho(true);
            }}
            className={iconeBtn}
            aria-label={`Abrir pedido, ${totalItens} itens`}
          >
            <Icone d="M3 3h2l2.4 11.2a2 2 0 002 1.6h8.2a2 2 0 002-1.5L21 7H6M10 21a1 1 0 100-2 1 1 0 000 2zM18 21a1 1 0 100-2 1 1 0 000 2z" />
            {totalItens > 0 && (
              <span className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-destaque px-1.5 text-center text-xs font-bold leading-5 text-marca-escuro">
                {totalItens}
              </span>
            )}
          </button>
          <div className="relative">
            <button onClick={() => setMenu((v) => !v)} className={iconeBtn} aria-label="Menu" aria-expanded={menu}>
              <Icone d="M4 6h16M4 12h16M4 18h16" />
            </button>
            {menu && (
              <>
                <button aria-label="Fechar menu" className="fixed inset-0 z-40 cursor-default" onClick={fecharMenu} />
                <div className="absolute left-1/2 top-11 z-50 w-60 -translate-x-1/2 overflow-hidden rounded-xl bg-white py-1 shadow-xl ring-1 ring-black/10">
                  <Link href="/" className={itemMenu} onClick={fecharMenu}>📚 Todos os catálogos</Link>
                  <button className={itemMenu} onClick={() => { fecharMenu(); setAjuda(true); }}>❓ Como comprar</button>
                  <a className={itemMenu} href={`https://wa.me/${waNumero(catalogo.whatsapp)}`} target="_blank" rel="noopener" onClick={fecharMenu}>💬 Falar no WhatsApp</a>
                  {equipe && (
                    <button className={itemMenu} aria-pressed={destacar} onClick={() => { setDestacar((v) => !v); fecharMenu(); }}>
                      {destacar ? "☑" : "☐"} Mostrar áreas clicáveis
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        <button onClick={() => setBusca(true)} className={`${iconeBtn} justify-self-end`} aria-label="Buscar produto">
          <Icone d="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3" />
        </button>
      </header>

      <section className="relative min-h-0 flex-1 px-1 py-2 sm:py-4">
        <Paginas
          ref={flipRef}
          pages={paginas}
          startPage={inicio}
          onPage={onPage}
          onOrientation={setRetrato}
          proximo={proximo}
          overlay={(p) =>
            (hotPorPagina.get(p.id) ?? [])
              .filter((h) => h.tipo !== "comprar" || h.produto_id) // carrinho ainda sem produto (sendo editado no painel)
              .map((h) => (
              <button
                key={h.id}
                type="button"
                aria-label={rotulo[h.tipo]}
                title={equipe ? rotulo[h.tipo] : undefined}
                onClick={() => clicar(h, p)}
                style={{ left: `${h.x}%`, top: `${h.y}%`, width: `${h.w}%`, height: `${h.h}%` }}
                className={`group absolute cursor-pointer rounded-md border-2 focus-visible:outline-none ${
                  equipe
                    ? `transition hover:border-amber-400 hover:bg-amber-300/25 focus-visible:border-amber-400 ${destacar ? "border-amber-400 bg-amber-300/30" : "border-transparent"}`
                    : catalogo.mostrar_icones && h.tipo === "comprar"
                      ? "border-transparent" // o foco do teclado aparece no selo, não na caixa
                      : "border-transparent focus-visible:border-amber-400"
                }`}
              >
                {catalogo.mostrar_icones && h.tipo === "comprar" && <SeloCarrinho pulsar />}
              </button>
            ))
          }
        />
      </section>

      <button
        onClick={() => setAjuda((v) => !v)}
        aria-expanded={ajuda}
        className="fixed bottom-10 right-3 z-30 flex items-center gap-2 rounded-md bg-marca px-4 py-3 text-sm font-medium text-white shadow-lg hover:bg-marca-hover sm:right-4"
      >
        Como comprar <span aria-hidden className={`transition ${ajuda ? "rotate-180" : ""}`}>⌃</span>
      </button>
      {ajuda && <ComoComprar onClose={() => setAjuda(false)} />}

      {/* Celular: atalho para voltar à capa de qualquer página. */}
      {pagina > 0 && (
        <button
          onClick={() => flipRef.current?.goTo(0)}
          aria-label="Voltar ao início do catálogo"
          className="fixed bottom-10 left-3 z-30 flex items-center gap-1.5 rounded-full bg-marca-escuro px-4 py-3 text-sm font-medium text-white shadow-lg active:bg-marca-noite sm:hidden"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10" />
          </svg>
          Início
        </button>
      )}

      <footer className="shrink-0 truncate bg-marca-escuro px-3 py-1 text-center text-[11px] text-white/80">{catalogo.nome}</footer>

      {aviso && (
        <div role="status" className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-lg">
          {aviso}
        </div>
      )}

      {busca && (
        <BuscaProdutos
          data={data}
          onClose={() => setBusca(false)}
          onEscolher={(numero) => {
            setBusca(false);
            irParaNumero(numero);
          }}
        />
      )}

      {produtoAberto && (
        <ProductSheet
          key={`${sheet?.tipo === "produto" ? `${sheet.hotspotId}:${sheet.variacaoId}` : ""}`}
          opcoes={opcoesAbertas}
          inicial={Math.max(0, opcoesAbertas.findIndex((o) => sheet?.tipo === "produto" && o.produto.id === sheet.produtoId))}
          fotoReserva={sheet?.tipo === "produto" ? sheet.fotoReserva : undefined}
          variacaoInicial={sheet?.tipo === "produto" ? sheet.variacaoId : null}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet?.tipo === "foto" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" role="dialog" aria-modal="true" onClick={() => setSheet(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={sheet.src} alt={sheet.titulo} className="max-h-full max-w-full rounded-lg object-contain" />
          <button className="absolute right-4 top-4 rounded-full bg-white/15 p-2 px-3" aria-label="Fechar">✕</button>
        </div>
      )}

      {carrinho && <CartDrawer onClose={() => setCarrinho(false)} />}
    </main>
  );
}

/** Ignora acentos e caixa: "terco" encontra "Terço". */
const normalizar = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

function BuscaProdutos({ data, onClose, onEscolher }: { data: CatalogoCompleto; onClose: () => void; onEscolher: (numero: number) => void }) {
  const [q, setQ] = useState("");

  // Página de cada produto = página do primeiro hotspot que aponta para ele.
  const itens = useMemo(() => {
    const numeroPorPagina = new Map(data.paginas.map((p) => [p.id, p.numero]));
    const paginaDoProduto = new Map<string, number>();
    for (const h of data.hotspots) {
      const n = numeroPorPagina.get(h.pagina_id);
      if (h.produto_id && n != null && !paginaDoProduto.has(h.produto_id)) paginaDoProduto.set(h.produto_id, n);
    }
    // Tamanhos/versões extras de um carrinho também aparecem na busca, na página do carrinho.
    const paginaDoHotspot = new Map(data.hotspots.map((h) => [h.id, numeroPorPagina.get(h.pagina_id)]));
    for (const o of data.opcoes) {
      const n = paginaDoHotspot.get(o.hotspot_id);
      if (n != null && !paginaDoProduto.has(o.produto_id)) paginaDoProduto.set(o.produto_id, n);
    }
    return data.produtos
      .filter((p) => paginaDoProduto.has(p.id))
      .map((p) => ({ ...p, pagina: paginaDoProduto.get(p.id)!, chave: normalizar(`${p.codigo} ${p.nome} ${p.descricao ?? ""}`) }))
      .sort((a, b) => a.pagina - b.pagina);
  }, [data]);

  const termos = normalizar(q).split(/\s+/).filter(Boolean);
  const resultado = termos.length ? itens.filter((i) => termos.every((t) => i.chave.includes(t))) : itens;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 pt-[8dvh]" role="dialog" aria-modal="true">
      <button aria-label="Fechar" className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 flex max-h-[80dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white text-slate-900 shadow-2xl">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
          <span aria-hidden>🔍</span>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              // Enter abre a página do primeiro produto da lista.
              if (e.key === "Enter" && !e.nativeEvent.isComposing && resultado[0]) {
                e.preventDefault();
                onEscolher(resultado[0].pagina);
              }
            }}
            placeholder="Código ou nome do produto"
            className="flex-1 bg-transparent py-1 outline-none"
          />
          <button onClick={onClose} aria-label="Fechar" className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100">✕</button>
        </div>
        <ul className="overflow-y-auto">
          {resultado.map((i) => (
            <li key={i.id}>
              <button onClick={() => onEscolher(i.pagina)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50">
                <span>
                  <span className="block text-xs font-medium text-slate-500">{i.codigo}</span>
                  <span className="block text-sm">{i.nome}</span>
                </span>
                <span className="shrink-0 text-xs text-slate-500">pág. {i.pagina}</span>
              </button>
            </li>
          ))}
          {resultado.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-500">Nenhum produto encontrado.</li>}
        </ul>
      </div>
    </div>
  );
}

function Icone({ d }: { d: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

const PASSOS = [
  ["Escolha", "Folheie o catálogo com as setas ou deslize para o lado. Toque no 🛒 em cima do produto que quiser."],
  ["Personalize", "Na janela do produto, escolha o santo, a cor ou o tamanho. A foto muda conforme a sua escolha."],
  ["Quantidade", "A quantidade anda de acordo com o mínimo de cada produto (ex.: de 6 em 6). “Livre” quer dizer de 1 em 1."],
  ["Adicione", "Toque em “Adicionar ao pedido”. Você pode continuar folheando e escolhendo outros produtos."],
  ["Envie", "Abra o carrinho na barra de cima, confira os itens, informe seu nome e WhatsApp e envie. O pedido chega para nós pelo WhatsApp, com um PDF."],
];

function ComoComprar({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed bottom-[5.5rem] right-3 z-30 flex max-h-[70dvh] w-[min(22rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl bg-white text-slate-900 shadow-2xl ring-1 ring-black/10 sm:right-4" role="region" aria-label="Como comprar">
      <div className="flex items-center justify-between bg-marca px-4 py-2.5 text-white">
        <h2 className="text-sm font-semibold">Como comprar</h2>
        <button onClick={onClose} aria-label="Fechar" className="rounded-full px-2 hover:bg-white/15">✕</button>
      </div>
      <ol className="space-y-3 overflow-y-auto p-4 text-sm">
        {PASSOS.map(([titulo, texto], i) => (
          <li key={titulo} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-marca-escuro text-xs font-bold text-white">{i + 1}</span>
            <span>
              <strong>{titulo}.</strong> <span className="text-slate-600">{texto}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
