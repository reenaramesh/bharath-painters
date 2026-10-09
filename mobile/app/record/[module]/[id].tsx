import { Stack, useLocalSearchParams, router } from 'expo-router';
import { Button, Card, Text, useTheme } from 'react-native-paper';
import { DemoLabel, Heading, Screen, State, styles } from '../../../src/components/ui';
import { useApp } from '../../../src/providers/AppProvider';
import { demoRecords } from '../../../src/data/demo';
import { canOpenModule, formatINR, modules } from '../../../src/core/navigation';
import { tokens } from '../../../src/theme';
export default function RecordDetail() {
  const { module, id } = useLocalSearchParams<{ module: string; id: string }>();
  const { user, demo, menuReady, disabledMenus } = useApp(); const theme = useTheme();
  const entry = modules.find(item => item.id === module);
  const record = entry && demo ? demoRecords[entry.id].find(item => item.id === id) : undefined;
  if (!entry || !user || !menuReady || !canOpenModule(user, module, disabledMenus)) return <Screen><State title="Access unavailable" description="Return to your workspace to choose an available tool." /></Screen>;
  if (!demo) return <Screen><State title="Record details coming next" description="This record is visible in your live dashboard. Its native detail workflow will be integrated in the next phase." /></Screen>;
  if (!record) return <Screen><State title="Record not found" description="Return to the list to choose another record." /></Screen>;
  return <Screen><Stack.Screen options={{ title: entry.label }} /><DemoLabel /><Heading title={record.title} subtitle={record.subtitle} /><Card mode="contained" style={styles.card}><Card.Content style={{ gap: tokens.space.lg }}><Text variant="labelLarge" style={{ color: theme.colors.primary }}>{record.status.replaceAll('_', ' ')}</Text>{record.amount && <Text variant="headlineMedium" style={styles.bold}>{formatINR(record.amount)}</Text>}<Text variant="bodyMedium">{record.note || 'This sample record demonstrates the native detail flow.'}</Text></Card.Content></Card>{module === 'properties' && <Button mode="contained" icon="ruler-square" contentStyle={styles.control} onPress={() => router.push({ pathname: '/module/[module]', params: { module: 'measurements' } })}>View measurements</Button>}<State title="Navigation prototype" description="Record editing, calculations, sharing and financial actions will be connected incrementally to the existing workflows." /></Screen>;
}
