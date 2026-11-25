import { supabase } from "./supabase";
import type { CatalogoCompleto, CatalogoResumo, Hotspot, HotspotOpcao, Pagina, Produto, Variacao } from "./types";

const num = (v: unknown) => (v == null ? null : Number(v));

/** `.in()` vira parte da URL: consulta em lotes para não estourar o tamanho com catálogos grandes. */
export async function emLotes<T>(
  ids: string[],
  consulta: (ids: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>,
  tamanho = 120,
): Promise<T[]> {
  const partes = [];
  for (let i = 0; i < ids.length; i += tamanho) partes.push(consulta(ids.slice(i, i + tamanho)));
  const res = await Promise.all(partes);
  for (const r of res) if (r.error) throw r.error;
  return res.flatMap((r) => r.data ?? []);
}

export async function listarCatalogos(): Promise<CatalogoResumo[]> {
  const { data, error } = await supabase
    .from("catalogos")
    .select("slug, nome, descricao, capa_path, destaque")
    .order("destaque", { ascending: false })
    .order("ordem")
    .order("criado_em", { ascending: false });
  if (error) throw error;
  return data as CatalogoResumo[];
}

export async function carregarCatalogo(slug: string): Promise<CatalogoCompleto | null> {
  const { data: catalogo, error } = await supabase
    .from("catalogos")
    .select("id, slug, nome, whatsapp, mensagem_inicial, mostrar_icones")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!catalogo) return null;

  const pag = await supabase.from("paginas").select("id, numero, imagem_path, largura, altura")
    .eq("catalogo_id", catalogo.id).order("numero");
  if (pag.error) throw pag.error;
  const paginas = pag.data as Pagina[];

  // Produtos são uma base única (planilha); o catálogo usa os que têm área clicável nas suas páginas.
  const hotspots = (
    await emLotes(paginas.map((p) => p.id), (ids) =>
      supabase.from("hotspots").select("id, pagina_id, x, y, w, h, tipo, produto_id, url, pagina_destino, variacao_id").in("pagina_id", ids),
    )
  ).map((h) => ({ ...(h as Hotspot), x: Number(h.x), y: Number(h.y), w: Number(h.w), h: Number(h.h) }));

  const opcoes = (await emLotes(hotspots.map((h) => h.id), (ids) =>
    supabase.from("hotspot_opcoes").select("hotspot_id, produto_id, rotulo, ordem").in("hotspot_id", ids),
  )) as HotspotOpcao[];
  const idsProdutos = [...new Set([...hotspots.map((h) => h.produto_id), ...opcoes.map((o) => o.produto_id)].filter((id): id is string => !!id))];
  const [prods, vars] = await Promise.all([
    emLotes(idsProdutos, (ids) =>
      supabase.from("produtos").select("id, codigo, nome, descricao, preco, qtd_minima, foto_path").in("id", ids).eq("ativo", true),
    ),
    emLotes(idsProdutos, (ids) =>
      supabase.from("variacoes").select("id, produto_id, rotulo, codigo, preco, ordem, foto_path, qtd_minima")
        .in("produto_id", ids).eq("ativo", true).order("ordem"),
    ),
  ]);
  // numeric do Postgres pode chegar como string dependendo do cliente; normaliza.
  const produtos = (prods as Produto[]).map((p) => ({ ...p, preco: num(p.preco) })).sort((a, b) => a.codigo.localeCompare(b.codigo));
  const variacoes = (vars as Variacao[]).map((v) => ({ ...v, preco: num(v.preco) }));

  return {
    catalogo,
    paginas,
    produtos,
    variacoes,
    hotspots,
    opcoes: opcoes.sort((a, b) => a.ordem - b.ordem),
  };
}
