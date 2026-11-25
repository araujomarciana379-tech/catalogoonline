alter table public.catalogos
  add column capa_path text,
  add column descricao text,
  add column ordem int not null default 0,
  add column destaque boolean not null default false;

