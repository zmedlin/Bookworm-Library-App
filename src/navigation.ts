import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStackParamList = {
  Tabs: undefined;
  ConfirmBook: { isbn13?: string; bookId?: string };
  BookDetail: { bookId: string };
  Lend: { bookId: string; borrowerId?: string };
  EditLoan: { loanId: string };
  /** Without borrowerId: add a new borrower. */
  BorrowerDetail: { borrowerId?: string };
};

export type TabParamList = {
  Scan: undefined;
  Library: undefined;
  Loans: undefined;
  Borrowers: undefined;
  Settings: undefined;
};

export type StackProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;

declare global {
  // Lets useNavigation() know about our screens everywhere.
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
