-- =====================================================================
-- Bookworm Library App — Step 3: multiple copies + per-loan reminder switch
-- Paste into Supabase → SQL Editor → New query → Run. Run once,
-- after 01_schema.sql and 02_email_and_covers.sql.
-- =====================================================================

-- ---------- Multiple copies ------------------------------------------

alter table public.books
  add column if not exists copies int not null default 1 check (copies >= 1);

-- A book can now be lent to several people at once, up to its number of copies.
drop index if exists public.loans_one_open_per_book;

create or replace function public.check_copies_available()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  available int;
  lent_out int;
begin
  if new.returned_at is null
     and (tg_op = 'INSERT' or old.returned_at is not null or old.book_id <> new.book_id) then
    select copies into available from public.books where id = new.book_id for update;
    select count(*) into lent_out
      from public.loans
     where book_id = new.book_id and returned_at is null and id <> new.id;
    if lent_out >= available then
      raise exception 'All copies of this book are already lent out.';
    end if;
  end if;
  return new;
end;
$$;

create trigger loans_check_copies
  before insert or update on public.loans
  for each row execute function public.check_copies_available();

create or replace function public.check_copies_not_below_loans()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  lent_out int;
begin
  if new.copies < old.copies then
    select count(*) into lent_out from public.loans where book_id = new.id and returned_at is null;
    if new.copies < lent_out then
      raise exception '% copies are lent out right now, so you can''t have fewer than that.', lent_out;
    end if;
  end if;
  return new;
end;
$$;

create trigger books_check_copies
  before update of copies on public.books
  for each row execute function public.check_copies_not_below_loans();

-- ---------- Automatic reminders: per loan + default for new loans ----
-- settings.auto_reminders_enabled stays as the master switch (off = pause all).

alter table public.loans
  add column if not exists auto_remind boolean not null default true;

alter table public.settings
  add column if not exists auto_remind_default boolean not null default true;

-- ---------- Library view, now copy-aware -----------------------------

drop view if exists public.book_status;

create view public.book_status with (security_invoker = true) as
select
  b.*,
  o.open_loans,
  o.next_due,
  coalesce(o.borrower_names, '{}') as borrower_names
from public.books b
cross join lateral (
  select
    count(*)::int                              as open_loans,
    min(l.due_date)                            as next_due,
    array_agg(br.name order by l.due_date)     as borrower_names
  from public.loans l
  join public.borrowers br on br.id = l.borrower_id
  where l.book_id = b.id and l.returned_at is null
) o;

revoke all on public.book_status from anon;
grant select on public.book_status to authenticated;
