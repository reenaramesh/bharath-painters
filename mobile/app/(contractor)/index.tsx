import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, Icon, IconButton, Text, useTheme } from 'react-native-paper';
import { router, useFocusEffect } from 'expo-router';
import { api, useApp } from '../../src/providers/AppProvider';
import { canOpenModule } from '../../src/core/navigation';
import type { Dashboard } from '../../src/core/contracts';
import { demoDashboard } from '../../src/data/demo';
import { DashboardSkeleton, DemoLabel, Heading, RecordCard, Section, State, styles } from '../../src/components/ui';
import { ModuleGrid } from '../../src/components/ModuleGrid';
import { BusinessBriefing, ContractorShortcuts, DailyFocus } from '../../src/components/ContractorBriefing';
import { tokens } from '../../src/theme';
export default function Home() {
  const { user, demo, disabledMenus, menuReady } = useApp(); const theme = useTheme();
  const [data, setData] = useState<Dashboard | null>(demo ? demoDashboard : null), [busy, setBusy] = useState(!demo), [error, setError] = useState('');
  const alive = useRef(true), inFlight = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const load = useCallback(async () => {
    if (demo) { setData(demoDashboard); setBusy(false); return; }
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      const result = await api.get<Dashboard>('/quotations/contractor-crm/dashboard/');
      if (!result.counts || !Array.isArray(result.recent_customers) || !Array.isArray(result.recent_quotations)) throw new Error('Your workspace could not be loaded. Please retry.');
      if (alive.current) setData(result);
    } catch (error) { if (alive.current) setError(error instanceof Error ? error.message : 'Could not load your workspace.'); }
    finally { inFlight.current = false; if (alive.current) setBusy(false); }
  }, [demo]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const allowed = (id: string) => !!user && menuReady && canOpenModule(user, id, disabledMenus);
  const open = (module: string) => router.push({ pathname: '/module/[module]', params: { module } });
  return <SafeAreaView edges={['top', 'left', 'right']} style={[styles.fill, { backgroundColor: theme.colors.background }]}>
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={busy && !!data} onRefresh={() => void load()} tintColor={theme.colors.primary} />}>
      <View style={styles.row}><View style={[local.brand, { backgroundColor: theme.colors.primaryContainer }]}><Icon source="layers-triple-outline" size={24} color={theme.colors.onPrimaryContainer} /></View><View style={styles.flex}><Text variant="titleMedium" style={styles.bold}>Bharath Apps</Text><Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Contractor workspace</Text></View><IconButton icon="cog-outline" accessibilityLabel="Open settings" onPress={() => open('settings')} size={24} style={{ width: 48, height: 48 }} /></View>
      <DemoLabel />
      <Heading title={`Namaste, ${data?.contractor_name || user?.first_name || 'there'}`} subtitle="Let’s build a good day." />
      {!!error && <State title={data ? 'Could not refresh' : 'Let’s reconnect'} description={error} action="Retry" onAction={() => void load()} />}
      {!data && busy && <DashboardSkeleton />}
      {data && <>
        <BusinessBriefing data={data} />
        <DailyFocus data={data} />
        <Section title="Your shortcuts" action="Quick actions" onAction={() => router.push('/quick-actions')}>
          {menuReady ? <ContractorShortcuts /> : <ModuleGrid ids={['customers', 'properties', 'quotations', 'measurements']} />}
        </Section>
        {allowed('quotations') && <Section title="Recent quotations" action="View all" onAction={() => open('quotations')}>{data.recent_quotations.length ? data.recent_quotations.map(item => <RecordCard key={item.id} module="quotations" item={{ id: String(item.id), title: item.property, subtitle: `${item.customer} · ${item.number}`, status: item.status, amount: String(item.amount) }} />) : <State title="Your first estimate" description="Your quotations will appear here when you create an estimate." />}</Section>}
        {allowed('schedules') && <Section title="Upcoming site visits" action="View all" onAction={() => open('schedules')}>{data.site_visits.length ? data.site_visits.map(item => <Card key={item.id} mode="contained" style={styles.card} onPress={() => open('schedules')} accessibilityRole="button"><Card.Content style={styles.record}><Icon source="calendar-outline" size={24} color={theme.colors.primary} /><View style={styles.flex}><Text variant="titleMedium" style={styles.bold}>{item.customer_name}</Text><Text variant="bodyMedium">{item.property_name || 'Site visit'}</Text><Text variant="labelMedium" style={{ color: theme.colors.primary, marginTop: tokens.space.sm }}>{item.scheduled_date} {item.scheduled_time?.slice(0, 5)}</Text></View></Card.Content></Card>) : <State title="Your calendar is clear" description="Upcoming site visits will appear here." />}</Section>}
        {allowed('customers') && <Section title="Recent customers" action="View all" onAction={() => open('customers')}>{data.recent_customers.length ? data.recent_customers.map(item => <RecordCard key={item.id} module="customers" item={{ id: String(item.id), title: item.name, subtitle: item.city || item.mobile, status: item.status }} />) : <State title="Welcome to your workspace" description="Start with your first customer and property." />}</Section>}
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>Built for better work, every day.</Text>
      </>}
    </ScrollView>
  </SafeAreaView>;
}
const local = StyleSheet.create({ brand: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: tokens.radius } });


