import { View, StyleSheet } from 'react-native';
import { Icon, IconButton, ProgressBar, Text, useTheme } from 'react-native-paper';
import { router } from 'expo-router';
import { MetricCard, ActionCard } from './DashboardCard';
import { useApp } from '../providers/AppProvider';
import { canOpenModule } from '../core/navigation';
import type { Dashboard } from '../core/contracts';
import type { BusinessProfile } from '../core/workspace';
import { colors } from '../theme/tokens';
import { tokens } from '../theme';
import { styles } from './ui';

const actions = [
  ['customers', 'Customers', 'people-outline'], ['properties', 'Properties', 'home-outline'],
  ['leads', 'Leads', 'trending-up-outline'], ['quotations', 'Quotations', 'document-text-outline'],
  ['measurements', 'Measurements', 'resize-outline'], ['projects', 'Projects', 'briefcase-outline'],
  ['schedules', 'Schedules', 'calendar-outline'], ['payments', 'Payments', 'wallet-outline'],
  ['messages', 'Messages', 'chatbubble-outline'], ['settings', 'Settings', 'settings-outline'],
] as const;
const open = (module: string) => router.push({ pathname: '/module/[module]', params: { module } });

export function PremiumHeader({ name, profile }: { name: string; profile: BusinessProfile | null }) {
  const theme = useTheme();
  return <View style={[local.header, { backgroundColor: theme.dark ? tokens.brand.navy : colors.primary }]}>
    <View style={styles.row}><View style={local.logo}><Icon source="home-city-outline" color={colors.primary} size={24} /></View><View style={styles.flex}><Text variant="titleMedium" style={[styles.bold, local.white]}>Bharath Apps</Text><Text variant="bodySmall" style={local.muted}>Contractor workspace</Text></View><IconButton icon="cog-outline" iconColor="white" accessibilityLabel="Open settings" onPress={() => open('settings')} style={{ width: 48, height: 48 }} /></View>
    <Text variant="headlineSmall" style={[styles.bold, local.white, { marginTop: 16 }]}>{`Namaste, ${name}`}</Text>
    {!!profile?.company_name && profile.company_name !== name && <Text variant="titleMedium" style={local.white}>{profile.company_name}</Text>}
    <Text variant="bodySmall" style={local.muted}>Everything your business needs, in one place.</Text>
  </View>;
}

export function PremiumMetrics({ data }: { data: Dashboard }) {
  const { user, menuReady, disabledMenus } = useApp();
  const entries = [
    { id: 'customers', label: 'Customers', value: data.counts.customers, icon: 'people-outline' as const },
    { id: 'quotations', label: 'Quotations', value: data.counts.quotations, icon: 'document-text-outline' as const },
    { id: 'leads', label: 'Active leads', value: data.counts.active_leads, icon: 'trending-up-outline' as const },
    { id: 'customers', label: 'Follow-ups due', value: data.counts.due_tasks, icon: 'time-outline' as const },
  ].filter(item => !!user && menuReady && canOpenModule(user, item.id, disabledMenus));
  return <View style={local.grid}>{entries.map(item => <View key={item.label} style={local.half}><MetricCard label={item.label} value={String(item.value)} icon={item.icon} tint={colors.softBlue} ink={colors.primary} onPress={() => open(item.id)} /></View>)}</View>;
}

export function PremiumActions() {
  const { user, menuReady, disabledMenus } = useApp();
  return <View style={local.grid}>{actions.filter(([id]) => id === 'settings' || (!!user && menuReady && canOpenModule(user, id, disabledMenus))).map(([id, title, icon]) => <View key={id} style={local.third}><ActionCard title={title} icon={icon} tint={colors.softBlue} ink={colors.primary} onPress={() => open(id)} /></View>)}</View>;
}

export function BusinessProfileSummary({ data, profile, error }: { data: Dashboard; profile: BusinessProfile | null; error: string | null }) {
  const theme = useTheme();
  return <View style={[local.profile, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}>
    <Text variant="titleMedium" style={styles.bold}>Business profile</Text>
    {!!profile?.owner_name && <Text variant="bodyMedium">{profile.owner_name}</Text>}
    {!!profile?.office_address && <Text variant="bodySmall">{profile.office_address}</Text>}
    {!!profile?.service_areas && <Text variant="bodySmall">Service areas: {profile.service_areas}</Text>}
    {!!error && <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{error}</Text>}
    <Text variant="bodySmall">{data.profile_completion.percent}% complete</Text>
    <ProgressBar progress={Math.max(0, Math.min(100, data.profile_completion.percent)) / 100} color={theme.colors.primary} />
    {!!data.profile_completion.missing.length && <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>To complete: {data.profile_completion.missing.join(', ')}</Text>}
  </View>;
}
const local = StyleSheet.create({
  header: { borderRadius: tokens.radius, padding: 16, gap: 8 }, logo: { width: 48, height: 48, borderRadius: 16, backgroundColor: 'white', justifyContent: 'center', alignItems: 'center' }, white: { color: 'white' }, muted: { color: '#EAF1FF' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, half: { width: '47%', flexGrow: 1 }, third: { width: '30%', flexGrow: 1, maxWidth: '34%' },
  profile: { padding: 16, borderWidth: 1, borderRadius: tokens.radius, gap: 8 },
});
