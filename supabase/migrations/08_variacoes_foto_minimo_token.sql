-- (Aplicada) Variações com foto, mínimo e ativo; produtos com código único; itens com nome/variação; token do pedido.
alter table public.variacoes
  add column foto_path text,
  add column qtd_minima int check (qtd_minima >= 1),
  add column ativo boolean not null default true;
alter table public.variacoes add constraint variacoes_produto_rotulo_key unique (produto_id, rotulo);

alter table public.produtos add constraint produtos_codigo_key unique (codigo);

alter table public.carrinho_itens
  add column produto_nome text,
  add column variacao_rotulo text;

alter table public.pedidos add column token uuid not null default gen_random_uuid();
