"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { maskTelefone, soDigitos } from "@/lib/format";
import {
  EVENTO_CLIENTE,
  K_ID,
  esquecerCliente,
  guardarCliente,
  registrarCliente,
  removerVendedoraDaUrl,
} from "@/lib/cliente";
import { MARCA_CURTA } from "@/lib/site";

// null = ainda não sei (servidor / primeira renderização); "" = sem cadastro neste aparelho.
const assinar = (aviso: () => void) => {
  window.addEventListener(EVENTO_CLIENTE, aviso);
  window.addEventListener("storage", aviso);
  return () => {
    window.removeEventListener(EVENTO_CLIENTE, aviso);
    window.removeEventListener("storage", aviso);
  };
};
const lerId = () => {
  try {
    return localStorage.getItem(K_ID) ?? "";
  } catch {
    return "";
  }
};

/**
 * Primeira visita: pede o WhatsApp (obrigatório) antes de mostrar o catálogo. O cadastro vai para o banco,
 * liga o cliente à vendedora do link (?v=) e serve para avisos de carrinho abandonado.
 * Não vale para o painel (/admin) nem para o PDF do pedido.
 */
export function ClienteGate({ children }: { children: ReactNode }) {
  const caminho = usePathname();
  const livre = caminho.startsWith("/admin") || caminho.startsWith("/pedido");
  const id = useSyncExternalStore(assinar, lerId, () => null);

  // Já cadastrado: confirma no banco em segundo plano (registra o link da vendedora e traz correções do admin).
  const sincronizou = useRef<string | null>(null);
  useEffect(() => {
    if (livre || !id || sincronizou.current === id) return;
    sincronizou.current = id;
    registrarCliente({ clienteId: id })
      .then((r) => {
        guardarCliente(r, false);
        removerVendedoraDaUrl();
      })
      .catch((e: Error) => {
        // Cadastro apagado no painel: pede de novo. Falha de rede: segue com o que já temos.
        if (/cliente_desconhecido/.test(e.message)) esquecerCliente();
      });
  }, [id, livre]);

  if (livre) return <>{children}</>;
  if (id === null) return null;
  if (id === "") return <PedirWhatsapp />;
  return <>{children}</>;
}

function PedirWhatsapp() {
  const [zap, setZap] = useState("");
  const [nome, setNome] = useState("");
  const [aceite, setAceite] = useState(false);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => campo.current?.focus(), []);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    const d = soDigitos(zap);
    if (d.length < 10 || d.length > 11) return setErro("Informe o WhatsApp com DDD, por exemplo (43) 99999-9999.");
    if (!aceite) return setErro("Marque a caixa para continuar.");
    setEnviando(true);
    try {
      const r = await registrarCliente({ whatsapp: d, nome: nome.trim() || undefined, aceite: true });
      guardarCliente(r, true);
      removerVendedoraDaUrl();
    } catch {
      setErro("Não conseguimos registrar agora. Confira sua internet e tente de novo.");
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-[radial-gradient(ellipse_at_top,var(--marca)_0%,var(--marca-noite)_70%)] p-4" role="dialog" aria-modal="true" aria-labelledby="titulo-cadastro">
      <form onSubmit={entrar} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 text-slate-900 shadow-2xl">
        <div className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="" className="mx-auto mb-2 h-14 w-14 rounded-full" />
          <h1 id="titulo-cadastro" className="text-lg font-bold text-marca">Bem-vindo(a) à {MARCA_CURTA}!</h1>
          <p className="mt-1 text-sm text-slate-600">Para ver os catálogos e fazer seu pedido, informe seu WhatsApp.</p>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">WhatsApp <span className="text-red-600">*</span></span>
          <input
            ref={campo}
            value={zap}
            onChange={(e) => setZap(maskTelefone(e.target.value))}
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="(43) 99999-9999"
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-marca"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Seu nome <span className="font-normal text-slate-500">(opcional)</span></span>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            autoComplete="name"
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-marca"
          />
        </label>
        <label className="flex items-start gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Concordo em receber mensagens da {MARCA_CURTA} no WhatsApp sobre meus pedidos e novidades. Posso pedir para parar a qualquer momento.</span>
        </label>
        {erro && <p role="alert" className="text-sm text-red-600">{erro}</p>}
        <button disabled={enviando} className="w-full rounded-lg bg-marca py-3 font-semibold text-white hover:bg-marca-hover disabled:opacity-50">
          {enviando ? "Entrando…" : "Entrar nos catálogos"}
        </button>
      </form>
    </div>
  );
}
