export type Catalogo = {
  id: string;
  slug: string;
  nome: string;
  whatsapp: string;
  mensagem_inicial: string;
  mostrar_icones: boolean;
};

/** Dados de vitrine (home). */
export type CatalogoResumo = {
  slug: string;
  nome: string;
  descricao: string | null;
  capa_path: string | null;
  destaque: boolean;
};

export type Pagina = {
  id: string;
  numero: number;
  imagem_path: string;
  largura: number | null;
  altura: number | null;
};

export type Produto = {
  id: string;
  codigo: string;
  nome: string;
  descricao: string | null;
  preco: number | null;
  qtd_minima: number;
  foto_path: string | null;
};

export type Variacao = {
  id: string;
  produto_id: string;
  rotulo: string;
  codigo: string | null;
  preco: number | null;
  ordem: number;
  /** Foto desta variação (ex.: o santo); null = usa a do produto. */
  foto_path: string | null;
  /** Mínimo desta variação; null = usa o do produto. */
  qtd_minima: number | null;
};

export type HotspotTipo = "comprar" | "foto" | "link" | "pagina";

export type Hotspot = {
  id: string;
  pagina_id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  tipo: HotspotTipo;
  produto_id: string | null;
  url: string | null;
  pagina_destino: number | null;
  /** Variação já escolhida ao tocar (ex.: o santo tocado na página). */
  variacao_id: string | null;
};

/** Produto extra oferecido por um carrinho (tamanhos/versões). */
export type HotspotOpcao = { hotspot_id: string; produto_id: string; rotulo: string; ordem: number };

export type CatalogoCompleto = {
  catalogo: Catalogo;
  paginas: Pagina[];
  produtos: Produto[];
  variacoes: Variacao[];
  hotspots: Hotspot[];
  opcoes: HotspotOpcao[];
};
