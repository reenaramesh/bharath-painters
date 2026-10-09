import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Icon, Text, useTheme } from 'react-native-paper';
import { router, useSegments } from 'expo-router';
import { tokens } from '../theme';
import { useApp } from '../providers/AppProvider';
import type { ModuleId, RecordItem } from '../core/navigation';
import { formatINR } from '../core/navigation';

export function Screen({ children, scroll = true }: { children: React.ReactNode; scroll?: boolean }) {
  const theme = useTheme();
  const segments = useSegments();
  const inTabs = segments[0] === '(contractor)';
  const standalone = segments[0] === 'login';
  return <SafeAreaView edges={inTabs ? ['top', 'left', 'right'] : standalone ? ['top', 'bottom', 'left', 'right'] : ['bottom', 'left', 'right']} style={[styles.fill, { backgroundColor: theme.colors.background }]}>
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {scroll ? <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>{children}</ScrollView> : children}
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
export function DemoLabel() {
  const { demo } = useApp(); const theme = useTheme();
  return demo ? <View style={styles.demo}><Icon source="flask-outline" size={14} color={theme.colors.onSurfaceVariant} /><Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Demo workspace · Sample data</Text></View> : null;
}
export function Heading({ title, subtitle }: { title: string; subtitle?: string }) {
  const theme = useTheme();
  return <View style={styles.heading}><Text accessibilityRole="header" variant="headlineMedium" style={styles.bold}>{title}</Text>{subtitle && <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>{subtitle}</Text>}</View>;
}
export function Section({ title, children, action, onAction }: { title: string; children: React.ReactNode; action?: string; onAction?: () => void }) {
  return <View style={styles.section}><View style={styles.sectionHead}><Text accessibilityRole="header" variant="titleMedium" style={[styles.bold, styles.flex]}>{title}</Text>{action && <Button onPress={onAction} contentStyle={styles.control}>{action}</Button>}</View>{children}</View>;
}
export function State({ title, description, action, onAction }: { title: string; description: string; action?: string; onAction?: () => void }) {
  const theme = useTheme();
  return <Card mode="outlined" style={styles.card}><Card.Content style={styles.state}><Icon source="information-outline" size={28} color={theme.colors.primary} /><Text variant="titleMedium">{title}</Text><Text accessibilityLiveRegion="polite" variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>{description}</Text>{action && <Button mode="contained" onPress={onAction} contentStyle={styles.control}>{action}</Button>}</Card.Content></Card>;
}
export function RecordCard({ item, module }: { item: RecordItem; module: ModuleId }) {
  const theme = useTheme();
  return <Card mode="outlined" style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]} accessibilityRole="button" accessibilityLabel={`${item.title}, ${item.subtitle}, ${item.status.replaceAll('_', ' ')}`} onPress={() => router.push({ pathname: '/record/[module]/[id]', params: { module, id: item.id } })}>
    <Card.Content style={styles.record}><View style={styles.flex}><Text variant="titleMedium" style={styles.bold}>{item.title}</Text><Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>{item.subtitle}</Text><Text variant="labelMedium" style={{ color: theme.colors.primary, marginTop: tokens.space.sm }}>{item.status.replaceAll('_', ' ')}</Text></View><View style={styles.recordSide}>{item.amount && <Text variant="titleSmall" style={styles.bold}>{formatINR(item.amount)}</Text>}<Icon source="chevron-right" color={theme.colors.onSurfaceVariant} size={20} /></View></Card.Content>
  </Card>;
}
export function DashboardSkeleton() {
  const theme = useTheme();
  return <View accessibilityLabel="Loading your workspace" accessibilityRole="progressbar" style={styles.section}>{[112, 80, 144, 80].map((height, index) => <View key={index} style={{ height, borderRadius: tokens.radius, backgroundColor: theme.colors.surfaceVariant }} />)}</View>;
}
export const styles = StyleSheet.create({
  fill: { flex: 1 }, flex: { flex: 1, minWidth: 0 },
  content: { padding: tokens.space.xl, paddingBottom: tokens.space.xxl, gap: tokens.space.lg },
  heading: { gap: tokens.space.sm, marginTop: tokens.space.sm }, bold: { fontWeight: '700', fontFamily: tokens.type.display },
  demo: { flexDirection: 'row', alignItems: 'center', gap: tokens.space.sm, paddingVertical: tokens.space.xs },
  section: { gap: tokens.space.md, marginTop: tokens.space.sm }, sectionHead: { flexDirection: 'row', alignItems: 'center', gap: tokens.space.sm },
  card: { borderRadius: tokens.radius }, state: { gap: tokens.space.md, paddingVertical: tokens.space.xl },
  control: { minHeight: tokens.control }, record: { flexDirection: 'row', alignItems: 'center', gap: tokens.space.md, paddingVertical: tokens.space.lg },
  recordSide: { alignItems: 'flex-end', gap: tokens.space.sm }, row: { flexDirection: 'row', alignItems: 'center', gap: tokens.space.md },
});
