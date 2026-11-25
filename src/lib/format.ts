import { SUPABASE_URL } from "./supabase";

export const brl = (n: number | null | undefined) =>
  n == null ? "Sob consulta" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Caminho absoluto/URL é usado como está; o resto é arquivo do bucket público 'catalogo'. */
export function imgUrl(path: string | null | undefined): string {
  if (!path) return "";
  if (path.startsWith("/") || path.startsWith("http")) return path;
  return `${SUPABASE_URL}/storage/v1/object/public/catalogo/${path}`;
}

export const soDigitos = (s: string) => s.replace(/\D/g, "");

/** Formata para exibição: (43) 99608-1065 */
export function maskTelefone(v: string): string {
  const d = soDigitos(v).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Garante DDI 55 para wa.me */
export function waNumero(v: string): string {
  const d = soDigitos(v);
  return d.startsWith("55") && d.length >= 12 ? d : `55${d}`;
}

/**
 * Miniatura para listas (ex.: os santos na janela do produto).
 * Google Fotos aceita o tamanho na própria URL; no Storage o script de importação grava "<foto>.thumb.jpg".
 */
export function thumbUrl(path: string | null | undefined, lado = 160): string {
  if (!path) return "";
  if (/googleusercontent\.com/.test(path)) {
    return path.replace(/=w\d+-h\d+[^?]*/, `=w${lado}-h${lado}-no`).replace(/=s\d+[^?]*/, `=s${lado}`);
  }
  // Fotos gravadas pelos scripts de importação (Storage "produtos/…" ou pasta pública "/catalogos/…/produtos/…").
  if (/^(produtos\/|\/catalogos\/[^/]+\/produtos\/).+\.jpg$/.test(path)) {
    return imgUrl(path.replace(/\.jpg$/, ".thumb.jpg"));
  }
  return imgUrl(path);
}

/** Endereço do catálogo a partir do nome: "Coleção São Bento" → "colecao-sao-bento". */
export const paraSlug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
