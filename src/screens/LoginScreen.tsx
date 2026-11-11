import React, { useState } from 'react';
import { KeyboardAvoidingView, Text, View } from 'react-native';
import { Button, Field, colors, s } from '../components/ui';
import { supabase } from '../lib/supabase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setError(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message);
    setBusy(false);
  }

  return (
    <KeyboardAvoidingView behavior="height" style={[s.screen, { justifyContent: 'center', padding: 24 }]}>
      <View style={{ alignItems: 'center', marginBottom: 32 }}>
        <Text style={{ fontSize: 56 }}>📚</Text>
        <Text style={[s.h1, { fontSize: 28, marginTop: 8 }]}>Bookworm</Text>
        <Text style={s.muted}>Your library, in your pocket</Text>
      </View>
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" onSubmitEditing={signIn} />
      {error && <Text style={{ color: colors.danger, marginBottom: 8 }}>{error}</Text>}
      <Button title="Sign in" onPress={signIn} loading={busy} disabled={!email || !password} />
    </KeyboardAvoidingView>
  );
}
