import React, { useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, Switch, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Button, Field, Loading, colors, s } from '../components/ui';
import { friendlyError, getSettings, saveSettings, sendEmail } from '../lib/db';
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
  const [autoDefault, setAutoDefault] = useState(true);
  const [signature, setSignature] = useState('Thanks!');
  const [senderName, setSenderName] = useState('');
  const [testing, setTesting] = useState(false);

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
            setAutoDefault(st.auto_remind_default ?? true);
            setAutoDefault(st.auto_remind_default ?? true);
            setSignature(st.signature);
            setSenderName(st.sender_name ?? '');
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
        auto_remind_default: autoDefault,
        signature: signature.trim() || 'Thanks!',
        sender_name: senderName.trim(),
      });
      Alert.alert('Saved');
    } catch (e) {
      Alert.alert('Couldn’t save', friendlyError(e));
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    try {
      const to = await sendEmail('test');
      Alert.alert('Test email sent', `Check the inbox for ${to}.`);
    } catch (e) {
      Alert.alert('Test email failed', e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(false);
    }
  }

  if (loading) return <Loading />;

  return (
    <KeyboardAvoidingView behavior="height" style={s.screen}>
      <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
        <Text style={s.h2}>Loans</Text>
        <Field label="Default loan length (days)" value={loanDays} onChangeText={setLoanDays} keyboardType="number-pad" />

        <Text style={s.h2}>Email reminders</Text>
        <View style={[s.row, { justifyContent: 'space-between', marginBottom: 4 }]}>
          <Text style={[s.body, { flex: 1 }]}>Send automatic reminders</Text>
          <Switch value={auto} onValueChange={setAuto} trackColor={{ true: colors.primary }} />
        </View>
        <Text style={[s.muted, { marginBottom: 14 }]}>
          {auto
            ? 'On: loans with automatic reminders turned on get emails.'
            : 'Paused: no automatic emails go out, whatever each loan is set to.'}
        </Text>
        <View style={[s.row, { justifyContent: 'space-between', marginBottom: 4 }]}>
          <Text style={[s.body, { flex: 1 }]}>New loans start with reminders on</Text>
          <Switch value={autoDefault} onValueChange={setAutoDefault} trackColor={{ true: colors.primary }} />
        </View>
        <Text style={[s.muted, { marginBottom: 14 }]}>You can still change it on each loan.</Text>
        <Field label="Remind this many days before due" value={before} onChangeText={setBefore} keyboardType="number-pad" />
        <Field label="When overdue, remind every (days)" value={overdueEvery} onChangeText={setOverdueEvery} keyboardType="number-pad" />
        <Field label="Maximum overdue reminders" value={maxOverdue} onChangeText={setMaxOverdue} keyboardType="number-pad" />
        <Field label="Sender name (shown in borrowers’ inbox)" value={senderName} onChangeText={setSenderName} placeholder="e.g. Mr. Medlin" />
        <Field label="Email sign-off" value={signature} onChangeText={setSignature} multiline />

        <Button title="Save settings" onPress={save} loading={saving} />
        <Button title="Send me a test email" variant="secondary" onPress={sendTest} loading={testing} />

        <Text style={s.h2}>Account</Text>
        <Text style={[s.muted, { marginBottom: 8 }]}>Signed in as {email}</Text>
        <Button title="Sign out" variant="secondary" onPress={() => supabase.auth.signOut()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
