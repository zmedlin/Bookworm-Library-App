import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { Session } from '@supabase/supabase-js';

import { supabase } from './src/lib/supabase';
import { Loading, colors } from './src/components/ui';
import type { RootStackParamList, TabParamList } from './src/navigation';
import LoginScreen from './src/screens/LoginScreen';
import ScannerScreen from './src/screens/ScannerScreen';
import LibraryScreen from './src/screens/LibraryScreen';
import LoansScreen from './src/screens/LoansScreen';
import BorrowersScreen from './src/screens/BorrowersScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import ConfirmBookScreen from './src/screens/ConfirmBookScreen';
import BookDetailScreen from './src/screens/BookDetailScreen';
import LendScreen from './src/screens/LendScreen';
import BorrowerDetailScreen from './src/screens/BorrowerDetailScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const TAB_ICONS: Record<keyof TabParamList, keyof typeof Ionicons.glyphMap> = {
  Scan: 'barcode-outline',
  Library: 'library-outline',
  Loans: 'swap-horizontal-outline',
  Borrowers: 'people-outline',
  Settings: 'settings-outline',
};

const theme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: colors.bg, primary: colors.primary, card: colors.card, text: colors.ink },
};

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarIcon: ({ color, size }) => <Ionicons name={TAB_ICONS[route.name]} size={size} color={color} />,
      })}
    >
      <Tab.Screen name="Scan" component={ScannerScreen} options={{ title: 'Scan a book' }} />
      <Tab.Screen name="Library" component={LibraryScreen} />
      <Tab.Screen name="Loans" component={LoansScreen} />
      <Tab.Screen name="Borrowers" component={BorrowersScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {!ready ? (
        <Loading />
      ) : !session ? (
        <LoginScreen />
      ) : (
        <NavigationContainer theme={theme}>
          <Stack.Navigator screenOptions={{ headerTintColor: colors.primary }}>
            <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
            <Stack.Screen name="ConfirmBook" component={ConfirmBookScreen} options={{ title: 'Add book' }} />
            <Stack.Screen name="BookDetail" component={BookDetailScreen} options={{ title: 'Book' }} />
            <Stack.Screen name="Lend" component={LendScreen} options={{ title: 'Lend book' }} />
            <Stack.Screen name="BorrowerDetail" component={BorrowerDetailScreen} options={{ title: 'Borrower' }} />
          </Stack.Navigator>
        </NavigationContainer>
      )}
    </SafeAreaProvider>
  );
}
