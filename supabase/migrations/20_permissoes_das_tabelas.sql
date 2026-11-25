-- Projeto novo do Supabase não concede acesso às tabelas por padrão (a API recusa tudo, mesmo com RLS correta).
-- Aqui ficam as permissões; quem vê o quê continua sendo decidido pelas políticas (RLS).
revoke all on all tables in schema public from anon, authenticated;

-- Visitante: só lê o que o catálogo precisa.
grant select on public.catalogos, public.paginas, public.produtos, public.variacoes, public.hotspots, public.hotspot_opcoes to anon;

-- Quem entrou no painel (admin, vendedora, editor): a RLS limita cada papel.
grant select, insert, update, delete on
  public.catalogos, public.paginas, public.produtos, public.variacoes, public.hotspots, public.hotspot_opcoes,
  public.catalogo_produtos, public.vendedoras, public.clientes, public.pedidos, public.carrinhos, public.carrinho_itens,
  public.eventos, public.admins, public.editores to authenticated;

-- Pedidos e carrinhos: no painel só muda o andamento.
revoke update on public.pedidos from authenticated;
grant update (status) on public.pedidos to authenticated;
revoke update on public.carrinhos from authenticated;
grant update (status, recuperacao_enviada_em) on public.carrinhos to authenticated;

-- As políticas de leitura chamam is_editor() também para o visitante (que recebe falso).
grant execute on function public.is_editor() to anon;
-- `sessoes` continua sem acesso direto: só as funções internas mexem nela.
