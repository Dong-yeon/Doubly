/** 스플래시 — 설계서 2.1 (로고 + 슬로건 '함께라서 더 건강해') */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { OnboardingStackParamList } from '../../navigation/types';
import { colors, fontSize, spacing } from '../../constants/theme';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'Splash'>;

export function SplashScreen({ navigation }: Props) {
  const scale = useRef(new Animated.Value(0.7)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 5, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 400, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ]).start();
    const t = setTimeout(() => navigation.replace('Login'), 1600);
    return () => clearTimeout(t);
  }, [navigation, scale, opacity]);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.center, { opacity, transform: [{ scale }] }]}>
        <Text style={styles.logo}>👩‍❤️‍👨</Text>
        <Text style={styles.brand}>Fitto</Text>
        <View style={styles.sloganWrap}>
          <Text style={styles.slogan}>함께라서 더 건강해</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  center: { alignItems: 'center' },
  logo: { fontSize: 72, textAlign: 'center' },
  brand: { fontSize: fontSize.display, fontWeight: '800', color: colors.white, textAlign: 'center', marginTop: spacing.sm, letterSpacing: -0.5 },
  sloganWrap: { marginTop: spacing.md, backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  slogan: { fontSize: fontSize.body, color: colors.white, fontWeight: '700' },
});
