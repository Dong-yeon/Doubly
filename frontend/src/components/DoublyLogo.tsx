/** Dubly 인앱 로고 — 앱 아이콘과 같은 <b>맞댄 두 숟가락 + 하트</b>(2026-09-29 통일).
 *
 *  스플래시(72)·로그인(56)·에러 화면(48)에서 쓴다. 경로는 store/icon/make_icon.py 가 아이콘과 같은
 *  점에서 뽑은 dublyMarkPaths.ts 다 — 한쪽만 고치면 런처 아이콘과 앱 안 로고가 갈라진다.
 *
 *  <b>색은 액센트를 따르지 않는다.</b> 예전 하트 로고는 mark* 토큰으로 액센트(민트·피치)를 따랐지만,
 *  지금 로고는 브랜드 마크이고 네이티브 스플래시(splash-icon.png)가 바로 앞에 같은 그림을 같은 색으로
 *  띄운다 — 색이 다르면 스플래시가 JS 화면으로 넘어가는 순간 로고 색이 바뀐다.
 *
 *  이전 로고의 역사: 겹친 두 하트(Pink/Sky) → 덩굴 하트 → 톱니 하트 → 겹친 두 하트 아웃라인(초록) → 숟가락.
 *  하트 곡선 헬퍼(heartPoints)는 HeartSproutIcon 이 재사용하므로 남긴다.
 */
import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { DUBLY_MARK_HEART, DUBLY_MARK_LEFT, DUBLY_MARK_RIGHT, DUBLY_MARK_VIEWBOX } from './dublyMarkPaths';

export type Pt = { x: number; y: number };

/**
 * 매끈한 하트 곡선(카디오이드류 파라메트릭 공식). HeartSproutIcon 이 쓴다.
 */
export function heartPoints(scale: number, segments = 96): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = (2 * Math.PI * i) / segments;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    out.push({ x: x * scale, y: -y * scale });
  }
  return out;
}

/** 아이콘과 같은 값(store/icon/make_icon.py 의 CORAL·SKY). onDark 는 사진 스크림 등 어두운 바탕 위 — 한 단계 밝힌다 */
const MARK = {
  light: { coral: '#F28472', sky: '#62A8EC' },
  onDark: { coral: '#F69A8A', sky: '#8CC0F2' },
};

/**
 * 인앱 마크(텍스트 없음) — 배경 없이 두 숟가락과 하트만 그린다(호출부 배경 위에 얹힌다).
 * size 는 마크를 담는 정사각 한 변이다.
 *
 * @param onDark 어두운 배경(배경 사진 위 스크림 등)에 얹을 때 true — 색을 한 단계 밝혀 묻히지 않게 한다
 */
export function DoublyMark({ size = 40, onDark = false }: { size?: number; onDark?: boolean }) {
  const c = onDark ? MARK.onDark : MARK.light;
  return (
    <Svg width={size} height={size} viewBox={DUBLY_MARK_VIEWBOX} accessibilityLabel="Dubly">
      <Path d={DUBLY_MARK_LEFT} fill={c.coral} />
      <Path d={DUBLY_MARK_RIGHT} fill={c.sky} />
      {DUBLY_MARK_HEART.map((d, i) => (
        <Path key={i} d={d} fill={c.coral} />
      ))}
    </Svg>
  );
}
