-- (Aplicada) Painel: a importação da planilha pode ser feita pelo admin logado (a função roda com as
-- permissões de quem chama; o RLS só deixa admin gravar em produtos/variações).
grant execute on function public.importar_planilha(jsonb) to authenticated;

-- Métricas do painel (só admin: roda com as permissões de quem chama e confere is_admin).
create or replace function public.admin_metricas(p_dias int default 30)
returns jsonb language plpgsql stable set search_path = public as $$
declare desde timestamptz := now() - make_interval(days => greatest(1, least(p_dias, 365)));
begin
  if not public.is_admin() then raise exception 'acesso negado'; end if;
  return jsonb_build_object(
    'funil', (select jsonb_build_object(
        'visitas', count(distinct session_id) filter (where tipo = 'abriu_catalogo'),
        'adicionaram', count(distinct session_id) filter (where tipo = 'add_carrinho'),
        'abriram_carrinho', count(distinct session_id) filter (where tipo = 'abriu_carrinho'),
        'finalizaram', count(distinct session_id) filter (where tipo = 'finalizou'))
      from public.eventos where criado_em >= desde),
    'por_dia', coalesce((select jsonb_agg(d order by d->>'dia') from (
        select jsonb_build_object('dia', to_char(dia, 'YYYY-MM-DD'), 'visitas', visitas, 'pedidos', pedidos) d
        from (
          select g::date dia,
            (select count(distinct session_id) from public.eventos e where e.tipo = 'abriu_catalogo' and e.criado_em >= g and e.criado_em < g + interval '1 day') visitas,
            (select count(*) from public.pedidos p where p.criado_em >= g and p.criado_em < g + interval '1 day') pedidos
          from generate_series(date_trunc('day', desde), date_trunc('day', now()), interval '1 day') g
        ) x) y), '[]'::jsonb),
    'pedidos', (select jsonb_build_object(
        'quantidade', count(*),
        'valor', coalesce(sum(total) filter (where status <> 'cancelado'), 0),
        'por_status', coalesce(jsonb_object_agg(status, n) filter (where status is not null), '{}'::jsonb))
      from (select status, total, count(*) over (partition by status) n from public.pedidos where criado_em >= desde) s),
    'top_produtos', coalesce((select jsonb_agg(t) from (
        select pr.codigo, pr.nome, count(*) adicoes
        from public.eventos e join public.produtos pr on pr.id = e.produto_id
        where e.tipo = 'add_carrinho' and e.criado_em >= desde
        group by pr.codigo, pr.nome order by count(*) desc limit 10) t), '[]'::jsonb),
    'top_paginas', coalesce((select jsonb_agg(t) from (
        select c.nome as catalogo, c.slug, e.pagina, count(*) vistas
        from public.eventos e join public.catalogos c on c.id = e.catalogo_id
        where e.tipo = 'viu_pagina' and e.criado_em >= desde and e.pagina is not null
        group by c.nome, c.slug, e.pagina order by count(*) desc limit 10) t), '[]'::jsonb),
    'por_catalogo', coalesce((select jsonb_agg(t) from (
        select c.nome, c.slug, count(distinct e.session_id) visitas
        from public.eventos e join public.catalogos c on c.id = e.catalogo_id
        where e.tipo = 'abriu_catalogo' and e.criado_em >= desde
        group by c.nome, c.slug order by 3 desc) t), '[]'::jsonb)
  );
end $$;

revoke all on function public.admin_metricas(int) from public, anon;
grant execute on function public.admin_metricas(int) to authenticated;
