-- (Aplicada) Um carrinho pode oferecer vários produtos (ex.: Pequeno = AD.055, Grande = AD.055-1).
create table public.hotspot_opcoes (
  hotspot_id uuid not null references public.hotspots(id) on delete cascade,
  produto_id uuid not null references public.produtos(id) on delete cascade,
  rotulo text not null,
  ordem int not null default 0,
  primary key (hotspot_id, produto_id)
);
create index on public.hotspot_opcoes (produto_id);
alter table public.hotspot_opcoes enable row level security;
create policy "publico le hotspot_opcoes" on public.hotspot_opcoes for select using (true);
create policy "admin total hotspot_opcoes" on public.hotspot_opcoes for all using (public.is_admin()) with check (public.is_admin());

-- Texto da personalização (opção "15 Personalizado") em cada item do carrinho.
alter table public.carrinho_itens add column observacao text;
