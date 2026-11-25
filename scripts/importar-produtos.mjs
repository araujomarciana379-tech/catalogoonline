// Cria/atualiza produtos, preços, variações e áreas clicáveis a partir de uma planilha CSV.
//
//   npm run importar-produtos -- produtos.csv --slug catalogo-geral [--seco]
//
// Colunas (separador ; ou ,  — o Excel em português salva com ;):
//   codigo       obrigatório (ex.: AD.050-4)
//   nome         obrigatório para produto novo
//   descricao
//   preco        12,50 | R$ 1.234,56 | 12.5     "-" = sem preço (sob consulta)
//   qtd_minima   número inteiro
//   variacoes    Pequeno 5 cm = AD.050-4 = 2,20 | Médio 10 cm = AD.050-5 = 4,09
//                (rótulo = código = preço; código e preço são opcionais)   "-" = remove todas
//   pagina, x, y, w, h   área clicável em % da página (gerada pelo importar-pdf)
//
// Célula vazia = mantém o valor atual. Use --seco para só validar a planilha.

import { readFileSync } from "node:fs";
import { clienteAdmin, falhar, lerArgs, slugValido } from "./_comum.mjs";

const { pos, opt } = lerArgs();
const arquivo = pos[0];
if (!arquivo || !opt.slug) falhar("Uso: npm run importar-produtos -- planilha.csv --slug nome-do-catalogo [--seco]");
const slug = String(opt.slug).toLowerCase();
if (!slugValido(slug)) falhar(`Slug inválido: "${slug}".`);

// ── CSV ──
function parseCsv(texto) {
  texto = texto.replace(/^﻿/, "");
  const primeira = texto.split(/\r?\n/, 1)[0];
  const sep = (primeira.match(/;/g)?.length ?? 0) >= (primeira.match(/,/g)?.length ?? 0) ? ";" : ",";
  const linhas = [];
  let campo = "", linha = [], aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linha.push(campo); linhas.push(linha); linha = []; campo = "";
    } else campo += c;
  }
  if (campo !== "" || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas.filter((l) => l.some((v) => v.trim() !== ""));
}

const semAcento = (s) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

/** "R$ 1.234,56" → 1234.56 ; "12.5" → 12.5 ; "-" → null ; "" → undefined (manter) */
function parsePreco(v, onde) {
  const s = v.trim();
  if (s === "") return undefined;
  if (s === "-") return null;
  let t = s.replace(/r\$\s*/i, "").replace(/\s/g, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${onde}: preço inválido "${v}"`);
  return Math.round(n * 100) / 100;
}

function parseVariacoes(v, onde) {
  const s = v.trim();
  if (s === "") return undefined;
  if (s === "-") return [];
  return s.split("|").map((parte, ordem) => {
    const [rotulo, codigo = "", preco = ""] = parte.split("=").map((x) => x.trim());
    if (!rotulo) throw new Error(`${onde}: variação sem rótulo em "${parte}"`);
    return { rotulo, codigo: codigo || null, preco: preco ? parsePreco(preco, onde) : null, ordem };
  });
}

const linhas = parseCsv(readFileSync(arquivo, "utf8"));
if (linhas.length < 2) falhar("Planilha vazia.");
const cab = linhas[0].map(semAcento);
const col = (nome) => cab.indexOf(nome);
if (col("codigo") < 0) falhar(`A planilha precisa da coluna "codigo". Colunas encontradas: ${linhas[0].join(", ")}`);

const erros = [];
const itens = [];
const vistos = new Set();
for (let i = 1; i < linhas.length; i++) {
  const l = linhas[i];
  const get = (nome) => (col(nome) >= 0 ? (l[col(nome)] ?? "").trim() : "");
  const onde = `linha ${i + 1}`;
  try {
    const codigo = get("codigo").toUpperCase();
    if (!codigo) throw new Error(`${onde}: código vazio`);
    if (vistos.has(codigo)) throw new Error(`${onde}: código ${codigo} repetido na planilha`);
    vistos.add(codigo);

    const qtdTxt = get("qtd_minima");
    const qtd = qtdTxt === "" ? undefined : Number(qtdTxt);
    if (qtd !== undefined && (!Number.isInteger(qtd) || qtd < 1)) throw new Error(`${onde}: qtd_minima inválida "${qtdTxt}"`);

    const area = ["pagina", "x", "y", "w", "h"].map((k) => get(k).replace(",", "."));
    let hotspot;
    if (area.some((v) => v !== "")) {
      const [pagina, x, y, w, h] = area.map(Number);
      const ok = Number.isInteger(pagina) && pagina >= 1 && [x, y].every((v) => v >= 0 && v <= 100) && [w, h].every((v) => v > 0 && v <= 100);
      if (!ok) throw new Error(`${onde}: área clicável incompleta ou inválida (pagina, x, y, w, h)`);
      hotspot = { pagina, x, y, w, h };
    }

    itens.push({
      linha: i + 1,
      codigo,
      nome: get("nome") || undefined,
      descricao: get("descricao") || undefined,
      preco: parsePreco(get("preco"), onde),
      qtd_minima: qtd,
      variacoes: parseVariacoes(get("variacoes"), onde),
      hotspot,
    });
  } catch (e) {
    erros.push(e.message);
  }
}

if (erros.length) falhar(`A planilha tem ${erros.length} erro(s):\n  ${erros.join("\n  ")}`);
console.log(`\n📋 ${itens.length} produto(s) lidos, sem erros.`);

if (opt.seco) {
  for (const it of itens) {
    const partes = [
      it.nome && `nome="${it.nome}"`,
      it.preco !== undefined && `preço=${it.preco ?? "sob consulta"}`,
      it.qtd_minima && `mín=${it.qtd_minima}`,
      it.variacoes && `${it.variacoes.length} variação(ões)`,
      it.hotspot && `área na pág. ${it.hotspot.pagina}`,
    ].filter(Boolean);
    console.log(`  ${it.codigo}: ${partes.join(", ") || "(sem alterações)"}`);
  }
  console.log("\n(--seco) Nada foi enviado ao Supabase.\n");
  process.exit(0);
}

// ── Banco ──
const sb = clienteAdmin();
const { data: cat, error: e0 } = await sb.from("catalogos").select("id").eq("slug", slug).maybeSingle();
if (e0) falhar(e0.message);
if (!cat) falhar(`Catálogo "${slug}" não existe. Rode antes: npm run importar-pdf -- arquivo.pdf --slug ${slug} --nome "..."`);

const { data: existentes, error: e1 } = await sb.from("produtos").select("id, codigo").eq("catalogo_id", cat.id);
if (e1) falhar(e1.message);
const idPorCodigo = new Map(existentes.map((p) => [p.codigo.toUpperCase(), p.id]));

const { data: paginas, error: e2 } = await sb.from("paginas").select("id, numero").eq("catalogo_id", cat.id);
if (e2) falhar(e2.message);
const paginaPorNumero = new Map(paginas.map((p) => [p.numero, p.id]));

let criados = 0, atualizados = 0, areas = 0;
const avisos = [];

for (const it of itens) {
  const campos = Object.fromEntries(
    Object.entries({ nome: it.nome, descricao: it.descricao, preco: it.preco, qtd_minima: it.qtd_minima }).filter(([, v]) => v !== undefined),
  );
  let id = idPorCodigo.get(it.codigo);
  if (id) {
    if (Object.keys(campos).length) {
      const { error } = await sb.from("produtos").update(campos).eq("id", id);
      if (error) falhar(`${it.codigo}: ${error.message}`);
    }
    atualizados++;
  } else {
    const { data, error } = await sb
      .from("produtos")
      .insert({ catalogo_id: cat.id, codigo: it.codigo, nome: it.nome ?? it.codigo, ...campos })
      .select("id")
      .single();
    if (error) falhar(`${it.codigo}: ${error.message}`);
    id = data.id;
    idPorCodigo.set(it.codigo, id);
    criados++;
    if (!it.nome) avisos.push(`${it.codigo}: criado sem nome (usei o código como nome)`);
  }

  // Variações: casa pelo rótulo para manter os IDs (carrinhos abertos continuam válidos).
  if (it.variacoes) {
    const { data: atuais, error } = await sb.from("variacoes").select("id, rotulo").eq("produto_id", id);
    if (error) falhar(error.message);
    const porRotulo = new Map(atuais.map((v) => [semAcento(v.rotulo), v.id]));
    const manter = new Set();
    for (const v of it.variacoes) {
      const vid = porRotulo.get(semAcento(v.rotulo));
      const r = vid
        ? await sb.from("variacoes").update(v).eq("id", vid)
        : await sb.from("variacoes").insert({ ...v, produto_id: id });
      if (r.error) falhar(`${it.codigo} / ${v.rotulo}: ${r.error.message}`);
      if (vid) manter.add(vid);
    }
    const remover = atuais.filter((v) => !manter.has(v.id));
    if (remover.length) await sb.from("variacoes").delete().in("id", remover.map((v) => v.id));
  }

  if (it.hotspot) {
    const paginaId = paginaPorNumero.get(it.hotspot.pagina);
    if (!paginaId) {
      avisos.push(`${it.codigo}: página ${it.hotspot.pagina} não existe no catálogo (área ignorada)`);
      continue;
    }
    const { x, y, w, h } = it.hotspot;
    const { data: hs } = await sb.from("hotspots").select("id").eq("pagina_id", paginaId).eq("produto_id", id).eq("tipo", "comprar").limit(1);
    const r = hs?.length
      ? await sb.from("hotspots").update({ x, y, w, h }).eq("id", hs[0].id)
      : await sb.from("hotspots").insert({ pagina_id: paginaId, produto_id: id, tipo: "comprar", x, y, w, h });
    if (r.error) falhar(`${it.codigo}: ${r.error.message}`);
    areas++;
  }
}

if (avisos.length) console.log(`\n⚠ Avisos:\n  ${avisos.join("\n  ")}`);
console.log(`\n✅ ${criados} criado(s), ${atualizados} atualizado(s), ${areas} área(s) clicável(is) gravada(s).\n`);
