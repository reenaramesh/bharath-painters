import { router } from 'expo-router';
import { Button, List } from 'react-native-paper';
import { DemoLabel, Heading, Screen, State, styles } from '../src/components/ui';
import { canOpenModule } from '../src/core/navigation';
import { useApp } from '../src/providers/AppProvider';
export default function QuickActions() {
  const { user, menuReady, disabledMenus } = useApp();
  return <Screen><DemoLabel /><Heading title="Where shall we start?" subtitle="Choose a workspace to continue." />{[{ id: 'customers', label: 'Customers', icon: 'account-plus-outline' }, { id: 'properties', label: 'Properties', icon: 'home-plus-outline' }, { id: 'quotations', label: 'Quotations', icon: 'file-document-outline' }, { id: 'schedules', label: 'Schedules', icon: 'calendar-outline' }].filter(item => menuReady && user && canOpenModule(user, item.id, disabledMenus)).map(item => <List.Item key={item.id} title={item.label} left={props => <List.Icon {...props} icon={item.icon} />} right={props => <List.Icon {...props} icon="chevron-right" />} style={{ minHeight: 64 }} accessibilityRole="button" onPress={() => router.replace({ pathname: '/module/[module]', params: { module: item.id } })} />)}{!menuReady && <State title="Tools are loading" description="Close this sheet and retry workspace permissions on Home." />}<Button contentStyle={styles.control} onPress={() => router.back()}>Close quick actions</Button></Screen>;
}
