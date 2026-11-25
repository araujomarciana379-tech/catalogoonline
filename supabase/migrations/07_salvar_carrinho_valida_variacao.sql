-- Reforço: produto com variações exige uma variação válida no carrinho
-- (ex.: variação removida numa reimportação de planilha não vira o produto base).
-- Aplicar no SQL Editor do Supabase.
create or replace function public.salvar_carrinho(
  p_slug text, p_session_id text, p_itens jsonb,
  p_nome text default null, p_whatsapp text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_cat uuid; v_car uuid; it jsonb; v_prod public.produtos; v_var public.variacoes;
  v_qtd int; v_desc text; v_tem_var boolean;
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
    select * into v_prod from public.produtos
      where id = (it->>'produto_id')::uuid and catalogo_id = v_cat and ativo;
    if v_prod.id is null then continue; end if;
    v_qtd := greatest(1, least(coalesce((it->>'quantidade')::int,1), 100000));
    v_var := null;
    if it->>'variacao_id' is not null then
      select * into v_var from public.variacoes
        where id = (it->>'variacao_id')::uuid and produto_id = v_prod.id;
    end if;
    select exists (select 1 from public.variacoes where produto_id = v_prod.id) into v_tem_var;
    if (it->>'variacao_id' is not null or v_tem_var) and v_var.id is null then continue; end if;

    v_desc := v_prod.nome || case when v_var.id is not null then ' – ' || v_var.rotulo else '' end;
    insert into public.carrinho_itens (carrinho_id, produto_id, variacao_id, codigo, descricao, quantidade, preco_unitario)
    values (v_car, v_prod.id, v_var.id, coalesce(v_var.codigo, v_prod.codigo), v_desc, v_qtd,
            coalesce(v_var.preco, v_prod.preco));
  end loop;
  return v_car;
end $$;
