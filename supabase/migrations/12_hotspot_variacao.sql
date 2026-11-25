-- (Aplicada) Área clicável pode apontar para uma variação (o santo tocado na página já vem escolhido).
alter table public.hotspots add column variacao_id uuid references public.variacoes(id) on delete set null;
