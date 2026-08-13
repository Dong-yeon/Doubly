/**
 * 하트 가지 — 스트릭(연속 기록) 전용 일러스트. 하트 안에서 작은 하트 세 개가
 * 가지처럼 뻗어 나오는 모양으로, "매일 쌓여서 자란다"는 스트릭의 의미를 담는다.
 *
 * <p>색은 <b>Pink</b>다. Doubly 전역 팔레트(src/theme/colors.ts)는 Gold/Green/Olive로
 * 정리돼 있고 그 파일 주석에 "예전엔 Pink 였다가 폐기했다"는 이력이 남아 있지만,
 * 이 일러스트는 그 팔레트에 색을 추가하는 게 아니라 <b>이 컴포넌트 하나에 국한된
 * 고정값</b>이다 — 스트릭 자리에서만 쓰는 걸로 정해서 전역 시맨틱 색과는 무관하게 둔다.
 *
 * <p>기하는 DoublyLogo.tsx 의 heartPoints() 를 그대로 재사용한다 — 큰 하트 윤곽과
 * 작은 하트 세 개 전부 같은 곡선을 스케일만 바꿔 쓴다.
 */
import React from 'react';
import Svg, { Path, Polyline } from 'react-native-svg';
import { heartPoints, Pt } from './DoublyLogo';

const V = 100;
const PINK = '#E8829E';
const STEM = '#3A342F';

function toPath(pts: Pt[], dx: number, dy: number, scale: number): string {
  return (
    pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${(p.x * scale + dx).toFixed(2)},${(p.y * scale + dy).toFixed(2)}`)
      .join(' ') + ' Z'
  );
}

/** 큰 하트 윤곽 (채움 없이 선만) */
const OUTER = heartPoints(2.6, 80);
/** 작은 가지 하트 — 왼쪽·가운데 작게, 오른쪽 위쪽으로 살짝 크게 */
const MINI = heartPoints(0.45, 40);
const MINI_BIG = heartPoints(0.55, 40);

// 줄기는 하트 윗부분에 매달려 아래로 늘어진다 (덩굴에 열매가 달린 모양)
const BASE: Pt = { x: 50, y: 30 };
const FORK: Pt = { x: 50, y: 46 };
const TIP_LEFT: Pt = { x: 40, y: 54 };
const TIP_MID: Pt = { x: 47, y: 62 };
const TIP_RIGHT: Pt = { x: 58, y: 58 };

export function HeartSproutIcon({ size = 24, color = PINK, stemColor = STEM }: {
  size?: number;
  color?: string;
  stemColor?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${V} ${V}`}>
      <Path d={toPath(OUTER, 50, 52, 1)} fill="none" stroke={color} strokeWidth={6} strokeLinejoin="round" />
      <Polyline points={`${BASE.x},${BASE.y} ${FORK.x},${FORK.y}`} stroke={stemColor} strokeWidth={1.8} fill="none" />
      {[TIP_LEFT, TIP_MID, TIP_RIGHT].map((tip, i) => (
        <Polyline
          key={i}
          points={`${FORK.x},${FORK.y} ${tip.x},${tip.y}`}
          stroke={stemColor}
          strokeWidth={1.6}
          fill="none"
        />
      ))}
      <Path d={toPath(MINI, TIP_LEFT.x, TIP_LEFT.y + 2.5, 1)} fill="none" stroke={stemColor} strokeWidth={1.6} />
      <Path d={toPath(MINI_BIG, TIP_MID.x, TIP_MID.y + 2.5, 1)} fill="none" stroke={stemColor} strokeWidth={1.6} />
      <Path d={toPath(MINI, TIP_RIGHT.x, TIP_RIGHT.y + 2.5, 1)} fill="none" stroke={stemColor} strokeWidth={1.6} />
    </Svg>
  );
}
