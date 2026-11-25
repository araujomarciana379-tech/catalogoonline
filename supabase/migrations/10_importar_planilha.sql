-- (Aplicada) Importação da planilha (Vou Pedir): recebe produtos já agrupados (scripts/importar-planilha.mjs)
-- e faz upsert de produtos e variações. Só a chave de serviço (script local) pode chamar.
create or replace function public.importar_planilha(p_produtos jsonb)
returns jsonb language plpgsql set search_path = public as $$
declare
  p jsonb; v jsonb; v_prod uuid; v_cat uuid; n_prod int := 0; n_var int := 0; n_inativas int := 0; n int;
  v_rotulos text[];
begin
  -- produtos.catalogo_id ainda é obrigatório: a base fica ligada ao catálogo mais antigo (só referência).
  select id into v_cat from public.catalogos order by criado_em limit 1;

  for p in select * from jsonb_array_elements(p_produtos) loop
    insert into public.produtos (catalogo_id, codigo, nome, descricao, preco, qtd_minima, foto_path, ativo)
    values (v_cat, p->>'codigo', p->>'nome', nullif(p->>'descricao',''), (p->>'preco')::numeric,
            coalesce((p->>'qtd_minima')::int, 1), nullif(p->>'foto',''), true)
    on conflict (codigo) do update set
      nome = excluded.nome,
      descricao = coalesce(excluded.descricao, public.produtos.descricao),
      preco = excluded.preco,
      qtd_minima = excluded.qtd_minima,
      foto_path = coalesce(excluded.foto_path, public.produtos.foto_path),
      ativo = true
    returning id into v_prod;
    n_prod := n_prod + 1;

    v_rotulos := array(select x->>'rotulo' from jsonb_array_elements(coalesce(p->'variacoes','[]')) x);
    for v in select * from jsonb_array_elements(coalesce(p->'variacoes','[]')) loop
      insert into public.variacoes (produto_id, rotulo, codigo, preco, qtd_minima, foto_path, ordem, ativo)
      values (v_prod, v->>'rotulo', nullif(v->>'codigo',''), (v->>'preco')::numeric,
              (v->>'qtd_minima')::int, nullif(v->>'foto',''), coalesce((v->>'ordem')::int, 0), true)
      on conflict (produto_id, rotulo) do update set
        codigo = excluded.codigo,
        preco = excluded.preco,
        qtd_minima = excluded.qtd_minima,
        foto_path = coalesce(excluded.foto_path, public.variacoes.foto_path),
        ordem = excluded.ordem,
        ativo = true;
      n_var := n_var + 1;
    end loop;

    -- Variações que saíram da planilha ficam inativas (não apaga: carrinhos e pedidos antigos continuam válidos).
    update public.variacoes set ativo = false
      where produto_id = v_prod and ativo and not (rotulo = any(v_rotulos));
    get diagnostics n = row_count;
    n_inativas := n_inativas + n;
  end loop;

  return jsonb_build_object('produtos', n_prod, 'variacoes', n_var, 'variacoes_inativadas', n_inativas);
end $$;

revoke all on function public.importar_planilha(jsonb) from public, anon, authenticated;
grant execute on function public.importar_planilha(jsonb) to service_role;
