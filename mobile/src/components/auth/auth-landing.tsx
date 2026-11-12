import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ACCENT = '#FFFFFF';

export function AuthLanding() {
  const insets = useSafeAreaInsets();
  const [opacity] = useState(() => new Animated.Value(0));
  const [rise] = useState(() => new Animated.Value(18));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { duration: 700, toValue: 1, useNativeDriver: true }),
      Animated.spring(rise, { damping: 18, stiffness: 110, toValue: 0, useNativeDriver: true }),
    ]).start();
  }, [opacity, rise]);

  return (
    <View style={styles.safe}>
      <View style={styles.page}>
        <Image contentFit="cover" source={require('@/assets/images/auth-hero.jpg')} style={styles.hero} />
        <View pointerEvents="none" style={styles.topShade} />
        <View pointerEvents="none" style={styles.bottomShade} />

        <Animated.View
          style={[styles.brand, { top: insets.top + 110, opacity, transform: [{ translateY: rise }] }]}>
          <View style={styles.logoRow}>
            <Image contentFit="contain" source={require('@/assets/taskvyn.icon/white.svg')} style={styles.logo} />
            <Text style={styles.wordmark}>Taskvyn</Text>
          </View>
          <Text style={styles.tagline}>Automate anything. Effortlessly.</Text>
        </Animated.View>

        <Animated.View
          style={[styles.actions, { bottom: insets.bottom + 24, opacity, transform: [{ translateY: rise }] }]}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/sign-in')}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
            <Text style={styles.primaryLabel}>Log In</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/sign-up')}
            style={({ pressed }) => [styles.ghostButton, pressed && styles.pressed]}>
            <Text style={styles.ghostLabel}>Create an account</Text>
          </Pressable>
          <View style={styles.legal}>
            <Text style={styles.legalText}>Terms of use</Text>
            <View style={styles.legalDot} />
            <Text style={styles.legalText}>Privacy policy</Text>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: '#000000', flex: 1 },
  page: { alignSelf: 'center', flex: 1, maxWidth: 720, overflow: 'hidden', width: '100%' },
  hero: { height: '58%', left: 0, position: 'absolute', right: 0, top: '34%' },
  topShade: {
    experimental_backgroundImage: 'linear-gradient(180deg, #000000 34%, rgba(0,0,0,0.55) 52%, rgba(0,0,0,0) 70%)',
    height: '100%',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  } as object,
  bottomShade: {
    bottom: 0,
    experimental_backgroundImage: 'linear-gradient(0deg, #000000 22%, rgba(0,0,0,0.7) 45%, rgba(0,0,0,0) 100%)',
    height: '48%',
    left: 0,
    position: 'absolute',
    right: 0,
  } as object,
  brand: { alignItems: 'center', left: 24, position: 'absolute', right: 24 },
  logoRow: { alignItems: 'center', flexDirection: 'row', gap: 9 },
  logo: { height: 36, width: 36 },
  wordmark: { color: '#FFFFFF', fontSize: 36, fontWeight: '800', letterSpacing: -1.4 },
  tagline: { color: 'rgba(255,255,255,0.72)', fontSize: 14, fontWeight: '600', marginTop: 8 },
  actions: { alignItems: 'center', gap: 10, left: 40, position: 'absolute', right: 40 },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: ACCENT,
    borderRadius: 999,
    height: 50,
    justifyContent: 'center',
    maxWidth: 520,
    width: '100%',
  },
  ghostButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 999,
    borderWidth: 1,
    height: 50,
    justifyContent: 'center',
    maxWidth: 520,
    width: '100%',
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },
  primaryLabel: { color: '#1D1D1F', fontSize: 15, fontWeight: '800' },
  ghostLabel: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  legal: { alignItems: 'center', flexDirection: 'row', gap: 10, marginTop: 14 },
  legalText: { color: '#6B6B70', fontSize: 11.5, fontWeight: '600' },
  legalDot: { backgroundColor: '#3E3E42', borderRadius: 2, height: 4, width: 4 },
});
