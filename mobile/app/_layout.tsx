import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, useTheme } from 'react-native-paper';
import { AppProvider, useApp } from '../src/providers/AppProvider';
import { Screen, State } from '../src/components/ui';
import { Platform, View } from 'react-native';
function RootNavigator() {
  const { ready, bootError, restore, logout, user, reducedMotion } = useApp(); const theme = useTheme();
  if (!ready) return <Screen><ActivityIndicator accessibilityLabel="Restoring session" /></Screen>;
  if (bootError) return <Screen><State title="Let’s reconnect" description={bootError} action="Retry" onAction={() => void restore()} /><State title="Use another account" description="Return to sign in on this device." action="Sign out" onAction={() => void logout().then(restore)} /></Screen>;
  return <><StatusBar style={theme.dark ? 'light' : 'dark'} /><Stack screenOptions={{ headerStyle: { backgroundColor: theme.colors.background }, headerTintColor: theme.colors.onSurface, contentStyle: { backgroundColor: theme.colors.background }, animation: reducedMotion ? 'none' : 'slide_from_right', headerShadowVisible: false }}>
    <Stack.Screen name="index" options={{ headerShown: false }} />
    <Stack.Protected guard={!user}><Stack.Screen name="login" options={{ headerShown: false }} /></Stack.Protected>
    <Stack.Protected guard={!!user && user.role !== 'CONTRACTOR'}><Stack.Screen name="role" options={{ title: 'Your workspace' }} /></Stack.Protected>
    <Stack.Protected guard={user?.role === 'CONTRACTOR'}>
      <Stack.Screen name="(contractor)" options={{ headerShown: false }} />
      <Stack.Screen name="module/[module]" options={{ title: 'Workspace', headerBackTitle: 'Back' }} />
      <Stack.Screen name="record/[module]/[id]" options={{ title: 'Details', headerBackTitle: 'Back' }} />
      <Stack.Screen name="quick-actions" options={{ title: 'Quick actions', presentation: 'formSheet', sheetAllowedDetents: [0.6, 1], sheetGrabberVisible: true }} />
    </Stack.Protected>
  </Stack></>;
}
function MobileViewport() {
  const theme = useTheme();
  if (Platform.OS !== 'web') return <RootNavigator />;
  return <View style={{ flex: 1, alignItems: 'center', backgroundColor: theme.dark ? '#0A1421' : '#EAE7E1' }}><View style={{ flex: 1, width: '100%', maxWidth: 430, borderLeftWidth: 1, borderRightWidth: 1, borderColor: theme.colors.outlineVariant }}><RootNavigator /></View></View>;
}
export default function RootLayout() { return <SafeAreaProvider><AppProvider><MobileViewport /></AppProvider></SafeAreaProvider>; }
