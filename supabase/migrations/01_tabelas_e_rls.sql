-- Tabelas, índices, RLS e funções de admin. (Aplicada no projeto raio-de-luz-catalogo.)

create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now()
);
alter table public.admins enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- O primeiro usuário autenticado que chamar vira admin; depois disso a função não concede mais nada.
create or replace function public.claim_admin()
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return false; end if;
  if exists (select 1 from public.admins) then return public.is_admin(); end if;
  insert into public.admins (user_id) values (auth.uid());
  return true;
end $$;

create policy "admin le admins" on public.admins for select using (public.is_admin());

create table public.catalogos (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  nome text not null,
  whatsapp text not null,
  mensagem_inicial text not null default 'Olá! Gostaria de fazer o seguinte pedido:',
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table public.paginas (
  id uuid primary key default gen_random_uuid(),
  catalogo_id uuid not null references public.catalogos(id) on delete cascade,
  numero int not null,
  imagem_path text not null,
  largura int,
  altura int,
  unique (catalogo_id, numero)
);

create table public.produtos (
  id uuid primary key default gen_random_uuid(),
  catalogo_id uuid not null references public.catalogos(id) on delete cascade,
  codigo text not null,
  nome text not null,
  descricao text,
  preco numeric(10,2),
  qtd_minima int not null default 1 check (qtd_minima >= 1),
  foto_path text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (catalogo_id, codigo)
);

create table public.variacoes (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references public.produtos(id) on delete cascade,
  rotulo text not null,
  codigo text,
  preco numeric(10,2),
  ordem int not null default 0
);

create table public.hotspots (
  id uuid primary key default gen_random_uuid(),
  pagina_id uuid not null references public.paginas(id) on delete cascade,
  x numeric not null check (x between 0 and 100),
  y numeric not null check (y between 0 and 100),
  w numeric not null check (w > 0 and w <= 100),
  h numeric not null check (h > 0 and h <= 100),
  tipo text not null check (tipo in ('comprar','foto','link','pagina')),
  produto_id uuid references public.produtos(id) on delete set null,
  url text,
  pagina_destino int
);

create table public.pedidos (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity,
  catalogo_id uuid not null references public.catalogos(id),
  cliente_nome text,
  cliente_whatsapp text,
  itens jsonb not null,
  total numeric(12,2),
  status text not null default 'novo' check (status in ('novo','em_atendimento','fechado','cancelado')),
  observacao text,
  criado_em timestamptz not null default now()
);

create table public.carrinhos (
  id uuid primary key default gen_random_uuid(),
  catalogo_id uuid not null references public.catalogos(id) on delete cascade,
  session_id text not null,
  cliente_nome text,
  cliente_whatsapp text,
  status text not null default 'aberto' check (status in ('aberto','convertido','descartado')),
  pedido_id uuid references public.pedidos(id) on delete set null,
  recuperacao_enviada_em timestamptz,
  criado_em timestamptz not null default now(),
  ultimo_evento_em timestamptz not null default now(),
  unique (catalogo_id, session_id)
);

create table public.carrinho_itens (
  id uuid primary key default gen_random_uuid(),
  carrinho_id uuid not null references public.carrinhos(id) on delete cascade,
  produto_id uuid references public.produtos(id) on delete set null,
  variacao_id uuid references public.variacoes(id) on delete set null,
  codigo text,
  descricao text not null,
  quantidade int not null check (quantidade > 0),
  preco_unitario numeric(10,2)
);

create table public.eventos (
  id bigint generated always as identity primary key,
  catalogo_id uuid not null references public.catalogos(id) on delete cascade,
  session_id text not null,
  tipo text not null check (tipo in ('abriu_catalogo','viu_pagina','clicou_foto','add_carrinho','abriu_carrinho','finalizou')),
  pagina int,
  produto_id uuid references public.produtos(id) on delete set null,
  criado_em timestamptz not null default now()
);

create index on public.carrinhos (status, ultimo_evento_em);
create index on public.carrinhos (catalogo_id);
create index on public.pedidos (criado_em desc);
create index on public.pedidos (catalogo_id);
create index on public.eventos (catalogo_id, criado_em desc);
create index on public.carrinho_itens (carrinho_id);
create index on public.hotspots (pagina_id);
create index on public.paginas (catalogo_id);
create index on public.produtos (catalogo_id);
create index on public.variacoes (produto_id);

alter table public.catalogos enable row level security;
alter table public.paginas enable row level security;
alter table public.produtos enable row level security;
alter table public.variacoes enable row level security;
alter table public.hotspots enable row level security;
alter table public.pedidos enable row level security;
alter table public.carrinhos enable row level security;
alter table public.carrinho_itens enable row level security;
alter table public.eventos enable row level security;

-- leitura pública só do que o catálogo precisa
create policy "publico le catalogos" on public.catalogos for select using (ativo);
create policy "publico le paginas" on public.paginas for select using (true);
create policy "publico le produtos" on public.produtos for select using (ativo);
create policy "publico le variacoes" on public.variacoes for select using (true);
create policy "publico le hotspots" on public.hotspots for select using (true);

-- admin: acesso total
create policy "admin total catalogos" on public.catalogos for all using (public.is_admin()) with check (public.is_admin());
create policy "admin total paginas" on public.paginas for all using (public.is_admin()) with check (public.is_admin());
create policy "admin total produtos" on public.produtos for all using (public.is_admin()) with check (public.is_admin());
create policy "admin total variacoes" on public.variacoes for all using (public.is_admin()) with check (public.is_admin());
create policy "admin total hotspots" on public.hotspots for all using (public.is_admin()) with check (public.is_admin());
create policy "admin total pedidos" on public.pedidos for all using (public.is_admin()) with check (public.is_admin());
create policy "admin total carrinhos" on public.carrinhos for all using (public.is_admin()) with check (public.is_admin());
create policy "admin total carrinho_itens" on public.carrinho_itens for all using (public.is_admin()) with check (public.is_admin());
create policy "admin total eventos" on public.eventos for all using (public.is_admin()) with check (public.is_admin());

revoke all on function public.claim_admin() from public;
grant execute on function public.claim_admin() to authenticated;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;
