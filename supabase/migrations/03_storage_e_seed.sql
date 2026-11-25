-- Bucket público de imagens dos catálogos.
insert into storage.buckets (id, name, public) values ('catalogo','catalogo', true) on conflict do nothing;
create policy "admin escreve catalogo" on storage.objects for insert with check (bucket_id = 'catalogo' and public.is_admin());
create policy "admin atualiza catalogo" on storage.objects for update using (bucket_id = 'catalogo' and public.is_admin());
create policy "admin apaga catalogo" on storage.objects for delete using (bucket_id = 'catalogo' and public.is_admin());

