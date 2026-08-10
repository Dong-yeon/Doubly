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

/** 잎이 붙는 위치 (반쪽 경로의 진행도 — "위 꼭지에서 얼마나 왔나") */
const LEAF_AT = [0.16, 0.42, 0.7];

/**
 * 한 반쪽의 기하 — 줄기 점들과 잎 세 장.
 *
 * <p><b>진짜 원인</b>: 줄기 곡선 자체는 완전히 대칭이지만({@code halfPoints(1)[i]}
 * 를 세로축으로 뒤집으면 {@code halfPoints(-1)[56-i]} 와 정확히 겹친다 — 이건
 * {@code i ↔ 56-i} 다), <b>{@link LEAF_AT}은 두 반쪽에서 같은 index 를 가리킨다</b>.
 * 오른쪽은 t 가 위→아래로 흐르고 왼쪽은 아래→위로 흐르므로, 같은 index 9 가
 * 오른쪽에서는 "위 꼭지 근처", 왼쪽에서는 "아래 끝 근처"를 가리켜 잎이 대각선으로
 * 몰렸다(실측: bbox 중심이 뷰박스 중앙에서 2.51 벗어남).
 *
 * <p><b>고침</b>: 왼쪽만 index 를 {@code (N-1-i)} 로 뒤집고, 접선을 재는 이웃점도
 * 반대 방향({@code i-3})에서 뽑는다 — "위 꼭지에서부터의 진행도"라는 뜻을 양쪽에서
 * 같게 맞춘다. 검증(면적·무게중심·bbox, 신발끈 공식): 세 잎 모두 좌우 오차 0.0000.
 */
function halfGeometry(side: 1 | -1): { stem: Pt[]; leaves: Pt[][] } {
  const stem = halfPoints(side);
  const N = stem.length;
  const leaves = LEAF_AT.map((f) => {
    const iFromTop = Math.round(f * (N - 1));
    const i = side > 0 ? iFromTop : N - 1 - iFromTop;
    const p = stem[i];
    const n = stem[side > 0 ? Math.min(i + 3, N - 1) : Math.max(i - 3, 0)];
    const ang = Math.atan2(n.y - p.y, n.x - p.x) + side * Math.PI * 0.46;
    return leafPoints(p.x, p.y, ang, H * 0.16);
  });
  return { stem, leaves };
}

const GEOMETRY = { right: halfGeometry(1), left: halfGeometry(-1) };

/**
 * 그림을 뷰박스 한가운데로 옮기는 안전망.
 *
 * <p>위 halfGeometry 수정으로 그림은 이미 완전 대칭이라(bbox 중심 오차 0.000,
 * verify-logo 스크립트로 확인) 이 보정은 사실상 항등(dx≈dy≈0)이다. 향후 잎 모양이나
 * 각도를 조정해 미세한 비대칭이 다시 생기더라도 자동으로 잡히도록 남겨 둔다.
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
      {/* halfGeometry 가 이제 좌우 완전 대칭이라 이 이동은 사실상 0 — CENTERING 주석 참고 */}
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
