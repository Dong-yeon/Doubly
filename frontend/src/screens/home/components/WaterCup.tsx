/**
 * 홈 물컵 — [운동][식단] 옆 세 번째 원. 컵 안의 물이 2L 고정 눈금으로 차오른다
 * (docs/HOME_WATER_TAP_ANALYSIS_2026-10-16.md §11).
 *
 * <p><b>그리는 법</b> — 새 의존성·새 아이콘 글리프 없이(폰트는 빌드 자산이라 OTA 를 막는다):
 * <ol>
 *   <li>물: 컵 상자 안에서 {@code translateY} 로 올라오는 소유자 색 면. 레이아웃 속성이 아니라 네이티브 드라이버로 돈다.
 *       "찍"은 스프링의 살짝 넘쳤다 내려앉는 맛이 맡는다.</li>
 *   <li>가리개: 컵 <b>바깥</b>을 원 배경색(surface)으로 칠한 SVG — 위가 넓고 아래가 좁은 컵 모양이 여기서 나온다.
 *       View 의 overflow 는 사각형으로만 자르기 때문이다. 가리개 색을 알아야 하므로 컵은 반드시 원 <b>안</b>에 있다.</li>
 *   <li>테두리: 같은 SVG 의 선.</li>
 * </ol>
 *
 * <p>물 색은 파랑이 아니라 <b>그 열 사람의 색</b>이다 — 이 앱에서 하늘색은 "상대"라서, 내 물을 파랗게 채우면 상대 것으로 읽힌다.
 *
 * <p>2L 를 넘어도 컵을 비우지 않는다 — 비는 모습이 "기록이 사라졌다"로 보인다(§11-5). 넘친 양은 토스트·스크린리더 숫자로만.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../../../constants/theme';
import { themedStyles } from '../../../theme/themedStyles';
import { layout } from '../../../theme/layout';
import { formatNumber } from '../../../utils/format';
import { useReduceMotion } from '../../../hooks/useOneShotMotion';
import { WATER_CUP_ML, WATER_STEP_ML } from '../useHomeWater';

/** 컵 상자 — 원 36 안 */
const CUP_W = 20;
const CUP_H = 26;
/** 가득 찼을 때 수면 — 테두리 바로 아래 */
const FULL_TOP = 3;

/** 컵 바깥(왼쪽·오른쪽 쐐기와 바닥 모서리)을 덮는 가리개 */
const MASK =
  `M0 0 L1.5 0 L4.6 23.6 Q5 25.2 6.6 25.2 L13.4 25.2 Q15 25.2 15.4 23.6 L18.5 0 L${CUP_W} 0 ` +
  `L${CUP_W} ${CUP_H} L0 ${CUP_H} Z`;
/** 컵 테두리 — 위는 열려 있다 */
const OUTLINE = 'M1.6 1 L4.6 23.6 Q5 25.2 6.6 25.2 L13.4 25.2 Q15 25.2 15.4 23.6 L18.4 1';

function levelOf(ml: number): number {
  return Math.max(0, Math.min(1, ml / WATER_CUP_ML));
}
function offsetOf(ml: number): number {
  // 0 이면 상자 아래로 완전히 숨고, 가득이면 FULL_TOP
  return FULL_TOP + (CUP_H - FULL_TOP) * (1 - levelOf(ml));
}

export function WaterCup({
  ml,
  fill,
  name,
  mine,
  onTap,
  onPressPartner,
}: {
  /** 오늘 마신 양 */
  ml: number;
  /** 그 사람의 채움색 — 운동·식단 완료 원과 같은 값 */
  fill: string;
  name: string;
  /** 내 컵만 누를 수 있다 — 상대 컵은 보기 전용(누르면 양만 알려 준다) */
  mine: boolean;
  /** 내 컵: +250(탭) / −250(길게 누르기). 0 아래로 못 가면 false */
  onTap?: (delta: number) => boolean;
  /** 상대 컵을 눌렀을 때 */
  onPressPartner?: () => void;
}) {
  const reduced = useReduceMotion();
  const [rise] = useState(() => new Animated.Value(offsetOf(ml)));
  const [tilt] = useState(() => new Animated.Value(0));
  const [float] = useState(() => new Animated.Value(1));
  const [floatText, setFloatText] = useState<string | null>(null);
  const prevMl = useRef(ml);

  // 값이 바뀌면 그 높이로 — 내 탭이든, 다시 읽어 온 상대 값이든 같은 길로 차오른다
  useEffect(() => {
    const from = prevMl.current;
    prevMl.current = ml;
    if (from === ml) return;
    const to = offsetOf(ml);
    if (reduced) {
      rise.setValue(to);
      return;
    }
    rise.stopAnimation();
    Animated.spring(rise, { toValue: to, friction: 4, tension: 140, useNativeDriver: true }).start();
    // 늘 때만 수면이 한 번 출렁인다 — 줄 때는 조용히
    if (ml > from && levelOf(from) < 1) {
      tilt.stopAnimation();
      tilt.setValue(0);
      Animated.sequence([
        Animated.timing(tilt, { toValue: 1, duration: 90, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(tilt, { toValue: -0.6, duration: 140, useNativeDriver: true }),
        Animated.timing(tilt, { toValue: 0, duration: 160, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]).start();
    }
  }, [ml, reduced, rise, tilt]);

  const popFloat = (delta: number) => {
    if (reduced) return;
    setFloatText(`${delta > 0 ? '+' : '−'}${Math.abs(delta)}`);
    float.stopAnimation();
    float.setValue(0);
    Animated.timing(float, { toValue: 1, duration: 650, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  };

  const tap = (delta: number) => {
    if (!onTap) return;
    if (onTap(delta)) popFloat(delta);
  };

  const amount = `${formatNumber(ml)}ml`;
  const label = mine ? `물 오늘 ${amount}` : `${name}님 물 오늘 ${amount}`;

  return (
    <Pressable
      style={({ pressed }) => [styles.slot, pressed && styles.pressed]}
      onPress={mine ? () => tap(WATER_STEP_ML) : onPressPartner}
      onLongPress={mine ? () => tap(-WATER_STEP_ML) : undefined}
      delayLongPress={400}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={mine ? `누르면 ${WATER_STEP_ML}ml 더해요. 길게 누르면 ${WATER_STEP_ML}ml 빼요` : '보기만 할 수 있어요'}
      accessibilityActions={
        mine
          ? [
              { name: 'increment', label: `${WATER_STEP_ML}ml 더하기` },
              { name: 'decrement', label: `${WATER_STEP_ML}ml 빼기` },
            ]
          : undefined
      }
      onAccessibilityAction={
        mine ? (e) => tap(e.nativeEvent.actionName === 'decrement' ? -WATER_STEP_ML : WATER_STEP_ML) : undefined
      }
    >
      <View style={styles.circle}>
        <View style={styles.cup}>
          <Animated.View
            style={[
              styles.water,
              { backgroundColor: fill },
              {
                transform: [
                  { translateY: rise },
                  { rotate: tilt.interpolate({ inputRange: [-1, 1], outputRange: ['-6deg', '6deg'] }) },
                ],
              },
            ]}
          />
          <Svg width={CUP_W} height={CUP_H} style={styles.svg} pointerEvents="none">
            <Path d={MASK} fill={colors.surface} />
            <Path d={OUTLINE} stroke={colors.textMuted} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" fill="none" />
          </Svg>
        </View>
      </View>
      {floatText ? (
        <Animated.Text
          style={[
            styles.float,
            {
              opacity: float.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 1, 1, 0] }),
              transform: [{ translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, -16] }) }],
            },
          ]}
          pointerEvents="none"
          importantForAccessibility="no"
          accessibilityElementsHidden
        >
          {floatText}
        </Animated.Text>
      ) : null}
    </Pressable>
  );
}

const styles = themedStyles((colors) => ({
  // CoupleHero 의 TodayButton 칸과 같은 크기 — 좁은 폭(320)에서는 원 크기까지 줄어든다
  slot: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    minWidth: 36,
    flexShrink: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  circle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cup: { width: CUP_W, height: CUP_H, overflow: 'hidden' },
  // 컵보다 넓게 — 출렁일 때(회전) 모서리가 드러나지 않게
  water: { position: 'absolute', left: -8, width: CUP_W + 16, top: 0, height: CUP_H + 8 },
  svg: { position: 'absolute', left: 0, top: 0 },
  float: {
    position: 'absolute',
    top: -6,
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
  },
}));
