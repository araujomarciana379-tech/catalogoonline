-- Produtos não dependem mais de nenhum catálogo.
-- Antes: produtos.catalogo_id era obrigatório com ON DELETE CASCADE e a importação da planilha ligava todos os produtos
-- ao catálogo mais antigo; excluir esse catálogo apagava todos os produtos e variações.
-- (Aplicada no Supabase em partes: 18a estrutura, 18b limpeza dos vínculos, 18c função importar_planilha.)

-- 18a
alter table public.produtos alter column catalogo_id drop not null;
alter table public.produtos drop constraint produtos_catalogo_id_fkey;
alter table public.produtos add constraint produtos_catalogo_id_fkey
  foreign key (catalogo_id) references public.catalogos(id) on delete set null;

-- 18b
update public.produtos set catalogo_id = null where catalogo_id is not null;

-- 18c: a importação deixa de usar "o catálogo mais antigo"
create or replace function public.importar_planilha(p_produtos jsonb)
returns jsonb language plpgsql set search_path = public as $$
declare
  p jsonb; v jsonb; v_prod uuid; n_prod int := 0; n_var int := 0; n_inativas int := 0; n int;
  v_rotulos text[];
begin
  for p in select * from jsonb_array_elements(p_produtos) loop
    insert into public.produtos (catalogo_id, codigo, nome, descricao, preco, qtd_minima, foto_path, ativo)
    values (null, p->>'codigo', p->>'nome', nullif(p->>'descricao',''), (p->>'preco')::numeric,
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
