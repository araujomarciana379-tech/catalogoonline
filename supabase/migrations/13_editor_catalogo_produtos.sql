-- (Aplicada) Admin é concedido manualmente (por e-mail), não pelo primeiro login.
revoke execute on function public.claim_admin() from authenticated;

-- Produtos de cada catálogo (planilha do catálogo); os sem área aparecem no editor como "não posicionados".
create table public.catalogo_produtos (
  catalogo_id uuid not null references public.catalogos(id) on delete cascade,
  produto_id uuid not null references public.produtos(id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (catalogo_id, produto_id)
);
create index on public.catalogo_produtos (produto_id);
alter table public.catalogo_produtos enable row level security;
create policy "admin total catalogo_produtos" on public.catalogo_produtos
  for all using (public.is_admin()) with check (public.is_admin());

insert into public.catalogo_produtos (catalogo_id, produto_id)
select distinct p.catalogo_id, h.produto_id
from public.hotspots h join public.paginas p on p.id = h.pagina_id
where h.produto_id is not null
on conflict do nothing;
