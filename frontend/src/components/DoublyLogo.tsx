/** Doubly 심볼 — 겹친 두 하트 아웃라인 + 반짝임 셋. 전부 초록 계열이다:
 *  뒤(연함) = 상대, 앞(짙음) = 나. 하트 곡선은 파라메트릭 카디오이드 공식(heartPoints).
 *
 *  앱 아이콘(DoublySquareMark)은 초록 그라데이션 정사각 배경 위에 이 두 하트를 얹은
 *  것이고(assets/doubly-logo.svg 가 마스터), 인앱 마크(DoublyMark, 20~72px 로 여러 곳에
 *  쓰인다)는 배경 없이 하트 두 개만 그린다 — 배경이 항상 밝다는 보장이 없어서(사진 위
 *  스크림 등) onDark prop 으로 밝은/어두운 배경용 색을 고른다.
 *
 *  이전에는 톱니(레코드) 하트였다(Gold/Green). 그 전엔 덩굴이 얽힌 하트(Gold/Green, 잎 셋).
 *  그 전엔 겹친 두 하트(Pink/Sky)였다.
 */
import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Polygon, Rect, Stop } from 'react-native-svg';
import { colors, fontSize } from '../constants/theme';

interface Props {
  size?: number;
  showWordmark?: boolean;
  wordmarkColor?: string;
  style?: ViewStyle;
}

export type Pt = { x: number; y: number };

/** 뷰박스 한 변 — 모든 좌표가 이 기준이다 */
const V = 100;

/**
 * 매끈한 하트 곡선(카디오이드류 파라메트릭 공식). 두 하트, 반짝임 별 모두 이 하나의
 * 곡선을 스케일만 바꿔 재사용한다.
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

function toPath(pts: Pt[], dx = 0, dy = 0, scale = 1): string {
  return (
    pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${(p.x * scale + dx).toFixed(2)},${(p.y * scale + dy).toFixed(2)}`)
      .join(' ') + ' Z'
  );
}

/** 네 꼭짓점 반짝임 별 하나의 폴리곤 점 (Polygon points 문자열용) */
function starPoints(cx: number, cy: number, s: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 8; i += 1) {
    const r = i % 2 === 0 ? 1 : 0.28;
    const ang = (Math.PI / 4) * i;
    pts.push(`${(cx + r * s * Math.cos(ang)).toFixed(2)},${(cy + r * s * Math.sin(ang)).toFixed(2)}`);
  }
  return pts.join(' ');
}

/** 뒤(상대) 하트 — 위·왼쪽으로 살짝 치우친다 */
const BACK_SCALE = 1.5;
const BACK_CX = 40;
const BACK_CY = 44;
/** 앞(나) 하트 — 아래·오른쪽, 뒤 하트보다 살짝 크다 */
const FRONT_SCALE = 1.55;
const FRONT_CX = 60;
const FRONT_CY = 58;

const BACK_HEART = heartPoints(BACK_SCALE, 120);
const FRONT_HEART = heartPoints(FRONT_SCALE, 120);
const BACK_D = toPath(BACK_HEART, BACK_CX, BACK_CY, 1);
const FRONT_D = toPath(FRONT_HEART, FRONT_CX, FRONT_CY, 1);

/** 하트 위쪽 반짝임 세 개 — 위치·크기는 아이콘 마스터(doubly-logo.svg)와 맞춘다 */
const SPARKLES: { cx: number; cy: number; s: number }[] = [
  { cx: 48, cy: 18, s: 3.2 },
  { cx: 56, cy: 14, s: 1.8 },
  { cx: 62, cy: 20, s: 1.3 },
];

/** 밝은 배경(흰/크림)용 색 — 인앱 마크 기본값 */
const ON_LIGHT = { back: '#8FCB98', front: '#1F5A25', sparkle: '#D9A441' };
/** 어두운 배경(다크모드, 사진 위 스크림)용 색 — 밝을수록 잘 읽힌다 */
const ON_DARK = { back: '#BFE3C4', front: '#5FBE73', sparkle: '#FFF3C4' };

/** 아이콘 배경 그라데이션(초록, 좌상단 밝음 → 우하단 짙음) + 아이콘 전용 하트 색 */
const ICON_GRADIENT = { from: '#4E9E56', to: '#143D19' };
const ICON_HEART = { back: '#D7F0D6', front: '#0F3D16', sparkle: '#FFF3C4' };

function Sparkles({ color }: { color: string }) {
  return (
    <>
      {SPARKLES.map((sp, i) => (
        <Polygon key={i} points={starPoints(sp.cx, sp.cy, sp.s)} fill={color} />
      ))}
    </>
  );
}

/**
 * 앱 아이콘과 같은 정사각 마크 — 초록 그라데이션 배경 위에 두 하트 + 반짝임.
 * 실제 icon.png 등은 assets/doubly-logo.svg 를 래스터화해서 만들지만, 인앱에서
 * (공유 카드 미리보기 등) 아이콘 그대로가 필요할 때 이 컴포넌트를 쓸 수 있다.
 */
export function DoublySquareMark({ size = 96, radius = 22 }: { size?: number; radius?: number }) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${V} ${V}`}>
      <Defs>
        <LinearGradient id="doublyBg" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={ICON_GRADIENT.from} />
          <Stop offset="1" stopColor={ICON_GRADIENT.to} />
        </LinearGradient>
      </Defs>
      <Rect width={V} height={V} rx={radius} fill="url(#doublyBg)" />
      <Path d={BACK_D} fill="none" stroke={ICON_HEART.back} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" />
      <Path d={FRONT_D} fill="none" stroke={ICON_HEART.front} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" />
      <Sparkles color={ICON_HEART.sparkle} />
    </Svg>
  );
}

/**
 * 인앱 마크(텍스트 없음) — 겹친 두 하트 아웃라인 + 반짝임. 배경은 없다(호출부 배경 위에
 * 얹힌다).
 *
 * @param onDark 어두운 배경(배경 사진 위 스크림 등)에 얹을 때 true. 밝을수록 잘 읽히는
 *   색으로 바꾼다
 */
export function DoublyMark({ size = 40, onDark = false }: { size?: number; onDark?: boolean }) {
  const palette = onDark ? ON_DARK : ON_LIGHT;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${V} ${V}`}>
      <Path d={BACK_D} fill="none" stroke={palette.back} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" />
      <Path d={FRONT_D} fill="none" stroke={palette.front} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" />
      <Sparkles color={palette.sparkle} />
    </Svg>
  );
}

/** 마크 + 워드마크(Doubly) 가로 조합 */
export function DoublyLogo({ size = 40, showWordmark = true, wordmarkColor = colors.ink, style }: Props) {
  return (
    <View style={[styles.row, style]}>
      <DoublyMark size={size} />
      {showWordmark ? (
        <Text style={[styles.word, { fontSize: size * 0.78, color: wordmarkColor }]}>Doubly</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  word: { fontWeight: '800', letterSpacing: -1 },
});
