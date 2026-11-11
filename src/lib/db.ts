// All database reads and writes live here.
import { supabase } from './supabase';
import { todayIso } from './dates';
import type {
  Book,
  BookStatus,
  BookWithStatus,
  Borrower,
  BorrowerKind,
  LoanFull,
  LoanWithBook,
  LoanWithBorrower,
  Settings,
} from './types';
import type { BookInfo } from './lookup';

const PAGE = 1000; // Supabase returns at most 1000 rows per request

function check<T>(res: { data: T; error: any }): T {
  if (res.error) throw new Error(friendlyError(res.error));
  return res.data;
}

export function friendlyError(e: any): string {
  if (!e) return 'Something went wrong.';
  if (e.code === '23505') {
    if (String(e.message).includes('loans_one_open_per_book')) return 'This book is already lent out.';
    if (String(e.message).includes('borrowers_owner_email')) return 'A borrower with that email already exists.';
    if (String(e.message).includes('isbn13')) return 'That book is already in your library.';
    return 'That already exists.';
  }
  if (e.code === '23503') return 'This is still linked to loan records, so it can’t be deleted.';
  if (e.code === '23514') return 'Please check the values you entered.';
  return e.message ?? String(e);
}

/** Status is worked out on the phone so "overdue" follows your local date. */
export function statusOf(b: Pick<BookWithStatus, 'open_loan_id' | 'due_date'>): BookStatus {
  if (!b.open_loan_id) return 'on_shelf';
  return b.due_date && b.due_date < todayIso() ? 'overdue' : 'on_loan';
}

// ---------- Books ----------

export async function listBooks(): Promise<BookWithStatus[]> {
  const all: BookWithStatus[] = [];
  for (let from = 0; ; from += PAGE) {
    const rows = check(
      await supabase
        .from('book_status')
        .select('*')
        .order('title', { ascending: true })
        .order('id')
        .range(from, from + PAGE - 1),
    ) as BookWithStatus[];
    all.push(...rows);
    if (rows.length < PAGE) return all;
  }
}

export async function getBookStatus(id: string): Promise<BookWithStatus | null> {
  return check(await supabase.from('book_status').select('*').eq('id', id).maybeSingle()) as BookWithStatus | null;
}

export async function findBookByIsbn(isbn13: string): Promise<Book | null> {
  return check(await supabase.from('books').select('*').eq('isbn13', isbn13).maybeSingle()) as Book | null;
}

export type BookInput = BookInfo & { isbn13: string | null; notes: string | null };

export async function createBook(input: BookInput): Promise<Book> {
  return check(await supabase.from('books').insert(input).select().single()) as Book;
}

export async function updateBook(id: string, input: Partial<BookInput>): Promise<Book> {
  return check(await supabase.from('books').update(input).eq('id', id).select().single()) as Book;
}

export async function deleteBook(id: string): Promise<void> {
  check(await supabase.from('books').delete().eq('id', id));
}

// ---------- Borrowers ----------

export type BorrowerWithCount = Borrower & { open_loans: number };

export async function listBorrowers(): Promise<BorrowerWithCount[]> {
  const rows = check(
    await supabase.from('borrowers').select('*, loans(returned_at)').order('name'),
  ) as (Borrower & { loans: { returned_at: string | null }[] })[];
  return rows.map(({ loans, ...b }) => ({ ...b, open_loans: loans.filter((l) => !l.returned_at).length }));
}

export async function getBorrower(id: string): Promise<Borrower | null> {
  return check(await supabase.from('borrowers').select('*').eq('id', id).maybeSingle()) as Borrower | null;
}

export type BorrowerInput = { name: string; email: string; kind: BorrowerKind; notes?: string | null };

const cleanBorrower = (i: BorrowerInput): BorrowerInput => ({
  ...i,
  name: i.name.trim(),
  email: i.email.trim().toLowerCase(),
});

export async function createBorrower(input: BorrowerInput): Promise<Borrower> {
  return check(await supabase.from('borrowers').insert(cleanBorrower(input)).select().single()) as Borrower;
}

export async function updateBorrower(id: string, input: BorrowerInput): Promise<Borrower> {
  return check(
    await supabase.from('borrowers').update(cleanBorrower(input)).eq('id', id).select().single(),
  ) as Borrower;
}

export async function deleteBorrower(id: string): Promise<void> {
  check(await supabase.from('borrowers').delete().eq('id', id));
}

// ---------- Loans ----------

export async function lendBook(bookId: string, borrowerId: string, dueDate: string): Promise<void> {
  check(
    await supabase
      .from('loans')
      .insert({ book_id: bookId, borrower_id: borrowerId, lent_at: todayIso(), due_date: dueDate }),
  );
}

export async function markReturned(loanId: string): Promise<void> {
  check(await supabase.from('loans').update({ returned_at: new Date().toISOString() }).eq('id', loanId));
}

export async function changeDueDate(loanId: string, dueDate: string): Promise<void> {
  check(await supabase.from('loans').update({ due_date: dueDate }).eq('id', loanId));
}

export async function listOpenLoans(): Promise<LoanFull[]> {
  return check(
    await supabase
      .from('loans')
      .select('*, book:books(id,title,authors,cover_url), borrower:borrowers(id,name,email)')
      .is('returned_at', null)
      .order('due_date'),
  ) as unknown as LoanFull[];
}

export async function loansForBook(bookId: string): Promise<LoanWithBorrower[]> {
  return check(
    await supabase
      .from('loans')
      .select('*, borrower:borrowers(id,name,email)')
      .eq('book_id', bookId)
      .order('lent_at', { ascending: false }),
  ) as unknown as LoanWithBorrower[];
}

export async function loansForBorrower(borrowerId: string): Promise<LoanWithBook[]> {
  return check(
    await supabase
      .from('loans')
      .select('*, book:books(id,title,authors,cover_url)')
      .eq('borrower_id', borrowerId)
      .order('lent_at', { ascending: false }),
  ) as unknown as LoanWithBook[];
}

// ---------- Settings ----------

export async function getSettings(): Promise<Settings | null> {
  return check(await supabase.from('settings').select('*').maybeSingle()) as Settings | null;
}

export async function saveSettings(s: Omit<Settings, 'owner_id'>): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error('Not signed in.');
  check(await supabase.from('settings').upsert({ owner_id: u.user.id, ...s }));
}
