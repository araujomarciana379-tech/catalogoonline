-- Catálogos cujo PDF não tem ícone de carrinho desenhado mostram um selo sobre as áreas de compra.
alter table public.catalogos add column mostrar_icones boolean not null default true;
