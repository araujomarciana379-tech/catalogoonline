"use client";

import { useEffect, useState } from "react";
import { useCart, type PedidoEnviado } from "@/lib/cart";
import { brl, maskTelefone, thumbUrl } from "@/lib/format";
import { MARCA_CURTA } from "@/lib/site";

export function CartDrawer({ onClose }: { onClose: () => void }) {
  const { items, cliente, setCliente, setQtd, remove, total, finalizar } = useCart();
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [pedido, setPedido] = useState<PedidoEnviado | null>(null);

  async function enviar() {
    setErro("");
    setEnviando(true);
    try {
      setPedido(await finalizar(""));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível enviar o pedido.");
    } finally {
      setEnviando(false);
    }
  }

  const unidades = items.reduce((s, i) => s + i.qtd, 0);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Seu pedido">
      <button aria-label="Fechar" className="absolute inset-0 bg-black/60" onClick={onClose} />
      <aside className="relative z-10 flex h-full w-full max-w-md flex-col bg-white text-slate-900 shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold">Seu pedido</h2>
          <button onClick={onClose} aria-label="Fechar" className="-mr-2 rounded-full p-2 text-slate-500 hover:bg-slate-100">✕</button>
        </header>

        {pedido ? (
          <PedidoConcluido pedido={pedido} onClose={onClose} />
        ) : items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-slate-500">
            <div className="text-4xl">🛒</div>
            <p>Seu pedido está vazio.</p>
            <p className="text-sm">Toque no carrinho dos produtos do catálogo para adicionar.</p>
          </div>
        ) : (
          <>
            <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto overscroll-contain px-5">
              {items.map((i) => (
                <li key={i.key} className="flex gap-3 py-3">
                  {i.foto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbUrl(i.foto)} alt="" className="h-14 w-14 shrink-0 rounded-lg border border-slate-100 object-cover" />
                  ) : (
                    <div className="h-14 w-14 shrink-0 rounded-lg bg-slate-100" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-snug">{i.descricao}</p>
                        {i.obs && <p className="text-xs italic text-slate-600">“{i.obs}”</p>}
                        <p className="text-xs text-slate-500">
                          {i.codigo}
                          {i.preco != null ? ` · ${brl(i.preco)} un.` : ""}
                        </p>
                      </div>
                      <button
                        onClick={() => remove(i.key)}
                        aria-label={`Remover ${i.descricao}`}
                        className="inline-flex min-h-9 shrink-0 items-center gap-1 self-start rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m2 0l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m5 5v6m4-6v6" />
                        </svg>
                        Remover
                      </button>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center rounded-lg border border-slate-200 text-sm">
                        <button className="h-8 w-8 disabled:opacity-30" onClick={() => setQtd(i.key, i.qtd - i.qtdMinima)} disabled={i.qtd <= i.qtdMinima} aria-label={`Diminuir ${i.qtdMinima}`}>−</button>
                        <span className="w-12 text-center">{i.qtd}</span>
                        <button className="h-8 w-8" onClick={() => setQtd(i.key, i.qtd + i.qtdMinima)} aria-label={`Aumentar ${i.qtdMinima}`}>+</button>
                      </div>
                      <span className="text-sm font-medium">{i.preco != null ? brl(i.preco * i.qtd) : "Sob consulta"}</span>
                    </div>
                    {i.qtdMinima > 1 && <p className="mt-1 text-[11px] text-slate-400">vende de {i.qtdMinima} em {i.qtdMinima}</p>}
                  </div>
                </li>
              ))}
            </ul>

            <div className="space-y-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
              <input
                value={cliente.nome}
                onChange={(e) => setCliente({ nome: e.target.value })}
                placeholder="Seu nome"
                autoComplete="name"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-marca"
              />
              <input
                value={cliente.whatsapp}
                onChange={(e) => setCliente({ whatsapp: maskTelefone(e.target.value) })}
                placeholder="Seu WhatsApp com DDD"
                inputMode="tel"
                autoComplete="tel"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-marca"
              />
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">{items.length} {items.length === 1 ? "item" : "itens"} · {unidades} unidades</span>
                <strong>{total != null ? brl(total) : "Valores sob consulta"}</strong>
              </div>
              {erro && <p className="text-sm text-red-600">{erro}</p>}
              <button
                onClick={enviar}
                disabled={enviando}
                className="w-full rounded-xl bg-[#15803d] px-4 py-3 font-semibold text-white transition enabled:hover:bg-[#166534] disabled:opacity-50"
              >
                {enviando ? "Gerando pedido…" : "Finalizar pedido"}
              </button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

function PedidoConcluido({ pedido, onClose }: { pedido: PedidoEnviado; onClose: () => void }) {
  // No celular, o PDF pode ir como arquivo pelo menu de compartilhar (o link wa.me só aceita texto).
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    let vivo = true;
    fetch(pedido.pdfUrl)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((b) => {
        const f = new File([b], `Pedido-${pedido.numero}-${MARCA_CURTA}.pdf`, { type: "application/pdf" });
        if (vivo && navigator.canShare?.({ files: [f] })) setArquivo(f);
      })
      .catch(() => {
        /* sem compartilhamento de arquivo: fica o link na mensagem */
      });
    return () => {
      vivo = false;
    };
  }, [pedido]);

  async function compartilharArquivo() {
    if (!arquivo) return;
    try {
      await navigator.share({ files: [arquivo], title: `Pedido #${pedido.numero}`, text: `Pedido #${pedido.numero} – ${MARCA_CURTA}` });
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) setAviso("Não foi possível compartilhar o arquivo. Use o botão do WhatsApp.");
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="text-5xl">✅</div>
      <h3 className="text-xl font-semibold">Pedido #{pedido.numero} registrado!</h3>
      <p className="text-sm text-slate-600">Agora envie para a {MARCA_CURTA} pelo WhatsApp. A mensagem já vai com o link do PDF do pedido.</p>
      <a href={pedido.whatsappUrl} className="w-full rounded-xl bg-[#15803d] px-6 py-3 font-semibold text-white transition hover:bg-[#166534]">
        Enviar pelo WhatsApp
      </a>
      {arquivo && (
        <button onClick={compartilharArquivo} className="w-full rounded-xl border border-marca px-6 py-3 font-semibold text-marca">
          Enviar o arquivo PDF
        </button>
      )}
      <a href={pedido.pdfUrl} target="_blank" rel="noopener" className="text-sm text-marca underline">
        Abrir o PDF do pedido
      </a>
      {aviso && <p className="text-sm text-red-600">{aviso}</p>}
      <button onClick={onClose} className="text-sm text-slate-500 underline">Voltar ao catálogo</button>
    </div>
  );
}
