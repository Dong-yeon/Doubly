/** 스플래시 — Doubly 로고 + 슬로건 '둘이라서, 두 배로' */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { OnboardingStackParamList } from '../../navigation/types';
import { DoublyMark } from '../../components/DoublyLogo';
import { storage } from '../../utils/storage';
import { STORAGE_KEYS } from '../../constants/config';
import { colors, fontSize, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'Splash'>;

export function SplashScreen({ navigation }: Props) {
  const scale = useRef(new Animated.Value(0.7)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 5, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 400, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ]).start();

    /*
     * 첫 실행이면 인트로, 아니면 로그인으로.
     *
     * 예전에는 setTimeout(1600) 이 <b>하한선</b>이었다. 저장소 읽기는 보통 수십 ms 에
     * 끝나는데도 매 실행마다 1.6초를 기다려야 했고, 그 시간이 앱 진입 체감 속도를
     * 그대로 깎아먹었다. 지금은 <b>읽기가 끝나는 즉시</b> 넘어간다.
     *
     * 다만 0ms 로 넘어가면 로고가 뜨자마자 사라져 깜빡임처럼 보이므로,
     * 등장 애니메이션이 자리잡을 최소 시간(360ms)만 함께 기다린다.
     */
    let cancelled = false;
    const seenPromise = storage.getItem(STORAGE_KEYS.onboardingSeen).catch(() => null);
    const minShow = new Promise((r) => setTimeout(r, 360));

    void Promise.all([seenPromise, minShow]).then(([seen]) => {
      if (!cancelled) navigation.replace(seen ? 'Login' : 'Onboarding');
    });

    return () => {
      cancelled = true;
    };
  }, [navigation, scale, opacity]);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.center, { opacity, transform: [{ scale }] }]}>
        <DoublyMark size={72} />
        <Text style={styles.brand}>Dubly</Text>
        <View style={styles.sloganWrap}>
          <Text style={styles.slogan}>둘이라서, 두 배로</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = themedStyles((colors) => ({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  center: { alignItems: 'center' },
  brand: { fontSize: fontSize.display, fontWeight: '800', color: colors.ink, textAlign: 'center', marginTop: spacing.lg, letterSpacing: -1 },
  sloganWrap: { marginTop: spacing.md, backgroundColor: colors.togetherPastelBg, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  /* togetherPastelBg 는 텍스트와 짝지어 쓸 만큼 밝아 원색 violet 은 대비가 안 나온다 — ink 를 쓴다 */
  slogan: { fontSize: fontSize.body, color: colors.ink, fontWeight: '700' },
}));
