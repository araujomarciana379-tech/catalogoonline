"use client";

// Leitura da planilha base (modelo Vou Pedir) no navegador: mesmas regras de scripts/importar-planilha.mjs.
//   GROUPING KEY = produto (o código impresso no catálogo). Cada linha = uma variação (NAME = santo/cor/tamanho).
//   Grupo de uma linha só = produto sem variação.  PACKAGE SIZE "LIVRE" = sem mínimo (1).

export type VariacaoPlanilha = { rotulo: string; codigo: string; preco: number | null; qtd_minima: number; foto: string; ordem: number };
export type ProdutoPlanilha = { codigo: string; nome: string; preco: number | null; qtd_minima: number; foto: string; variacoes: VariacaoPlanilha[] };
export type Problema = { linha: number | string; codigo: string; problema: string };

const texto = (v: unknown): string => {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] };
    if (o.richText) return o.richText.map((t) => t.text).join("");
    if ("result" in o) return texto(o.result);
    if ("text" in o) return texto(o.text);
  }
  return String(v).trim();
};

const agrupar = <T,>(arr: T[], chave: (x: T) => string) => {
  const m = new Map<string, T[]>();
  for (const x of arr) {
    const k = chave(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(x);
  }
  return m;
};

export async function lerPlanilha(arquivo: File): Promise<{ produtos: ProdutoPlanilha[]; problemas: Problema[]; codigos: number }> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await arquivo.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("A planilha está vazia.");
  const cab: Record<string, number> = {};
  ws.getRow(1).eachCell((c, i) => (cab[texto(c.value).toLowerCase()] = i));
  const col = (nome: string) => cab[nome.toLowerCase()];
  for (const obrig of ["ID", "NAME", "PRICE", "PACKAGE SIZE", "GROUPING KEY"]) {
    if (!col(obrig)) throw new Error(`A planilha precisa da coluna "${obrig}" na linha 1 (modelo Vou Pedir).`);
  }

  const problemas: Problema[] = [];
  const anotar = (linha: number | string, codigo: string, problema: string) => problemas.push({ linha, codigo, problema });
  const preco = (v: string, linha: number, codigo: string) => {
    const s = v.replace(/r\$\s*/i, "").replace(/\s/g, "");
    if (s === "") return null;
    const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
    if (!Number.isFinite(n) || n < 0) {
      anotar(linha, codigo, `preço inválido "${v}" (importado como "sob consulta")`);
      return null;
    }
    return Math.round(n * 100) / 100;
  };
  const minimo = (v: string, linha: number, codigo: string) => {
    if (v === "" || /^livre$/i.test(v)) return 1;
    const n = Number(v.replace(",", "."));
    if (!Number.isFinite(n) || n < 1) {
      anotar(linha, codigo, `quantidade mínima inválida "${v}" (importado como 1)`);
      return 1;
    }
    return Math.round(n);
  };

  type Linha = { linha: number; id: string; grupo: string; nome: string; preco: number | null; minimo: number; descricao: string; foto: string };
  const linhas: Linha[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const get = (nome: string) => (col(nome) ? texto(row.getCell(col(nome)).value) : "");
    const id = get("ID");
    if (!id || /^inserir/i.test(id)) return; // linha de instruções do modelo
    linhas.push({
      linha: n,
      id,
      grupo: get("GROUPING KEY") || id,
      nome: get("NAME"),
      preco: preco(get("PRICE"), n, id),
      minimo: minimo(get("PACKAGE SIZE"), n, id),
      descricao: get("Apenas descrição") || get("DESCRIPTION").replace(/\s*-\s*CÓD:.*$/i, ""),
      foto: get("Image 1"),
    });
  });
  if (!linhas.length) throw new Error("Nenhum produto encontrado na planilha.");

  for (const [id, ls] of agrupar(linhas, (l) => l.id)) {
    if (ls.length > 1) for (const l of ls) anotar(l.linha, id, `código repetido em ${ls.length} linhas (grupos: ${[...new Set(ls.map((x) => x.grupo))].join(", ")})`);
  }

  const maisComum = (arr: string[]) => {
    const c = new Map<string, number>();
    for (const x of arr) if (x) c.set(x, (c.get(x) ?? 0) + 1);
    return [...c].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  };
  const numeroInicial = (s: string) => Number(s.match(/^(\d{1,3})\s/)?.[1] ?? NaN);

  const produtos: ProdutoPlanilha[] = [];
  for (const [grupo, ls] of agrupar(linhas, (l) => l.grupo)) {
    const nome = maisComum(ls.map((l) => l.descricao)) || grupo;
    const foto = ls.find((l) => l.foto)?.foto ?? "";
    if (ls.length === 1) {
      const [l] = ls;
      produtos.push({ codigo: grupo, nome, preco: l.preco, qtd_minima: l.minimo, foto, variacoes: [] });
      continue;
    }
    const usados = new Set<string>();
    const variacoes = ls
      .map((l, i) => {
        let rotulo = l.nome.replace(/\s*-\s*CÓD:.*$/i, "") || (l.descricao !== nome ? l.descricao : "") || l.id;
        if (!l.nome) anotar(l.linha, l.id, `variação sem NAME (usei "${rotulo}")`);
        if (usados.has(rotulo)) {
          anotar(l.linha, l.id, `variação "${rotulo}" repetida no grupo ${grupo} (usei "${rotulo} – ${l.id}")`);
          rotulo = `${rotulo} – ${l.id}`;
        }
        usados.add(rotulo);
        return { rotulo, codigo: l.id, preco: l.preco, qtd_minima: l.minimo, foto: l.foto, i };
      })
      // Santos na ordem do número (03, 04, 05…); o resto na ordem da planilha.
      .sort((a, b) => (numeroInicial(a.rotulo) || 1000 + a.i) - (numeroInicial(b.rotulo) || 1000 + b.i))
      .map((v, ordem) => ({ rotulo: v.rotulo, codigo: v.codigo, preco: v.preco, qtd_minima: v.qtd_minima, foto: v.foto, ordem }));
    const precos = variacoes.map((v) => v.preco);
    produtos.push({
      codigo: grupo,
      nome,
      preco: precos.every((x) => x === precos[0]) ? precos[0] : null,
      qtd_minima: Math.min(...variacoes.map((v) => v.qtd_minima)),
      foto,
      variacoes,
    });
  }
  return { produtos, problemas, codigos: linhas.length };
}

/** Relatório de problemas em CSV (abre no Excel com acentos). */
export function problemasCsv(problemas: Problema[]): Blob {
  const q = (s: unknown) => `"${String(s).replace(/"/g, '""')}"`;
  const linhas = ["linha;codigo;problema", ...problemas.map((p) => [p.linha, q(p.codigo), q(p.problema)].join(";"))];
  return new Blob(["﻿" + linhas.join("\n")], { type: "text/csv;charset=utf-8" });
}
