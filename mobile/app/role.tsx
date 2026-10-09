import { Button } from 'react-native-paper';
import { Heading, Screen, State, styles } from '../src/components/ui';
import { useApp } from '../src/providers/AppProvider';
export default function RoleScreen() {
  const { user, logout } = useApp();
  const label = user?.role === 'PAINTER' ? 'Employee / professional' : user?.role === 'SUPPORT' ? 'Support' : user?.role === 'ADMIN' ? 'Admin' : 'Customer';
  return <Screen><Heading title={`${label} workspace`} /><State title="Your account is connected" description="This first mobile release includes the Contractor dashboard. Your dedicated workspace is planned in the next release. You can continue using the existing web application." /><Button mode="outlined" onPress={() => void logout()} contentStyle={styles.control}>Sign out</Button></Screen>;
}
