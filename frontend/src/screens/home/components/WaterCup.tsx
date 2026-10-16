/**
 * 홈 물 게이지 — [운동][식단] 옆의 세로 알약. 안의 파란 물이 2L 고정 눈금으로 출렁이며 차오른다
 * (docs/HOME_WATER_TAP_ANALYSIS_2026-10-16.md §15).
 *
 * <p><b>왜 알약인가</b>(2026-10-16 사용자 결정): 첫 판(원 안 사다리꼴 컵 + 테두리)은 "안 이쁘다·테두리 때문에 더 별로"였다.
 * 시안 다섯(물방울 얼굴·동그라미 물결·유리잔·물병·알약) 중 알약을 골랐다. 테두리 없이 연한 하늘 몸통 + 파란 물이다.
 * 물 색은 <b>파랑</b>이다 — 처음엔 "하늘 = 상대" 색 규칙과 헷갈릴까 봐 소유자 색으로 칠했지만 사용자가 파랑을 택했다
 * (물은 물색이 맞다는 판단). 그래서 두 열이 같은 파랑이고, 누구 것인지는 열 위치가 말한다.
 *
 * <p><b>그리는 법</b> — 새 의존성·새 아이콘 글리프 없이(폰트는 빌드 자산이라 OTA 를 막는다):
 * 알약 View 의 {@code borderRadius + overflow: hidden} 이 안쪽을 자른다 — 사진 배경 위라 색 가리개를 쓸 수 없고,
 * 둥근 사각형은 RN 이 두 플랫폼 모두 실제로 잘라 준다. 물은 {@code translateY} 로 오르고(스프링이 "찍"),
 * 수면은 react-native-svg 의 물결 띠를 {@code translateX} 로 흘린다. 둘 다 transform 이라 네이티브 드라이버로 돈다.
 *
 * <p>2L 를 넘어도 비우지 않는다 — 비는 모습이 "기록이 사라졌다"로 보인다(§11-5). 넘친 양은 토스트·스크린리더 숫자로만.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { themedStyles } from '../../../theme/themedStyles';
import { layout } from '../../../theme/layout';
import { formatNumber } from '../../../utils/format';
import { useReduceMotion } from '../../../hooks/useOneShotMotion';
import { WATER_CUP_ML, WATER_STEP_ML } from '../../../store/waterStore';

/** 알약 — 옆 원 버튼(36) 높이에 맞춘 세로 캡슐 */
const PILL_W = 16;
const PILL_H = 34;
/** 물결 한 주기 = 알약 폭. 띠는 두 주기라 한 주기만큼 흘렀다 처음으로 돌아가도 이음매가 안 보인다 */
const WAVE_H = 4;
/** 물(파랑)과 빈 몸통(연한 하늘) — 라이트·다크 모두 같은 값이다. 몸통은 반투명이라 어느 바탕에서도 유리처럼 보인다 */
const WATER = '#378ADD';
const BODY = 'rgba(133,183,235,0.28)';

/** 물결 띠 경로 — 폭 2·PILL_W, 마루 둘 */
const WAVE_PATH = (() => {
  const w = PILL_W;
  const q = w / 4;
  return `M0 ${WAVE_H / 2} Q${q} 0 ${2 * q} ${WAVE_H / 2} T${w} ${WAVE_H / 2} T${w + 2 * q} ${WAVE_H / 2} T${2 * w} ${WAVE_H / 2} V${WAVE_H} H0 Z`;
})();

function levelOf(ml: number): number {
  return Math.max(0, Math.min(1, ml / WATER_CUP_ML));
}
/** 물 덩어리의 translateY — 0 이면 알약 아래로 완전히 숨고(물결 마루까지), 가득이면 0 */
function offsetOf(ml: number): number {
  const level = levelOf(ml);
  return level === 0 ? PILL_H + WAVE_H : PILL_H * (1 - level);
}

export function WaterCup({
  ml,
  name,
  mine,
  onTap,
  onPressPartner,
}: {
  /** 오늘 마신 양 */
  ml: number;
  name: string;
  /** 내 것만 누를 수 있다 — 상대 것은 보기 전용(누르면 양만 알려 준다) */
  mine: boolean;
  /** 내 것: +250(탭) / −250(길게 누르기). 0 아래로 못 가면 false */
  onTap?: (delta: number) => boolean;
  /** 상대 것을 눌렀을 때 */
  onPressPartner?: () => void;
}) {
  const reduced = useReduceMotion();
  const [rise] = useState(() => new Animated.Value(offsetOf(ml)));
  const [flow] = useState(() => new Animated.Value(0));
  const [pop] = useState(() => new Animated.Value(1));
  const [float] = useState(() => new Animated.Value(1));
  const [floatText, setFloatText] = useState<string | null>(null);
  const prevMl = useRef(ml);

  // 수면이 늘 천천히 흐른다 — 물이 담겨 있을 때만, 동작 줄이기면 멈춘 물결
  const hasWater = ml > 0;
  useEffect(() => {
    if (reduced || !hasWater) {
      flow.stopAnimation();
      flow.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(flow, { toValue: 1, duration: 2400, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, hasWater, flow]);

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
    Animated.spring(rise, { toValue: to, friction: 5, tension: 120, useNativeDriver: true }).start();
    // 늘 때 알약이 한 번 톡 — 2L 를 막 넘긴 순간은 조금 더 크게
    if (ml > from) {
      const crossed = from < WATER_CUP_ML && ml >= WATER_CUP_ML;
      pop.stopAnimation();
      pop.setValue(1);
      Animated.sequence([
        Animated.timing(pop, { toValue: crossed ? 1.25 : 1.1, duration: 110, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.spring(pop, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }),
      ]).start();
    }
  }, [ml, reduced, rise, pop]);

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
      hitSlop={{ left: 4, right: 4 }}
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
      <Animated.View style={[styles.pill, { transform: [{ scale: pop }] }]}>
        <Animated.View style={[styles.water, { transform: [{ translateY: rise }] }]}>
          <Animated.View
            style={[
              styles.wave,
              { transform: [{ translateX: flow.interpolate({ inputRange: [0, 1], outputRange: [0, -PILL_W] }) }] },
            ]}
          >
            <Svg width={PILL_W * 2} height={WAVE_H}>
              <Path d={WAVE_PATH} fill={WATER} />
            </Svg>
          </Animated.View>
        </Animated.View>
      </Animated.View>
      {floatText ? (
        <Animated.Text
          style={[
            styles.float,
            {
              opacity: float.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 1, 1, 0] }),
              transform: [{ translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, -14] }) }],
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

const styles = themedStyles(() => ({
  // 옆 원 버튼 칸(44)보다 좁다 — 알약이 가늘어 넓은 칸은 빈 자리만 만든다. 높이는 터치 타깃 그대로
  slot: {
    width: 32,
    height: layout.touchTarget,
    flexShrink: 1,
    minWidth: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  pill: {
    width: PILL_W,
    height: PILL_H,
    borderRadius: PILL_W / 2,
    overflow: 'hidden',
    backgroundColor: BODY,
  },
  // 물 덩어리 — 알약 높이만큼의 파란 면, 맨 위에 물결 띠
  water: { position: 'absolute', left: 0, right: 0, top: WAVE_H, height: PILL_H + WAVE_H, backgroundColor: WATER },
  wave: { position: 'absolute', left: 0, top: -WAVE_H, width: PILL_W * 2, height: WAVE_H },
  float: {
    position: 'absolute',
    top: -8,
    color: WATER,
    fontSize: 11,
    fontWeight: '800',
  },
}));

