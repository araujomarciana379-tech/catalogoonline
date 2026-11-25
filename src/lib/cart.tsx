"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "./supabase";
import { brl, soDigitos, waNumero } from "./format";
import { EVENTO_DADOS, K_CLI, sessionId } from "./cliente";

export type CartItem = {
  key: string; // produtoId + variacaoId
  produtoId: string;
  variacaoId: string | null;
  codigo: string;
  descricao: string;
  preco: number | null;
  qtd: number;
  /** Mínimo e passo: com mínimo 3 a quantidade anda 3, 6, 9… */
  qtdMinima: number;
  foto?: string | null;
  /** Texto da personalização (opção "Personalizado"). */
  obs?: string;
};

/** Arredonda para cima até o múltiplo do mínimo (mínimo 3: 4 → 6). */
export function multiploDoMinimo(qtd: number, minimo: number): number {
  const m = Math.max(1, minimo || 1);
  return Math.min(Math.max(m, Math.ceil(qtd / m) * m), 100000);
}

export type PedidoEnviado = {
  numero: number;
  /** wa.me com a mensagem (inclui o link do PDF) */
  whatsappUrl: string;
  /** PDF do pedido (gerado pelo servidor; o token no link dispensa login) */
  pdfUrl: string;
};

type Cliente = { nome: string; whatsapp: string };

type CartCtx = {
  items: CartItem[];
  cliente: Cliente;
  setCliente: (c: Partial<Cliente>) => void;
  add: (item: Omit<CartItem, "key">) => void;
  setQtd: (key: string, qtd: number) => void;
  remove: (key: string) => void;
  totalItens: number;
  total: number | null; // null se algum item está sem preço
  track: (tipo: string, pagina?: number, produtoId?: string) => void;
  finalizar: (observacao?: string) => Promise<PedidoEnviado>;
};

const Ctx = createContext<CartCtx | null>(null);
export const useCart = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart fora do CartProvider");
  return c;
};

function lerLS<T>(k: string, fallback: T): T {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function gravarLS(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* modo privado: segue sem persistir */
  }
}

// Um carrinho só para todos os catálogos: o cliente pode misturar produtos de catálogos diferentes no mesmo pedido.
const K_CART = "rdl:cart";
const K_SINCRONIZADOS = "rdl:cart:slugs"; // catálogos cujo carrinho no banco ainda guarda itens

/** Carrinho salvo; na primeira vez junta os carrinhos antigos (rdl:<catálogo>:cart) num só. */
function carrinhoInicial(): CartItem[] {
  try {
    if (localStorage.getItem(K_CART) !== null) return lerLS<CartItem[]>(K_CART, []);
    const juntos = new Map<string, CartItem>();
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) ?? "";
      if (!/^rdl:[^:]+:cart$/.test(k) || k === K_CART) continue;
      for (const it of lerLS<CartItem[]>(k, [])) {
        const ja = juntos.get(it.key);
        juntos.set(it.key, ja ? { ...ja, qtd: multiploDoMinimo(ja.qtd + it.qtd, ja.qtdMinima) } : it);
      }
    }
    return [...juntos.values()];
  } catch {
    return [];
  }
}

function clienteInicial(): Cliente {
  const vazio = { nome: "", whatsapp: "" };
  try {
    const atual = lerLS<Cliente | null>(K_CLI, null);
    if (atual) return atual;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) ?? "";
      if (/^rdl:[^:]+:cliente$/.test(k) && k !== K_CLI) {
        const c = lerLS<Cliente>(k, vazio);
        if (c.nome || c.whatsapp) return c;
      }
    }
  } catch {
    /* sem localStorage */
  }
  return vazio;
}

export function CartProvider({ slug, children }: { slug: string; children: ReactNode }) {
  // O provider só monta no cliente (depois do fetch), então ler o localStorage aqui é seguro.
  const [items, setItems] = useState<CartItem[]>(carrinhoInicial);
  const [cliente, setClienteState] = useState<Cliente>(clienteInicial);
  const [sid] = useState(sessionId);
  const jaSincronizou = useRef(false);

  useEffect(() => {
    gravarLS(K_CART, items);
  }, [items]);
  useEffect(() => {
    gravarLS(K_CLI, cliente);
  }, [cliente]);
  // O cadastro do cliente (popup do WhatsApp, ou correção feita pelo admin) pré-preenche o pedido.
  useEffect(() => {
    const aoMudar = (e: Event) => setClienteState((c) => ({ ...c, ...(e as CustomEvent<Partial<Cliente>>).detail }));
    window.addEventListener(EVENTO_DADOS, aoMudar);
    return () => window.removeEventListener(EVENTO_DADOS, aoMudar);
  }, []);

  const payloadItens = (list: CartItem[]) =>
    list.map((i) => ({ produto_id: i.produtoId, variacao_id: i.variacaoId, quantidade: i.qtd, observacao: i.obs ?? null }));

  const sincronizar = useCallback(
    async (list: CartItem[], c: Cliente) => {
      // O carrinho é um só: fica registrado no catálogo atual e os outros catálogos são esvaziados,
      // para o mesmo cliente não aparecer em "carrinhos abandonados" mais de uma vez.
      const outros = lerLS<string[]>(K_SINCRONIZADOS, []).filter((x) => x !== slug);
      await Promise.all(
        outros.map((x) =>
          supabase.rpc("salvar_carrinho", { p_slug: x, p_session_id: sid, p_itens: [], p_nome: null, p_whatsapp: null }).then(
            () => undefined,
            () => undefined,
          ),
        ),
      );
      const { error } = await supabase.rpc("salvar_carrinho", {
        p_slug: slug,
        p_session_id: sid,
        p_itens: payloadItens(list),
        p_nome: c.nome || null,
        p_whatsapp: soDigitos(c.whatsapp) || null,
      });
      if (!error) {
        jaSincronizou.current = true;
        gravarLS(K_SINCRONIZADOS, list.length ? [slug] : []);
      }
    },
    [slug, sid],
  );

  // Envia o carrinho ao banco (base do "carrinho abandonado") com debounce.
  useEffect(() => {
    if (items.length === 0 && !jaSincronizou.current) return;
    const t = setTimeout(() => void sincronizar(items, cliente), 900);
    return () => clearTimeout(t);
  }, [items, cliente, sincronizar]);

  const add = useCallback((item: Omit<CartItem, "key">) => {
    // Personalizações diferentes do mesmo código são itens separados.
    const key = `${item.produtoId}:${item.variacaoId ?? "-"}${item.obs ? `:${item.obs}` : ""}`;
    setItems((prev) => {
      const i = prev.find((x) => x.key === key);
      if (i) return prev.map((x) => (x.key === key ? { ...x, qtd: multiploDoMinimo(x.qtd + item.qtd, x.qtdMinima) } : x));
      return [...prev, { ...item, key, qtd: multiploDoMinimo(item.qtd, item.qtdMinima) }];
    });
  }, []);

  const setQtd = useCallback((key: string, qtd: number) => {
    setItems((prev) => prev.map((x) => (x.key === key ? { ...x, qtd: multiploDoMinimo(qtd, x.qtdMinima) } : x)));
  }, []);
  const remove = useCallback((key: string) => setItems((prev) => prev.filter((x) => x.key !== key)), []);
  const setCliente = useCallback((c: Partial<Cliente>) => setClienteState((p) => ({ ...p, ...c })), []);

  const track = useCallback(
    (tipo: string, pagina?: number, produtoId?: string) => {
      // O builder do supabase-js é lazy: só envia com await/then.
      supabase.rpc("registrar_evento", {
        p_slug: slug,
        p_session_id: sid,
        p_tipo: tipo,
        p_pagina: pagina ?? null,
        p_produto_id: produtoId ?? null,
      }).then(() => undefined, () => undefined);
    },
    [slug, sid],
  );

  const totalItens = useMemo(() => items.reduce((s, i) => s + i.qtd, 0), [items]);
  const total = useMemo(
    () => (items.some((i) => i.preco == null) ? null : items.reduce((s, i) => s + i.qtd * (i.preco ?? 0), 0)),
    [items],
  );

  const finalizar = useCallback(
    async (observacao?: string) => {
      if (items.length === 0) throw new Error("Carrinho vazio");
      if (!cliente.nome.trim()) throw new Error("Informe seu nome");
      if (soDigitos(cliente.whatsapp).length < 10) throw new Error("Informe um WhatsApp válido");
      const faltando = items.find((i) => i.qtd < i.qtdMinima);
      if (faltando) throw new Error(`${faltando.descricao}: quantidade mínima é ${faltando.qtdMinima}`);

      await sincronizar(items, cliente);
      const { data, error } = await supabase.rpc("finalizar_pedido", {
        p_slug: slug,
        p_session_id: sid,
        p_nome: cliente.nome.trim(),
        p_whatsapp: soDigitos(cliente.whatsapp),
        p_observacao: observacao?.trim() || null,
      });
      if (error) throw new Error(error.message);
      const r = (Array.isArray(data) ? data[0] : data) as {
        numero: number;
        total: number;
        itens: { codigo: string | null; nome?: string; variacao?: string | null; observacao?: string | null; descricao: string; quantidade: number; preco_unitario: number | null }[];
        whatsapp_destino: string;
        mensagem_inicial: string;
        id: string;
        token: string;
      };

      const pdfUrl = `${window.location.origin}/pedido/${r.id}/pdf?t=${r.token}`;
      // A mensagem é um resumo; o pedido completo, em colunas, vai no PDF.
      const MAX_LINHAS = 25;
      const linhas = r.itens.slice(0, MAX_LINHAS).map(
        (i) => `• ${i.quantidade}x ${i.codigo ? `${i.codigo} ` : ""}${i.nome ?? i.descricao}${i.variacao ? ` – ${i.variacao}` : ""}${i.observacao ? ` ("${i.observacao}")` : ""}`,
      );
      if (r.itens.length > MAX_LINHAS) linhas.push(`… e mais ${r.itens.length - MAX_LINHAS} itens (veja o PDF)`);
      const unidades = r.itens.reduce((s, i) => s + i.quantidade, 0);
      const temPreco = r.itens.every((i) => i.preco_unitario != null);
      const msg = [
        r.mensagem_inicial,
        "",
        `*Pedido #${r.numero}* – ${r.itens.length} ${r.itens.length === 1 ? "item" : "itens"}, ${unidades} unidades`,
        ...linhas,
        ...(temPreco ? ["", `*Total: ${brl(Number(r.total))}*`] : []),
        ...(observacao?.trim() ? ["", `Obs.: ${observacao.trim()}`] : []),
        "",
        `Cliente: ${cliente.nome.trim()}`,
        `WhatsApp: ${cliente.whatsapp}`,
        "",
        `📄 Pedido completo em PDF: ${pdfUrl}`,
      ].join("\n");

      track("finalizou");
      jaSincronizou.current = false; // evita sincronizar o carrinho vazio e reabrir o pedido
      setItems([]);
      return {
        numero: r.numero,
        pdfUrl,
        whatsappUrl: `https://wa.me/${waNumero(r.whatsapp_destino)}?text=${encodeURIComponent(msg)}`,
      };
    },
    [items, cliente, slug, sid, sincronizar, track],
  );

  const value = useMemo(
    () => ({ items, cliente, setCliente, add, setQtd, remove, totalItens, total, track, finalizar }),
    [items, cliente, setCliente, add, setQtd, remove, totalItens, total, track, finalizar],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
