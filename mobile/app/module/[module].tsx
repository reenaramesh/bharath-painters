import { Stack, useLocalSearchParams } from 'expo-router';
import { ModuleScreen } from '../../src/screens/ModuleScreen';
import { modules } from '../../src/core/navigation';
export default function ModuleRoute() { const { module } = useLocalSearchParams<{ module: string }>(); return <><Stack.Screen options={{ title: modules.find(item => item.id === module)?.label || 'Workspace' }} /><ModuleScreen id={module} /></>; }
