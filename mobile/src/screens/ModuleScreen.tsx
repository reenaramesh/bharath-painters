import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { Searchbar } from 'react-native-paper';
import { canOpenModule, filterRecords, modules, type ModuleId } from '../core/navigation';
import { useApp } from '../providers/AppProvider';
import { demoRecords } from '../data/demo';
import { DemoLabel, Heading, RecordCard, Screen, State, styles } from '../components/ui';
import { tokens } from '../theme';
import { SettingsScreen } from './SettingsScreen';
export function ModuleScreen({ id }: { id: string }) {
  const { user, demo, menuReady, disabledMenus, menuError, loadMenus } = useApp();
  const [query, setQuery] = useState('');
  const entry = modules.find(item => item.id === id);
  const rows = useMemo(() => filterRecords(entry && demo ? demoRecords[entry.id] : [], query), [entry, demo, query]);
  if (!entry) return <Screen><State title="Screen not found" description="Return to your workspace to choose a tool." /></Screen>;
  if (id === 'settings' && user?.role === 'CONTRACTOR') return <SettingsScreen />;
  if (!menuReady) return <Screen><State title="Checking available tools" description={menuError || 'Loading your workspace permissions…'} action={menuError ? 'Retry' : undefined} onAction={() => void loadMenus()} /></Screen>;
  if (!user || !canOpenModule(user, id, disabledMenus)) return <Screen><State title="Access unavailable" description="This feature is disabled or requires a verified contractor account." /></Screen>;
  if (!demo) return <Screen><Heading title={entry.label} subtitle={entry.description} /><State title="Mobile integration coming next" description="Your Contractor home is connected. This workflow will be integrated in the next phase; continue using the existing web application for now." /></Screen>;
  return <Screen scroll={false}><FlatList key={id} data={rows} keyExtractor={item => item.id} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content} initialNumToRender={10} windowSize={7} ListHeaderComponent={<View style={{ gap: tokens.space.lg }}><DemoLabel /><Heading title={entry.label} subtitle={entry.description} /><Searchbar placeholder={`Search ${entry.label.toLowerCase()}`} accessibilityLabel={`Search ${entry.label.toLowerCase()}`} value={query} onChangeText={setQuery} style={{ marginBottom: tokens.space.sm }} /></View>} renderItem={({ item }) => <RecordCard item={item} module={id as ModuleId} />} ItemSeparatorComponent={() => <View style={{ height: tokens.space.md }} />} ListEmptyComponent={<State title="No matching records" description="Try another name, location or status." action={query ? 'Clear search' : undefined} onAction={() => setQuery('')} />} /></Screen>;
}
