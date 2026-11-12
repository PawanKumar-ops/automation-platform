import { Redirect, Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '@/auth/auth-context';
import { ActivityIndicator, View } from 'react-native';

export default function RootLayout() {
  return (
    <AuthProvider><StatusBar style="light" /><Routes /></AuthProvider>
  );
}

function Routes() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const privateRoute = segments[0] === 'dashboard' || segments[0] === 'canvas';
  const guestRoute = ['sign-in', 'sign-up', 'forgot-password', 'verify-email', 'reset-password'].includes(segments[0] ?? '');
  if (loading && !user) return <View style={{ alignItems: 'center', backgroundColor: '#000', flex: 1, justifyContent: 'center' }}><ActivityIndicator color="#fff" /></View>;
  if (privateRoute && !user) return <Redirect href="/sign-in" />;
  if (user && guestRoute) return <Redirect href="/dashboard" />;
  return <Stack screenOptions={{ animation: 'fade', contentStyle: { backgroundColor: '#000000' }, headerShown: false }}>
    <Stack.Screen name="index" /><Stack.Screen name="sign-in" /><Stack.Screen name="sign-up" />
    <Stack.Screen name="forgot-password" /><Stack.Screen name="reset-password" /><Stack.Screen name="verify-email" />
    <Stack.Screen name="dashboard" /><Stack.Screen name="canvas" />
  </Stack>;
}
