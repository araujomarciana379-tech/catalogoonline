"use client";

import { useMemo, useState } from "react";
import { multiploDoMinimo, useCart } from "@/lib/cart";
import { brl, imgUrl, thumbUrl } from "@/lib/format";
import type { Produto, Variacao } from "@/lib/types";

/** Um produto oferecido pelo carrinho (vários = tamanhos/versões: Pequeno = AD.055, Grande = AD.055-1). */
export type OpcaoProduto = { produto: Produto; variacoes: Variacao[]; rotulo: string };

type Props = {
  opcoes: OpcaoProduto[];
  /** Índice da opção aberta primeiro. */
  inicial?: number;
  /** Foto usada quando nem a variação nem o produto têm foto (a página do catálogo). */
  fotoReserva?: string;
  /** Variação já escolhida ao abrir (o santo tocado na página). */
  variacaoInicial?: string | null;
  onClose: () => void;
};

/** "15 Personalizado": o cliente descreve a personalização num texto. */
const ehPersonalizado = (rotulo?: string | null) => !!rotulo && /personaliz/i.test(rotulo);

export function ProductSheet({ opcoes, inicial = 0, fotoReserva, variacaoInicial, onClose }: Props) {
  const { add, items, track } = useCart();
  const [iOp, setIOp] = useState(Math.min(Math.max(inicial, 0), opcoes.length - 1));
  const { produto, variacoes } = opcoes[iOp];
  const [varId, setVarId] = useState<string | null>(() => (variacoes.some((v) => v.id === variacaoInicial) ? variacaoInicial! : null));
  const [textoPers, setTextoPers] = useState("");
  const temVariacoes = variacoes.length > 0;
  const variacao = variacoes.find((v) => v.id === varId) ?? null;

  const minimo = Math.max(1, variacao?.qtd_minima ?? produto.qtd_minima ?? 1);
  const [qtd, setQtd] = useState(minimo);
  const [aviso, setAviso] = useState("");
  const preco = variacao ? (variacao.preco ?? produto.preco) : produto.preco;

  // "Escolha o santo" quando as opções são santos numerados (03 Anjo da Guarda, 04 N. Sra. Aparecida…).
  const saoSantos = variacoes.length > 0 && variacoes.filter((v) => /^\d{1,3}\s/.test(v.rotulo)).length >= variacoes.length / 2;
  const precos = variacoes.map((v) => v.preco ?? produto.preco).filter((p): p is number => p != null);
  const faixa = precos.length && Math.min(...precos) !== Math.max(...precos) ? [Math.min(...precos), Math.max(...precos)] : null;

  const foto = imgUrl(variacao?.foto_path || produto.foto_path || variacoes.find((v) => v.foto_path)?.foto_path || "") || fotoReserva || "";

  const idsOpcoes = useMemo(() => new Set(opcoes.map((o) => o.produto.id)), [opcoes]);
  const noPedido = useMemo(() => items.filter((i) => idsOpcoes.has(i.produtoId)), [items, idsOpcoes]);
  const personalizado = ehPersonalizado(variacao?.rotulo);
  const faltaTexto = personalizado && textoPers.trim().length < 2;

  /** Troca de tamanho mantendo o santo/cor escolhido, se existir no outro tamanho. */
  function trocarOpcao(i: number) {
    if (i === iOp) return;
    const nova = opcoes[i];
    const mesma = variacao ? nova.variacoes.find((v) => v.rotulo === variacao.rotulo) : null;
    setIOp(i);
    setVarId(mesma?.id ?? null);
    const m = Math.max(1, mesma?.qtd_minima ?? nova.produto.qtd_minima ?? 1);
    setQtd((q) => multiploDoMinimo(q, m));
    setAviso("");
  }

  function escolher(v: Variacao) {
    setVarId(v.id);
    const m = Math.max(1, v.qtd_minima ?? produto.qtd_minima ?? 1);
    setQtd((q) => multiploDoMinimo(q, m));
    setAviso("");
  }

  function adicionar() {
    if ((temVariacoes && !variacao) || faltaTexto) return;
    const q = multiploDoMinimo(qtd, minimo);
    const obs = personalizado ? textoPers.trim().slice(0, 300) : undefined;
    add({
      obs,
      produtoId: produto.id,
      variacaoId: variacao?.id ?? null,
      codigo: variacao?.codigo ?? produto.codigo,
      descricao: produto.nome + (variacao ? ` – ${variacao.rotulo}` : ""),
      preco,
      qtd: q,
      qtdMinima: minimo,
      foto: variacao?.foto_path || produto.foto_path || null,
    });
    track("add_carrinho", undefined, produto.id);
    if (!temVariacoes) return onClose();
    // Atacado: o cliente costuma levar vários santos do mesmo produto, então a janela fica aberta.
    setAviso(`✓ ${q}× ${opcoes.length > 1 ? `${opcoes[iOp].rotulo} · ` : ""}${variacao!.rotulo} adicionado`);
    setVarId(null);
    setTextoPers("");
  }

  const passo = minimo > 1 ? `de ${minimo} em ${minimo}` : "";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={produto.nome}>
      <button aria-label="Fechar" className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white text-slate-900 shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-wide text-slate-500">{variacao?.codigo ?? produto.codigo}</p>
            <h2 className="text-base font-semibold leading-snug sm:text-lg">{produto.nome}</h2>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="-mr-2 rounded-full p-2 text-slate-500 hover:bg-slate-100">✕</button>
        </div>

        {/* Só esta área rola; min-h-0 deixa o flex encolher em vez de empurrar a janela para fora da tela. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {foto && (
            <div className="relative flex h-48 items-center justify-center bg-slate-50 sm:h-72">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img key={foto} src={foto} alt={variacao ? `${produto.nome} – ${variacao.rotulo}` : produto.nome} className="h-full w-full animate-[fadein_.25s_ease] object-contain p-2" />
              {variacao && (
                <span className="absolute bottom-2 left-1/2 max-w-[90%] -translate-x-1/2 truncate rounded-full bg-marca px-3 py-1 text-xs font-medium text-white shadow">
                  {variacao.rotulo}
                </span>
              )}
            </div>
          )}

          <div className="space-y-4 px-5 py-4">
            {opcoes.length > 1 && (
              <fieldset>
                <legend className="mb-2 text-sm font-semibold">Escolha o tamanho / versão</legend>
                <div className="flex flex-wrap gap-2">
                  {opcoes.map((o, i) => (
                    <button
                      key={o.produto.id}
                      type="button"
                      onClick={() => trocarOpcao(i)}
                      aria-pressed={i === iOp}
                      className={`rounded-lg border px-3 py-2 text-sm transition ${
                        i === iOp ? "border-marca bg-marca font-semibold text-white" : "border-slate-300 hover:border-slate-500"
                      }`}
                    >
                      {o.rotulo}
                      {o.produto.preco != null && <span className={`ml-1 text-xs ${i === iOp ? "text-white/80" : "text-slate-500"}`}>{brl(o.produto.preco)}</span>}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="text-lg font-bold text-marca">
                {preco != null ? brl(preco) : faixa && !variacao ? `${brl(faixa[0])} a ${brl(faixa[1])}` : brl(null)}
                {preco != null && <span className="ml-1 text-xs font-normal text-slate-500">/ unidade</span>}
              </p>
              <p className="text-xs text-slate-500">{minimo > 1 ? `Mínimo ${minimo} un. (vende ${passo})` : "Sem quantidade mínima"}</p>
            </div>
            {produto.descricao && <p className="text-sm text-slate-600">{produto.descricao}</p>}

            {temVariacoes && (
              <fieldset>
                <legend className="mb-2 text-sm font-semibold">{saoSantos ? "Escolha o santo" : "Escolha uma opção"}</legend>
                <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
                  {variacoes.map((v) => {
                    const ativo = varId === v.id;
                    const qtdNoPedido = noPedido.filter((i) => i.variacaoId === v.id).reduce((s, i) => s + i.qtd, 0) || null;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => escolher(v)}
                        aria-pressed={ativo}
                        className={`relative flex items-center gap-2 rounded-lg border p-1.5 text-left text-xs leading-tight transition ${
                          ativo ? "border-marca bg-marca/5 ring-2 ring-marca" : "border-slate-200 hover:border-slate-400"
                        }`}
                      >
                        {v.foto_path ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumbUrl(v.foto_path)} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded object-cover" />
                        ) : (
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-slate-100 text-[10px] text-slate-400">sem foto</span>
                        )}
                        <span className="line-clamp-2">{v.rotulo}</span>
                        {qtdNoPedido && (
                          <span className="absolute -right-1.5 -top-1.5 rounded-full bg-emerald-600 px-1.5 text-[10px] font-bold leading-4 text-white">{qtdNoPedido}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}

            {personalizado && (
              <label className="block">
                <span className="mb-1 block text-sm font-semibold">Descreva a personalização *</span>
                <textarea
                  value={textoPers}
                  onChange={(e) => setTextoPers(e.target.value.slice(0, 300))}
                  rows={2}
                  placeholder="Ex.: nome Maria, imagem de Santa Rita"
                  className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-marca"
                />
              </label>
            )}

            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold">Quantidade</span>
              <div className="flex items-center rounded-lg border border-slate-200">
                <button className="h-10 w-10 text-lg disabled:opacity-30" disabled={qtd <= minimo} onClick={() => setQtd((q) => Math.max(minimo, q - minimo))} aria-label={`Diminuir ${minimo}`}>−</button>
                <input
                  inputMode="numeric"
                  aria-label="Quantidade"
                  value={qtd}
                  onChange={(e) => setQtd(Number(e.target.value.replace(/\D/g, "")) || 0)}
                  onBlur={() => setQtd((q) => multiploDoMinimo(q, minimo))}
                  className="h-10 w-16 border-x border-slate-200 text-center outline-none"
                />
                <button className="h-10 w-10 text-lg" onClick={() => setQtd((q) => multiploDoMinimo(q + minimo, minimo))} aria-label={`Aumentar ${minimo}`}>+</button>
              </div>
            </div>

            {noPedido.length > 0 && (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                <strong>No seu pedido:</strong>{" "}
                {noPedido.map((i) => `${i.qtd}× ${opcoes.length > 1 ? `${opcoes.find((o) => o.produto.id === i.produtoId)?.rotulo} · ` : ""}${i.descricao.replace(/^.*? – /, "")}${i.obs ? ` ("${i.obs}")` : ""}`).join(" · ")}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          {aviso && <p role="status" className="text-center text-sm font-medium text-emerald-700">{aviso}</p>}
          <div className="flex gap-2">
            {temVariacoes && noPedido.length > 0 && (
              <button onClick={onClose} className="rounded-xl border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-700 hover:bg-slate-100">
                Concluir
              </button>
            )}
            <button
              onClick={adicionar}
              disabled={(temVariacoes && !variacao) || faltaTexto}
              className="flex flex-1 items-center justify-between gap-2 rounded-xl bg-marca px-4 py-3 font-semibold text-white transition enabled:hover:bg-marca-hover disabled:opacity-40"
            >
              <span>{temVariacoes && !variacao ? (saoSantos ? "Escolha um santo" : "Escolha uma opção") : faltaTexto ? "Descreva a personalização" : `Adicionar ${multiploDoMinimo(qtd, minimo)}`}</span>
              {preco != null && (!temVariacoes || variacao) && <span>{brl(preco * multiploDoMinimo(qtd, minimo))}</span>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
