import { StyleSheet, View } from 'react-native';
import { Card, Icon, Text, TouchableRipple, useTheme } from 'react-native-paper';
import { router } from 'expo-router';
import type { Dashboard } from '../core/contracts';
import { canOpenModule, formatINR, modules } from '../core/navigation';
import { useApp } from '../providers/AppProvider';
import { tokens } from '../theme';
import { styles } from './ui';

export function BusinessBriefing({ data }: { data: Dashboard }) {
  const { user, menuReady, disabledMenus } = useApp();
  const visible = (id: string) => !!user && menuReady && canOpenModule(user, id, disabledMenus);
  return <View style={local.hero}>
    <View style={local.heroTop}><Text variant="labelMedium" style={local.heroMuted}>BUSINESS SNAPSHOT</Text><View style={local.brandMark}><Icon source="home-city-outline" size={24} color={tokens.brand.peach} /></View></View>
    <Text variant="bodySmall" style={local.heroMuted}>Your quotation value</Text>
    <Text variant="displaySmall" style={[styles.bold, local.heroValue]}>{formatINR(data.counts.quotation_value)}</Text>
    <Text variant="bodySmall" style={local.heroMuted}>{data.counts.quotations} estimates · {data.counts.active_leads} active leads</Text>
    <View style={local.heroRule} />
    <View style={local.metrics}>{[{ id: 'customers', label: 'Customers', value: data.counts.customers, icon: 'account-group-outline' }, { id: 'properties', label: 'Properties', value: data.counts.properties, icon: 'home-city-outline' }].filter(item => visible(item.id)).map(item => <TouchableRipple key={item.id} onPress={() => router.push({ pathname: '/module/[module]', params: { module: item.id } })} accessibilityRole="button" accessibilityLabel={`${item.label}, ${item.value}`} borderless style={local.metric}><View style={local.metricBody}><Icon source={item.icon} size={20} color={tokens.brand.heroMuted} /><View><Text variant="titleLarge" style={[styles.bold, local.heroInk]}>{item.value}</Text><Text variant="labelSmall" style={local.heroMuted}>{item.label}</Text></View><Icon source="arrow-top-right" size={16} color={tokens.brand.heroMuted} /></View></TouchableRipple>)}</View>
  </View>;
}

export function ContractorShortcuts() {
  const { user, disabledMenus, menuReady } = useApp(); const theme = useTheme();
  const entries = modules.filter(item => ['customers', 'properties', 'quotations', 'measurements'].includes(item.id) && user && menuReady && canOpenModule(user, item.id, disabledMenus));
  return <View style={local.shortcuts}>{entries.map(item => <TouchableRipple key={item.id} onPress={() => router.push({ pathname: '/module/[module]', params: { module: item.id } })} accessibilityRole="button" accessibilityLabel={item.label} borderless style={local.shortcut}><View style={local.shortcutBody}><View style={[local.shortcutIcon, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}><Icon source={item.icon} size={24} color={theme.colors.onSurface} /></View><Text variant="labelSmall" style={{ textAlign: 'center', color: theme.colors.onSurface, fontFamily: tokens.type.medium }}>{item.id === 'measurements' ? 'Measure' : item.label}</Text></View></TouchableRipple>)}</View>;
}

export function DailyFocus({ data }: { data: Dashboard }) {
  const { user, disabledMenus, menuReady } = useApp(); const theme = useTheme();
  const hasDue = data.counts.due_tasks > 0;
  const enabled = !!user && menuReady && canOpenModule(user, 'customers', disabledMenus);
  return <Card mode="outlined" style={[styles.card, { borderColor: theme.colors.outlineVariant, backgroundColor: theme.colors.surface }]} onPress={hasDue && enabled ? () => router.push({ pathname: '/module/[module]', params: { module: 'customers' } }) : undefined} accessibilityRole={hasDue && enabled ? 'button' : undefined}>
    <Card.Content style={local.focus}><View style={[local.focusIcon, { backgroundColor: theme.colors.primaryContainer }]}><Icon source={hasDue ? 'clock-alert-outline' : 'check-circle-outline'} size={22} color={theme.colors.onPrimaryContainer} /></View><View style={styles.flex}><Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>TODAY’S FOCUS</Text><Text variant="titleSmall" style={styles.bold}>{hasDue ? `${data.counts.due_tasks} follow-ups due` : 'You’re all caught up'}</Text><Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{hasDue ? enabled ? 'A conversation can move work forward.' : 'Review in your web workspace.' : 'No customer follow-ups need attention.'}</Text></View>{hasDue && enabled && <Icon source="chevron-right" size={20} color={theme.colors.onSurfaceVariant} />}</Card.Content>
  </Card>;
}

const local = StyleSheet.create({
  hero: { backgroundColor: tokens.brand.navy, borderRadius: tokens.radius, padding: tokens.space.lg, gap: tokens.space.xs, overflow: 'hidden' },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: tokens.space.xs },
  brandMark: { backgroundColor: tokens.brand.navySoft, borderRadius: tokens.radius, padding: tokens.space.sm },
  heroInk: { color: tokens.brand.heroInk }, heroMuted: { color: tokens.brand.heroMuted }, heroValue: { color: tokens.brand.heroInk, fontVariant: ['tabular-nums'], marginVertical: tokens.space.xs },
  heroRule: { height: 1, backgroundColor: tokens.brand.line, marginTop: tokens.space.md, marginBottom: tokens.space.sm },
  metrics: { flexDirection: 'row', gap: tokens.space.md }, metric: { flex: 1, borderRadius: tokens.radius, minHeight: tokens.control }, metricBody: { flexDirection: 'row', alignItems: 'center', gap: tokens.space.sm, flexWrap: 'wrap' },
  shortcuts: { flexDirection: 'row', gap: tokens.space.sm }, shortcut: { flex: 1, borderRadius: tokens.radius, minHeight: tokens.control }, shortcutBody: { alignItems: 'center', gap: tokens.space.sm, paddingVertical: tokens.space.sm }, shortcutIcon: { width: 56, height: 56, borderRadius: tokens.radius, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  focus: { flexDirection: 'row', alignItems: 'center', gap: tokens.space.md, paddingVertical: tokens.space.lg }, focusIcon: { width: 48, height: 48, borderRadius: tokens.radius, alignItems: 'center', justifyContent: 'center' },
});
