-- Papel "editor": entra no painel só para a aba Catálogos e mexer nos carrinhos (áreas clicáveis) das páginas.
-- Não vê pedidos, clientes, vendedoras nem produtos; não importa PDF, não exclui nem configura catálogos.
-- (As contas são criadas direto no Auth e liberadas inserindo o user_id em public.editores; nada de senha vai para o repositório.)

create table public.editores (
  user_id uuid primary key references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now()
);
alter table public.editores enable row level security;

create or replace function public.is_editor()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.editores where user_id = auth.uid());
$$;
revoke execute on function public.is_editor() from public, anon;
grant execute on function public.is_editor() to authenticated;

create policy "admin total editores" on public.editores for all using (public.is_admin()) with check (public.is_admin());
create policy "editor le a propria" on public.editores for select using (user_id = auth.uid());

-- Carrinhos (hotspots), tamanhos/versões e produtos do catálogo: leitura e escrita.
create policy "editor total hotspots" on public.hotspots for all using (public.is_editor()) with check (public.is_editor());
create policy "editor total hotspot_opcoes" on public.hotspot_opcoes for all using (public.is_editor()) with check (public.is_editor());
create policy "editor total catalogo_produtos" on public.catalogo_produtos for all using (public.is_editor()) with check (public.is_editor());

-- Leitura do que o editor precisa ver (inclui catálogos ocultos e produtos inativos); sem escrita.
create policy "editor le catalogos" on public.catalogos for select using (public.is_editor());
create policy "editor le produtos" on public.produtos for select using (public.is_editor());
