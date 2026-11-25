-- Texto da personalização por item (opção "Personalizado"): o carrinho grava e o pedido devolve.
-- Aplicar no SQL Editor do Supabase (funções security definer: o painel pede confirmação).
-- O tipo de retorno não muda, então não precisa recriar.

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
    select exists (select 1 from public.variacoes where produto_id = v_prod.id and ativo) into v_tem_var;
    if (it->>'variacao_id' is not null or v_tem_var) and v_var.id is null then continue; end if;

    v_min := greatest(1, coalesce(v_var.qtd_minima, v_prod.qtd_minima, 1));
    v_qtd := greatest(1, least(coalesce((it->>'quantidade')::int, v_min), 100000));
    v_qtd := ceil(v_qtd::numeric / v_min)::int * v_min;

    insert into public.carrinho_itens
      (carrinho_id, produto_id, variacao_id, codigo, descricao, produto_nome, variacao_rotulo, quantidade, preco_unitario, observacao)
    values (v_car, v_prod.id, v_var.id, coalesce(v_var.codigo, v_prod.codigo),
            v_prod.nome || case when v_var.id is not null then ' – ' || v_var.rotulo else '' end,
            v_prod.nome, v_var.rotulo, v_qtd, coalesce(v_var.preco, v_prod.preco),
            nullif(left(btrim(coalesce(it->>'observacao', '')), 300), ''));
  end loop;
  return v_car;
end $$;

create or replace function public.finalizar_pedido(
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
           'observacao', ci.observacao,
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
