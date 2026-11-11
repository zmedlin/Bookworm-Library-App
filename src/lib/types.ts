export type Book = {
  id: string;
  owner_id: string;
  isbn13: string | null;
  title: string;
  authors: string[];
  publisher: string | null;
  published_year: number | null;
  cover_url: string | null;
  notes: string | null;
  created_at: string;
};

export type BookStatus = 'on_shelf' | 'on_loan' | 'overdue';

/** A row of the book_status view. */
export type BookWithStatus = Book & {
  open_loan_id: string | null;
  lent_at: string | null;
  due_date: string | null;
  borrower_id: string | null;
  borrower_name: string | null;
  borrower_email: string | null;
};

export type BorrowerKind = 'friend' | 'student';

export type Borrower = {
  id: string;
  name: string;
  email: string;
  kind: BorrowerKind;
  notes: string | null;
  created_at: string;
};

export type Loan = {
  id: string;
  book_id: string;
  borrower_id: string;
  lent_at: string;
  due_date: string;
  returned_at: string | null;
  last_reminder_at: string | null;
  reminder_count: number;
};

export type LoanWithBook = Loan & { book: Pick<Book, 'id' | 'title' | 'authors' | 'cover_url'> };
export type LoanWithBorrower = Loan & { borrower: Pick<Borrower, 'id' | 'name' | 'email'> };
export type LoanFull = LoanWithBook & LoanWithBorrower;

export type Settings = {
  owner_id: string;
  default_loan_days: number;
  remind_days_before: number;
  overdue_interval_days: number;
  max_overdue_reminders: number;
  auto_reminders_enabled: boolean;
  signature: string;
  sender_name: string;
};
