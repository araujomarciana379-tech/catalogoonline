-- Vendedoras, clientes e acesso por vendedora.
-- (Aplicada no Supabase em partes 17a–17g: um único bloco grande estoura o tempo da chamada.)
--
--  * Cada vendedora tem um link (?v=codigo). Quem entra por ele fica ligado a ela (vale o último link usado,
--    a não ser que o administrador tenha fixado a vendedora do cliente) e o pedido vai para o WhatsApp dela.
--  * Todo visitante informa o WhatsApp na primeira visita: vira um "cliente" (base para carrinho abandonado etc.).
--  * Vendedora entra no painel com a própria conta e só enxerga pedidos, carrinhos e clientes dela.
--  * O administrador pode trocar a vendedora e o telefone de qualquer cliente (admin_alterar_cliente).

-- ───────────── Tabelas ─────────────
create table public.vendedoras (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  whatsapp text not null,                           -- só dígitos, sem 55
  ativo boolean not null default true,
  user_id uuid unique references auth.users(id) on delete set null,   -- conta de login (preenchida ao aceitar o convite)
  convite uuid unique default gen_random_uuid(),    -- código do convite; some quando é aceito
  criado_em timestamptz not null default now()
);

create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  whatsapp text not null,                           -- só dígitos, sem 55
  nome text,
  vendedora_id uuid references public.vendedoras(id) on delete set null,
  vendedora_fixa boolean not null default false,    -- true: o admin escolheu; os links de outras vendedoras não trocam
  aceite_em timestamptz,                            -- quando concordou em receber mensagens
  criado_em timestamptz not null default now(),
  ultimo_acesso_em timestamptz not null default now()
);
create unique index clientes_whatsapp_key on public.clientes (whatsapp);
create index on public.clientes (vendedora_id);

-- Qual cliente está usando cada navegador (session_id do carrinho). Só as funções abaixo mexem nela.
create table public.sessoes (
  session_id text primary key,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  criado_em timestamptz not null default now()
);
create index on public.sessoes (cliente_id);

alter table public.pedidos
  add column cliente_id uuid references public.clientes(id) on delete set null,
  add column vendedora_id uuid references public.vendedoras(id) on delete set null;
alter table public.carrinhos
  add column cliente_id uuid references public.clientes(id) on delete set null,
  add column vendedora_id uuid references public.vendedoras(id) on delete set null;
create index on public.pedidos (vendedora_id, criado_em desc);
create index on public.pedidos (cliente_id);
create index on public.carrinhos (vendedora_id);
create index on public.carrinhos (cliente_id);

alter table public.vendedoras enable row level security;
alter table public.clientes enable row level security;
alter table public.sessoes enable row level security;   -- sem política: ninguém lê direto

-- ───────────── Quem é a vendedora logada ─────────────
create or replace function public.minha_vendedora()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.vendedoras where user_id = auth.uid() and ativo limit 1;
$$;
revoke all on function public.minha_vendedora() from public;
grant execute on function public.minha_vendedora() to anon, authenticated;   -- anon recebe null (as políticas rodam para ele também)

-- ───────────── Políticas (RLS) ─────────────
create policy "admin total vendedoras" on public.vendedoras for all using (public.is_admin()) with check (public.is_admin());
create policy "vendedora le a propria" on public.vendedoras for select using (user_id = auth.uid());

create policy "admin total clientes" on public.clientes for all using (public.is_admin()) with check (public.is_admin());
create policy "vendedora le seus clientes" on public.clientes for select using (vendedora_id = public.minha_vendedora());

create policy "vendedora le seus pedidos" on public.pedidos for select using (vendedora_id = public.minha_vendedora());
create policy "vendedora atualiza seus pedidos" on public.pedidos for update
  using (vendedora_id = public.minha_vendedora()) with check (vendedora_id = public.minha_vendedora());

create policy "vendedora le seus carrinhos" on public.carrinhos for select using (vendedora_id = public.minha_vendedora());
create policy "vendedora atualiza seus carrinhos" on public.carrinhos for update
  using (vendedora_id = public.minha_vendedora()) with check (vendedora_id = public.minha_vendedora());
create policy "vendedora le itens dos seus carrinhos" on public.carrinho_itens for select
  using (exists (select 1 from public.carrinhos c where c.id = carrinho_id and c.vendedora_id = public.minha_vendedora()));

-- No painel só se muda o status do pedido e o andamento do carrinho; o resto é gravado pelas funções.
revoke update on public.pedidos from authenticated;
grant update (status) on public.pedidos to authenticated;
revoke update on public.carrinhos from authenticated;
grant update (status, recuperacao_enviada_em) on public.carrinhos to authenticated;

-- ───────────── Cliente se identifica (popup do WhatsApp) ─────────────
-- p_cliente_id: o que o navegador já guardou (ou null na primeira vez). p_vendedora: o ?v= da URL, se houver.
create or replace function public.registrar_cliente(
  p_session_id text, p_whatsapp text default null, p_nome text default null,
  p_vendedora text default null, p_cliente_id uuid default null, p_aceite boolean default false
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cli public.clientes; v_vend uuid; v_dig text; v_nome text := nullif(left(btrim(coalesce(p_nome,'')),120),'');
begin
  if length(coalesce(p_session_id,'')) < 8 then raise exception 'sessão inválida'; end if;
  select id into v_vend from public.vendedoras where slug = lower(btrim(coalesce(p_vendedora,''))) and ativo;

  if p_cliente_id is not null then select * into v_cli from public.clientes where id = p_cliente_id; end if;
  if v_cli.id is null then
    v_dig := regexp_replace(coalesce(p_whatsapp,''), '\D', '', 'g');
    if length(v_dig) >= 12 and left(v_dig,2) = '55' then v_dig := substr(v_dig, 3); end if;
    if length(v_dig) not in (10,11) then raise exception 'cliente_desconhecido'; end if;
    select * into v_cli from public.clientes where whatsapp = v_dig;
    if v_cli.id is null then
      insert into public.clientes (whatsapp, nome, vendedora_id) values (v_dig, v_nome, v_vend) returning * into v_cli;
    end if;
  end if;

  update public.clientes set
    ultimo_acesso_em = now(),
    nome = coalesce(nome, v_nome),
    aceite_em = coalesce(aceite_em, case when p_aceite then now() end),
    vendedora_id = case when v_vend is not null and not vendedora_fixa then v_vend else vendedora_id end
  where id = v_cli.id returning * into v_cli;

  insert into public.sessoes (session_id, cliente_id) values (p_session_id, v_cli.id)
    on conflict (session_id) do update set cliente_id = excluded.cliente_id;

  -- Carrinhos abertos deste navegador acompanham o cliente (e a vendedora atual dele).
  update public.carrinhos set cliente_id = v_cli.id, vendedora_id = v_cli.vendedora_id
    where session_id = p_session_id and status = 'aberto';

  return jsonb_build_object('cliente_id', v_cli.id, 'whatsapp', v_cli.whatsapp, 'nome', v_cli.nome);
end $$;
revoke all on function public.registrar_cliente(text,text,text,text,uuid,boolean) from public;
grant execute on function public.registrar_cliente(text,text,text,text,uuid,boolean) to anon, authenticated;

-- ───────────── Administrador altera um cliente ─────────────
-- Trocar a vendedora fixa o cliente nela (link de outra vendedora deixa de trocar); p_automatico = true solta de novo.
create or replace function public.admin_alterar_cliente(
  p_cliente uuid, p_whatsapp text, p_nome text, p_vendedora uuid,
  p_automatico boolean default false, p_mover_historico boolean default false
) returns void language plpgsql security definer set search_path = public as $$
declare v_cli public.clientes; v_dig text; v_nova uuid; v_fixa boolean;
begin
  if not public.is_admin() then raise exception 'acesso negado'; end if;
  select * into v_cli from public.clientes where id = p_cliente for update;
  if v_cli.id is null then raise exception 'cliente não encontrado'; end if;

  v_dig := regexp_replace(coalesce(p_whatsapp,''), '\D', '', 'g');
  if length(v_dig) >= 12 and left(v_dig,2) = '55' then v_dig := substr(v_dig, 3); end if;
  if length(v_dig) not in (10,11) then raise exception 'WhatsApp inválido: use DDD + número'; end if;
  if exists (select 1 from public.clientes where whatsapp = v_dig and id <> v_cli.id) then
    raise exception 'Já existe outro cliente com este WhatsApp';
  end if;

  v_nova := p_vendedora;
  v_fixa := case when p_automatico then false
                 when v_nova is distinct from v_cli.vendedora_id then true
                 else v_cli.vendedora_fixa end;

  update public.clientes set whatsapp = v_dig, nome = nullif(left(btrim(coalesce(p_nome,'')),120),''),
    vendedora_id = v_nova, vendedora_fixa = v_fixa where id = v_cli.id;

  -- Carrinhos abertos passam para a nova vendedora; pedidos antigos só se o admin pedir.
  update public.carrinhos set vendedora_id = v_nova where cliente_id = v_cli.id and status = 'aberto';
  if p_mover_historico then update public.pedidos set vendedora_id = v_nova where cliente_id = v_cli.id; end if;
end $$;
revoke all on function public.admin_alterar_cliente(uuid,text,text,uuid,boolean,boolean) from public, anon;
grant execute on function public.admin_alterar_cliente(uuid,text,text,uuid,boolean,boolean) to authenticated;

-- ───────────── Vendedora aceita o convite (liga a conta dela ao cadastro) ─────────────
create or replace function public.aceitar_convite(p_codigo uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_nome text;
begin
  if auth.uid() is null then raise exception 'entre na sua conta primeiro'; end if;
  update public.vendedoras set user_id = auth.uid(), convite = null
    where convite = p_codigo and user_id is null returning nome into v_nome;
  if v_nome is null then raise exception 'convite inválido ou já usado'; end if;
  return v_nome;
end $$;
revoke all on function public.aceitar_convite(uuid) from public, anon;
grant execute on function public.aceitar_convite(uuid) to authenticated;

-- ───────────── Carrinho passa a registrar cliente e vendedora ─────────────
-- Gatilho em vez de reescrever salvar_carrinho: o carrinho de quem já se identificou herda cliente e vendedora atuais.
create or replace function public.carrinho_liga_cliente() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_cli uuid; v_vend uuid;
begin
  select s.cliente_id, c.vendedora_id into v_cli, v_vend
    from public.sessoes s join public.clientes c on c.id = s.cliente_id where s.session_id = new.session_id;
  if v_cli is not null then new.cliente_id := v_cli; new.vendedora_id := v_vend; end if;
  return new;
end $$;
revoke all on function public.carrinho_liga_cliente() from public, anon, authenticated;

create trigger carrinho_liga_cliente before insert or update of session_id, ultimo_evento_em on public.carrinhos
  for each row execute function public.carrinho_liga_cliente();

-- O pedido vai para o WhatsApp da vendedora do cliente (se ativa); sem vendedora, para o do catálogo.
create or replace function public.finalizar_pedido(
  p_slug text, p_session_id text, p_nome text, p_whatsapp text, p_observacao text default null
) returns table (numero bigint, total numeric, itens jsonb, whatsapp_destino text, mensagem_inicial text, id uuid, token uuid)
language plpgsql security definer set search_path = public as $$
declare
  v_cat public.catalogos; v_car public.carrinhos; v_itens jsonb; v_total numeric; v_ped public.pedidos;
  v_cli uuid; v_vend public.vendedoras;
begin
  select * into v_cat from public.catalogos c where c.slug = p_slug and c.ativo;
  if v_cat.id is null then raise exception 'catálogo não encontrado'; end if;
  select * into v_car from public.carrinhos c where c.catalogo_id = v_cat.id and c.session_id = p_session_id;
  if v_car.id is null then raise exception 'carrinho vazio'; end if;

  select s.cliente_id into v_cli from public.sessoes s where s.session_id = p_session_id;
  select vd.* into v_vend from public.clientes cl join public.vendedoras vd on vd.id = cl.vendedora_id where cl.id = v_cli;

  select jsonb_agg(jsonb_build_object(
           'codigo', ci.codigo, 'descricao', ci.descricao,
           'nome', coalesce(ci.produto_nome, ci.descricao), 'variacao', ci.variacao_rotulo,
           'observacao', ci.observacao,
           'quantidade', ci.quantidade, 'preco_unitario', ci.preco_unitario) order by ci.id),
         sum(ci.quantidade * coalesce(ci.preco_unitario, 0))
    into v_itens, v_total
    from public.carrinho_itens ci where ci.carrinho_id = v_car.id;
  if v_itens is null then raise exception 'carrinho vazio'; end if;

  insert into public.pedidos (catalogo_id, cliente_nome, cliente_whatsapp, itens, total, observacao, cliente_id, vendedora_id)
  values (v_cat.id, left(p_nome,120), nullif(regexp_replace(coalesce(p_whatsapp,''),'\D','','g'),''),
          v_itens, v_total, left(p_observacao,1000), v_cli, v_vend.id)
  returning * into v_ped;

  update public.carrinhos c set status = 'convertido', pedido_id = v_ped.id, ultimo_evento_em = now(),
    cliente_nome = left(p_nome,120),
    cliente_whatsapp = nullif(regexp_replace(coalesce(p_whatsapp,''),'\D','','g'),'')
  where c.id = v_car.id;

  return query select v_ped.numero, v_ped.total, v_ped.itens,
    case when v_vend.id is not null and v_vend.ativo then v_vend.whatsapp else v_cat.whatsapp end,
    v_cat.mensagem_inicial, v_ped.id, v_ped.token;
end $$;

-- ───────────── Clientes que já existiam (pedidos e carrinhos anteriores) ─────────────
insert into public.clientes (whatsapp, nome, criado_em)
select distinct on (w) w, nome, min_em
from (
  select case when length(d) >= 12 and left(d,2) = '55' then substr(d,3) else d end as w,
         nome, criado_em as min_em
  from (
    select regexp_replace(cliente_whatsapp, '\D', '', 'g') d, cliente_nome nome, criado_em from public.pedidos where cliente_whatsapp is not null
    union all
    select regexp_replace(cliente_whatsapp, '\D', '', 'g'), cliente_nome, criado_em from public.carrinhos where cliente_whatsapp is not null
  ) t
) u
where length(w) in (10,11)
order by w, (nome is null), min_em desc
on conflict (whatsapp) do nothing;

update public.pedidos p set cliente_id = c.id from public.clientes c
  where p.cliente_id is null and p.cliente_whatsapp is not null
    and c.whatsapp = case when length(regexp_replace(p.cliente_whatsapp,'\D','','g')) >= 12 and left(regexp_replace(p.cliente_whatsapp,'\D','','g'),2) = '55'
                          then substr(regexp_replace(p.cliente_whatsapp,'\D','','g'),3) else regexp_replace(p.cliente_whatsapp,'\D','','g') end;
update public.carrinhos p set cliente_id = c.id from public.clientes c
  where p.cliente_id is null and p.cliente_whatsapp is not null
    and c.whatsapp = case when length(regexp_replace(p.cliente_whatsapp,'\D','','g')) >= 12 and left(regexp_replace(p.cliente_whatsapp,'\D','','g'),2) = '55'
                          then substr(regexp_replace(p.cliente_whatsapp,'\D','','g'),3) else regexp_replace(p.cliente_whatsapp,'\D','','g') end;
