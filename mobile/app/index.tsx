import { Redirect } from 'expo-router';
import { useApp } from '../src/providers/AppProvider';
import { roleDestination } from '../src/core/navigation';
export default function Index() { const { user } = useApp(); return <Redirect href={user ? roleDestination(user.role) : '/login'} />; }
