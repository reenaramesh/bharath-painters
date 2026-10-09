import { View, StyleSheet } from 'react-native';
import { Card, Icon, Text, useTheme } from 'react-native-paper';
import { router } from 'expo-router';
import { modules, canOpenModule, type ModuleId } from '../core/navigation';
import { useApp } from '../providers/AppProvider';
import { State, styles } from './ui';
import { tokens } from '../theme';
export function ModuleGrid({ ids }: { ids?: ModuleId[] }) {
  const { user, menuReady, disabledMenus, menuError, loadMenus } = useApp(); const theme = useTheme();
  if (!menuReady) return <State title="Your available tools" description={menuError || 'Loading your workspace permissions…'} action={menuError ? 'Retry' : undefined} onAction={() => void loadMenus()} />;
  const entries = modules.filter(item => (!ids || ids.includes(item.id)) && user && canOpenModule(user, item.id, disabledMenus));
  return <View style={local.grid}>{entries.map(item => <Card key={item.id} mode="outlined" style={[local.tile, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]} onPress={() => router.push({ pathname: '/module/[module]', params: { module: item.id } })} accessibilityRole="button" accessibilityLabel={item.label}>
    <Card.Content style={local.tileBody}><View style={[local.icon, { backgroundColor: theme.colors.primaryContainer }]}><Icon source={item.icon} size={24} color={theme.colors.onPrimaryContainer} /></View><Text variant="titleSmall" style={styles.bold}>{item.label}</Text><Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{item.description}</Text></Card.Content>
  </Card>)}</View>;
}
const local = StyleSheet.create({ grid: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space.md }, tile: { width: '48%', flexGrow: 1, flexBasis: '45%', borderRadius: tokens.radius }, tileBody: { gap: tokens.space.sm, paddingVertical: tokens.space.lg }, icon: { width: 48, height: 48, borderRadius: tokens.radius, alignItems: 'center', justifyContent: 'center' } });
