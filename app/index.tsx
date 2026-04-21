import { Redirect } from 'expo-router';
import { useAuth } from '../src/store/auth';

export default function Index() {
  const { isAuthenticated, activeGroup } = useAuth();

  if (isAuthenticated && !activeGroup) {
    return <Redirect href="/onboarding" />;
  }

  if (isAuthenticated) {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/auth/login" />;
}
