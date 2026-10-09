import { Tabs } from 'expo-router';
import { Icon, useTheme } from 'react-native-paper';
import { useApp } from '../../src/providers/AppProvider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View } from 'react-native';
import { tokens } from '../../src/theme';
export default function ContractorTabs() {
  const theme = useTheme(); const { menuReady, disabledMenus } = useApp(); const insets = useSafeAreaInsets();
  return <Tabs backBehavior="initialRoute" screenOptions={{ headerShown: false, tabBarActiveTintColor: theme.colors.primary, tabBarInactiveTintColor: theme.colors.onSurfaceVariant, tabBarStyle: { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.outlineVariant, height: 64 + insets.bottom, paddingTop: 8, paddingBottom: insets.bottom }, tabBarItemStyle: { minHeight: 48, paddingHorizontal: 0 }, tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginHorizontal: 0 }, tabBarHideOnKeyboard: true }}>
    {([{ name: 'index', title: 'Home', icon: 'view-dashboard-outline' }, { name: 'customers', title: 'Customers', icon: 'account-group-outline' }, { name: 'work', title: 'Work', icon: 'briefcase-outline' }, { name: 'messages', title: 'Messages', icon: 'message-text-outline' }, { name: 'more', title: 'More', icon: 'dots-grid' }] as const).map(tab => <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.title, href: (tab.name === 'customers' || tab.name === 'messages') && (!menuReady || disabledMenus.includes(tab.name)) ? null : undefined, tabBarIcon: ({ color, focused }) => <View style={{ width: 48, height: 28, borderRadius: tokens.radius, alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? theme.colors.primaryContainer : 'transparent' }}><Icon source={focused ? tab.icon.replace('-outline', '') : tab.icon} color={color} size={22} /></View> }} />)}
  </Tabs>;
}
