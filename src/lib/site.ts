/**
 * Identidade da empresa. Para usar o sistema em outra empresa, troque os valores abaixo,
 * as cores em `src/app/globals.css` (bloco "Cores da marca") e as imagens em `public/icons/` e `src/app/`.
 */

/** URL pública do site (para links absolutos em prévias de compartilhamento). */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

/** Nome completo da empresa. */
export const MARCA = "Zanato Artigos Religiosos";
/** Nome curto (ícone do app, textos de conversa). */
export const MARCA_CURTA = "Zanato";
export const SLOGAN = "Artigos religiosos inspirados em sua fé.";
/** WhatsApp que recebe os pedidos de um catálogo novo (DDI + DDD + número, só dígitos). */
export const WHATSAPP_PADRAO = "5543996127577";
/** Site institucional da empresa (aparece no rodapé da página inicial). */
export const SITE_INSTITUCIONAL = "https://zanatoartigosreligiosos.com";
/** Cor principal (barra do navegador, PWA e cabeçalho do PDF do pedido). Mantenha igual a --marca-escuro do globals.css. */
export const COR_TEMA = "#4B2A5C";
/** Mesma cor em RGB, para o PDF do pedido. */
export const COR_PDF: [number, number, number] = [132, 79, 153];
