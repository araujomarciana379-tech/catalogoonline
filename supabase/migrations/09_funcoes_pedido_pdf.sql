-- Funções do carrinho/pedido para a base de produtos da planilha (Vou Pedir) e o pedido em PDF.
-- Aplicar no SQL Editor do Supabase (são security definer: o painel pede confirmação).
--
-- O que muda:
--  * produtos de qualquer catálogo (base única); variações inativas são ignoradas
--  * mínimo por variação; a quantidade é arredondada para o múltiplo do mínimo (3, 6, 9…)
--  * itens guardam nome do produto e variação separados (colunas do PDF)
--  * finalizar_pedido devolve id + token (link do PDF); pedido_publico lê o pedido com o token

create or replace function public.salvar_carrinho(
  p_slug text, p_session_id text, p_itens jsonb,
  p_nome text default null, p_whatsapp text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_cat uuid; v_car uuid; it jsonb; v_prod public.produtos; v_var public.variacoes;
  v_qtd int; v_min int; v_tem_var boolean;
begin
  if length(coalesce(p_session_id,'')) < 8 then raise exception 'sessão inválida'; end if;
  select id into v_cat from public.catalogos where slug = p_slug and ativo;
  if v_cat is null then raise exception 'catálogo não encontrado'; end if;

  insert into public.carrinhos (catalogo_id, session_id, cliente_nome, cliente_whatsapp, ultimo_evento_em)
  values (v_cat, p_session_id, nullif(left(p_nome,120),''), nullif(regexp_replace(coalesce(p_whatsapp,''),'\D','','g'),''), now())
  on conflict (catalogo_id, session_id) do update set
    cliente_nome = coalesce(nullif(left(p_nome,120),''), public.carrinhos.cliente_nome),
    cliente_whatsapp = coalesce(nullif(regexp_replace(coalesce(p_whatsapp,''),'\D','','g'),''), public.carrinhos.cliente_whatsapp),
    ultimo_evento_em = now(),
    status = case when public.carrinhos.status = 'convertido' then 'aberto' else public.carrinhos.status end,
    recuperacao_enviada_em = null
  returning id into v_car;

  delete from public.carrinho_itens where carrinho_id = v_car;

  for it in select * from jsonb_array_elements(coalesce(p_itens,'[]'::jsonb)) loop
    select * into v_prod from public.produtos where id = (it->>'produto_id')::uuid and ativo;
    if v_prod.id is null then continue; end if;

    v_var := null;
    if it->>'variacao_id' is not null then
      select * into v_var from public.variacoes
        where id = (it->>'variacao_id')::uuid and produto_id = v_prod.id and ativo;
    end if;
    -- Produto com variações exige uma variação válida.
    select exists (select 1 from public.variacoes where produto_id = v_prod.id and ativo) into v_tem_var;
    if (it->>'variacao_id' is not null or v_tem_var) and v_var.id is null then continue; end if;

    -- Quantidade sempre em múltiplos do mínimo (mínimo 3 → 3, 6, 9…).
    v_min := greatest(1, coalesce(v_var.qtd_minima, v_prod.qtd_minima, 1));
    v_qtd := greatest(1, least(coalesce((it->>'quantidade')::int, v_min), 100000));
    v_qtd := ceil(v_qtd::numeric / v_min)::int * v_min;

    insert into public.carrinho_itens
      (carrinho_id, produto_id, variacao_id, codigo, descricao, produto_nome, variacao_rotulo, quantidade, preco_unitario)
    values (v_car, v_prod.id, v_var.id, coalesce(v_var.codigo, v_prod.codigo),
            v_prod.nome || case when v_var.id is not null then ' – ' || v_var.rotulo else '' end,
            v_prod.nome, v_var.rotulo, v_qtd, coalesce(v_var.preco, v_prod.preco));
  end loop;
  return v_car;
end $$;

-- O tipo de retorno mudou (id e token), então a função é recriada.
drop function if exists public.finalizar_pedido(text,text,text,text,text);
create function public.finalizar_pedido(
  p_slug text, p_session_id text, p_nome text, p_whatsapp text, p_observacao text default null
) returns table (numero bigint, total numeric, itens jsonb, whatsapp_destino text, mensagem_inicial text, id uuid, token uuid)
language plpgsql security definer set search_path = public as $$
declare
  v_cat public.catalogos; v_car public.carrinhos; v_itens jsonb; v_total numeric; v_ped public.pedidos;
begin
  select * into v_cat from public.catalogos c where c.slug = p_slug and c.ativo;
  if v_cat.id is null then raise exception 'catálogo não encontrado'; end if;
  select * into v_car from public.carrinhos c where c.catalogo_id = v_cat.id and c.session_id = p_session_id;
  if v_car.id is null then raise exception 'carrinho vazio'; end if;

  select jsonb_agg(jsonb_build_object(
           'codigo', ci.codigo, 'descricao', ci.descricao,
           'nome', coalesce(ci.produto_nome, ci.descricao), 'variacao', ci.variacao_rotulo,
           'quantidade', ci.quantidade, 'preco_unitario', ci.preco_unitario) order by ci.id),
         sum(ci.quantidade * coalesce(ci.preco_unitario, 0))
    into v_itens, v_total
    from public.carrinho_itens ci where ci.carrinho_id = v_car.id;
  if v_itens is null then raise exception 'carrinho vazio'; end if;

  insert into public.pedidos (catalogo_id, cliente_nome, cliente_whatsapp, itens, total, observacao)
  values (v_cat.id, left(p_nome,120), nullif(regexp_replace(coalesce(p_whatsapp,''),'\D','','g'),''),
          v_itens, v_total, left(p_observacao,1000))
  returning * into v_ped;

  update public.carrinhos c set status = 'convertido', pedido_id = v_ped.id, ultimo_evento_em = now(),
    cliente_nome = left(p_nome,120),
    cliente_whatsapp = nullif(regexp_replace(coalesce(p_whatsapp,''),'\D','','g'),'')
  where c.id = v_car.id;

  return query select v_ped.numero, v_ped.total, v_ped.itens, v_cat.whatsapp, v_cat.mensagem_inicial, v_ped.id, v_ped.token;
end $$;

-- Leitura do pedido para gerar o PDF: só com o token que vai no link.
create or replace function public.pedido_publico(p_id uuid, p_token uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'numero', p.numero, 'criado_em', p.criado_em, 'cliente_nome', p.cliente_nome,
    'cliente_whatsapp', p.cliente_whatsapp, 'observacao', p.observacao,
    'itens', p.itens, 'total', p.total, 'catalogo', c.nome)
  from public.pedidos p join public.catalogos c on c.id = p.catalogo_id
  where p.id = p_id and p.token = p_token;
$$;

revoke all on function public.salvar_carrinho(text,text,jsonb,text,text) from public;
revoke all on function public.finalizar_pedido(text,text,text,text,text) from public;
revoke all on function public.pedido_publico(uuid,uuid) from public;
grant execute on function public.salvar_carrinho(text,text,jsonb,text,text) to anon, authenticated;
grant execute on function public.finalizar_pedido(text,text,text,text,text) to anon, authenticated;
grant execute on function public.pedido_publico(uuid,uuid) to anon, authenticated;
