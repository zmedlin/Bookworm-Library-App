-- =====================================================================
-- Bookworm Library App — Step 1: database schema
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to run once on a fresh project.
-- =====================================================================

-- ---------- Tables ----------------------------------------------------

create table public.books (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid()
                    references auth.users(id) on delete cascade,
  isbn13          text check (isbn13 ~ '^[0-9]{13}$'),  -- null for books added by hand
  title           text not null check (length(trim(title)) > 0),
  authors         text[] not null default '{}',
  publisher       text,
  published_year  int check (published_year between 1000 and 2100),
  cover_url       text,
  notes           text,
  created_at      timestamptz not null default now(),
  unique (owner_id, isbn13)
);

create table public.borrowers (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid()
                references auth.users(id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  email       text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  kind        text not null default 'friend' check (kind in ('friend', 'student')),
  notes       text,
  created_at  timestamptz not null default now()
);
-- Don't allow the same email address twice (case-insensitive)
create unique index borrowers_owner_email_uq on public.borrowers (owner_id, lower(email));

create table public.loans (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null default auth.uid()
                      references auth.users(id) on delete cascade,
  book_id           uuid not null references public.books(id) on delete cascade,
  borrower_id       uuid not null references public.borrowers(id) on delete restrict,
  lent_at           date not null default current_date,
  due_date          date not null,
  returned_at       timestamptz,
  last_reminder_at  timestamptz,
  reminder_count    int not null default 0,
  created_at        timestamptz not null default now(),
  check (due_date >= lent_at)
);
-- A book can only be lent to one person at a time
create unique index loans_one_open_per_book on public.loans (book_id) where returned_at is null;
create index loans_borrower_idx on public.loans (borrower_id);
create index loans_open_due_idx on public.loans (due_date) where returned_at is null;

create table public.email_log (
  id        uuid primary key default gen_random_uuid(),
  owner_id  uuid not null default auth.uid()
              references auth.users(id) on delete cascade,
  loan_id   uuid references public.loans(id) on delete set null,
  kind      text not null check (kind in ('confirmation', 'upcoming', 'due', 'overdue', 'manual')),
  to_email  text not null,
  sent_at   timestamptz not null default now(),
  status    text not null check (status in ('sent', 'failed')),
  error     text
);
create index email_log_loan_idx on public.email_log (loan_id);

create table public.settings (
  owner_id               uuid primary key default auth.uid()
                           references auth.users(id) on delete cascade,
  default_loan_days      int  not null default 14 check (default_loan_days > 0),
  remind_days_before     int  not null default 3  check (remind_days_before >= 0),
  overdue_interval_days  int  not null default 7  check (overdue_interval_days > 0),
  max_overdue_reminders  int  not null default 4  check (max_overdue_reminders >= 0),
  auto_reminders_enabled bool not null default true,
  signature              text not null default 'Thanks!'
);

-- ---------- Row Level Security: only you can see your data ------------

alter table public.books     enable row level security;
alter table public.borrowers enable row level security;
alter table public.loans     enable row level security;
alter table public.email_log enable row level security;
alter table public.settings  enable row level security;

create policy "own books"     on public.books     for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "own borrowers" on public.borrowers for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "own loans"     on public.loans     for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "own settings"  on public.settings  for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
-- The app can read the email log; only the server (Edge Functions) writes to it
create policy "read own email log" on public.email_log for select to authenticated
  using (owner_id = (select auth.uid()));

-- Logged-in user gets table access (RLS above still applies); anonymous gets nothing
revoke all on public.books, public.borrowers, public.loans, public.email_log, public.settings from anon;
grant select, insert, update, delete on public.books, public.borrowers, public.loans, public.settings to authenticated;
grant select on public.email_log to authenticated;

-- ---------- Library view: each book with its current status ----------

create view public.book_status with (security_invoker = true) as
select
  b.*,
  l.id          as open_loan_id,
  l.lent_at,
  l.due_date,
  br.id         as borrower_id,
  br.name       as borrower_name,
  br.email      as borrower_email,
  case
    when l.id is null             then 'on_shelf'
    when l.due_date < current_date then 'overdue'
    else 'on_loan'
  end           as status
from public.books b
left join public.loans l      on l.book_id = b.id and l.returned_at is null
left join public.borrowers br on br.id = l.borrower_id;

revoke all on public.book_status from anon;
grant select on public.book_status to authenticated;

-- ---------- Settings row created automatically for each user ---------

create function public.create_settings_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.settings (owner_id) values (new.id)
  on conflict (owner_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created_settings
  after insert on auth.users
  for each row execute function public.create_settings_for_new_user();

-- In case your user account already exists
insert into public.settings (owner_id)
select id from auth.users
on conflict (owner_id) do nothing;
