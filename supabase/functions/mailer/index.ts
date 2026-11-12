// Bookworm "mailer" Edge Function — sends all emails through your Gmail.
//
// Called by the app (signed-in user):
//   { action: "test" }                                   → test email to yourself
//   { action: "lent",   loan_id }                        → "you borrowed…" confirmation
//   { action: "remind", loan_id }                        → reminder about one loan
//   { action: "remind_all", scope: "overdue"|"all", dry_run? }
//        → one email per borrower listing all their (overdue) books; dry_run only counts
// Called once a day by the GitHub "Daily reminders" workflow (header x-cron-secret):
//   { action: "daily", dry_run? }                        → automatic reminders
//
// Secrets (Supabase → Edge Functions → Secrets): GMAIL_USER, GMAIL_APP_PASSWORD, CRON_SECRET
// Deploy with "Verify JWT" turned OFF — this function checks the caller itself.

import { createClient } from 'npm:@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6';

const TIME_ZONE = 'America/Chicago';

// ---------- setup ----------

function adminKey(): string {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (keys) {
    const parsed = JSON.parse(keys);
    const k = parsed.default ?? Object.values(parsed)[0];
    if (k) return k as string;
  }
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  throw new Error('No Supabase secret key available to the function.');
}

const db = createClient(Deno.env.get('SUPABASE_URL')!, adminKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const GMAIL_USER = Deno.env.get('GMAIL_USER') ?? '';
const GMAIL_APP_PASSWORD = (Deno.env.get('GMAIL_APP_PASSWORD') ?? '').replace(/\s+/g, '');

const mail = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465, // Edge Functions block ports 25 and 587
  secure: true,
  auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
});

// ---------- types ----------

type Settings = {
  owner_id: string;
  remind_days_before: number;
  overdue_interval_days: number;
  max_overdue_reminders: number;
  auto_reminders_enabled: boolean; // master switch: false = all automatic reminders paused
  signature: string;
  sender_name: string;
};

type Loan = {
  id: string;
  owner_id: string;
  borrower_id: string;
  lent_at: string;
  due_date: string;
  returned_at: string | null;
  reminder_count: number;
  auto_remind: boolean;
  book: { title: string; authors: string[] };
  borrower: { name: string; email: string };
};

type Kind = 'test' | 'confirmation' | 'upcoming' | 'due' | 'overdue' | 'manual';
type Item = { loan: Loan; kind: Kind };

const LOAN_SELECT = '*, book:books(title,authors), borrower:borrowers(name,email)';

// ---------- dates (in your time zone) ----------

const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const todayIso = () => ymd.format(new Date());
const tsToIso = (ts: string) => ymd.format(new Date(ts));
const isoToUtc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const daysBetween = (a: string, b: string) => Math.round((isoToUtc(b) - isoToUtc(a)) / 86_400_000);
const longDate = (iso: string) =>
  new Date(isoToUtc(iso)).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' });

// ---------- email text ----------

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const byLine = (l: Loan) => (l.book.authors?.length ? ` by ${l.book.authors.join(', ')}` : '');
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** "due back Monday, November 30 (in 3 days)" / "was due back … (5 days ago)" */
function dueText(l: Loan, today: string) {
  const d = daysBetween(today, l.due_date);
  if (d > 1) return `due back ${longDate(l.due_date)} (in ${d} days)`;
  if (d === 1) return `due back tomorrow, ${longDate(l.due_date)}`;
  if (d === 0) return 'due back today';
  return `was due back ${longDate(l.due_date)} (${plural(-d, 'day')} ago)`;
}

type Composed = { subject: string; paragraphs: string[]; list?: string[]; closing?: string };

/** Email for one borrower about one or more loans. */
function compose(items: Item[], today: string): Composed {
  const first = items[0].loan.borrower.name.trim().split(/\s+/)[0];
  const hi = `Hi ${first},`;

  if (items.length === 1) {
    const { loan: l, kind } = items[0];
    const title = l.book.title;
    const d = daysBetween(today, l.due_date);
    if (kind === 'confirmation') {
      return {
        subject: `You borrowed “${title}”`,
        paragraphs: [hi, `Thanks for borrowing “${title}”${byLine(l)}. It's due back on ${longDate(l.due_date)}.`],
      };
    }
    const lent = longDate(l.lent_at);
    if (d > 0)
      return {
        subject: `Reminder: “${title}” is due ${longDate(l.due_date)}`,
        paragraphs: [hi, `Just a friendly reminder that “${title}”${byLine(l)}, which you borrowed on ${lent}, is ${dueText(l, today)}.`],
      };
    if (d === 0)
      return {
        subject: `“${title}” is due back today`,
        paragraphs: [hi, `Just a friendly reminder that “${title}”${byLine(l)}, which you borrowed on ${lent}, is due back today.`],
      };
    return {
      subject: `Overdue: “${title}”`,
      paragraphs: [hi, `“${title}”${byLine(l)}, which you borrowed on ${lent}, ${dueText(l, today)}. Please return it when you can.`],
    };
  }

  // Several books in one email.
  const sorted = [...items].sort((a, b) => a.loan.due_date.localeCompare(b.loan.due_date));
  const overdue = sorted.filter((i) => i.loan.due_date < today).length;
  const dueToday = sorted.filter((i) => i.loan.due_date === today).length;
  const subject = overdue
    ? `Overdue library books (${plural(overdue, 'book')} overdue)`
    : dueToday
      ? 'Library books due back today'
      : `Reminder: ${items.length} library books due soon`;
  return {
    subject,
    paragraphs: [hi, `Just a friendly reminder about the ${items.length} books you've borrowed:`],
    list: sorted.map((i) => `“${i.loan.book.title}”${byLine(i.loan)}: ${dueText(i.loan, today)}`),
    closing: overdue ? 'Please return the overdue ones when you can.' : undefined,
  };
}

const fromAddress = (s: Settings) =>
  s.sender_name?.trim() ? `"${s.sender_name.trim().replace(/"/g, '')}" <${GMAIL_USER}>` : GMAIL_USER;

function render(c: Composed, signature: string) {
  const sig = signature?.trim() || 'Thanks!';
  const textParts = [...c.paragraphs, ...(c.list ? [c.list.map((x) => `• ${x}`).join('\n')] : []), ...(c.closing ? [c.closing] : []), sig];
  const html =
    c.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('') +
    (c.list ? `<ul>${c.list.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '') +
    (c.closing ? `<p>${esc(c.closing)}</p>` : '') +
    `<p>${esc(sig).replace(/\n/g, '<br>')}</p>`;
  return { text: textParts.join('\n\n'), html };
}

/** Send one email to a borrower covering `items`; logs one row per loan. */
async function sendItems(items: Item[], settings: Settings, today: string) {
  const to = items[0].loan.borrower.email;
  const c = compose(items, today);
  const { text, html } = render(c, settings.signature);
  let status: 'sent' | 'failed' = 'sent';
  let error: string | null = null;
  try {
    await mail.sendMail({ from: fromAddress(settings), to, subject: c.subject, text, html });
  } catch (e) {
    status = 'failed';
    error = e instanceof Error ? e.message : String(e);
  }
  await db.from('email_log').insert(
    items.map((i) => ({ owner_id: settings.owner_id, loan_id: i.loan.id, kind: i.kind, to_email: to, status, error })),
  );
  if (status === 'sent') {
    const now = new Date().toISOString();
    for (const i of items) {
      if (i.kind === 'confirmation') continue;
      await db
        .from('loans')
        .update({ last_reminder_at: now, reminder_count: (i.loan.reminder_count ?? 0) + 1 })
        .eq('id', i.loan.id);
    }
  }
  return { ok: status === 'sent', to, subject: c.subject, books: items.length, error };
}

function groupByBorrower(items: Item[]): Item[][] {
  const groups = new Map<string, Item[]>();
  for (const i of items) {
    const key = i.loan.borrower.email.toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), i]);
  }
  return [...groups.values()];
}

async function getSettings(ownerId: string): Promise<Settings> {
  const { data } = await db.from('settings').select('*').eq('owner_id', ownerId).maybeSingle();
  return (
    data ?? {
      owner_id: ownerId,
      remind_days_before: 3,
      overdue_interval_days: 7,
      max_overdue_reminders: 4,
      auto_reminders_enabled: true,
      signature: 'Thanks!',
      sender_name: '',
    }
  );
}

// ---------- daily job ----------

/** Which automatic reminder (if any) a loan should get today. */
function reminderDue(loan: Loan, s: Settings, today: string, sent: { kind: string; sent_at: string }[]): Kind | null {
  if (loan.auto_remind === false) return null;
  if (loan.lent_at >= today) return null; // lent today: no reminder yet
  const d = daysBetween(today, loan.due_date);
  const reminders = sent.filter((e) => e.kind !== 'confirmation');
  const has = (k: string) => reminders.some((e) => e.kind === k);

  if (d > 0) return d <= s.remind_days_before && reminders.length === 0 ? 'upcoming' : null;
  if (d === 0) return has('due') ? null : 'due';

  const overdueSent = reminders.filter((e) => e.kind === 'overdue').length;
  if (overdueSent >= s.max_overdue_reminders) return null;
  const last = reminders.map((e) => tsToIso(e.sent_at)).sort().pop();
  if (!last) return 'overdue';
  return daysBetween(last, today) >= s.overdue_interval_days ? 'overdue' : null;
}

async function runDaily(dryRun: boolean) {
  const today = todayIso();
  const { data: loans, error } = await db.from('loans').select(LOAN_SELECT).is('returned_at', null);
  if (error) throw error;
  const open = (loans ?? []) as Loan[];
  if (!open.length) return { today, checked: 0, emails: [] };

  const { data: log } = await db
    .from('email_log')
    .select('loan_id, kind, sent_at')
    .eq('status', 'sent')
    .in('loan_id', open.map((l) => l.id));

  // Group by owner (normally just you), then by borrower: one email per person.
  const byOwner = new Map<string, Loan[]>();
  for (const l of open) byOwner.set(l.owner_id, [...(byOwner.get(l.owner_id) ?? []), l]);

  const emails: unknown[] = [];
  for (const [ownerId, ownerLoans] of byOwner) {
    const s = await getSettings(ownerId);
    if (!s.auto_reminders_enabled) continue; // paused
    const items: Item[] = [];
    for (const loan of ownerLoans) {
      const kind = reminderDue(loan, s, today, (log ?? []).filter((e) => e.loan_id === loan.id));
      if (kind) items.push({ loan, kind });
    }
    for (const group of groupByBorrower(items)) {
      if (dryRun) {
        emails.push({ to: group[0].loan.borrower.email, subject: compose(group, today).subject, books: group.length });
      } else {
        emails.push(await sendItems(group, s, today));
      }
    }
  }
  return { today, checked: open.length, dry_run: dryRun, emails };
}

// ---------- HTTP handler ----------

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
  let body: { action?: string; loan_id?: string; scope?: string; dry_run?: boolean };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) return json({ error: 'Gmail secrets are not set in Supabase.' }, 500);

  try {
    // Daily job: authenticated by the shared cron secret.
    if (body.action === 'daily') {
      const secret = Deno.env.get('CRON_SECRET');
      if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'Unauthorized' }, 401);
      return json(await runDaily(!!body.dry_run));
    }

    // Everything else: must be the signed-in app user.
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: auth } = token ? await db.auth.getUser(token) : { data: { user: null } };
    const user = auth?.user;
    if (!user) return json({ error: 'Please sign in again.' }, 401);

    const settings = await getSettings(user.id);
    const today = todayIso();

    if (body.action === 'test') {
      const c: Composed = {
        subject: 'Bookworm test email',
        paragraphs: ['This is a test from your Bookworm library app. Email is set up and working.'],
      };
      const { text, html } = render(c, settings.signature);
      try {
        await mail.sendMail({ from: fromAddress(settings), to: GMAIL_USER, subject: c.subject, text, html });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await db.from('email_log').insert({ owner_id: user.id, kind: 'test', to_email: GMAIL_USER, status: 'failed', error: msg });
        return json({ error: msg }, 502);
      }
      await db.from('email_log').insert({ owner_id: user.id, kind: 'test', to_email: GMAIL_USER, status: 'sent' });
      return json({ ok: true, to: GMAIL_USER });
    }

    if (body.action === 'lent' || body.action === 'remind') {
      if (!body.loan_id) return json({ error: 'loan_id is required' }, 400);
      const { data, error } = await db
        .from('loans')
        .select(LOAN_SELECT)
        .eq('id', body.loan_id)
        .eq('owner_id', user.id)
        .maybeSingle();
      if (error) throw error;
      const loan = data as Loan | null;
      if (!loan) return json({ error: 'Loan not found' }, 404);
      if (loan.returned_at) return json({ error: 'That book has already been returned.' }, 400);
      const r = await sendItems([{ loan, kind: body.action === 'lent' ? 'confirmation' : 'manual' }], settings, today);
      return r.ok ? json({ ok: true, to: r.to }) : json({ error: r.error }, 502);
    }

    if (body.action === 'remind_all') {
      const scope = body.scope === 'overdue' ? 'overdue' : 'all';
      let q = db.from('loans').select(LOAN_SELECT).eq('owner_id', user.id).is('returned_at', null);
      if (scope === 'overdue') q = q.lt('due_date', today);
      const { data, error } = await q;
      if (error) throw error;
      const groups = groupByBorrower(((data ?? []) as Loan[]).map((loan) => ({ loan, kind: 'manual' as Kind })));
      const books = groups.reduce((n, g) => n + g.length, 0);
      if (body.dry_run) return json({ ok: true, scope, people: groups.length, books });
      const results = [];
      for (const g of groups) results.push(await sendItems(g, settings, today));
      const failed = results.filter((r) => !r.ok);
      return json({
        ok: failed.length === 0,
        scope,
        people: groups.length,
        books,
        sent: results.length - failed.length,
        failed: failed.map((f) => ({ to: f.to, error: f.error })),
      });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
