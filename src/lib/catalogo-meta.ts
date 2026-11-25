import { cacheLife } from "next/cache";

// Leitura no servidor só para metadados (título, descrição e capa na prévia do WhatsApp).
// Usa a API REST pública com a chave publishable: mesmas permissões do navegador.

type Meta = { nome: string; descricao: string | null; capa: string | null };

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CHAVE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

function urlCapa(path: string | null): string | null {
  if (!path) return null;
  if (path.startsWith("http") || path.startsWith("/")) return path;
  return `${URL_SB}/storage/v1/object/public/catalogo/${path}`;
}

async function buscar(query: string): Promise<Meta | null> {
  if (!URL_SB || !CHAVE) return null;
  try {
    const r = await fetch(`${URL_SB}/rest/v1/catalogos?select=nome,descricao,capa_path&${query}&limit=1`, {
      headers: { apikey: CHAVE, Authorization: `Bearer ${CHAVE}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    const [c] = (await r.json()) as { nome: string; descricao: string | null; capa_path: string | null }[];
    return c ? { nome: c.nome, descricao: c.descricao, capa: urlCapa(c.capa_path) } : null;
  } catch {
    return null; // sem rede/fora do ar: a página usa os metadados padrão
  }
}

export async function metaCatalogo(slug: string): Promise<Meta | null> {
  "use cache";
  cacheLife("hours");
  return buscar(`slug=eq.${encodeURIComponent(slug)}`);
}

export async function metaDestaque(): Promise<Meta | null> {
  "use cache";
  cacheLife("hours");
  return buscar("order=destaque.desc,ordem.asc");
}
