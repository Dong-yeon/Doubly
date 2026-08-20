/**
 * 자극 부위 배지 — 몸 실루엣에서 이 종목이 어느 부위를 쓰는지 색칠해 보여주는 작은 아이콘.
 * 짐핏류 앱의 종목 카드 배지(몸통에 부위를 색칠한 미니 다이어그램)를 참고했지만, 종목별
 * 전용 일러스트(기구/동작 그림)는 전문 일러스트레이터가 수백 종목에 붙인 콘텐츠라 이미지
 * 생성 도구 없이 34개를 그 퀄리티로 따라 그리면 오히려 조잡해진다 — 그래서 부위 배지만
 * 이 컴포넌트로 직접 그린다. 사람은 몸 앞면 실루엣 하나뿐이라 "등"은 뒷면이 안 보이는데,
 * 채움 대신 <b>테두리만</b> 그려서 "이 부위의 반대쪽(등)"이라는 걸 구분한다.
 */
import React from 'react';
import Svg, { Circle, Rect } from 'react-native-svg';
import { colors } from '../constants/theme';

export type MuscleBadgeGroup = '가슴' | '등' | '어깨' | '팔' | '하체' | '코어' | '전신' | string;

const V_W = 60;
const V_H = 100;

// 몸 실루엣 부위 — 좌표는 60x100 뷰박스 기준. 팔/다리는 좌우 대칭이라 쌍으로 그린다.
const HEAD = { cx: 30, cy: 10, r: 7 };
const SHOULDERS: { cx: number; cy: number; r: number }[] = [
  { cx: 15, cy: 25, r: 6 },
  { cx: 45, cy: 25, r: 6 },
];
const CHEST = { x: 18, y: 20, width: 24, height: 16, rx: 6 };
const ARMS: { x: number; y: number; width: number; height: number; rx: number }[] = [
  { x: 6, y: 24, width: 8, height: 30, rx: 4 },
  { x: 46, y: 24, width: 8, height: 30, rx: 4 },
];
const CORE = { x: 20, y: 36, width: 20, height: 16, rx: 4 };
const LEGS: { x: number; y: number; width: number; height: number; rx: number }[] = [
  { x: 18, y: 52, width: 10, height: 40, rx: 5 },
  { x: 32, y: 52, width: 10, height: 40, rx: 5 },
];

/** 종목 muscleGroup 문자열 → 하이라이트할 부위. 매칭 안 되면 전부 비활성(민무늬 실루엣만). */
function regionsFor(group: string): { shoulders?: boolean; chest?: boolean; arms?: boolean; core?: boolean; legs?: boolean; outline?: boolean } {
  switch (group) {
    case '가슴':
      return { chest: true };
    case '등':
      // 앞면 실루엣이라 등은 안 보임 — 가슴·어깨 자리를 테두리만 그려 "반대쪽" 부위임을 표시
      return { chest: true, shoulders: true, outline: true };
    case '어깨':
      return { shoulders: true };
    case '팔':
      return { arms: true };
    case '하체':
      return { legs: true };
    case '코어':
      return { core: true };
    case '전신':
      return { shoulders: true, chest: true, arms: true, core: true, legs: true };
    default:
      return {};
  }
}

export function MuscleBodyBadge({ muscleGroup, size = 24 }: { muscleGroup: string; size?: number }) {
  const on = regionsFor(muscleGroup);
  const muted = colors.textMuted;
  const hi = colors.primary;
  const outline = !!on.outline;

  const shapeProps = (active?: boolean) =>
    active
      ? outline
        ? { fill: 'none', stroke: hi, strokeWidth: 1.6 }
        : { fill: hi }
      : { fill: muted };

  return (
    <Svg width={size} height={(size * V_H) / V_W} viewBox={`0 0 ${V_W} ${V_H}`}>
      <Circle cx={HEAD.cx} cy={HEAD.cy} r={HEAD.r} fill={muted} />
      {SHOULDERS.map((s, i) => (
        <Circle key={i} cx={s.cx} cy={s.cy} r={s.r} {...shapeProps(on.shoulders)} />
      ))}
      {ARMS.map((a, i) => (
        <Rect key={i} x={a.x} y={a.y} width={a.width} height={a.height} rx={a.rx} {...shapeProps(on.arms)} />
      ))}
      <Rect x={CHEST.x} y={CHEST.y} width={CHEST.width} height={CHEST.height} rx={CHEST.rx} {...shapeProps(on.chest)} />
      <Rect x={CORE.x} y={CORE.y} width={CORE.width} height={CORE.height} rx={CORE.rx} {...shapeProps(on.core)} />
      {LEGS.map((l, i) => (
        <Rect key={i} x={l.x} y={l.y} width={l.width} height={l.height} rx={l.rx} {...shapeProps(on.legs)} />
      ))}
    </Svg>
  );
}
