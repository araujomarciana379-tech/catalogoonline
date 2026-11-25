"use client";

import { supabase } from "./supabase";
import { maskTelefone } from "./format";

// Identificação do cliente neste aparelho: o popup do WhatsApp na primeira visita.
// O cadastro (nome, WhatsApp, vendedora) fica no banco; aqui só guardamos o código do cliente.
export const K_ID = "rdl:cliente-id";
export const K_ZAP = "rdl:cliente-zap"; // último WhatsApp que o banco devolveu (para notar quando o admin corrige)
export const K_CLI = "rdl:cliente"; // nome e WhatsApp pré-preenchidos no pedido
export const EVENTO_CLIENTE = "rdl:cliente";
export const EVENTO_DADOS = "rdl:cliente-dados";

export function sessionId(): string {
  try {
    let id = localStorage.getItem("rdl:session");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("rdl:session", id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

/** Código da vendedora no link (?v=maria). Só vale a que está na URL desta visita: vale o último link usado. */
export function vendedoraDaUrl(): string | null {
  const v = new URLSearchParams(window.location.search).get("v");
  return v && /^[a-z0-9-]{1,40}$/i.test(v) ? v.toLowerCase() : null;
}

/** Tira o ?v= do endereço depois de registrado, para o cliente não repassar o link com a vendedora dele. */
export function removerVendedoraDaUrl() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("v")) return;
  url.searchParams.delete("v");
  window.history.replaceState(null, "", url);
}

export type RespostaCliente = { cliente_id: string; whatsapp: string; nome: string | null };

export async function registrarCliente(a: { clienteId?: string | null; whatsapp?: string; nome?: string; aceite?: boolean }): Promise<RespostaCliente> {
  const { data, error } = await supabase.rpc("registrar_cliente", {
    p_session_id: sessionId(),
    p_whatsapp: a.whatsapp ?? null,
    p_nome: a.nome ?? null,
    p_vendedora: vendedoraDaUrl(),
    p_cliente_id: a.clienteId ?? null,
    p_aceite: !!a.aceite,
  });
  if (error) throw new Error(error.message);
  return data as RespostaCliente;
}

function ler<T>(k: string, padrao: T): T {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : padrao;
  } catch {
    return padrao;
  }
}

/** Guarda o cliente neste aparelho e pré-preenche o pedido. `forcar`: sobrescreve o que já estava no pedido. */
export function guardarCliente(r: RespostaCliente, forcar: boolean) {
  try {
    const antes = ler<{ nome: string; whatsapp: string }>(K_CLI, { nome: "", whatsapp: "" });
    const mudouZap = localStorage.getItem(K_ZAP) !== r.whatsapp;
    const dados = {
      nome: forcar || !antes.nome ? (r.nome ?? antes.nome) : antes.nome,
      whatsapp: forcar || !antes.whatsapp || mudouZap ? maskTelefone(r.whatsapp) : antes.whatsapp,
    };
    localStorage.setItem(K_CLI, JSON.stringify(dados));
    localStorage.setItem(K_ZAP, r.whatsapp);
    localStorage.setItem(K_ID, r.cliente_id);
    window.dispatchEvent(new CustomEvent(EVENTO_DADOS, { detail: dados }));
    window.dispatchEvent(new Event(EVENTO_CLIENTE));
  } catch {
    /* modo privado sem armazenamento: o cliente é pedido de novo na próxima visita */
  }
}

export function esquecerCliente() {
  try {
    localStorage.removeItem(K_ID);
    window.dispatchEvent(new Event(EVENTO_CLIENTE));
  } catch {
    /* sem armazenamento */
  }
}
