-- Postara · Upload de imagens para posts sociais
-- Rode após:
-- 1) 001_initial_schema.sql
-- 2) 002_social_publishing.sql

insert into storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
values (
    'postara-images',
    'postara-images',
    true,
    10485760,
    array['image/jpeg', 'image/png']
)
on conflict (id) do update
set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "postara_images_select_own" on storage.objects;
create policy "postara_images_select_own"
on storage.objects
for select
to authenticated
using (
    bucket_id = 'postara-images'
    and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "postara_images_insert_own" on storage.objects;
create policy "postara_images_insert_own"
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'postara-images'
    and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "postara_images_update_own" on storage.objects;
create policy "postara_images_update_own"
on storage.objects
for update
to authenticated
using (
    bucket_id = 'postara-images'
    and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
    bucket_id = 'postara-images'
    and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "postara_images_delete_own" on storage.objects;
create policy "postara_images_delete_own"
on storage.objects
for delete
to authenticated
using (
    bucket_id = 'postara-images'
    and (storage.foldername(name))[1] = auth.uid()::text
);
