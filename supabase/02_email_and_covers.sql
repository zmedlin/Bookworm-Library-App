-- =====================================================================
-- Bookworm Library App — Step 2: email + cover photos
-- Paste into Supabase → SQL Editor → New query → Run. Run once.
-- =====================================================================

-- Name shown as the email sender (e.g. "Mr. Medlin")
alter table public.settings
  add column if not exists sender_name text not null default '';

-- Allow "test" emails in the email log
alter table public.email_log drop constraint if exists email_log_kind_check;
alter table public.email_log add constraint email_log_kind_check
  check (kind in ('test', 'confirmation', 'upcoming', 'due', 'overdue', 'manual'));

-- ---------- Cover photos (Storage) -----------------------------------
-- Public bucket so the app can show covers by URL. Only you can upload,
-- replace or delete, and only inside your own folder.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('covers', 'covers', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "covers: upload own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'covers' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "covers: read own"
  on storage.objects for select to authenticated
  using (bucket_id = 'covers' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "covers: update own"
  on storage.objects for update to authenticated
  using (bucket_id = 'covers' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "covers: delete own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'covers' and (storage.foldername(name))[1] = (select auth.uid())::text);
