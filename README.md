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
- **Settings**: loan length, reminder rules, email sign-off, sign out

Not yet: sending emails (next step: Supabase Edge Functions + daily schedule).

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
