import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, View } from 'react-native';
import { Button, Searchbar, Text, useTheme } from 'react-native-paper';
import { router } from 'expo-router';
import { canOpenModule, filterRecords, modules, type ModuleId } from '../core/navigation';
import { useApp } from '../providers/AppProvider';
import { DemoLabel, Heading, Screen, State, styles, DashboardSkeleton } from '../components/ui';
import { tokens } from '../theme';
import { SettingsScreen } from './SettingsScreen';
import { useModuleRecords } from '../hooks/useModuleRecords';
import { NativeRecordCard } from '../components/ModuleUI';
import { filterWorkOrders } from '../core/moduleRecords';
import { OfflineQueuePanel } from '../components/OfflineQueuePanel';
import { EmployeeAttendanceScreen } from './EmployeeAttendanceScreen';
import { ScheduleProgressScreen } from './ScheduleProgressScreen';
import { MeasurementsScreen } from './MeasurementsScreen';
import { WageRegisterScreen } from './WageRegisterScreen';

const workOrderFilters = [
  { value: 'ALL', label: 'All' }, { value: 'SENT', label: 'Awaiting response' },
  { value: 'ACTIVE', label: 'In progress' }, { value: 'SUBMITTED_FOR_REVIEW', label: 'Awaiting review' },
  { value: 'COMPLETED', label: 'Completed' },
];

export function ModuleScreen({ id }: { id: string }) {
  const { user, demo, menuReady, disabledMenus, menuError, loadMenus } = useApp();
  const [query, setQuery] = useState('');
  const [workOrderFilter, setWorkOrderFilter] = useState('ALL');
  const entry = modules.find(item => item.id === id);
  const validId = (entry?.id || 'customers') as ModuleId;
  const live = useModuleRecords(validId);
  const theme = useTheme();
  const searchedRows = useMemo(() => filterRecords(live.rows, query), [live.rows, query]);
  const rows = useMemo(() => id === 'subcontracts' ? filterWorkOrders(searchedRows, workOrderFilter) : searchedRows, [id, searchedRows, workOrderFilter]);

  if (!entry) return <Screen><State title="Screen not found" description="Return to your workspace to choose a tool." /></Screen>;
  if (id === 'settings' && user?.role === 'CONTRACTOR') return <SettingsScreen />;
  if (!menuReady) return <Screen><State title="Checking available tools" description={menuError || 'Loading your workspace permissions…'} action={menuError ? 'Retry' : undefined} onAction={() => void loadMenus()} /></Screen>;
  if (!user || !canOpenModule(user, id, disabledMenus)) return <Screen><State title="Access unavailable" description="This feature is disabled or requires a verified contractor account." /></Screen>;
  if (id === 'employees' && user.role === 'CONTRACTOR' && !demo) return <EmployeeAttendanceScreen />;
  if (id === 'schedules' && user.role === 'CONTRACTOR' && !demo) return <ScheduleProgressScreen />;
  if (id === 'measurements' && user.role === 'CONTRACTOR' && !demo) return <MeasurementsScreen />;
  if (id === 'wage-register' && user.role === 'CONTRACTOR' && !demo) return <WageRegisterScreen />;

  if (!demo && live.busy && live.rows.length === 0 && !live.error) return <Screen><DemoLabel /><Heading title={entry.label} subtitle={entry.description} /><DashboardSkeleton /></Screen>;

  return <Screen scroll={false}>
    <FlatList
      key={id}
      data={rows}
      keyExtractor={item => item.id}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.content, { paddingBottom: tokens.space.xxl }]}
      initialNumToRender={12}
      windowSize={7}
      refreshControl={<RefreshControl refreshing={!demo && live.busy && live.rows.length > 0} onRefresh={() => void live.load(false)} tintColor={theme.colors.primary} />}
      ListHeaderComponent={<View style={{ gap: tokens.space.md }}>
        <DemoLabel />
        <Heading title={entry.label} subtitle={entry.description} />
        {!demo && <OfflineQueuePanel actorId={user?.id} />}
        {entry.id === 'customers' && !demo && <Button mode="contained" icon="account-plus-outline" contentStyle={{ minHeight: 48 }} onPress={() => router.push({ pathname: '/record/[module]/[id]', params: { module: 'customers', id: 'new' } })}>Add customer</Button>}
        {entry.id === 'properties' && !demo && <Button mode="contained" icon="home-plus-outline" contentStyle={{ minHeight: 48 }} onPress={() => router.push({ pathname: '/record/[module]/[id]', params: { module: 'properties', id: 'new' } })}>Add property</Button>}
        {entry.id === 'quotations' && !demo && user?.role === 'CONTRACTOR' && <>
          <Button mode="contained" icon="file-document-edit-outline" contentStyle={{ minHeight: 48 }} onPress={() => router.push({ pathname: '/record/[module]/[id]', params: { module: 'quotations', id: 'new' } })}>New manual quotation</Button>
          <Button mode="outlined" icon="ruler-square" contentStyle={{ minHeight: 48 }} onPress={() => router.push({ pathname: '/record/[module]/[id]', params: { module: 'quotations', id: 'measurement-new' } })}>New measurement quotation</Button>
        </>}
        <Searchbar placeholder={`Search ${entry.label.toLowerCase()}`} accessibilityLabel={`Search ${entry.label.toLowerCase()}`} value={query} onChangeText={setQuery} />
        {entry.id === 'subcontracts' && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: tokens.space.xs }} accessibilityLabel="Filter work orders">
          {workOrderFilters.map(filter => <Button key={filter.value} mode={workOrderFilter === filter.value ? 'contained-tonal' : 'outlined'} onPress={() => setWorkOrderFilter(filter.value)} contentStyle={{ minHeight: 48 }} compact>{filter.label}</Button>)}
        </ScrollView>}
        {live.error && <State title={live.rows.length ? 'Showing saved records' : 'Could not load records'} description={live.error} action="Retry" onAction={() => void live.load(false)} />}
        {!demo && live.rows.length > 0 && <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{live.error ? 'Previously loaded information' : 'Synced from Bharath Apps'}</Text>}
      </View>}
      renderItem={({ item }) => <NativeRecordCard item={item} module={entry.id} />}
      ItemSeparatorComponent={() => <View style={{ height: tokens.space.sm }} />}
      ListEmptyComponent={<State title={query ? 'No matching records' : live.error ? 'Try again when connected' : 'Nothing here yet'} description={query ? 'Try another name, location or status.' : live.error ? 'Your account is still available. Retry when the network is back.' : `Records from your ${entry.label.toLowerCase()} workspace will appear here.`} action={query ? 'Clear search' : live.error ? 'Retry' : undefined} onAction={() => query ? setQuery('') : void live.load(false)} />}
      ListFooterComponent={live.next ? <Button mode="outlined" icon="chevron-down" onPress={() => void live.load(true)} loading={live.busy} disabled={live.busy} contentStyle={{ minHeight: 48 }}>Load more</Button> : null}
    />
  </Screen>;
}
