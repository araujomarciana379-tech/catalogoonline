"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { emLotes } from "@/lib/catalogo-data";
import { imgUrl, thumbUrl } from "@/lib/format";
import { BuscaProduto, type ProdutoResumo } from "./BuscaProduto";
import { ImportarListaCatalogo } from "./ImportarListaCatalogo";
import { SeloCarrinho } from "../SeloCarrinho";

type Area = {
  id: string;
  pagina_id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  tipo: string;
  produto_id: string | null;
  variacao_id: string | null;
};
type Pagina = { id: string; numero: number; imagem_path: string };
type Var = { id: string; produto_id: string; rotulo: string; codigo: string | null };
type Opcao = { hotspot_id: string; produto_id: string; rotulo: string; ordem: number };

/** Rótulo sugerido para cada tamanho/versão: as palavras do nome que não são comuns a todos (Pequeno / Grande). */
function sugerirRotulos(nomes: string[]): string[] {
  const palavras = nomes.map((n) => n.split(/\s+/));
  const comuns = new Set(palavras[0].filter((w) => palavras.every((ps) => ps.includes(w))));
  return palavras.map((ps, i) => ps.filter((w) => !comuns.has(w)).join(" ") || `Opção ${i + 1}`);
}
type Arrasto =
  | { modo: "mover"; id: string; px: number; py: number; orig: Area }
  | { modo: "redim"; id: string; canto: "nw" | "ne" | "sw" | "se"; px: number; py: number; orig: Area }
  | { modo: "desenhar"; x0: number; y0: number; x1: number; y1: number };

const TAM_PADRAO = { w: 22, h: 9 }; // carrinho solto da bandeja (em % da página)
const r1 = (n: number) => Math.round(n * 10) / 10;
const limitar = (a: Area): Area => {
  const w = Math.min(Math.max(a.w, 2), 100);
  const h = Math.min(Math.max(a.h, 1.5), 100);
  return { ...a, w: r1(w), h: r1(h), x: r1(Math.min(Math.max(a.x, 0), 100 - w)), y: r1(Math.min(Math.max(a.y, 0), 100 - h)) };
};

export function Editor({ slug }: { slug: string }) {
  const [catalogo, setCatalogo] = useState<{ id: string; nome: string; ativo: boolean; mostrar_icones: boolean } | null>(null);
  const [verCliente, setVerCliente] = useState(false);
  const [tela, setTela] = useState<"ajustada" | "celular" | "computador">("ajustada");
  const [paginas, setPaginas] = useState<Pagina[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [produtos, setProdutos] = useState<Map<string, ProdutoResumo>>(new Map());
  const [vars, setVars] = useState<Map<string, Var[]>>(new Map());
  const [doCatalogo, setDoCatalogo] = useState<Set<string>>(new Set());
  const [opcoes, setOpcoes] = useState<Opcao[]>([]);
  const [addOpcao, setAddOpcao] = useState(false);
  const [idx, setIdx] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const [arrasto, setArrasto] = useState<Arrasto | null>(null);
  const [status, setStatus] = useState<{ tipo: "ok" | "salvando" | "erro"; texto: string }>({ tipo: "ok", texto: "Tudo salvo" });
  const [erroCarga, setErroCarga] = useState("");
  const [desfazer, setDesfazer] = useState<Area | null>(null);
  const [proporcao, setProporcao] = useState(595 / 842); // atualizada pela imagem real da página

  // ── Carga ──
  const carregarProdutos = useCallback(async (ids: string[]) => {
    const faltam = ids.filter((id) => !produtos.has(id));
    if (!faltam.length) return;
    const [ps, vs] = await Promise.all([
      emLotes(faltam, (l) => supabase.from("produtos").select("id, codigo, nome, foto_path").in("id", l)),
      emLotes(faltam, (l) => supabase.from("variacoes").select("id, produto_id, rotulo, codigo").in("produto_id", l).eq("ativo", true).order("ordem")),
    ]);
    setProdutos((m) => new Map([...m, ...(ps as ProdutoResumo[]).map((p) => [p.id, p] as const)]));
    setVars((m) => {
      const n = new Map(m);
      for (const v of vs as Var[]) n.set(v.produto_id, [...(n.get(v.produto_id) ?? []), v]);
      return n;
    });
  }, [produtos]);

  useEffect(() => {
    (async () => {
      const { data: c, error } = await supabase.from("catalogos").select("id, nome, ativo, mostrar_icones").eq("slug", slug).maybeSingle();
      if (error || !c) return setErroCarga(error?.message ?? "Catálogo não encontrado.");
      setCatalogo(c);
      const { data: pgs } = await supabase.from("paginas").select("id, numero, imagem_path").eq("catalogo_id", c.id).order("numero");
      const pags = (pgs ?? []) as Pagina[];
      setPaginas(pags);
      const hs = (await emLotes(pags.map((p) => p.id), (l) =>
        supabase.from("hotspots").select("id, pagina_id, x, y, w, h, tipo, produto_id, variacao_id").in("pagina_id", l),
      )) as Area[];
      setAreas(hs.map((h) => ({ ...h, x: +h.x, y: +h.y, w: +h.w, h: +h.h })));
      const ops = (await emLotes(hs.map((h) => h.id), (l) => supabase.from("hotspot_opcoes").select("hotspot_id, produto_id, rotulo, ordem").in("hotspot_id", l))) as Opcao[];
      setOpcoes(ops);
      const { data: cp } = await supabase.from("catalogo_produtos").select("produto_id").eq("catalogo_id", c.id).limit(5000);
      const ids = new Set((cp ?? []).map((r) => r.produto_id as string));
      setDoCatalogo(ids);
      await carregarProdutos([...new Set([...hs.map((h) => h.produto_id).filter((x): x is string => !!x), ...ops.map((o) => o.produto_id), ...ids])]);
      const p = Number(new URLSearchParams(window.location.search).get("p"));
      if (p) setIdx(Math.max(0, pags.findIndex((x) => x.numero === p)));
    })().catch((e) => setErroCarga(String(e?.message ?? e)));
    // carregarProdutos muda a cada carga; a carga inicial roda uma vez por catálogo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const pagina = paginas[idx];
  const daPagina = useMemo(() => areas.filter((a) => a.pagina_id === pagina?.id), [areas, pagina]);
  const selecionada = areas.find((a) => a.id === sel) ?? null;
  const [selAnterior, setSelAnterior] = useState(sel);
  if (selAnterior !== sel) {
    setSelAnterior(sel);
    setAddOpcao(false);
  }
  const posicionados = useMemo(() => new Set([...areas.map((a) => a.produto_id), ...opcoes.map((o) => o.produto_id)].filter(Boolean)), [areas, opcoes]);
  const bandeja = useMemo(
    () => [...doCatalogo].filter((id) => !posicionados.has(id)).map((id) => produtos.get(id)).filter((p): p is ProdutoResumo => !!p).sort((a, b) => a.codigo.localeCompare(b.codigo)),
    [doCatalogo, posicionados, produtos],
  );

  // ── Gravação ──
  async function salvar<T>(acao: () => PromiseLike<{ error: { message: string } | null; data?: T | null }>, ok = "Salvo") {
    setStatus({ tipo: "salvando", texto: "Salvando…" });
    const { error, data } = await acao();
    if (error) {
      setStatus({ tipo: "erro", texto: `Erro ao salvar: ${error.message}` });
      return null;
    }
    setStatus({ tipo: "ok", texto: ok });
    return (data ?? true) as T | true;
  }

  async function ligarAoCatalogo(produtoId: string) {
    if (!catalogo || doCatalogo.has(produtoId)) return;
    setDoCatalogo((s) => new Set(s).add(produtoId));
    await supabase.from("catalogo_produtos").upsert({ catalogo_id: catalogo.id, produto_id: produtoId }, { onConflict: "catalogo_id,produto_id", ignoreDuplicates: true });
  }

  async function criar(base: Omit<Area, "id" | "pagina_id" | "tipo">) {
    if (!pagina) return;
    const nova = limitar({ ...base, id: "", pagina_id: pagina.id, tipo: "comprar" });
    const r = await salvar<Area>(() =>
      supabase.from("hotspots").insert({ pagina_id: nova.pagina_id, tipo: "comprar", x: nova.x, y: nova.y, w: nova.w, h: nova.h, produto_id: nova.produto_id, variacao_id: nova.variacao_id }).select("id, pagina_id, x, y, w, h, tipo, produto_id, variacao_id").single(),
      "Carrinho criado",
    );
    if (r && r !== true) {
      const a = { ...r, x: +r.x, y: +r.y, w: +r.w, h: +r.h };
      setAreas((as) => [...as, a]);
      setSel(a.id);
      if (a.produto_id) void ligarAoCatalogo(a.produto_id);
      return a;
    }
    return null;
  }

  async function atualizar(id: string, mud: Partial<Area>) {
    setAreas((as) => as.map((a) => (a.id === id ? { ...a, ...mud } : a)));
    await salvar(() => supabase.from("hotspots").update(mud).eq("id", id));
    if (mud.produto_id) void ligarAoCatalogo(mud.produto_id);
  }

  async function remover(id: string) {
    const a = areas.find((x) => x.id === id);
    if (!a) return;
    setAreas((as) => as.filter((x) => x.id !== id));
    setSel(null);
    const ok = await salvar(() => supabase.from("hotspots").delete().eq("id", id), "Carrinho removido");
    if (ok) setDesfazer(a);
  }

  async function restaurar() {
    if (!desfazer) return;
    const a = desfazer;
    setDesfazer(null);
    const i = paginas.findIndex((p) => p.id === a.pagina_id);
    if (i >= 0) setIdx(i);
    await criar({ x: a.x, y: a.y, w: a.w, h: a.h, produto_id: a.produto_id, variacao_id: a.variacao_id });
  }

  async function duplicar(a: Area) {
    const nova = await criar({ x: a.x + 2, y: a.y + 2, w: a.w, h: a.h, produto_id: a.produto_id, variacao_id: a.variacao_id });
    const ops = opcoes.filter((o) => o.hotspot_id === a.id);
    if (!nova || !ops.length) return;
    const linhas = ops.map((o) => ({ ...o, hotspot_id: nova.id }));
    setOpcoes((os) => [...os, ...linhas]);
    await salvar(() => supabase.from("hotspot_opcoes").insert(linhas), "Carrinho duplicado");
  }

  // ── Tamanhos / versões no mesmo carrinho ──
  const opcoesDe = (id: string) => opcoes.filter((o) => o.hotspot_id === id).sort((a, b) => a.ordem - b.ordem);

  async function adicionarOpcao(a: Area, novo: ProdutoResumo) {
    if (!a.produto_id || novo.id === a.produto_id) return;
    const atuais = opcoesDe(a.id);
    const ids = atuais.length ? atuais.map((o) => o.produto_id) : [a.produto_id];
    if (ids.includes(novo.id)) return;
    const todos = [...ids, novo.id];
    const nomes = todos.map((id) => (id === novo.id ? novo.nome : (produtos.get(id)?.nome ?? "")));
    const sug = sugerirRotulos(nomes);
    // Mantém rótulos já editados; sugere para os novos.
    const linhas = todos.map((produto_id, ordem) => ({
      hotspot_id: a.id,
      produto_id,
      ordem,
      rotulo: atuais.find((o) => o.produto_id === produto_id)?.rotulo ?? sug[ordem],
    }));
    setOpcoes((os) => [...os.filter((o) => o.hotspot_id !== a.id), ...linhas]);
    await salvar(() => supabase.from("hotspot_opcoes").upsert(linhas, { onConflict: "hotspot_id,produto_id" }), "Tamanho adicionado");
    void ligarAoCatalogo(novo.id);
  }

  async function renomearOpcao(o: Opcao, rotulo: string) {
    const r = rotulo.trim();
    if (!r || r === o.rotulo) return;
    setOpcoes((os) => os.map((x) => (x.hotspot_id === o.hotspot_id && x.produto_id === o.produto_id ? { ...x, rotulo: r } : x)));
    await salvar(() => supabase.from("hotspot_opcoes").update({ rotulo: r }).eq("hotspot_id", o.hotspot_id).eq("produto_id", o.produto_id));
  }

  async function removerOpcao(a: Area, o: Opcao) {
    const resto = opcoesDe(a.id).filter((x) => x.produto_id !== o.produto_id);
    if (resto.length <= 1) {
      // Sobrou um produto só: volta a ser um carrinho simples.
      setOpcoes((os) => os.filter((x) => x.hotspot_id !== a.id));
      await salvar(() => supabase.from("hotspot_opcoes").delete().eq("hotspot_id", a.id), "Tamanho removido");
      if (resto[0] && resto[0].produto_id !== a.produto_id) await atualizar(a.id, { produto_id: resto[0].produto_id, variacao_id: null });
      return;
    }
    setOpcoes((os) => os.filter((x) => !(x.hotspot_id === a.id && x.produto_id === o.produto_id)));
    await salvar(() => supabase.from("hotspot_opcoes").delete().eq("hotspot_id", a.id).eq("produto_id", o.produto_id), "Tamanho removido");
    if (o.produto_id === a.produto_id) await atualizar(a.id, { produto_id: resto[0].produto_id, variacao_id: null });
  }

  // ── Arrastar / redimensionar / desenhar ──
  // Posição do ponteiro em % da página (a folha é localizada pelo atributo, só dentro de eventos).
  const emPct = (e: { clientX: number; clientY: number }) => {
    const r = document.querySelector("[data-folha]")!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
  };

  useEffect(() => {
    if (!arrasto) return;
    const mover = (e: PointerEvent) => {
      const p = emPct(e);
      if (arrasto.modo === "desenhar") return setArrasto({ ...arrasto, x1: p.x, y1: p.y });
      const dx = p.x - arrasto.px;
      const dy = p.y - arrasto.py;
      const o = arrasto.orig;
      let n: Area;
      if (arrasto.modo === "mover") n = { ...o, x: o.x + dx, y: o.y + dy };
      else {
        const c = arrasto.canto;
        const x = c.includes("w") ? o.x + dx : o.x;
        const y = c.includes("n") ? o.y + dy : o.y;
        const w = c.includes("w") ? o.w - dx : o.w + dx;
        const h = c.includes("n") ? o.h - dy : o.h + dy;
        n = { ...o, x, y, w, h };
      }
      const l = limitar(n);
      setAreas((as) => as.map((a) => (a.id === l.id ? l : a)));
    };
    const soltar = () => {
      if (arrasto.modo === "desenhar") {
        const x = Math.min(arrasto.x0, arrasto.x1), y = Math.min(arrasto.y0, arrasto.y1);
        const w = Math.abs(arrasto.x1 - arrasto.x0), h = Math.abs(arrasto.y1 - arrasto.y0);
        if (w > 1.5 && h > 1) void criar({ x, y, w, h, produto_id: null, variacao_id: null });
      } else {
        const a = areas.find((x) => x.id === arrasto.id);
        const o = arrasto.orig;
        if (a && (a.x !== o.x || a.y !== o.y || a.w !== o.w || a.h !== o.h)) void atualizar(a.id, { x: a.x, y: a.y, w: a.w, h: a.h });
      }
      setArrasto(null);
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    return () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
    };
    // criar/atualizar leem o estado atual; o efeito é refeito a cada mudança do arrasto
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrasto, areas]);

  // Teclado: Delete remove, Ctrl+D duplica, setas ajustam, PageUp/PageDown trocam de página.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.key === "PageDown") return setIdx((i) => Math.min(i + 1, paginas.length - 1));
      if (e.key === "PageUp") return setIdx((i) => Math.max(i - 1, 0));
      if (e.key.toLowerCase() === "v" && !e.ctrlKey && !e.metaKey && !e.altKey) return setVerCliente((v) => !v);
      if (e.key.toLowerCase() === "c" && !e.ctrlKey && !e.metaKey && !e.altKey) return setTela((t) => (t === "ajustada" ? "celular" : t === "celular" ? "computador" : "ajustada"));
      if (!selecionada) return;
      if (e.key === "Delete" || e.key === "Backspace") return void remover(selecionada.id);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        return void duplicar(selecionada);
      }
      const passo = e.shiftKey ? 1 : 0.2;
      const d = { ArrowLeft: [-passo, 0], ArrowRight: [passo, 0], ArrowUp: [0, -passo], ArrowDown: [0, passo] }[e.key];
      if (d) {
        e.preventDefault();
        const l = limitar({ ...selecionada, x: selecionada.x + d[0], y: selecionada.y + d[1] });
        void atualizar(l.id, { x: l.x, y: l.y });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (erroCarga) return <main className="p-8 text-red-700">Não foi possível abrir o editor: {erroCarga}</main>;
  if (!catalogo || !pagina) return <main className="p-8 text-slate-600">Carregando editor…</main>;

  const prodSel = selecionada?.produto_id ? produtos.get(selecionada.produto_id) : null;
  const varsSel = selecionada?.produto_id ? (vars.get(selecionada.produto_id) ?? []) : [];
  const desenho = arrasto?.modo === "desenhar" ? arrasto : null;

  return (
    <div className="flex h-dvh flex-col bg-slate-200 text-slate-900">
      <header className="flex items-center gap-3 border-b border-slate-300 bg-white px-4 py-2">
        <Link href="/admin/catalogos" className="text-sm text-marca underline">← Catálogos</Link>
        <h1 className="font-semibold">{catalogo.nome}</h1>
        {!catalogo.ativo && <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">oculto</span>}
        <div className="ml-4 flex items-center gap-1">
          <button onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0} className="rounded px-2 py-1 hover:bg-slate-100 disabled:opacity-30" aria-label="Página anterior">‹</button>
          <span className="text-sm">
            Página{" "}
            <input
              key={pagina.numero}
              defaultValue={pagina.numero}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                const i = paginas.findIndex((p) => p.numero === Number(e.currentTarget.value));
                if (i >= 0) setIdx(i);
              }}
              className="w-12 rounded border border-slate-300 px-1 text-center"
              aria-label="Ir para a página"
            />{" "}
            de {paginas.length}
          </span>
          <button onClick={() => setIdx((i) => Math.min(paginas.length - 1, i + 1))} disabled={idx === paginas.length - 1} className="rounded px-2 py-1 hover:bg-slate-100 disabled:opacity-30" aria-label="Próxima página">›</button>
        </div>
        <span className="text-xs text-slate-500">{daPagina.length} carrinho(s) nesta página</span>
        <button
          onClick={() => setVerCliente((v) => !v)}
          aria-pressed={verCliente}
          title="Esconde as caixas e mostra só os carrinhos, como o cliente vê (atalho: V)"
          className={`rounded border px-2 py-1 text-sm ${verCliente ? "border-marca bg-marca text-white" : "border-slate-300 hover:bg-slate-100"}`}
        >
          👁 Ver como cliente
        </button>
        <div className="flex overflow-hidden rounded border border-slate-300 text-sm" role="group" aria-label="Tamanho da tela" title="Mostra a página no tamanho que o cliente vê (atalho: C)">
          {([["ajustada", "Ajustada"], ["celular", "📱 Celular"], ["computador", "🖥 Computador"]] as const).map(([v, r]) => (
            <button key={v} onClick={() => setTela(v)} aria-pressed={tela === v} className={`px-2 py-1 ${tela === v ? "bg-marca text-white" : "hover:bg-slate-100"}`}>{r}</button>
          ))}
        </div>
        {!catalogo.mostrar_icones && <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800" title="O PDF já tem o ícone de carrinho desenhado; o selo não aparece para o cliente">selo 🛒 desligado neste catálogo</span>}
        <a href={`/c/${slug}?p=${pagina.numero}`} target="_blank" rel="noopener" className="text-sm text-marca underline">Abrir página ↗</a>
        <span role="status" className={`ml-auto text-sm ${status.tipo === "erro" ? "text-red-600" : status.tipo === "salvando" ? "text-amber-700" : "text-emerald-700"}`}>
          {status.texto}
        </span>
        {desfazer && <button onClick={() => void restaurar()} className="rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-100">Desfazer remoção</button>}
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Página */}
        <section className="flex min-w-0 flex-1 overflow-auto p-4">
          <div
            data-folha
            className={`relative m-auto select-none bg-white shadow-xl ${tela === "ajustada" ? "h-full max-h-full" : "shrink-0"} ${verCliente ? "overflow-hidden" : ""}`}
            style={{
              aspectRatio: String(proporcao),
              ...(tela === "celular" ? { width: 382 } : tela === "computador" ? { height: 800 } : {}), // 382 px = celular de 390 px menos a margem do visualizador
              containerType: "inline-size",
              cursor: verCliente ? "default" : "crosshair",
              touchAction: "none",
            }}
            onPointerDown={(e) => {
              if (verCliente) return;
              if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.fundo) return;
              const p = emPct(e);
              setSel(null);
              setArrasto({ modo: "desenhar", x0: p.x, y0: p.y, x1: p.x, y1: p.y });
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              const id = e.dataTransfer.getData("text/produto");
              if (!id || verCliente) return;
              const p = emPct(e);
              void criar({ x: p.x - TAM_PADRAO.w / 2, y: p.y - TAM_PADRAO.h / 2, ...TAM_PADRAO, produto_id: id, variacao_id: null });
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img data-fundo="1" src={imgUrl(pagina.imagem_path)} alt={`Página ${pagina.numero}`} draggable={false} onLoad={(e) => setProporcao(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)} className="absolute inset-0 h-full w-full object-fill" />
            {daPagina.map((a) => {
              const p = a.produto_id ? produtos.get(a.produto_id) : null;
              const ativo = a.id === sel;
              const v = a.variacao_id ? vars.get(a.produto_id ?? "")?.find((x) => x.id === a.variacao_id) : null;
              // Como o cliente: área invisível, só o selo 🛒 (e só em carrinho que já tem produto).
              if (verCliente)
                return (
                  <div key={a.id} className="pointer-events-none absolute rounded-md border-2 border-transparent" style={{ left: `${a.x}%`, top: `${a.y}%`, width: `${a.w}%`, height: `${a.h}%` }}>
                    {catalogo.mostrar_icones && a.produto_id && <SeloCarrinho pulsar />}
                  </div>
                );
              return (
                <div
                  key={a.id}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setSel(a.id);
                    const pt = emPct(e);
                    setArrasto({ modo: "mover", id: a.id, px: pt.x, py: pt.y, orig: a });
                  }}
                  style={{ left: `${a.x}%`, top: `${a.y}%`, width: `${a.w}%`, height: `${a.h}%`, cursor: "move" }}
                  className={`absolute rounded border-2 ${ativo ? "z-10 border-blue-600 bg-blue-500/10" : p ? "border-amber-500/80 bg-amber-300/10 hover:bg-amber-300/25" : "border-red-600 bg-red-500/15"}`}
                  title={p ? `${p.codigo} – ${p.nome}` : "Sem produto (o cliente não vê este carrinho)"}
                >
                  <span className={`pointer-events-none absolute left-0 top-0 max-w-[calc(100%-1.5rem)] -translate-y-full truncate rounded-t px-1 text-[10px] font-semibold text-white ${ativo ? "bg-blue-600" : p ? "bg-amber-600" : "bg-red-600"}`}>
                    {p ? p.codigo : "sem produto"}{opcoes.some((o) => o.hotspot_id === a.id) ? ` +${opcoes.filter((o) => o.hotspot_id === a.id).length - 1} tam.` : ""}{v ? ` · ${v.rotulo}` : ""}
                  </span>
                  <SeloCarrinho estado={p ? "ok" : "sem-produto"} interativo />
                  {ativo &&
                    (["nw", "ne", "sw", "se"] as const).map((c) => (
                      <span
                        key={c}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          const pt = emPct(e);
                          setArrasto({ modo: "redim", id: a.id, canto: c, px: pt.x, py: pt.y, orig: a });
                        }}
                        className="absolute h-3 w-3 rounded-sm border border-white bg-blue-600"
                        style={{ [c.includes("n") ? "top" : "bottom"]: -6, [c.includes("w") ? "left" : "right"]: -6, cursor: `${c}-resize` }}
                      />
                    ))}
                </div>
              );
            })}
            {desenho && (
              <div
                className="pointer-events-none absolute border-2 border-dashed border-blue-600 bg-blue-500/10"
                style={{ left: `${Math.min(desenho.x0, desenho.x1)}%`, top: `${Math.min(desenho.y0, desenho.y1)}%`, width: `${Math.abs(desenho.x1 - desenho.x0)}%`, height: `${Math.abs(desenho.y1 - desenho.y0)}%` }}
              />
            )}
          </div>
        </section>

        {/* Painel lateral */}
        <aside className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-slate-300 bg-white p-4">
          {selecionada ? (
            <div className="space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Carrinho selecionado</h2>
              {prodSel ? (
                <div className="flex gap-2">
                  {prodSel.foto_path ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbUrl(prodSel.foto_path)} alt="" className="h-14 w-14 rounded border object-cover" />
                  ) : (
                    <div className="h-14 w-14 rounded bg-slate-100" />
                  )}
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold">{prodSel.codigo}</p>
                    <p className="text-slate-600">{prodSel.nome}</p>
                  </div>
                </div>
              ) : (
                <p className="rounded bg-red-50 p-2 text-sm text-red-700">Escolha o produto deste carrinho:</p>
              )}
              {opcoesDe(selecionada.id).length <= 1 && <BuscaProduto
                rotulo={prodSel ? "Trocar produto" : "Buscar produto"}
                onEscolher={async (p) => {
                  setProdutos((m) => new Map(m).set(p.id, p));
                  await carregarProdutos([p.id]);
                  void atualizar(selecionada.id, { produto_id: p.id, variacao_id: null });
                }}
              />}
              {prodSel && (
                <div className="space-y-1.5 rounded border border-slate-200 p-2">
                  <p className="text-sm font-medium">Tamanhos / versões neste carrinho</p>
                  {opcoesDe(selecionada.id).length > 1 ? (
                    <ul className="space-y-1">
                      {opcoesDe(selecionada.id).map((o) => (
                        <li key={o.produto_id} className="flex items-center gap-1 text-xs">
                          <input
                            defaultValue={o.rotulo}
                            onBlur={(e) => void renomearOpcao(o, e.target.value)}
                            className="w-24 rounded border border-slate-300 px-1 py-0.5"
                            aria-label="Nome da opção"
                          />
                          <span className="min-w-0 flex-1 truncate text-slate-600">{produtos.get(o.produto_id)?.codigo}</span>
                          <button onClick={() => void removerOpcao(selecionada, o)} className="px-1 text-red-600" aria-label="Remover tamanho">✕</button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-500">Só este produto. Adicione outro para o cliente escolher o tamanho (ex.: Pequeno / Grande).</p>
                  )}
                  {addOpcao ? (
                    <BuscaProduto
                      rotulo="Outro tamanho"
                      onEscolher={async (p) => {
                        setAddOpcao(false);
                        setProdutos((m) => new Map(m).set(p.id, p));
                        await carregarProdutos([p.id]);
                        await adicionarOpcao(selecionada, p);
                      }}
                    />
                  ) : (
                    <button onClick={() => setAddOpcao(true)} className="w-full rounded border border-dashed border-slate-400 py-1 text-xs hover:bg-slate-50">
                      + Adicionar outro tamanho / versão
                    </button>
                  )}
                </div>
              )}
              {varsSel.length > 0 && (
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">Abrir já com a variação</span>
                  <select
                    value={selecionada.variacao_id ?? ""}
                    onChange={(e) => void atualizar(selecionada.id, { variacao_id: e.target.value || null })}
                    className="w-full rounded border border-slate-300 px-2 py-1.5"
                  >
                    <option value="">Nenhuma (o cliente escolhe)</option>
                    {varsSel.map((v) => (
                      <option key={v.id} value={v.id}>{v.rotulo}{v.codigo ? ` (${v.codigo})` : ""}</option>
                    ))}
                  </select>
                </label>
              )}
              <div className="flex gap-2">
                <button onClick={() => void duplicar(selecionada)} className="flex-1 rounded border border-slate-300 py-1.5 text-sm hover:bg-slate-50">Duplicar</button>
                <button onClick={() => void remover(selecionada.id)} className="flex-1 rounded border border-red-300 py-1.5 text-sm text-red-700 hover:bg-red-50">Remover</button>
              </div>
            </div>
          ) : (
            <div className="space-y-1 rounded bg-slate-50 p-3 text-xs text-slate-600">
              <p className="font-semibold text-slate-800">Como usar</p>
              <p>• O 🛒 mostra onde o botão aparece para o cliente: arraste a caixa (ou o próprio 🛒) para mover e puxe os cantos para redimensionar. Tecla V ou “Ver como cliente” mostra só os carrinhos; “Celular”/“Computador” (tecla C) mostram a página no tamanho real que o cliente vê.</p>
              <p>• Arraste num espaço vazio da página para criar um carrinho.</p>
              <p>• Arraste um produto da lista abaixo até a página.</p>
              <p>• Teclas: Delete remove · Ctrl+D duplica · setas ajustam · PageUp/PageDown trocam a página.</p>
            </div>
          )}

          <div className="min-h-0 space-y-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Não posicionados ({bandeja.length})</h2>
            <p className="text-xs text-slate-500">Produtos deste catálogo que ainda não têm carrinho em nenhuma página.</p>
            <ImportarListaCatalogo
              catalogoId={catalogo.id}
              onImportado={async (ids) => {
                setDoCatalogo((s) => new Set([...s, ...ids]));
                await carregarProdutos(ids);
              }}
            />
            <ul className="space-y-1">
              {bandeja.map((p) => (
                <li
                  key={p.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/produto", p.id)}
                  className="flex cursor-grab items-center gap-2 rounded border border-slate-200 p-1.5 text-xs hover:border-amber-500 active:cursor-grabbing"
                  title="Arraste até a página"
                >
                  {p.foto_path ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbUrl(p.foto_path)} alt="" className="h-8 w-8 rounded object-cover" />
                  ) : (
                    <span className="h-8 w-8 rounded bg-slate-100" />
                  )}
                  <span className="min-w-0">
                    <span className="block font-semibold">{p.codigo}</span>
                    <span className="block truncate text-slate-600">{p.nome}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
