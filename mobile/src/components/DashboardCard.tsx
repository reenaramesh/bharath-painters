import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../theme/tokens';
import { useTheme } from 'react-native-paper';
import { tokens } from '../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
export function MetricCard({ label, value, icon, tint, ink, onPress }: {
  label: string; value: string; icon: IconName; tint: string; ink: string; onPress?: () => void;
}) {
  const theme = useTheme();
  return <Pressable accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={`${label}: ${value}`} onPress={onPress} style={({ pressed }) => [styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }, pressed && { opacity: .75 }]}>
    <View style={[styles.icon, { backgroundColor: theme.dark ? theme.colors.primaryContainer : tint }]}><Ionicons name={icon} color={theme.dark ? theme.colors.onPrimaryContainer : ink} size={22} /></View>
    <Text style={[styles.value, { color: theme.colors.onSurface }]}>{value}</Text><Text style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>{label}</Text>
  </Pressable>;
}
export function ActionCard({ title, icon, tint, ink, onPress }: {
  title: string; icon: IconName; tint: string; ink: string; onPress: () => void;
}) {
  const theme = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => [styles.action, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }, pressed && { opacity: .75 }]}>
    <View style={[styles.actionIcon, { backgroundColor: theme.dark ? theme.colors.primaryContainer : tint }]}><Ionicons name={icon} color={theme.dark ? theme.colors.onPrimaryContainer : ink} size={24} /></View>
    <Text style={[styles.actionText, { color: theme.colors.onSurface }]} numberOfLines={2}>{title}</Text>
  </Pressable>;
}
const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderColor: colors.border, borderWidth: 1, borderRadius: radius.card, padding: 16, minHeight: 128, flexGrow: 1 },
  icon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  value: { marginTop: 8, fontSize: 24, fontFamily: tokens.type.display, color: colors.text },
  label: { marginTop: 4, fontSize: 12, fontFamily: tokens.type.body, color: colors.muted },
  action: { alignItems: 'center', justifyContent: 'center', paddingVertical: 8, minHeight: 96, backgroundColor: colors.white, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border },
  actionIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  actionText: { marginTop: 8, fontSize: 11, color: colors.text, fontFamily: tokens.type.medium, textAlign: 'center' },
});
