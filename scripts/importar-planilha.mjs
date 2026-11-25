// Importa a planilha base (modelo Vou Pedir) para o Supabase: produtos, variações (santos, cores, tamanhos),
// preços, quantidades mínimas e fotos.
//
//   npm run importar-planilha -- "base de dados.xlsx"
//
// Opções:
//   --seco          só lê e valida; gera o relatório, não envia nada
//   --sem-fotos     não copia as fotos (usa os links do Google direto)
//   --refazer-fotos copia de novo fotos que já estão no Supabase
//
// Regras:
//   GROUPING KEY = produto (o código impresso no catálogo). Cada linha = uma variação (NAME = santo/cor/tamanho).
//   Grupo de uma linha só = produto sem variação.  PACKAGE SIZE "LIVRE" = sem mínimo (1).
//   Variação que sumiu da planilha fica inativa (não é apagada).
// Problemas encontrados (código repetido, preço inválido…) vão para importacao/planilha-problemas.csv.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { clienteAdmin, falhar, lerArgs } from "./_comum.mjs";

const { pos, opt } = lerArgs();
const arquivo = pos[0];
if (!arquivo) falhar('Uso: npm run importar-planilha -- "planilha.xlsx" [--seco] [--sem-fotos]');

// ── Leitura ──
const texto = (v) => {
  if (v == null) return "";
  if (typeof v === "object") {
    if ("result" in v) return texto(v.result); // fórmula
    if ("text" in v) return texto(v.text); // hyperlink
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if (v instanceof Date) return v.toISOString();
  }
  return String(v).trim();
};

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(arquivo);
const ws = wb.worksheets[0];
const cab = {};
ws.getRow(1).eachCell((c, i) => (cab[texto(c.value).toLowerCase()] = i));
const col = (nome) => cab[nome.toLowerCase()];
for (const obrig of ["ID", "NAME", "PRICE", "PACKAGE SIZE", "GROUPING KEY"]) {
  if (!col(obrig)) falhar(`A planilha precisa da coluna "${obrig}" na linha 1.`);
}

const problemas = [];
const anotar = (linha, codigo, problema) => problemas.push({ linha, codigo, problema });

function preco(v, linha, codigo) {
  const s = v.replace(/r\$\s*/i, "").replace(/\s/g, "");
  if (s === "") return null;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  if (!Number.isFinite(n) || n < 0) {
    anotar(linha, codigo, `preço inválido "${v}" (importado como "sob consulta")`);
    return null;
  }
  return Math.round(n * 100) / 100;
}

function minimo(v, linha, codigo) {
  if (v === "" || /^livre$/i.test(v)) return 1;
  const n = Number(v.replace(",", "."));
  if (!Number.isFinite(n) || n < 1) {
    anotar(linha, codigo, `quantidade mínima inválida "${v}" (importado como 1)`);
    return 1;
  }
  return Math.round(n);
}

// Map.groupBy só existe a partir do Node 21; o Next roda no 20.
const agrupar = (arr, chave) => {
  const m = new Map();
  for (const x of arr) {
    const k = chave(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
};

const linhas = [];
ws.eachRow((row, n) => {
  if (n === 1) return;
  const get = (nome) => (col(nome) ? texto(row.getCell(col(nome)).value) : "");
  const id = get("ID");
  if (!id || /^inserir/i.test(id)) return; // linha de instruções do modelo
  const grupo = get("GROUPING KEY") || id;
  linhas.push({
    linha: n,
    id,
    grupo,
    nome: get("NAME"),
    preco: preco(get("PRICE"), n, id),
    minimo: minimo(get("PACKAGE SIZE"), n, id),
    descricao: get("Apenas descrição") || get("DESCRIPTION").replace(/\s*-\s*CÓD:.*$/i, ""),
    foto: get("Image 1"),
  });
});
if (!linhas.length) falhar("Nenhum produto encontrado na planilha.");

// Códigos repetidos (erro de cadastro): importa mesmo assim, mas avisa.
const porId = agrupar(linhas, (l) => l.id);
for (const [id, ls] of porId) {
  if (ls.length > 1) for (const l of ls) anotar(l.linha, id, `código repetido em ${ls.length} linhas (grupos: ${[...new Set(ls.map((x) => x.grupo))].join(", ")})`);
}

// ── Agrupamento ──
const maisComum = (arr) => {
  const c = new Map();
  for (const x of arr) if (x) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
};
const todosIguais = (arr) => arr.every((x) => x === arr[0]);
const numeroInicial = (s) => Number(s.match(/^(\d{1,3})\s/)?.[1] ?? NaN);

const produtos = [];
for (const [grupo, ls] of agrupar(linhas, (l) => l.grupo)) {
  const nome = maisComum(ls.map((l) => l.descricao)) || grupo;
  const foto = ls.find((l) => l.foto)?.foto ?? "";
  if (ls.length === 1) {
    const [l] = ls;
    produtos.push({ codigo: grupo, nome, preco: l.preco, qtd_minima: l.minimo, foto, variacoes: [] });
    continue;
  }
  const rotulosUsados = new Set();
  const variacoes = ls
    .map((l, i) => {
      let rotulo = l.nome.replace(/\s*-\s*CÓD:.*$/i, "") || (l.descricao !== nome ? l.descricao : "") || l.id;
      if (!l.nome) anotar(l.linha, l.id, `variação sem NAME (usei "${rotulo}")`);
      if (rotulosUsados.has(rotulo)) {
        anotar(l.linha, l.id, `variação "${rotulo}" repetida no grupo ${grupo} (usei "${rotulo} – ${l.id}")`);
        rotulo = `${rotulo} – ${l.id}`;
      }
      rotulosUsados.add(rotulo);
      return { rotulo, codigo: l.id, preco: l.preco, qtd_minima: l.minimo, foto: l.foto, i };
    })
    // Santos na ordem do número (03, 04, 05…); o resto na ordem da planilha.
    .sort((a, b) => (numeroInicial(a.rotulo) || 1000 + a.i) - (numeroInicial(b.rotulo) || 1000 + b.i))
    .map((v, ordem) => ({ rotulo: v.rotulo, codigo: v.codigo, preco: v.preco, qtd_minima: v.qtd_minima, foto: v.foto, ordem }));
  const precos = variacoes.map((v) => v.preco);
  const mins = variacoes.map((v) => v.qtd_minima);
  produtos.push({
    codigo: grupo,
    nome,
    preco: todosIguais(precos) ? precos[0] : null,
    qtd_minima: Math.min(...mins),
    foto,
    variacoes,
  });
}

const nVar = produtos.reduce((s, p) => s + p.variacoes.length, 0);
const nFotos = linhas.filter((l) => l.foto).length;
console.log(`\n📋 ${linhas.length} códigos → ${produtos.length} produtos (${nVar} variações), ${nFotos} com foto.`);

mkdirSync("importacao", { recursive: true });
const csv = (s) => `"${String(s).replace(/"/g, '""')}"`;
const relatorio = join("importacao", "planilha-problemas.csv");
writeFileSync(relatorio, "﻿" + ["linha;codigo;problema", ...problemas.map((p) => [p.linha, csv(p.codigo), csv(p.problema)].join(";"))].join("\n"));
console.log(problemas.length ? `⚠ ${problemas.length} problema(s) anotados em ${relatorio} (a importação continua).` : "✔ Nenhum problema na planilha.");

if (opt.seco) {
  writeFileSync(join("importacao", "planilha-produtos.json"), JSON.stringify(produtos, null, 1));
  console.log(`\n(--seco) Nada foi enviado. Prévia em importacao/planilha-produtos.json\n`);
  process.exit(0);
}

const sb = clienteAdmin();

// ── Fotos: copia do Google Fotos para o Supabase (mais rápido e não quebra se o álbum mudar) ──
const pasta = (s) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^A-Za-z0-9.-]+/g, "_").replace(/^_+|_+$/g, "") || "x";

if (!opt["sem-fotos"]) {
  const tarefas = [];
  for (const p of produtos) {
    if (!p.variacoes.length && p.foto) tarefas.push({ alvo: p, destino: `produtos/${pasta(p.codigo)}/produto.jpg` });
    for (const v of p.variacoes) if (v.foto) tarefas.push({ alvo: v, destino: `produtos/${pasta(p.codigo)}/${pasta(v.rotulo)}.jpg` });
  }
  const jaTem = new Set(); // arquivos já no Storage (lista cada pasta de produto uma vez)
  let feitas = 0, falhas = 0, puladas = 0;

  async function copiar({ alvo, destino }) {
    if (!opt["refazer-fotos"]) {
      const dir = destino.slice(0, destino.lastIndexOf("/"));
      if (!jaTem.has(`dir:${dir}`)) {
        const { data } = await sb.storage.from("catalogo").list(dir, { limit: 1000 });
        jaTem.add(`dir:${dir}`);
        for (const o of data ?? []) jaTem.add(`${dir}/${o.name}`);
      }
      if (jaTem.has(destino)) {
        alvo.foto = destino;
        puladas++;
        return;
      }
    }
    try {
      const r = await fetch(alvo.foto, { signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const img = await loadImage(Buffer.from(await r.arrayBuffer()));
      const escala = Math.min(1, 900 / Math.max(img.width, img.height));
      const c = createCanvas(Math.round(img.width * escala), Math.round(img.height * escala));
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const { error } = await sb.storage
        .from("catalogo")
        .upload(destino, await c.encode("jpeg", 82), { contentType: "image/jpeg", upsert: true, cacheControl: "604800" });
      if (error) throw new Error(error.message);
      // Miniatura para a lista de santos (o site procura "<foto>.thumb.jpg").
      const et = Math.min(1, 200 / Math.max(img.width, img.height));
      const t = createCanvas(Math.round(img.width * et), Math.round(img.height * et));
      const tctx = t.getContext("2d");
      tctx.fillStyle = "#fff";
      tctx.fillRect(0, 0, t.width, t.height);
      tctx.drawImage(img, 0, 0, t.width, t.height);
      const r2 = await sb.storage
        .from("catalogo")
        .upload(destino.replace(/\.jpg$/, ".thumb.jpg"), await t.encode("jpeg", 78), { contentType: "image/jpeg", upsert: true, cacheControl: "604800" });
      if (r2.error) throw new Error(r2.error.message);
      alvo.foto = destino;
      feitas++;
    } catch (e) {
      falhas++; // mantém o link do Google
      anotar("-", destino, `foto não copiada (${e.message}); ficou o link original`);
    }
    const total = feitas + falhas + puladas;
    if (total % 25 === 0) process.stdout.write(`  🖼  fotos: ${total}/${tarefas.length}\r`);
  }

  console.log(`\n🖼  Copiando ${tarefas.length} fotos (pode levar alguns minutos)…`);
  const fila = [...tarefas];
  await Promise.all(Array.from({ length: 8 }, async () => { while (fila.length) await copiar(fila.shift()); }));
  for (const p of produtos) if (p.variacoes.length) p.foto = p.variacoes.find((v) => v.foto)?.foto ?? p.foto;
  console.log(`\n   ${feitas} copiadas, ${puladas} já estavam lá, ${falhas} falharam (ficaram com o link do Google).`);
  writeFileSync(relatorio, "﻿" + ["linha;codigo;problema", ...problemas.map((p) => [p.linha, csv(p.codigo), csv(p.problema)].join(";"))].join("\n"));
}

// ── Banco: lotes pequenos para não estourar o tempo de cada chamada ──
const LOTE = 60;
const soma = { produtos: 0, variacoes: 0, variacoes_inativadas: 0 };
for (let i = 0; i < produtos.length; i += LOTE) {
  const lote = produtos.slice(i, i + LOTE);
  const { data, error } = await sb.rpc("importar_planilha", { p_produtos: lote });
  if (error) falhar(`Erro no lote ${i / LOTE + 1} (produtos ${lote[0].codigo}…): ${error.message}`);
  for (const k of Object.keys(soma)) soma[k] += data[k];
  process.stdout.write(`  ⬆ ${Math.min(i + LOTE, produtos.length)}/${produtos.length} produtos\r`);
}
console.log(`\n\n✅ ${soma.produtos} produtos e ${soma.variacoes} variações gravados (${soma.variacoes_inativadas} variações que saíram da planilha ficaram inativas).\n`);
