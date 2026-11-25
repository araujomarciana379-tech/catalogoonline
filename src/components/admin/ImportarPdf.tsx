"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { emLotes } from "@/lib/catalogo-data";
import { abrirPdf, areaDoCodigo, lerPagina, type PaginaLida } from "@/lib/pdf-importacao";

export type ResultadoImportacao = {
  paginas: number;
  codigos: number;
  ligados: number;
  desconhecidos: string[];
  areas: number;
  fotos: number;
  /** modo "religar": carrinhos que já existiam e receberam o produto */
  religados?: number;
};

type Produto = { id: string; codigo: string; foto_path: string | null };
type Variacao = { id: string; produto_id: string; codigo: string; foto_path: string | null };

const nomeArquivo = (codigo: string) => codigo.replace(/[^A-Za-z0-9.-]+/g, "_");

/**
 * Lê o PDF no navegador e grava tudo no Supabase: imagens das páginas, páginas do catálogo,
 * áreas clicáveis (🛒) nos códigos encontrados no texto e fotos recortadas dos produtos sem foto.
 *
 * modo "novo": o catálogo acabou de ser criado (sem páginas).
 * modo "substituir": troca as imagens das páginas; os carrinhos já posicionados continuam onde estão.
 * modo "religar": não mexe nas páginas; relê os códigos do PDF e liga o produto aos carrinhos que já existem
 *   (mesma posição), criando só os que faltam. Serve para recuperar ligações perdidas.
 */
export async function importarPdf(
  arquivo: File,
  catalogo: { id: string; slug: string },
  modo: "novo" | "substituir" | "religar",
  progresso: (texto: string, fracao: number) => void,
): Promise<ResultadoImportacao> {
  const pdf = await abrirPdf(arquivo);
  const total = pdf.numPages;
  // Pasta nova a cada importação: o celular do cliente não fica com a imagem antiga em cache.
  const versao = Date.now().toString(36);
  const lidas: PaginaLida[] = [];
  const comFoto = new Set<string>();

  for (let n = 1; n <= total; n++) {
    progresso(`Lendo página ${n} de ${total}…`, (n - 1) / total);
    const p = await lerPagina(pdf, n, 1100, comFoto);
    for (const c of p.fotos.keys()) comFoto.add(c);
    if (modo !== "religar") {
      const { error } = await supabase.storage
        .from("catalogo")
        .upload(`${catalogo.slug}/${versao}/p-${n}.jpg`, p.jpeg, { contentType: "image/jpeg", cacheControl: "31536000" });
      if (error) throw new Error(`Falha ao enviar a página ${n}: ${error.message}`);
    }
    lidas.push(p);
  }
  await pdf.cleanup();
  // Falha de leitura (formato de imagem que o navegador não decodificou): melhor parar do que publicar páginas em branco.
  const vazias = lidas.filter((p) => p.vazia).length;
  if (modo !== "religar" && vazias > Math.max(2, lidas.length * 0.5)) {
    throw new Error(
      `${vazias} de ${lidas.length} páginas saíram em branco: este PDF usa um formato que o navegador não conseguiu desenhar. Reexporte o PDF (por exemplo, "Salvar como PDF" de novo no Corel/Canva) ou importe com o script do computador.`,
    );
  }

  let pags: { id: string; numero: number }[] | null;
  if (modo === "religar") {
    // O PDF precisa ser o mesmo do catálogo: as páginas existentes são as de destino.
    const { data, error: ep } = await supabase.from("paginas").select("id, numero").eq("catalogo_id", catalogo.id);
    if (ep) throw new Error(ep.message);
    pags = data;
  } else {
    progresso("Gravando páginas…", 0.9);
    const linhas = lidas.map((p) => ({
      catalogo_id: catalogo.id,
      numero: p.numero,
      imagem_path: `${catalogo.slug}/${versao}/p-${p.numero}.jpg`,
      largura: p.largura,
      altura: p.altura,
    }));
    const { data, error: ep } = await supabase.from("paginas").upsert(linhas, { onConflict: "catalogo_id,numero" }).select("id, numero");
    if (ep) throw new Error(ep.message);
    pags = data;
    // PDF novo com menos páginas: as que sobraram saem (e os carrinhos delas).
    await supabase.from("paginas").delete().eq("catalogo_id", catalogo.id).gt("numero", total);
    await supabase.from("catalogos").update({ capa_path: linhas[0]?.imagem_path ?? null }).eq("id", catalogo.id);
  }

  const res: ResultadoImportacao = { paginas: total, codigos: 0, ligados: 0, desconhecidos: [], areas: 0, fotos: 0 };
  const codigos = [...new Set(lidas.flatMap((p) => p.codigos.map((c) => c.codigo)))];
  res.codigos = codigos.length;
  if (!codigos.length) return res;

  // Códigos → produto (código do produto) ou variação (código do santo/cor).
  progresso("Procurando os produtos…", 0.92);
  const prods = (await emLotes(codigos, (l) => supabase.from("produtos").select("id, codigo, foto_path").in("codigo", l))) as Produto[];
  const vars = (await emLotes(codigos, (l) => supabase.from("variacoes").select("id, produto_id, codigo, foto_path").in("codigo", l).eq("ativo", true))) as Variacao[];
  const porCodigo = new Map<string, { produto_id: string; variacao_id: string | null }>();
  for (const v of vars) porCodigo.set(v.codigo, { produto_id: v.produto_id, variacao_id: v.id });
  for (const p of prods) porCodigo.set(p.codigo, { produto_id: p.id, variacao_id: null });
  res.desconhecidos = codigos.filter((c) => !porCodigo.has(c));
  res.ligados = codigos.length - res.desconhecidos.length;

  const produtoIds = [...new Set([...porCodigo.values()].map((x) => x.produto_id))];
  if (produtoIds.length) {
    await supabase
      .from("catalogo_produtos")
      .upsert(produtoIds.map((produto_id) => ({ catalogo_id: catalogo.id, produto_id })), { onConflict: "catalogo_id,produto_id", ignoreDuplicates: true });
  }

  // Áreas clicáveis só no catálogo novo (ao substituir o PDF, as posições já ajustadas são mantidas).
  if (modo === "novo") {
    progresso("Criando os carrinhos…", 0.95);
    const idPagina = new Map((pags ?? []).map((p) => [p.numero as number, p.id as string]));
    const areas = lidas.flatMap((p) => {
      const vistos = new Set<string>();
      return p.codigos
        .filter((c) => !vistos.has(c.codigo) && vistos.add(c.codigo))
        .map((c) => ({
          pagina_id: idPagina.get(p.numero)!,
          tipo: "comprar",
          ...areaDoCodigo(c, p.caixas.get(c.codigo)),
          // Código desconhecido vira carrinho sem produto: aparece no editor para ligar (o cliente não vê).
          produto_id: porCodigo.get(c.codigo)?.produto_id ?? null,
          variacao_id: porCodigo.get(c.codigo)?.variacao_id ?? null,
        }));
    });
    for (let i = 0; i < areas.length; i += 200) {
      const { error } = await supabase.from("hotspots").insert(areas.slice(i, i + 200));
      if (error) throw new Error(`Falha ao criar carrinhos: ${error.message}`);
    }
    res.areas = areas.length;
  }

  if (modo === "religar") {
    progresso("Religando os carrinhos…", 0.95);
    const idPagina = new Map((pags ?? []).map((p) => [p.numero as number, p.id as string]));
    type Hot = { id: string; pagina_id: string; x: number; y: number; w: number; h: number; tipo: string; produto_id: string | null; variacao_id: string | null };
    const existentes = (await emLotes([...idPagina.values()], (l) =>
      supabase.from("hotspots").select("id, pagina_id, x, y, w, h, tipo, produto_id, variacao_id").in("pagina_id", l).eq("tipo", "comprar"),
    )) as Hot[];
    const porPagina = new Map<string, Hot[]>();
    for (const h of existentes) porPagina.set(h.pagina_id, [...(porPagina.get(h.pagina_id) ?? []), { ...h, x: +h.x, y: +h.y, w: +h.w, h: +h.h }]);

    const atualizar: Hot[] = [];
    const criar: Record<string, unknown>[] = [];
    for (const p of lidas) {
      const pid = idPagina.get(p.numero);
      if (!pid) continue; // o PDF tem página que o catálogo não tem
      const livres = (porPagina.get(pid) ?? []).filter((h) => !h.produto_id);
      const vistos = new Set<string>();
      for (const c of p.codigos) {
        if (vistos.has(c.codigo)) continue;
        vistos.add(c.codigo);
        const alvo = porCodigo.get(c.codigo);
        const area = areaDoCodigo(c, p.caixas.get(c.codigo));
        // O carrinho existente mais perto desta posição (se estiver a menos de 2% da página) recebe o produto.
        let melhor = -1;
        let dist = 2;
        livres.forEach((h, i) => {
          const d = Math.hypot(h.x - area.x, h.y - area.y);
          if (d < dist) {
            dist = d;
            melhor = i;
          }
        });
        if (melhor >= 0 && alvo) {
          const [h] = livres.splice(melhor, 1);
          atualizar.push({ ...h, produto_id: alvo.produto_id, variacao_id: alvo.variacao_id });
        } else if (melhor < 0) {
          criar.push({ pagina_id: pid, tipo: "comprar", ...area, produto_id: alvo?.produto_id ?? null, variacao_id: alvo?.variacao_id ?? null });
        }
      }
    }
    for (let i = 0; i < atualizar.length; i += 200) {
      const { error } = await supabase.from("hotspots").upsert(atualizar.slice(i, i + 200), { onConflict: "id" });
      if (error) throw new Error(`Falha ao religar carrinhos: ${error.message}`);
    }
    for (let i = 0; i < criar.length; i += 200) {
      const { error } = await supabase.from("hotspots").insert(criar.slice(i, i + 200));
      if (error) throw new Error(`Falha ao criar carrinhos: ${error.message}`);
    }
    res.religados = atualizar.length;
    res.areas = criar.length;
  }

  // Fotos recortadas: só preenchem quem ainda não tem foto.
  const semFotoProd = new Map(prods.filter((p) => !p.foto_path).map((p) => [p.codigo, p.id]));
  const semFotoVar = new Map(vars.filter((v) => !v.foto_path).map((v) => [v.codigo, v.id]));
  const fotos = lidas.flatMap((p) => [...p.fotos].filter(([c]) => semFotoProd.has(c) || semFotoVar.has(c)));
  for (let i = 0; i < fotos.length; i++) {
    const [codigo, f] = fotos[i];
    progresso(`Enviando fotos dos produtos (${i + 1} de ${fotos.length})…`, 0.96 + (0.04 * i) / fotos.length);
    const destino = `produtos/${nomeArquivo(codigo)}/pdf-${versao}.jpg`;
    const up1 = await supabase.storage.from("catalogo").upload(destino, f.foto, { contentType: "image/jpeg", cacheControl: "604800" });
    const up2 = await supabase.storage.from("catalogo").upload(destino.replace(/\.jpg$/, ".thumb.jpg"), f.thumb, { contentType: "image/jpeg", cacheControl: "604800" });
    if (up1.error || up2.error) continue;
    const prodId = semFotoProd.get(codigo);
    const { error } = prodId
      ? await supabase.from("produtos").update({ foto_path: destino }).eq("id", prodId).is("foto_path", null)
      : await supabase.from("variacoes").update({ foto_path: destino }).eq("id", semFotoVar.get(codigo)!).is("foto_path", null);
    if (!error) res.fotos++;
  }
  progresso("Pronto!", 1);
  return res;
}

/** Campo de arquivo PDF com área de soltar. */
export function EscolherPdf({ arquivo, onArquivo, disabled }: { arquivo: File | null; onArquivo: (f: File | null) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [sobre, setSobre] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setSobre(true);
      }}
      onDragLeave={() => setSobre(false)}
      onDrop={(e) => {
        e.preventDefault();
        setSobre(false);
        const f = e.dataTransfer.files[0];
        if (f && !disabled) onArquivo(/pdf$/i.test(f.type) || /\.pdf$/i.test(f.name) ? f : null);
      }}
      className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center text-sm ${sobre ? "border-marca bg-blue-50" : "border-slate-300 bg-slate-50"}`}
    >
      <input ref={input} type="file" accept="application/pdf,.pdf" hidden disabled={disabled} onChange={(e) => onArquivo(e.target.files?.[0] ?? null)} />
      {arquivo ? (
        <p>
          📄 <strong>{arquivo.name}</strong> <span className="text-slate-500">({(arquivo.size / 1048576).toFixed(1)} MB)</span>
        </p>
      ) : (
        <p className="text-slate-600">Arraste o PDF do catálogo aqui</p>
      )}
      <button type="button" disabled={disabled} onClick={() => input.current?.click()} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium hover:bg-slate-100 disabled:opacity-50">
        {arquivo ? "Trocar arquivo" : "Escolher PDF"}
      </button>
    </div>
  );
}

/** Barra de progresso + texto. */
export function Progresso({ texto, fracao }: { texto: string; fracao: number }) {
  return (
    <div role="status" aria-live="polite">
      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-marca transition-[width]" style={{ width: `${Math.round(fracao * 100)}%` }} />
      </div>
      <p className="mt-1 text-sm text-slate-600">{texto}</p>
    </div>
  );
}

/** Resumo do que foi importado, com o próximo passo. */
export function ResumoImportacao({ r, slug }: { r: ResultadoImportacao; slug: string }) {
  return (
    <div className="space-y-2 text-sm">
      <p>✅ <strong>{r.paginas}</strong> página(s) importadas.</p>
      {r.codigos ? (
        <>
          <p>
            🔎 <strong>{r.codigos}</strong> código(s) encontrados no texto do PDF; <strong>{r.ligados}</strong> ligados a produtos cadastrados
            {r.religados ? <>, <strong>{r.religados}</strong> carrinho(s) que já existiam religados ao produto</> : null}
            {r.areas ? <>, <strong>{r.areas}</strong> carrinho(s) criados</> : null}
            {r.fotos ? <>, <strong>{r.fotos}</strong> foto(s) de produto preenchidas</> : null}.
          </p>
          {r.desconhecidos.length > 0 && (
            <details className="rounded-lg bg-amber-50 p-2 text-amber-900">
              <summary className="cursor-pointer">
                ⚠️ {r.desconhecidos.length} código(s) não estão cadastrados em Produtos — os carrinhos deles ficam sem produto até você ligar no editor
              </summary>
              <p className="mt-1 break-words font-mono text-xs">{r.desconhecidos.join(", ")}</p>
            </details>
          )}
        </>
      ) : (
        <p className="rounded-lg bg-amber-50 p-2 text-amber-900">
          ⚠️ Não achei códigos de produto no texto do PDF (provavelmente o texto foi convertido em curvas). Abra o editor de carrinhos,
          importe a planilha do catálogo (lista de códigos) e arraste cada produto da bandeja para o lugar dele na página.
        </p>
      )}
      <p className="pt-1">
        <a href={`/admin/c/${slug}`} className="inline-block rounded-lg bg-marca px-4 py-2 font-semibold text-white hover:bg-marca-hover">
          Conferir carrinhos no editor →
        </a>
      </p>
    </div>
  );
}
