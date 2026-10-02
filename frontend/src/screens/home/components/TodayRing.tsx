/**
 * 아바타 둘레 "오늘 챙김" 링 — 아침·점심·저녁·운동 네 조각, 숫자 없음(LOVEBODY_REVIEW_2026-10-02 §2-2).
 *
 * <p><b>왜 달성률이 아니라 조각인가</b>: 상대 열에도 같은 링이 있다. 단백질·칼로리 달성률을 담으면 상대의
 * 개인 목표가 내 홈에 그대로 보이고, 목표가 없는 대부분의 사용자에겐 늘 빈 링이 된다. "챙겼다"는 사실은
 * 목표가 필요 없고 둘에게 똑같이 보여도 괜찮다.
 *
 * <p><b>조각 배치</b>: 12·3·6·9시를 <b>중심</b>으로(위 아침 · 오른쪽 점심 · 아래 저녁 · 왼쪽 운동), 틈은 대각선.
 * 무드 배지가 오른쪽 아래(4시 반)에 붙는데 그 자리가 틈이라 어떤 조각도 가리지 않는다.
 *
 * <p><b>색맹·흑백</b>: 소유자는 열 위치(왼쪽 나·오른쪽 상대)가 말한다. 채움/빈 칸은 색이 아니라 <b>굵기</b>로도
 * 갈린다 — 채운 조각은 굵은 진한 소유자 색, 빈 조각은 가는 textMuted 선. 그리는 방식은 NutritionRing 과 같은
 * dash 호(strokeDasharray + 회전)다.
 */
import React from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '../../../constants/theme';

export interface TodaySlices {
  breakfast: boolean;
  lunch: boolean;
  dinner: boolean;
  workout: boolean;
}

/** 위 → 오른쪽 → 아래 → 왼쪽(시계 방향) */
const ORDER: (keyof TodaySlices)[] = ['breakfast', 'lunch', 'dinner', 'workout'];
const LABEL: Record<keyof TodaySlices, string> = { breakfast: '아침', lunch: '점심', dinner: '저녁', workout: '운동' };

/** 조각 사이 틈(도) — 배지가 앉을 자리가 보일 만큼 */
const GAP_DEG = 16;
const STROKE_ON = 4;
const STROKE_OFF = 1.5;

/** 스크린리더 문장 — "오늘 아침·점심 기록, 운동 안 함"(간식은 조각이 없어 따로 한 마디) */
export function todayRingLabel(s: TodaySlices, snack: boolean): string {
  const meals = (['breakfast', 'lunch', 'dinner'] as const).filter((k) => s[k]).map((k) => LABEL[k]);
  const mealText = meals.length > 0 ? `오늘 ${meals.join('·')} 기록` : '오늘 끼니 기록 없음';
  return `${mealText}${snack ? ', 간식 기록' : ''}, ${s.workout ? '운동함' : '운동 안 함'}`;
}

export function TodayRing({
  slices,
  color,
  size,
  children,
}: {
  slices: TodaySlices;
  /** 채운 조각 색 — 소유자의 진한 값(me / partner). 연한 fill 은 배경 대비가 모자라다 */
  color: string;
  /** 바깥 지름 */
  size: number;
  /** 가운데(아바타) */
  children: React.ReactNode;
}) {
  const r = (size - STROKE_ON) / 2;
  const c = 2 * Math.PI * r;
  const seg = (c * (90 - GAP_DEG)) / 360;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }} pointerEvents="none">
        {ORDER.map((key, i) => {
          const on = slices[key];
          // 12시 기준 시계 방향 시작각 — 조각 중심이 0·90·180·270도가 되게 반 칸 당긴다. SVG 0도는 3시라 −90
          const start = i * 90 - 45 + GAP_DEG / 2 - 90;
          return (
            <Circle
              key={key}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={on ? color : colors.textMuted}
              strokeWidth={on ? STROKE_ON : STROKE_OFF}
              strokeDasharray={`${seg} ${c - seg}`}
              strokeLinecap="round"
              rotation={start}
              origin={`${size / 2}, ${size / 2}`}
            />
          );
        })}
      </Svg>
      {children}
    </View>
  );
}
