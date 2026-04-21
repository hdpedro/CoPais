import { Stack } from 'expo-router';

export default function CalendarioLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#EEECEA' }, animation: 'slide_from_right' }} />;
}
