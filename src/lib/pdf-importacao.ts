"use client";

// Leitura de PDF de catálogo no navegador (painel): imagens das páginas, códigos de produto no texto
// e fotos recortadas (sem fundo) ligadas ao código mais próximo. Mesmo método de scripts/importar-pdf.mjs.

import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

/** Códigos no padrão do catálogo: 1–4 letras, ponto, números, sufixo opcional (AD.050-4, NA.107). */
const RE_CODIGO = /\b[A-Z]{1,4}\.\d{2,4}(?:-[0-9A-Z]{1,3})?\b/g;

export type CodigoNaPagina = { codigo: string; pagina: number; x: number; y: number; w: number; h: number };
export type Recorte = { id: string; x0: number; x1: number; y0: number; y1: number; img: { width: number; height: number; data: Uint8ClampedArray } };
export type PaginaLida = {
  numero: number;
  jpeg: Blob;
  /** página sem nenhum conteúdo desenhado (pode ser falha de leitura do PDF) */
  vazia: boolean;
  largura: number;
  altura: number;
  codigos: CodigoNaPagina[];
  /** posição da foto ligada a cada código da página (para a área clicável) */
  caixas: Map<string, Recorte>;
  /** foto recortada por código (só quem ainda não tem foto nesta importação) */
  fotos: Map<string, { foto: Blob; thumb: Blob }>;
};

export async function abrirPdf(arquivo: File): Promise<PDFDocumentProxy> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  return pdfjs.getDocument({
    data: new Uint8Array(await arquivo.arrayBuffer()),
    // Decodificadores (JPEG2000, JBIG2, perfis de cor), mapas de caracteres e fontes: sem eles, imagens e textos somem.
    wasmUrl: "/pdfjs/wasm/",
    iccUrl: "/pdfjs/iccs/",
    cMapUrl: "/pdfjs/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/pdfjs/standard_fonts/",
    // Imagens em bytes (não ImageBitmap): precisamos ler a transparência para recortar as fotos.
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
    verbosity: 0,
  }).promise;
}

const canvasJpeg = (c: HTMLCanvasElement, q: number) =>
  new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("falha ao gerar JPEG"))), "image/jpeg", q));

/** Reduz a página a uma miniatura e vê se ficou tudo branco. */
function paginaVazia(canvas: HTMLCanvasElement): boolean {
  const t = document.createElement("canvas");
  t.width = 40;
  t.height = 56;
  const c = t.getContext("2d", { willReadFrequently: true })!;
  c.drawImage(canvas, 0, 0, t.width, t.height);
  const d = c.getImageData(0, 0, t.width, t.height).data;
  for (let i = 0; i < d.length; i += 4) if (d[i] < 250 || d[i + 1] < 250 || d[i + 2] < 250) return false;
  return true;
}

export async function lerPagina(pdf: PDFDocumentProxy, n: number, largura = 1100, jaComFoto: Set<string> = new Set()): Promise<PaginaLida> {
  const page = await pdf.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: largura / base.width });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff"; // JPEG não tem transparência
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  const jpeg = await canvasJpeg(canvas, 0.82);
  const vazia = paginaVazia(canvas);

  // Texto com posição → códigos (só funciona se o texto não foi convertido em curvas).
  const codigos: CodigoNaPagina[] = [];
  const texto = await page.getTextContent();
  for (const item of texto.items) {
    if (!("str" in item) || !item.str) continue;
    const [, , , , ex, ey] = item.transform as number[];
    const alt = Math.abs(item.height || (item.transform as number[])[3] || 10);
    const porChar = (item.width || alt * 0.6 * item.str.length) / item.str.length;
    for (const m of item.str.matchAll(RE_CODIGO)) {
      const x0 = ex + (m.index ?? 0) * porChar;
      codigos.push({
        codigo: m[0],
        pagina: n,
        x: +Math.max(0, (x0 / base.width) * 100 - 1).toFixed(1),
        y: +Math.max(0, ((base.height - ey - alt) / base.height) * 100 - 1).toFixed(1),
        w: +Math.min(100, ((m[0].length * porChar) / base.width) * 100 + 2).toFixed(1),
        h: +Math.min(100, (alt / base.height) * 100 + 2).toFixed(1),
      });
    }
  }

  const fotos: PaginaLida["fotos"] = new Map();
  const caixas = codigos.length ? associar(codigos, await recortesDaPagina(page)) : new Map<string, Recorte>();
  for (const [codigo, caixa] of caixas) {
    if (jaComFoto.has(codigo)) continue;
    const f = await fotoJpeg(caixa.img);
    if (f) fotos.set(codigo, f);
  }
  page.cleanup();
  return { numero: n, jpeg, vazia, largura: canvas.width, altura: canvas.height, codigos, caixas, fotos };
}

// ── Fotos recortadas ──

const RGBA = 3; // ImageKind.RGBA_32BPP do pdf.js

const mult = (m: number[], n: number[]) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];

/** Enfeites não são foto de produto: minúsculos, fora da página, largura inteira, quase transparentes ou alongados. */
function ehEnfeite(c: Omit<Recorte, "id" | "img">, img: Recorte["img"]) {
  const w = c.x1 - c.x0;
  const h = c.y1 - c.y0;
  if (w * h < 1.5 || w > 95) return true;
  if (c.x0 < -3 || c.x1 > 103 || c.y0 < -3 || c.y1 > 103) return true;
  const proporcao = w / h;
  if (proporcao > 3.5 || proporcao < 0.15) return true;
  let opacos = 0, soma = 0;
  for (let i = 3; i < img.data.length; i += 16) if (img.data[i] > 16) { opacos++; soma += img.data[i]; }
  return opacos === 0 || soma / opacos < 150;
}

async function recortesDaPagina(page: PDFPageProxy): Promise<Recorte[]> {
  const { OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const vp = page.getViewport({ scale: 1 });
  const ops = await page.getOperatorList();
  let ctm = [1, 0, 0, 1, 0, 0];
  const pilha: number[][] = [];
  const out: Recorte[] = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const a = ops.argsArray[i];
    if (fn === OPS.save) pilha.push(ctm);
    else if (fn === OPS.restore) ctm = pilha.pop() ?? ctm;
    else if (fn === OPS.transform) ctm = mult(ctm, a);
    else if (fn === OPS.paintFormXObjectBegin) {
      pilha.push(ctm);
      if (a[0]) ctm = mult(ctm, a[0]);
    } else if (fn === OPS.paintFormXObjectEnd) ctm = pilha.pop() ?? ctm;
    else if (fn === OPS.paintImageXObject) {
      const id = a[0] as string;
      const repo = id.startsWith("g_") ? page.commonObjs : page.objs;
      const img = (await Promise.race([
        new Promise((res) => (repo.has(id) ? res(repo.get(id)) : repo.get(id, res))),
        new Promise((res) => setTimeout(() => res(null), 5000)),
      ])) as (Recorte["img"] & { kind?: number }) | null;
      if (!img || img.kind !== RGBA || !img.data) continue;
      const xs = [ctm[4], ctm[4] + ctm[0], ctm[4] + ctm[2], ctm[4] + ctm[0] + ctm[2]];
      const ys = [ctm[5], ctm[5] + ctm[1], ctm[5] + ctm[3], ctm[5] + ctm[1] + ctm[3]];
      const caixa = {
        x0: (Math.min(...xs) / vp.width) * 100,
        x1: (Math.max(...xs) / vp.width) * 100,
        y0: 100 - (Math.max(...ys) / vp.height) * 100,
        y1: 100 - (Math.min(...ys) / vp.height) * 100,
      };
      if (ehEnfeite(caixa, img)) continue;
      out.push({ id: `${id}#${out.length}`, ...caixa, img });
    }
  }
  return out;
}

const distancia = (px: number, py: number, r: Recorte) =>
  Math.hypot(Math.max(r.x0 - px, 0, px - r.x1), Math.max(r.y0 - py, 0, py - r.y1));

/** Liga cada código à foto mais próxima (uma foto por código), pelos pares mais próximos primeiro. */
function associar(codigos: CodigoNaPagina[], recortes: Recorte[], distMax = 30) {
  const pares: { c: CodigoNaPagina; r: Recorte; d: number }[] = [];
  for (const c of codigos) for (const r of recortes) pares.push({ c, r, d: distancia(c.x, c.y + 1.5, r) });
  pares.sort((a, b) => a.d - b.d);
  const usadosC = new Set<string>();
  const usadosR = new Set<string>();
  const res = new Map<string, Recorte>();
  for (const p of pares) {
    if (p.d > distMax || usadosC.has(p.c.codigo) || usadosR.has(p.r.id)) continue;
    usadosC.add(p.c.codigo);
    usadosR.add(p.r.id);
    res.set(p.c.codigo, p.r);
  }
  return res;
}

/** Foto quadrada em JPEG sobre fundo branco, aparando a transparência em volta, + miniatura 200px. */
async function fotoJpeg(img: Recorte["img"], maxLado = 900, margem = 0.06) {
  const { width: w, height: h, data } = img;
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (data[(y * w + x) * 4 + 3] > 16) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < x0) return null;
  const src = document.createElement("canvas");
  src.width = w;
  src.height = h;
  src.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(data.subarray(0, w * h * 4)), w, h), 0, 0);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const lado = Math.max(cw, ch) * (1 + 2 * margem);
  const escala = Math.min(1, maxLado / lado);
  const L = Math.round(lado * escala);
  const c = document.createElement("canvas");
  c.width = c.height = L;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, L, L);
  ctx.drawImage(src, x0, y0, cw, ch, (L - cw * escala) / 2, (L - ch * escala) / 2, cw * escala, ch * escala);
  const t = document.createElement("canvas");
  t.width = t.height = 200;
  t.getContext("2d")!.drawImage(c, 0, 0, 200, 200);
  return { foto: await canvasJpeg(c, 0.85), thumb: await canvasJpeg(t, 0.8) };
}

/**
 * Área clicável de um código: a foto ligada a ele somada ao próprio código; sem foto, um retângulo
 * em volta do código. Em % da página.
 */
export function areaDoCodigo(c: CodigoNaPagina, foto?: Recorte) {
  let x0 = c.x, y0 = c.y, x1 = c.x + c.w, y1 = c.y + c.h;
  if (foto) {
    x0 = Math.min(x0, foto.x0);
    y0 = Math.min(y0, foto.y0);
    x1 = Math.max(x1, foto.x1);
    y1 = Math.max(y1, foto.y1);
  } else {
    const cx = (x0 + x1) / 2;
    x0 = cx - 11;
    x1 = cx + 11;
    y0 -= 3;
    y1 += 3;
  }
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const x = Math.min(Math.max(x0, 0), 98);
  const y = Math.min(Math.max(y0, 0), 98.5);
  return { x: r1(x), y: r1(y), w: r1(Math.min(Math.max(x1 - x, 2), 100 - x)), h: r1(Math.min(Math.max(y1 - y, 1.5), 100 - y)) };
}
