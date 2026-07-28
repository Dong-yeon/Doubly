/** 스플래시 — Doubly 로고 + 슬로건 '둘이라서, 두 배로' */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { OnboardingStackParamList } from '../../navigation/types';
import { DoublyMark } from '../../components/DoublyLogo';
import { storage } from '../../utils/storage';
import { STORAGE_KEYS } from '../../constants/config';
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

    // 첫 실행이면 인트로, 아니면 로그인으로. 플래그 읽기는 애니메이션 시간 안에 끝난다.
    let cancelled = false;
    const seenPromise = storage.getItem(STORAGE_KEYS.onboardingSeen).catch(() => null);
    const t = setTimeout(async () => {
      const seen = await seenPromise;
      if (!cancelled) {
        navigation.replace(seen ? 'Login' : 'Onboarding');
      }
    }, 1600);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [navigation, scale, opacity]);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.center, { opacity, transform: [{ scale }] }]}>
        <DoublyMark size={72} />
        <Text style={styles.brand}>Doubly</Text>
        <View style={styles.sloganWrap}>
          <Text style={styles.slogan}>둘이라서, 두 배로</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  center: { alignItems: 'center' },
  brand: { fontSize: fontSize.display, fontWeight: '800', color: colors.ink, textAlign: 'center', marginTop: spacing.lg, letterSpacing: -1 },
  sloganWrap: { marginTop: spacing.md, backgroundColor: colors.togetherBg, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  slogan: { fontSize: fontSize.body, color: colors.violet, fontWeight: '700' },
});
