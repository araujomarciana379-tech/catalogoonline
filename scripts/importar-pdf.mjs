// Converte um PDF de catálogo em imagens (uma por página), envia ao Supabase e cria/atualiza o catálogo.
//
//   npm run importar-pdf -- catalogo.pdf --slug sao-bento --nome "Coleção São Bento"
//
// Opções:
//   --descricao "texto"   texto da vitrine
//   --destaque            vira o catálogo em destaque da home
//   --sem-icones          não mostra o selo 🛒 (use quando o PDF já tem ícone de carrinho desenhado)
//   --whatsapp 5543...    número que recebe os pedidos (padrão: o mesmo do catálogo existente ou 5543996127577)
//   --largura 1100        largura das imagens em pixels (padrão 1100)
//   --seco                só gera as imagens em ./importacao/<slug>/, sem enviar nada
//   --substituir-fotos    troca também fotos de produto que já existem (padrão: só preenche quem não tem foto)
//
// Se o PDF tiver texto selecionável, os códigos de produto (ex.: AD.050-4, NA.107) são detectados e salvos em
// ./importacao/<slug>/produtos.csv com a página e a posição. Preencha nome/preço e rode `npm run importar-produtos`.
// As fotos recortadas (sem fundo) de cada produto também são extraídas e ligadas ao código mais próximo.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { clienteAdmin, falhar, lerArgs, slugValido } from "./_comum.mjs";
import { associar, fotoJpeg, recortesDaPagina } from "./_fotos-pdf.mjs";

const { pos, opt } = lerArgs();
const arquivo = pos[0];
if (!arquivo || !opt.slug) {
  falhar('Uso: npm run importar-pdf -- arquivo.pdf --slug nome-do-catalogo --nome "Nome do catálogo" [--seco]');
}
const slug = String(opt.slug).toLowerCase();
if (!slugValido(slug)) falhar(`Slug inválido: "${slug}". Use letras minúsculas, números e hífen (ex.: sao-bento).`);
const nome = typeof opt.nome === "string" ? opt.nome : null;
const seco = Boolean(opt.seco);
const largura = Number(opt.largura ?? 1100);
if (!Number.isFinite(largura) || largura < 400 || largura > 3000) falhar("--largura deve estar entre 400 e 3000.");

// Códigos no padrão do catálogo: 2–4 letras, ponto, números, sufixo opcional (-1, -A).
const RE_CODIGO = /\b[A-Z]{1,4}\.\d{2,4}(?:-[0-9A-Z]{1,3})?\b/g;

const saida = join("importacao", slug);
mkdirSync(saida, { recursive: true });

const pdf = await getDocument({ data: new Uint8Array(readFileSync(arquivo)), verbosity: 0 }).promise;
console.log(`\n📄 ${basename(arquivo)}: ${pdf.numPages} página(s)`);

const paginas = [];
const codigos = [];
const fotos = new Map(); // codigo -> arquivo da foto recortada
mkdirSync(join(saida, "fotos"), { recursive: true });
const nomeArquivo = (codigo) => codigo.replace(/[^A-Za-z0-9.-]+/g, "_");

for (let n = 1; n <= pdf.numPages; n++) {
  const page = await pdf.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: largura / base.width });
  const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff"; // JPEG não tem transparência
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  const jpg = await canvas.encode("jpeg", 82);
  const nomeArq = `p-${n}.jpg`;
  writeFileSync(join(saida, nomeArq), jpg);
  paginas.push({ numero: n, arquivo: nomeArq, largura: canvas.width, altura: canvas.height, bytes: jpg.length });

  // Texto com posição → códigos de produto (só funciona se o texto não foi convertido em curvas).
  const texto = await page.getTextContent();
  for (const item of texto.items) {
    if (!("str" in item) || !item.str) continue;
    const [, , , , ex, ey] = item.transform; // origem do texto em unidades do PDF (y de baixo para cima)
    const alt = Math.abs(item.height || item.transform[3] || 10);
    // Largura média por caractere: localiza o código dentro da linha (aproximação boa para fontes comuns).
    const porChar = (item.width || alt * 0.6 * item.str.length) / item.str.length;
    for (const m of item.str.matchAll(RE_CODIGO)) {
      const x0 = ex + m.index * porChar;
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
  // Fotos de produto: recortes do PDF ligados ao código mais próximo na página.
  const daPagina = codigos.filter((c) => c.pagina === n && !fotos.has(c.codigo));
  if (daPagina.length) {
    const mapa = associar(daPagina, await recortesDaPagina(page));
    for (const [codigo, recorte] of mapa) {
      const jpg = await fotoJpeg(recorte.img);
      if (!jpg) continue;
      const arq = `${nomeArquivo(codigo)}.jpg`;
      writeFileSync(join(saida, "fotos", arq), jpg.foto);
      writeFileSync(join(saida, "fotos", arq.replace(/\.jpg$/, ".thumb.jpg")), jpg.thumb);
      fotos.set(codigo, arq);
    }
  }
  page.cleanup();
  process.stdout.write(`  página ${n}: ${canvas.width}×${canvas.height}, ${(jpg.length / 1024).toFixed(0)} KB\r`);
}
console.log(`\n🖼  Imagens em ${saida}/`);

// Planilha para completar (mesmo formato aceito por importar-produtos).
const vistos = new Set();
const unicos = codigos.filter((c) => !vistos.has(c.codigo) && vistos.add(c.codigo));
const csv = [
  "codigo;nome;descricao;preco;qtd_minima;variacoes;pagina;x;y;w;h",
  ...unicos.map((c) => [c.codigo, "", "", "", "", "", c.pagina, c.x, c.y, c.w, c.h].join(";")),
].join("\n");
writeFileSync(join(saida, "produtos.csv"), "﻿" + csv); // BOM: o Excel abre com acentos certos
console.log(
  unicos.length
    ? `🔎 ${unicos.length} código(s) encontrados → ${saida}/produtos.csv (complete nome e preço)`
    : "🔎 Nenhum código encontrado no texto (o PDF provavelmente tem o texto convertido em curvas). Cadastre os produtos na planilha manualmente.",
);

if (codigos.length) console.log(`📷 ${fotos.size} de ${new Set(codigos.map((c) => c.codigo)).size} produtos com foto recortada do PDF → ${saida}/fotos/`);

if (seco) {
  console.log("\n(--seco) Nada foi enviado ao Supabase.\n");
  process.exit(0);
}

// ── Envio ──
const sb = clienteAdmin();

const { data: existente, error: e0 } = await sb.from("catalogos").select("id, whatsapp, nome").eq("slug", slug).maybeSingle();
if (e0) falhar(e0.message);
if (!existente && !nome) falhar(`O catálogo "${slug}" não existe ainda: informe --nome "Nome do catálogo".`);

for (const p of paginas) {
  const caminho = `${slug}/${p.arquivo}`;
  const { error } = await sb.storage
    .from("catalogo")
    .upload(caminho, readFileSync(join(saida, p.arquivo)), { contentType: "image/jpeg", upsert: true, cacheControl: "3600" });
  if (error) falhar(`Falha ao enviar ${caminho}: ${error.message}`);
  process.stdout.write(`  ⬆ ${caminho}\r`);
}
console.log(`\n☁  ${paginas.length} imagens enviadas ao bucket "catalogo"`);

// Cache-busting: a mesma URL de imagem pode estar em cache no celular do cliente após reimportar.
const versao = Date.now().toString(36);
const dadosCatalogo = {
  slug,
  nome: nome ?? existente.nome,
  whatsapp: String(opt.whatsapp ?? existente?.whatsapp ?? "5543996127577").replace(/\D/g, ""),
  capa_path: `${slug}/${paginas[0].arquivo}?v=${versao}`,
  ...(typeof opt.descricao === "string" ? { descricao: opt.descricao } : {}),
  ...(opt.destaque ? { destaque: true } : {}),
  ...(opt["sem-icones"] ? { mostrar_icones: false } : {}),
};
const { data: cat, error: e1 } = await sb.from("catalogos").upsert(dadosCatalogo, { onConflict: "slug" }).select("id").single();
if (e1) falhar(e1.message);
if (opt.destaque) await sb.from("catalogos").update({ destaque: false }).neq("id", cat.id);

const { error: e2 } = await sb.from("paginas").upsert(
  paginas.map((p) => ({
    catalogo_id: cat.id,
    numero: p.numero,
    imagem_path: `${slug}/${p.arquivo}?v=${versao}`,
    largura: p.largura,
    altura: p.altura,
  })),
  { onConflict: "catalogo_id,numero" },
);
if (e2) falhar(e2.message);

// PDF novo com menos páginas: remove as que sobraram (e as áreas clicáveis delas).
const { data: sobras } = await sb.from("paginas").select("numero").eq("catalogo_id", cat.id).gt("numero", paginas.length);
if (sobras?.length) {
  await sb.from("paginas").delete().eq("catalogo_id", cat.id).gt("numero", paginas.length);
  console.log(`🧹 Removidas ${sobras.length} página(s) antigas além da ${paginas.length}.`);
}

// Fotos recortadas: sobem para o Storage e preenchem o produto (sem apagar a foto da planilha, salvo --substituir-fotos).
if (fotos.size) {
  let gravadas = 0;
  for (const [codigo, arq] of fotos) {
    const destino = `produtos/${nomeArquivo(codigo)}/pdf.jpg`;
    for (const [local, remoto] of [[arq, destino], [arq.replace(/\.jpg$/, ".thumb.jpg"), destino.replace(/\.jpg$/, ".thumb.jpg")]]) {
      const { error } = await sb.storage.from("catalogo").upload(remoto, readFileSync(join(saida, "fotos", local)), { contentType: "image/jpeg", upsert: true, cacheControl: "604800" });
      if (error) falhar(`Falha ao enviar ${remoto}: ${error.message}`);
    }
    let q = sb.from("produtos").update({ foto_path: destino }).eq("codigo", codigo);
    if (!opt["substituir-fotos"]) q = q.is("foto_path", null);
    const { data } = await q.select("id");
    gravadas += data?.length ?? 0;
  }
  console.log(`📷 ${fotos.size} fotos enviadas; ${gravadas} produtos receberam a foto.`);
}

console.log(`\n✅ Catálogo "${dadosCatalogo.nome}" pronto em /c/${slug}\n`);
