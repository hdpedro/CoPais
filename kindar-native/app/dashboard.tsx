import { Redirect } from 'expo-router';
import { useAuth } from '../src/store/auth';

export default function DashboardAlias() {
  const { isAuthenticated, activeGroup } = useAuth();

  if (!isAuthenticated) {
    return <Redirect href="/login" />;
  }

  if (!activeGroup) {
    return <Redirect href="/onboarding" />;
  }

  return <Redirect href="/(tabs)" />;
}
