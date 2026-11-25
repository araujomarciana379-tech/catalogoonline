"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import type { Pagina } from "@/lib/types";
import { imgUrl } from "@/lib/format";

export type PaginasHandle = { goTo: (index: number) => void; next: () => void; prev: () => void };

type Props = {
  pages: Pagina[];
  /** Conteúdo desenhado por cima de cada página (áreas clicáveis). */
  overlay?: (p: Pagina) => ReactNode;
  /** Índice da página atual (no modo duas páginas, a da esquerda). */
  onPage?: (index: number) => void;
  /** Índice inicial (0 = capa). Lido só na montagem. */
  startPage?: number;
  /** true = uma página por vez (celular); false = duas páginas lado a lado. */
  onOrientation?: (retrato: boolean) => void;
  /** Catálogo seguinte: na última página, passar a página (ou tocar no botão) abre ele. */
  proximo?: { nome: string; abrir: () => void };
};

const RAZAO = 595 / 842; // A4 em pé

/** No modo duas páginas a capa fica sozinha e depois vêm os pares (2-3, 4-5…): o índice vira o da esquerda. */
const inicioDoPar = (i: number) => (i <= 0 ? 0 : i % 2 === 1 ? i : i - 1);

export const Paginas = forwardRef<PaginasHandle, Props>(function Paginas({ pages, overlay, onPage, startPage = 0, onOrientation, proximo }, ref) {
  const caixaRef = useRef<HTMLDivElement>(null);
  const [tam, setTam] = useState({ w: 0, h: 0 });
  const duplo = tam.w >= 700 && tam.w > tam.h * RAZAO * 1.6;
  const [atual, setAtual] = useState(() => Math.max(0, Math.min(startPage, pages.length - 1)));
  const [direcao, setDirecao] = useState<1 | -1>(1);
  const n = pages.length;

  // Tamanho disponível (a página se ajusta à tela sem cortar).
  useEffect(() => {
    const el = caixaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setTam({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const indice = duplo ? inicioDoPar(atual) : atual;

  useEffect(() => {
    onOrientation?.(!duplo);
  }, [duplo, onOrientation]);
  useEffect(() => {
    onPage?.(indice);
  }, [indice, onPage]);

  const ir = useCallback(
    (alvo: number) => {
      const i = Math.max(0, Math.min(alvo, n - 1));
      setDirecao(i >= indice ? 1 : -1);
      setAtual(duplo ? inicioDoPar(i) : i);
    },
    [n, indice, duplo],
  );
  const proxima = useCallback(() => {
    const alvo = duplo ? (indice === 0 ? 1 : indice + 2) : indice + 1;
    if (alvo < n) ir(alvo);
  }, [duplo, indice, n, ir]);
  const anterior = useCallback(() => {
    if (indice > 0) ir(duplo ? (indice <= 1 ? 0 : indice - 2) : indice - 1);
  }, [duplo, indice, ir]);

  useImperativeHandle(ref, () => ({ goTo: ir, next: proxima, prev: anterior }), [ir, proxima, anterior]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (document.querySelector("[role=dialog]")) return; // janela aberta: as setas não mudam a página
      if (e.key === "ArrowRight") proxima();
      if (e.key === "ArrowLeft") anterior();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [proxima, anterior]);

  // Arrastar para o lado (celular). Só conta se o gesto for mais horizontal que vertical.
  const toque = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => (toque.current = { x: e.touches[0].clientX, y: e.touches[0].clientY });
  const onTouchEnd = (e: React.TouchEvent) => {
    const t = toque.current;
    toque.current = null;
    if (!t) return;
    const dx = e.changedTouches[0].clientX - t.x;
    const dy = e.changedTouches[0].clientY - t.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx > 0) anterior();
      else if (podeAvancar) proxima();
      else proximo?.abrir(); // arrastou além da última página: abre o catálogo seguinte
    }
  };

  const visiveis = duplo && indice > 0 ? [indice, indice + 1].filter((i) => i < n) : [indice];
  // Maior página que cabe: limitada pela altura e pela largura disponível.
  const altura = Math.max(0, Math.min(tam.h, tam.w / (RAZAO * visiveis.length)));
  const largura = altura * RAZAO;

  // Pré-carrega as vizinhas para a troca ser instantânea.
  const vizinhas = [indice - 2, indice - 1, indice + 1, indice + 2, indice + 3].filter((i) => i >= 0 && i < n && !visiveis.includes(i));

  const podeVoltar = indice > 0;
  const podeAvancar = duplo ? (indice === 0 ? n > 1 : indice + 2 < n) : indice + 1 < n;
  // Com folga ao lado da página (tela larga) as setas ficam coladas nela; sem folga (celular) vão por cima, translúcidas.
  const folga = (tam.w - largura * visiveis.length) / 2;
  const fora = folga >= 52;
  const seta = `absolute z-10 flex items-center justify-center transition disabled:pointer-events-none disabled:opacity-0 ${
    fora ? "h-11 w-11 text-slate-900 hover:text-marca-escuro" : "h-10 w-10 rounded-full bg-black/45 text-white shadow backdrop-blur hover:bg-black/65"
  }`;
  const ladoE = { left: fora ? folga - 48 : 4 };
  const ladoD = { right: fora ? folga - 48 : 4 };
  const topoPagina = Math.max(0, (tam.h - altura) / 2);

  const Chevron = ({ dir }: { dir: "e" | "d" }) => (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={dir === "d" ? "M9 5l7 7-7 7" : "M15 5l-7 7 7 7"} />
    </svg>
  );
  const Extremo = ({ dir }: { dir: "e" | "d" }) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={dir === "d" ? "M5 6l6 6-6 6M19 5v14" : "M19 6l-6 6 6 6M5 5v14"} />
    </svg>
  );

  return (
    <div ref={caixaRef} className="relative h-full w-full select-none" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {tam.w > 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div key={indice} className={`flex shadow-[0_0_12px_rgba(0,0,0,.25)] ${direcao === 1 ? "animate-[entra-dir_.25s_ease-out]" : "animate-[entra-esq_.25s_ease-out]"}`}>
            {visiveis.map((i) => (
              <div key={pages[i].id} className="relative overflow-hidden bg-white" style={{ width: largura, height: altura, containerType: "inline-size" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imgUrl(pages[i].imagem_path)}
                  alt={`Página ${pages[i].numero}`}
                  draggable={false}
                  className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                />
                {overlay?.(pages[i])}
              </div>
            ))}
          </div>
        </div>
      )}
      <button type="button" onClick={() => ir(0)} disabled={!podeVoltar} className={seta} style={{ ...ladoE, top: topoPagina + 8 }} aria-label="Primeira página"><Extremo dir="e" /></button>
      <button type="button" onClick={() => ir(n - 1)} disabled={!podeAvancar} className={seta} style={{ ...ladoD, top: topoPagina + 8 }} aria-label="Última página"><Extremo dir="d" /></button>
      <button type="button" onClick={anterior} disabled={!podeVoltar} className={`${seta} top-1/2 -translate-y-1/2`} style={ladoE} aria-label="Página anterior"><Chevron dir="e" /></button>
      <button type="button" onClick={proxima} disabled={!podeAvancar} className={`${seta} top-1/2 -translate-y-1/2`} style={ladoD} aria-label="Próxima página"><Chevron dir="d" /></button>
      {!podeAvancar && proximo && (
        <button
          type="button"
          onClick={proximo.abrir}
          className="absolute left-1/2 top-2 z-10 lg:bottom-3 lg:top-auto max-w-[80%] -translate-x-1/2 truncate rounded-full bg-marca-escuro px-5 py-2.5 text-sm font-semibold text-white shadow-lg ring-1 ring-destaque transition hover:bg-marca-escuro"
        >
          Próximo catálogo: {proximo.nome} →
        </button>
      )}
      <div className="hidden" aria-hidden>
        {vizinhas.map((i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={imgUrl(pages[i].imagem_path)} alt="" />
        ))}
      </div>
    </div>
  );
});
