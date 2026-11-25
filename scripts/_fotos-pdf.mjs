// Extrai as fotos de produto de uma página de PDF: imagens recortadas (com transparência) e sua posição.
// Catálogos feitos no CorelDRAW costumam ter cada produto como uma imagem PNG sem fundo.
import { createCanvas, ImageData } from "@napi-rs/canvas";
import { OPS } from "pdfjs-dist/legacy/build/pdf.mjs";

const RGBA = 3; // ImageKind.RGBA_32BPP do pdf.js

const mult = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];

/**
 * Enfeites não são foto de produto: minúsculos, que saem da página (flores, ramos), que ocupam a largura
 * inteira (guirlandas, fundos), quase transparentes (marcas d'água) ou muito alongados (faixas de luz).
 */
function ehEnfeite(c, img) {
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

/** Recortes (com transparência) da página, com caixa em % da página (y de cima para baixo). */
export async function recortesDaPagina(page) {
  const vp = page.getViewport({ scale: 1 });
  const ops = await page.getOperatorList();
  let ctm = [1, 0, 0, 1, 0, 0];
  const pilha = [];
  const out = [];
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
      const id = a[0];
      // Imagens repetidas em várias páginas ficam em commonObjs ("g_…"); limite de tempo para nunca travar.
      const repo = id.startsWith("g_") ? page.commonObjs : page.objs;
      const img = await Promise.race([
        new Promise((res) => (repo.has(id) ? res(repo.get(id)) : repo.get(id, res))),
        new Promise((res) => setTimeout(() => res(null), 5000)),
      ]);
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
      // A mesma imagem pode ser desenhada várias vezes na página: cada ocorrência é um recorte.
      out.push({ id: `${id}#${out.length}`, ...caixa, img });
    }
  }
  return out;
}

/** Distância (em % da página) do ponto ao retângulo; 0 se estiver dentro. */
const distancia = (px, py, r) => Math.hypot(Math.max(r.x0 - px, 0, px - r.x1), Math.max(r.y0 - py, 0, py - r.y1));

/**
 * Liga cada código à foto mais próxima (uma foto por código), pelos pares mais próximos primeiro.
 * codigos: [{ codigo, x, y }] com a posição do texto do código em %.
 */
export function associar(codigos, recortes, distMax = 30) {
  const pares = [];
  for (const c of codigos) for (const r of recortes) pares.push({ c, r, d: distancia(c.x, c.y + 1.5, r) });
  pares.sort((a, b) => a.d - b.d);
  const usadosC = new Set();
  const usadosR = new Set();
  const res = new Map();
  for (const p of pares) {
    if (p.d > distMax || usadosC.has(p.c.codigo) || usadosR.has(p.r.id)) continue;
    usadosC.add(p.c.codigo);
    usadosR.add(p.r.id);
    res.set(p.c.codigo, p.r);
  }
  return res;
}

/** Foto em JPEG sobre fundo branco, aparando a transparência em volta. */
export async function fotoJpeg(img, maxLado = 900, margem = 0.06) {
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
  const src = createCanvas(w, h);
  src.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(data.buffer, data.byteOffset, w * h * 4), w, h), 0, 0);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const lado = Math.max(cw, ch) * (1 + 2 * margem); // quadrado: miniaturas alinhadas na janela do produto
  const escala = Math.min(1, maxLado / lado);
  const L = Math.round(lado * escala);
  const c = createCanvas(L, L);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, L, L);
  ctx.drawImage(src, x0, y0, cw, ch, (L - cw * escala) / 2, (L - ch * escala) / 2, cw * escala, ch * escala);
  const t = createCanvas(200, 200);
  const tctx = t.getContext("2d");
  tctx.drawImage(c, 0, 0, 200, 200);
  return { foto: await c.encode("jpeg", 85), thumb: await t.encode("jpeg", 80) };
}
