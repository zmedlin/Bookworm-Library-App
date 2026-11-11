import React, { useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, Switch, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Button, Field, Loading, colors, s } from '../components/ui';
import { friendlyError, getSettings, saveSettings } from '../lib/db';
import { supabase } from '../lib/supabase';

export default function SettingsScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState('');
  const [loanDays, setLoanDays] = useState('14');
  const [before, setBefore] = useState('3');
  const [overdueEvery, setOverdueEvery] = useState('7');
  const [maxOverdue, setMaxOverdue] = useState('4');
  const [auto, setAuto] = useState(true);
  const [signature, setSignature] = useState('Thanks!');

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const [{ data }, st] = await Promise.all([supabase.auth.getUser(), getSettings()]);
          setEmail(data.user?.email ?? '');
          if (st) {
            setLoanDays(String(st.default_loan_days));
            setBefore(String(st.remind_days_before));
            setOverdueEvery(String(st.overdue_interval_days));
            setMaxOverdue(String(st.max_overdue_reminders));
            setAuto(st.auto_reminders_enabled);
            setSignature(st.signature);
          }
        } catch (e) {
          Alert.alert('Couldn’t load settings', friendlyError(e));
        } finally {
          setLoading(false);
        }
      })();
    }, []),
  );

  async function save() {
    const n = (v: string) => Number.parseInt(v, 10);
    const vals = [n(loanDays), n(before), n(overdueEvery), n(maxOverdue)];
    if (vals.some((v) => !Number.isInteger(v) || v < 0) || n(loanDays) < 1 || n(overdueEvery) < 1)
      return Alert.alert('Check the numbers', 'Use whole numbers. Loan length and reminder interval must be at least 1.');
    setSaving(true);
    try {
      await saveSettings({
        default_loan_days: vals[0],
        remind_days_before: vals[1],
        overdue_interval_days: vals[2],
        max_overdue_reminders: vals[3],
        auto_reminders_enabled: auto,
        signature: signature.trim() || 'Thanks!',
      });
      Alert.alert('Saved');
    } catch (e) {
      Alert.alert('Couldn’t save', friendlyError(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Loading />;

  return (
    <KeyboardAvoidingView behavior="height" style={s.screen}>
      <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
        <Text style={s.h2}>Loans</Text>
        <Field label="Default loan length (days)" value={loanDays} onChangeText={setLoanDays} keyboardType="number-pad" />

        <Text style={s.h2}>Email reminders</Text>
        <View style={[s.row, { justifyContent: 'space-between', marginBottom: 14 }]}>
          <Text style={s.body}>Send reminders automatically</Text>
          <Switch value={auto} onValueChange={setAuto} trackColor={{ true: colors.primary }} />
        </View>
        <Field label="Remind this many days before due" value={before} onChangeText={setBefore} keyboardType="number-pad" />
        <Field label="When overdue, remind every (days)" value={overdueEvery} onChangeText={setOverdueEvery} keyboardType="number-pad" />
        <Field label="Maximum overdue reminders" value={maxOverdue} onChangeText={setMaxOverdue} keyboardType="number-pad" />
        <Field label="Email sign-off" value={signature} onChangeText={setSignature} multiline />
        <Text style={[s.muted, { marginBottom: 10 }]}>Emails will start sending once the email step is set up.</Text>

        <Button title="Save settings" onPress={save} loading={saving} />

        <Text style={s.h2}>Account</Text>
        <Text style={[s.muted, { marginBottom: 8 }]}>Signed in as {email}</Text>
        <Button title="Sign out" variant="secondary" onPress={() => supabase.auth.signOut()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
