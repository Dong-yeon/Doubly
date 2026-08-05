/** Doubly 심볼 — 두 덩굴이 얽혀 이루는 하트 (나=Gold · 상대=Forest).
 *
 *  앱 아이콘과 같은 모티프다. 예전에는 겹친 두 하트(Pink/Sky)였는데, 아이콘을
 *  덩굴 하트로 바꾸면서 <b>앱을 열자마자 다른 마크가 나오는</b> 상태가 됐다.
 *  색도 팔레트 밖의 값(#FF7EB9/#7DD3F0)을 쓰고 있어 앱 어디와도 맞지 않았다.
 *
 *  하트는 파라메트릭 곡선을 좌/우 반쪽으로 갈라 그린다. 왼쪽이 나, 오른쪽이 상대이고
 *  위·아래 두 지점에서 만난다. 잎은 각 반쪽에서 바깥으로 뻗는다.
 *
 *  이모지(🩷🩵)를 글자로 쓰지 않는 이유: Unicode 15(2022) 라 구형 기기에서 두부(☒)가
 *  되고, 플랫폼마다 모양이 달라 브랜드 마크로 쓸 수 없다.
 */
import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import Svg, { G, Path, Polygon } from 'react-native-svg';
import { colors, fontSize } from '../constants/theme';

interface Props {
  size?: number;
  showWordmark?: boolean;
  wordmarkColor?: string;
  style?: ViewStyle;
}

/** 뷰박스 한 변 — 모든 좌표가 이 기준이다 */
const V = 100;
/** 하트 높이 (뷰박스 대비) */
const H = 78;
/** 덩굴 굵기 */
const STROKE = 9;

/**
 * 파라메트릭 하트의 반쪽 좌표.
 * t 0..π 가 오른쪽(위 꼭지 → 아래 끝), π..2π 가 왼쪽이다.
 */
function halfPoints(side: 1 | -1): { x: number; y: number }[] {
  const [a, b] = side > 0 ? [0, Math.PI] : [Math.PI, 2 * Math.PI];
  const k = H / 34;
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i <= 56; i += 1) {
    const t = a + ((b - a) * i) / 56;
    const x = 16 * Math.sin(t) ** 3;
    const y =
      13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    out.push({ x: V / 2 + x * k, y: V / 2 + 3 - y * k });
  }
  return out;
}

function toPath(pts: { x: number; y: number }[]): string {
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('');
}

type Pt = { x: number; y: number };

/** 잎 — 양 끝이 모이는 아몬드형. 줄기 위 한 점에서 바깥으로 뻗는다 */
function leafPoints(x: number, y: number, ang: number, len: number): Pt[] {
  const pts: Pt[] = [];
  const push = (u: number, v: number) =>
    pts.push({
      x: x + u * Math.cos(ang) - v * Math.sin(ang),
      y: y + u * Math.sin(ang) + v * Math.cos(ang),
    });
  for (let i = 0; i <= 12; i += 1) {
    const u = i / 12;
    push(u * len, len * 0.3 * Math.sin(Math.PI * u) ** 0.85);
  }
  for (let i = 12; i >= 0; i -= 1) {
    const u = i / 12;
    push(u * len, -len * 0.3 * Math.sin(Math.PI * u) ** 0.85);
  }
  return pts;
}

const toPolygon = (pts: Pt[]) => pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

/** 잎이 붙는 위치 (반쪽 경로의 진행도) */
const LEAF_AT = [0.16, 0.42, 0.7];

/** 한 반쪽의 기하 — 줄기 점들과 잎 세 장 */
function halfGeometry(side: 1 | -1): { stem: Pt[]; leaves: Pt[][] } {
  const stem = halfPoints(side);
  const leaves = LEAF_AT.map((f) => {
    const i = Math.round(f * (stem.length - 1));
    const p = stem[i];
    const n = stem[Math.min(i + 3, stem.length - 1)];
    const ang = Math.atan2(n.y - p.y, n.x - p.x) + side * Math.PI * 0.46;
    return leafPoints(p.x, p.y, ang, H * 0.16);
  });
  return { stem, leaves };
}

const GEOMETRY = { right: halfGeometry(1), left: halfGeometry(-1) };

/**
 * 그림을 뷰박스 한가운데로 옮기는 보정값.
 *
 * <p><b>왜 필요한가</b>: 줄기 곡선({@code 16·sin³t})은 좌우 대칭이지만 <b>잎은 아니다</b>.
 * {@link LEAF_AT} 은 "반쪽 경로의 진행도"인데, 오른쪽 반쪽은 위→아래로,
 * 왼쪽 반쪽은 아래→위로 매개변수가 흐른다. 그래서 잎이 대각선으로 몰리고
 * 그림 전체가 뷰박스 중앙에서 벗어난다 — 실측 <b>가로 약 5% 왼쪽</b>.
 *
 * <p>홈 히어로에서는 마크 위아래로 정확히 가운데인 세로선이 지나가므로 이 어긋남이
 * 눈에 띄었다. 잎 배치(=브랜드 모양)를 건드리지 않고 <b>위치만</b> 바로잡는다.
 *
 * <p>값은 그림을 만드는 함수에서 직접 계산한다 — 모양을 고치면 보정도 따라 움직인다.
 */
const CENTERING = (() => {
  const all: Pt[] = [];
  for (const half of [GEOMETRY.right, GEOMETRY.left]) {
    // 줄기는 선 굵기의 절반만큼 더 번진다
    for (const p of half.stem) {
      all.push({ x: p.x - STROKE / 2, y: p.y - STROKE / 2 });
      all.push({ x: p.x + STROKE / 2, y: p.y + STROKE / 2 });
    }
    for (const leaf of half.leaves) all.push(...leaf);
  }
  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  const dx = V / 2 - (Math.min(...xs) + Math.max(...xs)) / 2;
  const dy = V / 2 - (Math.min(...ys) + Math.max(...ys)) / 2;
  return { dx, dy };
})();

/**
 * 어두운 배경 위에 얹을 때 쓰는 밝은 변형.
 *
 * <p>홈 히어로는 배경 사진 위 스크림이라 <b>테마와 무관하게 항상 어둡다</b>.
 * 라이트 팔레트의 짙은 골드·포레스트를 그대로 쓰면 묻히므로 다크 팔레트 값을 고정으로 쓴다.
 */
const ON_DARK = { me: '#F1C999', partner: '#A7D2A9', together: '#C9DA97' };

function Half({ side, color, leafColor }: { side: 1 | -1; color: string; leafColor: string }) {
  const { stem, leaves } = side > 0 ? GEOMETRY.right : GEOMETRY.left;
  return (
    <>
      {leaves.map((leaf, i) => (
        <Polygon key={`${side}-${i}`} points={toPolygon(leaf)} fill={leafColor} />
      ))}
      <Path
        d={toPath(stem)}
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </>
  );
}

/**
 * 덩굴 하트 마크 (텍스트 없음) — 왼쪽 나 · 오른쪽 상대.
 *
 * @param onDark 어두운 배경(배경 사진 위 스크림 등)에 얹을 때 true. 밝은 변형을 쓴다
 */
export function DoublyMark({ size = 40, onDark = false }: { size?: number; onDark?: boolean }) {
  const me = onDark ? ON_DARK.me : colors.me;
  const partner = onDark ? ON_DARK.partner : colors.partner;
  const leaf = onDark ? ON_DARK.together : colors.together;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${V} ${V}`}>
      {/* 잎이 비대칭이라 그림이 뷰박스 중앙에서 벗어난다 — CENTERING 주석 참고 */}
      <G transform={`translate(${CENTERING.dx.toFixed(2)} ${CENTERING.dy.toFixed(2)})`}>
        {/* 상대(뒤) → 나(앞) 순서로 겹쳐 '얽힌' 인상을 만든다 */}
        <Half side={1} color={partner} leafColor={leaf} />
        <Half side={-1} color={me} leafColor={leaf} />
      </G>
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
