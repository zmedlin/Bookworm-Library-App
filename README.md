# Bookworm — personal library app (Android)

Scan a book's barcode to add it to your library, lend books to friends and students,
and track who has what. Data is stored in Supabase.

## What's built so far
- Sign in (single account)
- **Scan**: ISBN barcode scanning; also type an ISBN or add a book without one
- Automatic book details from Open Library (Google Books as backup)
- **Library**: search and filter (on shelf / on loan / overdue)
- **Book detail**: lend, mark returned, change due date, edit, delete, loan history
- **Lend**: pick an earlier borrower or add a new one (name, email, student/friend), due date
- **Loans**: everything lent out, overdue first
- **Borrowers**: contact details, current and past loans
- **Settings**: loan length, reminder rules, sender name, email sign-off, test email, sign out
- **Multiple copies**: copy count per book; lend until all copies are out
- **Edit loans**: change borrower, dates, auto reminders; undo a return; delete a mistaken loan
- **Reminders**: per-loan automatic-reminder switch (default set in Settings), a master pause switch, and "Remind…" on the Loans tab (overdue only or everyone; one email per person)
- **Saved borrowers**: pick from a list when lending; add people ahead of time from the Borrowers tab
- **Covers**: if none is found, search online for covers or take/choose a photo (stored in Supabase Storage)
- **Email** (Supabase function `mailer`, sent from Gmail): loan confirmation, "Send reminder" button,
  and automatic daily reminders (before due, on due date, then every N days while overdue)

## Server pieces
- `supabase/01_schema.sql`, `02_email_and_covers.sql`, `03_copies_and_reminder_options.sql`: run once each, in order, in the SQL Editor
- `supabase/functions/mailer/index.ts`: Edge Function (deploy with JWT verification **off**)
  - Secrets: `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `CRON_SECRET`
- `.github/workflows/daily-reminders.yml`: calls the function every morning; needs repo secret `CRON_SECRET`

## Project layout
```
App.tsx                  navigation + login gate
src/config.ts            Supabase URL + publishable key
src/lib/                 supabase client, database calls, ISBN + date helpers, book lookup
src/screens/             one file per screen
src/components/          shared UI pieces
.github/workflows/       cloud build that produces the APK
supabase/                database SQL
```

## Getting the app on your phone

### Option A — cloud build (no computer needed)
Push this repo to GitHub. The **Build Android APK** workflow builds the app (~15–20 min)
and publishes `Bookworm.apk` under **Releases**. On the phone, open the release page,
download `Bookworm.apk`, and tap it to install (allow "install unknown apps" for your browser
when asked). To update later, install the newer APK over the old one.

### Option B — run from a computer
```
npm install
npx expo start
```
Install **Expo Go** from the Play Store and scan the QR code. Good for trying changes quickly.

## Development
```
npm run typecheck
```
