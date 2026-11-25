# Catálogo Online – catálogo interativo com pedido por WhatsApp

## Usar para outra empresa (marca)

Tudo que identifica a empresa fica em poucos lugares:

1. `src/lib/site.ts` — nome, nome curto, slogan, WhatsApp padrão, site institucional e cor do tema/PDF.
2. `src/app/globals.css` — bloco **Cores da marca** (`--marca`, `--marca-escuro`, `--destaque`…).
3. `src/app/layout.tsx` — fontes (corpo e títulos, via `next/font/google`).
4. Imagens: `public/icons/` (`logo-horizontal.png`, `logo-horizontal-branco.png`, `logo.png`, `flor.png`,
   `icon-192.png`, `icon-512.png`, `maskable-512.png`), `src/app/icon.png`, `src/app/apple-icon.png`
   e `src/lib/logo-pdf.ts` (logo 120×120 do PDF do pedido, em base64).

Cada empresa tem o seu próprio projeto no Supabase e na Vercel (dados separados).

Catálogos em formato flipbook (virar página) com áreas clicáveis, carrinho e envio do pedido por WhatsApp.
Next.js 16 + Tailwind 4 + Supabase.

- `/` — vitrine com os catálogos (o marcado como destaque aparece em cima)
- `/c/<slug>` — o catálogo; `/c/<slug>?p=5` abre direto na página 5
- Busca por código ou nome, botão de compartilhar, instalável como app (PWA)
- Prévia com capa e nome ao compartilhar o link no WhatsApp

## Rodar no computador

```bash
cp .env.example .env.local   # preencher URL e chave publishable do Supabase
npm install
npm run dev                  # http://localhost:3000
```

## Publicar na Vercel

1. Em vercel.com: **Add New → Project** → importar este repositório.
2. Em **Environment Variables**, cadastrar:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `NEXT_PUBLIC_SITE_URL` — o endereço final, ex.: `https://catalogo.suaempresa.com.br` (sem barra no fim).
     Opcional: sem ele, usa o domínio de produção da Vercel.
3. **Deploy**. Cada push na `main` publica de novo automaticamente.

> ⚠️ Nunca cadastre a `SUPABASE_SERVICE_ROLE_KEY` na Vercel. Ela é só para os scripts de importação no seu computador.

## Importar um catálogo novo (PDF)

Coloque no `.env.local` também a `SUPABASE_SERVICE_ROLE_KEY`
(Supabase → Project Settings → API Keys → *secret* / *service_role*).

```bash
npm run importar-pdf -- "C:\caminho\Catalogo São Bento.pdf" --slug sao-bento --nome "Coleção São Bento"
```

Opções: `--descricao "texto"`, `--destaque` (vira o principal da home), `--sem-icones` (o PDF já tem o
ícone do carrinho desenhado), `--whatsapp 5543...`, `--seco` (só gera as imagens em `importacao/<slug>/`, sem enviar).

Reimportar o mesmo `--slug` substitui as páginas (as áreas clicáveis continuam, ligadas ao número da página).

Se o PDF tiver texto selecionável, os códigos de produto são detectados e salvos em
`importacao/<slug>/produtos.csv`, já com a página e a posição de cada um.

## Importar produtos e preços (planilha)

```bash
npm run importar-produtos -- produtos.csv --slug sao-bento
```

Veja `exemplos/produtos-exemplo.csv`. Colunas (separador `;` como o Excel salva):

| coluna | exemplo | observação |
|---|---|---|
| codigo | `AD.050` | obrigatório |
| nome | `Adesivo Preto São Bento` | obrigatório para produto novo |
| descricao | `Embalagem: saquinho plástico` | |
| preco | `5,14` · `R$ 1.234,56` · `-` | `-` = sob consulta |
| qtd_minima | `6` | |
| variacoes | `Pequeno 5 cm = AD.050-4 = 2,20 \| Médio 10 cm = AD.050-5 = 4,09` | rótulo = código = preço; `-` remove todas |
| pagina, x, y, w, h | `2;60;20;30;25` | área clicável em % da página |

Célula vazia mantém o valor atual. Use `--seco` para só validar a planilha.

## Banco (Supabase)

As migrations estão em `supabase/migrations/` e são aplicadas em ordem (01 a 19), num projeto novo e vazio.

- O público só lê `catalogos`, `paginas`, `produtos`, `variacoes` e `hotspots`.
- Carrinho, pedidos e eventos **não** são acessíveis ao público: a escrita passa só pelas funções
  `salvar_carrinho`, `finalizar_pedido` e `registrar_evento`, que recalculam preço e descrição no servidor.
- Administrador: crie a conta (Authentication → Users) e cadastre o `user_id` em `public.admins`.
- Editores (só a aba Catálogos e os carrinhos): `user_id` em `public.editores`.
