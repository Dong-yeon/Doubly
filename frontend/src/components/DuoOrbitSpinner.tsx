/**
 * "듀오 궤도" 로딩 스피너 — Dubly만의 로딩 표시.
 *
 * <p>금색(나)·초록(상대) 점 두 개가 궤도를 마주 보고 반대 방향으로 돌다가,
 * 궤도 양 끝(오른쪽·왼쪽)에서 만나는 순간 잠깐 함께(together, 올리브)색으로
 * 겹쳐 보이고 다시 갈라진다. 그냥 "혼자 도는 원"이 아니라 "둘이 만난다"는
 * 동작 자체가 로딩의 의미가 되도록 설계했다 — 이 앱의 나/상대/함께 색 체계
 * (theme/colors.ts 의 Duo 시맨틱, 읽음 표시·채팅 하트 등에도 쓰는 관례)를
 * 그대로 재사용해서 새 규칙을 만들지 않는다.
 *
 * <p>RN 기본 Animated API 만 쓴다 — 이 코드베이스의 커스텀 애니메이션 관례
 * (SplashScreen.tsx 참고)와 같다. backgroundColor 보간은 native driver 에
 * 못 태우므로 전체를 useNativeDriver:false 로 돌린다. 오버레이가 떠 있는
 * 동안(보통 네트워크 대기라 JS 스레드가 한가함)만 잠깐 도는 장식용
 * 애니메이션이라 체감 성능에 영향은 없다.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { colors } from '../constants/theme';

const SIZE = 56;
const RADIUS = 18;
const DOT = 12;
const DURATION = 1600;

// 궤도 양 끝(t=0, 0.5, 1 — 오른쪽·왼쪽)에서 만난다. 그 부근만 짧게 together 색.
const MEETING_STOPS = [0, 0.04, 0.46, 0.5, 0.54, 0.96, 1];

export function DuoOrbitSpinner() {
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(t, { toValue: 1, duration: DURATION, easing: Easing.linear, useNativeDriver: false }),
    );
    loop.start();
    return () => loop.stop();
  }, [t]);

  const rotateA = t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const rotateB = t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-360deg'] });
  const colorA = t.interpolate({
    inputRange: MEETING_STOPS,
    outputRange: [colors.together, colors.me, colors.me, colors.together, colors.me, colors.me, colors.together],
  });
  const colorB = t.interpolate({
    inputRange: MEETING_STOPS,
    outputRange: [
      colors.together,
      colors.partner,
      colors.partner,
      colors.together,
      colors.partner,
      colors.partner,
      colors.together,
    ],
  });

  return (
    <View style={styles.box}>
      <Animated.View style={[styles.pivot, { transform: [{ rotate: rotateA }] }]}>
        <Animated.View style={[styles.dot, { backgroundColor: colorA }]} />
      </Animated.View>
      <Animated.View style={[styles.pivot, { transform: [{ rotate: rotateB }] }]}>
        <Animated.View style={[styles.dot, { backgroundColor: colorB }]} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  // 회전 중심 — 크기 0인 지점을 박스 한가운데 두고, 점을 여기서 RADIUS 만큼
  // 오른쪽에 얹는다. 이 pivot 을 rotate 시키면 점이 원을 그리며 돈다.
  pivot: { position: 'absolute', width: 0, height: 0 },
  dot: { position: 'absolute', width: DOT, height: DOT, borderRadius: DOT / 2, left: RADIUS, top: -DOT / 2 },
});
