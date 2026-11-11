// Bookworm "mailer" Edge Function — sends all emails through your Gmail.
//
// Called by the app (signed-in user):
//   { action: "test" }                     → test email to yourself
//   { action: "lent",   loan_id }          → "you borrowed…" confirmation
//   { action: "remind", loan_id }          → manual reminder
// Called once a day by the GitHub "Daily reminders" workflow (header x-cron-secret):
//   { action: "daily", dry_run?: boolean } → automatic reminders
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
  auto_reminders_enabled: boolean;
  signature: string;
  sender_name: string;
};

type Loan = {
  id: string;
  owner_id: string;
  lent_at: string;
  due_date: string;
  returned_at: string | null;
  reminder_count: number;
  book: { title: string; authors: string[] };
  borrower: { name: string; email: string };
};

type Kind = 'test' | 'confirmation' | 'upcoming' | 'due' | 'overdue' | 'manual';

const LOAN_SELECT = '*, book:books(title,authors), borrower:borrowers(name,email)';

// ---------- dates (in your time zone) ----------

const todayIso = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

const isoToUtc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const daysBetween = (a: string, b: string) => Math.round((isoToUtc(b) - isoToUtc(a)) / 86_400_000);
const longDate = (iso: string) =>
  new Date(isoToUtc(iso)).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' });
const tsToIso = (ts: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts));

// ---------- email text ----------

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function compose(kind: Kind, loan: Loan | null, settings: Settings, today: string) {
  const sig = settings.signature?.trim() || 'Thanks!';
  if (kind === 'test' || !loan) {
    return {
      subject: 'Bookworm test email',
      paragraphs: ['This is a test from your Bookworm library app. Email reminders are set up and working.'],
      sig,
    };
  }
  const first = loan.borrower.name.trim().split(/\s+/)[0];
  const title = loan.book.title;
  const by = loan.book.authors?.length ? ` by ${loan.book.authors.join(', ')}` : '';
  const d = daysBetween(today, loan.due_date);
  const due = longDate(loan.due_date);
  const lent = longDate(loan.lent_at);

  let subject: string;
  let body: string;
  if (kind === 'confirmation') {
    subject = `You borrowed “${title}”`;
    body = `Thanks for borrowing “${title}”${by}. It's due back on ${due}.`;
  } else if (d > 0) {
    subject = `Reminder: “${title}” is due ${due}`;
    body = `Just a friendly reminder that “${title}”${by}, which you borrowed on ${lent}, is due back ${d === 1 ? 'tomorrow' : `in ${d} days`}, on ${due}.`;
  } else if (d === 0) {
    subject = `“${title}” is due back today`;
    body = `Just a friendly reminder that “${title}”${by}, which you borrowed on ${lent}, is due back today.`;
  } else {
    subject = `Overdue: “${title}”`;
    body = `“${title}”${by}, which you borrowed on ${lent}, was due back on ${due} (${-d} day${d === -1 ? '' : 's'} ago). Please return it when you can.`;
  }
  return { subject, paragraphs: [`Hi ${first},`, body], sig };
}

async function send(kind: Kind, to: string, loan: Loan | null, settings: Settings, today: string, dryRun = false) {
  const { subject, paragraphs, sig } = compose(kind, loan, settings, today);
  const text = [...paragraphs, sig].join('\n\n');
  const html =
    paragraphs.map((p) => `<p>${esc(p)}</p>`).join('') + `<p>${esc(sig).replace(/\n/g, '<br>')}</p>`;
  const from = settings.sender_name?.trim()
    ? `"${settings.sender_name.trim().replace(/"/g, '')}" <${GMAIL_USER}>`
    : GMAIL_USER;

  if (dryRun) return { ok: true, subject };

  let status: 'sent' | 'failed' = 'sent';
  let error: string | null = null;
  try {
    await mail.sendMail({ from, to, subject, text, html });
  } catch (e) {
    status = 'failed';
    error = e instanceof Error ? e.message : String(e);
  }

  await db.from('email_log').insert({
    owner_id: settings.owner_id,
    loan_id: loan?.id ?? null,
    kind,
    to_email: to,
    status,
    error,
  });
  if (status === 'sent' && loan && kind !== 'confirmation') {
    await db
      .from('loans')
      .update({ last_reminder_at: new Date().toISOString(), reminder_count: (loan.reminder_count ?? 0) + 1 })
      .eq('id', loan.id);
  }
  return { ok: status === 'sent', subject, error };
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

/** Decide which automatic reminder (if any) a loan should get today. */
function reminderDue(
  loan: Loan,
  s: Settings,
  today: string,
  sent: { kind: string; sent_at: string }[],
): Kind | null {
  if (loan.lent_at >= today) return null; // lent today: no reminder yet
  const d = daysBetween(today, loan.due_date);
  const reminders = sent.filter((e) => e.kind !== 'confirmation');
  const has = (k: string) => reminders.some((e) => e.kind === k);

  if (d > 0) {
    return d <= s.remind_days_before && reminders.length === 0 ? 'upcoming' : null;
  }
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
  if (!open.length) return { today, checked: 0, results: [] };

  const { data: log } = await db
    .from('email_log')
    .select('loan_id, kind, sent_at')
    .eq('status', 'sent')
    .in('loan_id', open.map((l) => l.id));

  const settingsCache = new Map<string, Settings>();
  const results: unknown[] = [];
  for (const loan of open) {
    let s = settingsCache.get(loan.owner_id);
    if (!s) {
      s = await getSettings(loan.owner_id);
      settingsCache.set(loan.owner_id, s);
    }
    if (!s.auto_reminders_enabled) continue;
    const kind = reminderDue(loan, s, today, (log ?? []).filter((e) => e.loan_id === loan.id));
    if (!kind) continue;
    const r = await send(kind, loan.borrower.email, loan, s, today, dryRun);
    results.push({ loan_id: loan.id, to: loan.borrower.email, kind, ...r });
  }
  return { today, checked: open.length, dry_run: dryRun, results };
}

// ---------- HTTP handler ----------

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
  let body: { action?: string; loan_id?: string; dry_run?: boolean };
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
      const r = await send('test', GMAIL_USER, null, settings, today);
      return r.ok ? json({ ok: true, to: GMAIL_USER }) : json({ error: r.error }, 502);
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
      const kind: Kind = body.action === 'lent' ? 'confirmation' : 'manual';
      const r = await send(kind, loan.borrower.email, loan, settings, today);
      return r.ok ? json({ ok: true, to: loan.borrower.email }) : json({ error: r.error }, 502);
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
