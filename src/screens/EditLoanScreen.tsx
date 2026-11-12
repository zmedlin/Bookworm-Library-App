import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { Button, Cover, Loading, colors, s } from '../components/ui';
import { pickDate } from '../components/pickDate';
import { BorrowerWithCount, deleteLoan, friendlyError, getLoan, listBorrowers, updateLoan } from '../lib/db';
import { formatDate, formatTimestamp } from '../lib/dates';
import type { LoanFull } from '../lib/types';
import type { StackProps } from '../navigation';

/** Fix a loan: borrower, dates, automatic reminders; undo a return; delete a mistaken loan. */
export default function EditLoanScreen({ route, navigation }: StackProps<'EditLoan'>) {
  const { loanId } = route.params;
  const [loan, setLoan] = useState<LoanFull | null>(null);
  const [borrowers, setBorrowers] = useState<BorrowerWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [borrowerId, setBorrowerId] = useState('');
  const [lentAt, setLentAt] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [autoRemind, setAutoRemind] = useState(true);
  const [changingBorrower, setChangingBorrower] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [l, list] = await Promise.all([getLoan(loanId), listBorrowers()]);
        setLoan(l);
        setBorrowers(list);
        if (l) {
          setBorrowerId(l.borrower_id);
          setLentAt(l.lent_at);
          setDueDate(l.due_date);
          setAutoRemind(l.auto_remind);
        }
      } catch (e) {
        Alert.alert('Couldn’t load', friendlyError(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [loanId]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return borrowers.filter((b) => !q || b.name.toLowerCase().includes(q) || b.email.toLowerCase().includes(q));
  }, [borrowers, search]);

  if (loading) return <Loading />;
  if (!loan) return <Text style={s.empty}>Loan not found.</Text>;

  const borrower = borrowers.find((b) => b.id === borrowerId);
  const returned = !!loan.returned_at;

  async function save() {
    if (dueDate < lentAt) return Alert.alert('Check the dates', 'The due date can’t be before the date it was lent.');
    setSaving(true);
    try {
      await updateLoan(loanId, { borrower_id: borrowerId, lent_at: lentAt, due_date: dueDate, auto_remind: autoRemind });
      navigation.goBack();
    } catch (e) {
      Alert.alert('Couldn’t save', friendlyError(e));
      setSaving(false);
    }
  }

  function undoReturn() {
    Alert.alert('Mark as not returned?', 'The book will show as lent out again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Not returned',
        onPress: async () => {
          try {
            await updateLoan(loanId, { returned_at: null });
            navigation.goBack();
          } catch (e) {
            Alert.alert('Couldn’t update', friendlyError(e));
          }
        },
      },
    ]);
  }

  function confirmDelete() {
    Alert.alert('Delete this loan?', 'Use this only for a loan entered by mistake. It will be removed from the history.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteLoan(loanId);
            navigation.goBack();
          } catch (e) {
            Alert.alert('Couldn’t delete', friendlyError(e));
          }
        },
      },
    ]);
  }

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <View style={[s.row, { marginBottom: 8 }]}>
        <Cover uri={loan.book.cover_url} size={44} />
        <View style={{ marginLeft: 12, flex: 1 }}>
          <Text style={[s.body, { fontWeight: '700' }]}>{loan.book.title}</Text>
          {returned && <Text style={s.muted}>Returned {formatTimestamp(loan.returned_at!)}</Text>}
        </View>
      </View>

      <Text style={s.h2}>Borrower</Text>
      {!changingBorrower ? (
        <Pressable onPress={() => setChangingBorrower(true)} style={s.card}>
          <Text style={[s.body, { fontWeight: '700' }]}>{borrower?.name ?? loan.borrower.name}</Text>
          <Text style={s.muted}>{borrower?.email ?? loan.borrower.email}</Text>
          <Text style={{ color: colors.primary, fontWeight: '600', marginTop: 6 }}>Change borrower</Text>
        </Pressable>
      ) : (
        <>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search saved borrowers"
            placeholderTextColor={colors.muted}
            style={[s.input, { marginBottom: 8 }]}
          />
          <View style={{ borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: colors.line }}>
            {matches.map((b) => (
              <Pressable
                key={b.id}
                onPress={() => { setBorrowerId(b.id); setChangingBorrower(false); setSearch(''); }}
                style={[s.listRow, b.id === borrowerId && { backgroundColor: '#E5EFE9' }]}
              >
                <View>
                  <Text style={[s.body, { fontWeight: '600' }]}>{b.name}</Text>
                  <Text style={s.muted}>{b.email}</Text>
                </View>
              </Pressable>
            ))}
          </View>
          <Text style={[s.muted, { marginTop: 6 }]}>To add someone new, use the Borrowers tab first.</Text>
        </>
      )}

      <Text style={s.h2}>Dates</Text>
      <Text style={s.label}>Lent on</Text>
      <Pressable onPress={() => pickDate(lentAt, setLentAt)} style={[s.input, { marginBottom: 12 }]}>
        <Text style={s.body}>📅  {formatDate(lentAt)}</Text>
      </Pressable>
      <Text style={s.label}>Due back</Text>
      <Pressable onPress={() => pickDate(dueDate, setDueDate, lentAt)} style={s.input}>
        <Text style={s.body}>📅  {formatDate(dueDate)}</Text>
      </Pressable>

      {!returned && (
        <View style={[s.row, { justifyContent: 'space-between', marginTop: 18 }]}>
          <Text style={s.body}>Automatic reminders</Text>
          <Switch value={autoRemind} onValueChange={setAutoRemind} trackColor={{ true: colors.primary }} />
        </View>
      )}

      <Button title="Save changes" onPress={save} loading={saving} style={{ marginTop: 20 }} />
      <Button title="Cancel" variant="secondary" onPress={() => navigation.goBack()} />
      {returned && <Button title="Mark as not returned" variant="secondary" onPress={undoReturn} style={{ marginTop: 16 }} />}
      <Button title="Delete this loan" variant="danger" onPress={confirmDelete} style={{ marginTop: returned ? 4 : 16 }} />
    </ScrollView>
  );
}
