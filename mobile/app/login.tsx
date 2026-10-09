import { useState } from 'react';
import { View } from 'react-native';
import { Button, Icon, Text, TextInput, useTheme } from 'react-native-paper';
import { useApp } from '../src/providers/AppProvider';
import { Heading, Screen, styles } from '../src/components/ui';
import { tokens } from '../src/theme';
export default function Login() {
  const { login, enterDemo } = useApp(); const theme = useTheme();
  const [identifier, setIdentifier] = useState(''), [password, setPassword] = useState(''), [visible, setVisible] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit() {
    if (busy) return;
    if (!identifier.trim() || !password) { setError('Enter your mobile number or verified email and password.'); return; }
    setError(''); setBusy(true);
    try { await login(identifier, password); } catch (error) { setError(error instanceof Error ? error.message : 'Could not sign in. Please try again.'); } finally { setBusy(false); }
  }
  return <Screen><View style={{ marginTop: tokens.space.lg, gap: tokens.space.xl, backgroundColor: tokens.brand.navy, padding: tokens.space.xl, borderRadius: tokens.radius }}>
    <View style={styles.row}><Icon source="layers-triple-outline" size={28} color={tokens.brand.peach} /><Text variant="titleMedium" style={{ color: tokens.brand.heroInk, fontFamily: tokens.type.display }}>Bharath Apps</Text></View>
    <Text variant="headlineLarge" style={[styles.bold, { color: tokens.brand.heroInk }]}>Good work.{'\n'}Great possibilities.</Text>
    <View style={styles.row}><Icon source="home-city-outline" size={36} color={tokens.brand.peach} /><Text variant="bodySmall" style={{ color: tokens.brand.heroMuted, flex: 1 }}>A little less admin.{'\n'}A lot more building.</Text></View>
  </View>
    <Heading title="Welcome back" subtitle="Your customers, sites and everyday work. Together in one place." />
    <View style={{ gap: tokens.space.lg, marginTop: tokens.space.sm }}>
      <TextInput mode="outlined" label="Mobile number or verified email" accessibilityLabel="Mobile number or verified email" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" autoCorrect={false} autoComplete="username" textContentType="username" returnKeyType="next" />
      <TextInput mode="outlined" label="Password" accessibilityLabel="Password" value={password} onChangeText={setPassword} secureTextEntry={!visible} autoComplete="current-password" textContentType="password" returnKeyType="go" onSubmitEditing={() => void submit()} right={<TextInput.Icon icon={visible ? 'eye-off' : 'eye'} accessibilityLabel={visible ? 'Hide password' : 'Show password'} onPress={() => setVisible(!visible)} />} />
      {!!error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: theme.colors.error }}>{error}</Text>}
      <Button mode="contained" loading={busy} disabled={busy} onPress={() => void submit()} contentStyle={styles.control}>Sign in</Button>
      <Button mode="outlined" disabled={busy} icon="flask-outline" onPress={enterDemo} contentStyle={styles.control}>Explore demo workspace</Button>
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>The demo uses sample records. Sign in with your existing Bharath Apps account to view your dashboard.</Text>
    </View>
  </Screen>;
}
