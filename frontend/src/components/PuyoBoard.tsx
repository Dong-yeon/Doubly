/**
 * 연쇄 퍼즐 판 — 엔진 {@code Board} 를 그대로 그린다. 규칙 없음, 게임 상태 없음.
 *
 * <p>내 판(조각·고스트·터짐 연출 포함)과 상대 미니 판(판만)이 같은 컴포넌트다 — 셀 크기만 다르다.
 * 절대 위치 View 로 그린다(Skia 없음, svg 도 굳이 필요 없다 — docs/COUPLE_PUZZLE_BATTLE §11-3).
 *
 * <p><b>조각은 얼굴이 있는 말랑한 알이다(2026-09-30).</b> 민 원만 있으면 밋밋했고("너무 원형이라 별로"),
 * 색만으로는 적록 색약이 빨강·초록을 못 가른다 — 색마다 <b>눈 모양을 다르게</b> 두어 색 없이도 구분된다
 * (docs/PUZZLE_UX_REVIEW_2026-09-30.md 3번). 이웃한 같은 색은 다리로 이어 붙여 무리가 한 덩어리로 보이게 한다.
 * 작은 판(셀 20px 미만, 상대 미니 판)은 얼굴·다리 없이 그린다 — 보이지 않을 크기에 View 만 늘어난다.
 *
 * <p><b>터짐</b>: 사라지는 칸은 부풀었다 꺼지고, 조각 부스러기가 사방으로 튄다. {@code burstKey} 가 바뀔
 * 때마다(연쇄 한 단계마다) 새로 재생된다 — 네이티브 드라이버라 JS 가 바빠도 끊기지 않는다.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, View, type GestureResponderHandlers, type StyleProp, type ViewStyle } from 'react-native';
import { radius } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';
import {
  type Board,
  type Cell,
  type Piece,
  EMPTY,
  GARBAGE,
  HIDDEN_ROWS,
  VISIBLE_HEIGHT,
  WIDTH,
  pieceCells,
} from '../games/puyo';

/** 조각 색 — 테마와 무관하게 서로 확실히 갈리는 4색. 방해는 회색 */
export const PIECE_COLORS: Record<Cell, string> = {
  0: 'transparent',
  1: '#E5484D',
  2: '#3B82F6',
  3: '#22A06B',
  4: '#F5B301',
  5: '#9AA09A',
};

/** 알의 아랫부분 그늘 — 같은 색을 어둡게 한 값(입체감) */
const SHADE: Record<Cell, string> = {
  0: 'transparent',
  1: '#B9343A',
  2: '#2A63C4',
  3: '#177A50',
  4: '#C98F00',
  5: '#7B807B',
};

/**
 * 색마다 다른 눈 — 색을 못 가려도 모양으로 가른다.
 * 1 빨강 = 동그란 눈 · 2 파랑 = 웃는 눈(^ ^) · 3 초록 = 한쪽 윙크 · 4 노랑 = 큰 흰자에 작은 눈동자
 */
type Face = 'round' | 'happy' | 'wink' | 'wide';
const FACE: Partial<Record<Cell, Face>> = { 1: 'round', 2: 'happy', 3: 'wink', 4: 'wide' };

/** 얼굴·다리를 그리는 최소 셀 크기 — 이보다 작으면 민 알 */
const DETAIL_MIN = 20;
/** 한 번에 튀는 부스러기 수 상한 — 큰 연쇄에서 View 가 수백 개 생기지 않게 */
const MAX_SHARDS = 48;
const POP_MS = 260;

interface Props {
  board: Board | null;
  /** 한 칸의 px — 판 크기는 여기서 나온다(6×12) */
  cell: number;
  piece?: Piece | null;
  /** 착지 예상 자리 — 반투명 */
  ghost?: Piece | null;
  /** 터지는 프레임의 칸 */
  flashing?: Set<number>;
  /** 터짐 연출을 다시 트는 값 — 연쇄 단계마다 바꾼다 */
  burstKey?: number;
  dim?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  accessibilityLabel?: string;
  /** PanResponder 핸들러 — 판 컨테이너에 그대로 펼친다. 없으면 판은 조작을 받지 않는다 */
  containerProps?: GestureResponderHandlers;
}

export function PuyoBoard({
  board,
  cell,
  piece,
  ghost,
  flashing,
  burstKey = 0,
  dim,
  style,
  children,
  accessibilityLabel,
  containerProps,
}: Props) {
  const width = cell * WIDTH;
  const height = cell * VISIBLE_HEIGHT;
  const detail = cell >= DETAIL_MIN;

  const links: React.ReactNode[] = [];
  const cells: React.ReactNode[] = [];
  if (board) {
    for (let row = HIDDEN_ROWS; row < HIDDEN_ROWS + VISIBLE_HEIGHT; row++) {
      for (let col = 0; col < WIDTH; col++) {
        const i = row * WIDTH + col;
        const v = board[i];
        if (v === EMPTY) continue;
        const popping = flashing?.has(i) ?? false;
        // 같은 색 이웃(오른쪽·아래)과 다리 — 터지는 칸은 다리를 떼어 따로 부푼다
        if (detail && v !== GARBAGE && !popping) {
          if (col + 1 < WIDTH && board[i + 1] === v && !flashing?.has(i + 1)) {
            links.push(<Link key={`h${i}`} cell={cell} col={col} row={row} dir="h" color={PIECE_COLORS[v]} />);
          }
          if (row + 1 < HIDDEN_ROWS + VISIBLE_HEIGHT && board[i + WIDTH] === v && !flashing?.has(i + WIDTH)) {
            links.push(<Link key={`v${i}`} cell={cell} col={col} row={row} dir="v" color={PIECE_COLORS[v]} />);
          }
        }
        cells.push(
          popping ? (
            <PopCell key={`pop${burstKey}-${i}`} cell={cell} col={col} row={row} color={v} detail={detail} />
          ) : (
            <Blob key={i} cell={cell} col={col} row={row} color={v} detail={detail} />
          ),
        );
      }
    }
  }

  const renderPiece = (p: Piece, ghosted: boolean) =>
    pieceCells(p).map(([c, r], idx) => {
      if (r < HIDDEN_ROWS) return null;
      const color = idx === 0 ? p.axis : p.child;
      return (
        <Blob
          key={`${ghosted ? 'g' : 'p'}${idx}`}
          cell={cell}
          col={c}
          row={r}
          color={color}
          detail={detail && !ghosted}
          ghost={ghosted}
          axis={!ghosted && idx === 0}
        />
      );
    });

  return (
    <View
      style={[styles.board, { width, height }, dim && styles.dim, style]}
      accessibilityLabel={accessibilityLabel}
      {...(containerProps ?? {})}
    >
      {links}
      {cells}
      {ghost ? renderPiece(ghost, true) : null}
      {piece ? renderPiece(piece, false) : null}
      {detail && flashing && flashing.size > 0 && board ? (
        <Burst key={`burst${burstKey}`} cell={cell} cells={[...flashing]} board={board} />
      ) : null}
      {children}
    </View>
  );
}

/* ─── 조각 한 알 ─── */

function place(cell: number, col: number, row: number) {
  const gap = cell >= DETAIL_MIN ? 2 : 1;
  const size = cell - gap;
  return { size, left: col * cell + gap / 2, top: (row - HIDDEN_ROWS) * cell + gap / 2 };
}

function Blob({
  cell,
  col,
  row,
  color,
  detail,
  ghost,
  axis,
}: {
  cell: number;
  col: number;
  row: number;
  color: Cell;
  detail: boolean;
  ghost?: boolean;
  axis?: boolean;
}) {
  const { size, left, top } = place(cell, col, row);
  const garbage = color === GARBAGE;
  return (
    <View
      style={[
        styles.abs,
        {
          width: size,
          height: size,
          left,
          top,
          // 살짝 네모난 원 — 민 원보다 말랑한 알처럼 보이고, 이웃과 붙었을 때 이음이 자연스럽다
          borderRadius: garbage ? size * 0.3 : size * 0.46,
          backgroundColor: PIECE_COLORS[color],
        },
        ghost && styles.ghost,
        axis && styles.axis,
      ]}
    >
      {detail ? <Body size={size} color={color} /> : null}
    </View>
  );
}

/** 알의 속 — 아래 그늘·위 광택·얼굴. 방해는 얼굴 대신 점 셋 */
function Body({ size, color }: { size: number; color: Cell }) {
  const shade = SHADE[color];
  const face = FACE[color];
  return (
    <>
      <View
        style={[
          styles.abs,
          { left: size * 0.2, right: size * 0.2, bottom: size * 0.04, height: size * 0.16, borderRadius: size * 0.1, backgroundColor: shade, opacity: 0.35 },
        ]}
      />
      <View
        style={[
          styles.abs,
          { left: size * 0.18, top: size * 0.12, width: size * 0.3, height: size * 0.18, borderRadius: size * 0.12, backgroundColor: '#FFFFFF', opacity: 0.45 },
        ]}
      />
      {face ? <Eyes size={size} face={face} /> : <GarbageDots size={size} />}
    </>
  );
}

function Eyes({ size, face }: { size: number; face: Face }) {
  const eyeY = size * 0.42;
  const dx = size * 0.19;
  const cx = size / 2;
  const ink = '#1F1F1F';
  const dot = (x: number, r: number, fill = ink, key?: string) => (
    <View key={key} style={[styles.abs, { left: x - r, top: eyeY - r, width: r * 2, height: r * 2, borderRadius: r, backgroundColor: fill }]} />
  );
  // ^ 모양: 윗변만 있는 둥근 테두리
  const arc = (x: number, key?: string) => {
    const w = size * 0.26;
    return (
      <View
        key={key}
        style={[
          styles.abs,
          {
            left: x - w / 2,
            top: eyeY - w * 0.25,
            width: w,
            height: w,
            borderRadius: w / 2,
            borderTopWidth: Math.max(2.5, size * 0.1),
            borderLeftWidth: Math.max(2, size * 0.07),
            borderRightWidth: Math.max(2, size * 0.07),
            borderColor: ink,
            borderBottomColor: 'transparent',
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
          },
        ]}
      />
    );
  };
  switch (face) {
    case 'round':
      return (
        <>
          {dot(cx - dx, size * 0.085)}
          {dot(cx + dx, size * 0.085)}
        </>
      );
    case 'happy':
      return (
        <>
          {arc(cx - dx, 'l')}
          {arc(cx + dx, 'r')}
        </>
      );
    case 'wink':
      return (
        <>
          {dot(cx - dx, size * 0.085, ink, 'l')}
          {arc(cx + dx, 'r')}
        </>
      );
    case 'wide':
      return (
        <>
          {dot(cx - dx, size * 0.13, '#FFFFFF', 'lw')}
          {dot(cx + dx, size * 0.13, '#FFFFFF', 'rw')}
          {dot(cx - dx, size * 0.06, ink, 'lp')}
          {dot(cx + dx, size * 0.06, ink, 'rp')}
        </>
      );
    default:
      return null;
  }
}

function GarbageDots({ size }: { size: number }) {
  const r = size * 0.06;
  return (
    <>
      {[0.3, 0.5, 0.7].map((f) => (
        <View
          key={f}
          style={[styles.abs, { left: size * f - r, top: size * 0.5 - r, width: r * 2, height: r * 2, borderRadius: r, backgroundColor: '#FFFFFF', opacity: 0.6 }]}
        />
      ))}
    </>
  );
}

/** 이웃한 같은 색을 잇는 다리 — 알 아래에 깔린다 */
function Link({ cell, col, row, dir, color }: { cell: number; col: number; row: number; dir: 'h' | 'v'; color: string }) {
  const { size, left, top } = place(cell, col, row);
  const thick = size * 0.56;
  const style =
    dir === 'h'
      ? { left: left + size / 2, top: top + (size - thick) / 2, width: cell, height: thick }
      : { left: left + (size - thick) / 2, top: top + size / 2, width: thick, height: cell };
  return <View style={[styles.abs, style, { backgroundColor: color }]} />;
}

/* ─── 터짐 ─── */

/** 사라지는 칸 — 하얗게 번쩍이며 부풀었다 꺼진다 */
function PopCell({ cell, col, row, color, detail }: { cell: number; col: number; row: number; color: Cell; detail: boolean }) {
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: POP_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [t]);
  const { size, left, top } = place(cell, col, row);
  const scale = t.interpolate({ inputRange: [0, 0.35, 1], outputRange: [1, 1.3, 0.2] });
  const opacity = t.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1, 0.9, 0] });
  const flash = t.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.85, 0] });
  return (
    <Animated.View
      style={[
        styles.abs,
        {
          width: size,
          height: size,
          left,
          top,
          borderRadius: size * 0.46,
          backgroundColor: PIECE_COLORS[color],
          opacity,
          transform: [{ scale }],
        },
      ]}
    >
      {detail ? <Body size={size} color={color} /> : null}
      <Animated.View style={[styles.abs, { left: 0, top: 0, width: size, height: size, borderRadius: size * 0.46, backgroundColor: '#FFFFFF', opacity: flash }]} />
    </Animated.View>
  );
}

/** 부스러기 — 사라진 칸마다 몇 조각이 사방으로 튀며 옅어진다 */
function Burst({ cell, cells, board }: { cell: number; cells: number[]; board: Board }) {
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [t]);

  const shards = useMemo(() => {
    const per = Math.max(2, Math.min(6, Math.floor(MAX_SHARDS / Math.max(1, cells.length))));
    const out: { x: number; y: number; dx: number; dy: number; color: string; s: number }[] = [];
    cells.forEach((i, n) => {
      const col = i % WIDTH;
      const row = Math.floor(i / WIDTH);
      const cx = col * cell + cell / 2;
      const cy = (row - HIDDEN_ROWS) * cell + cell / 2;
      const color = PIECE_COLORS[board[i]] ?? '#FFFFFF';
      for (let k = 0; k < per; k++) {
        // 난수 대신 칸 번호로 흩뿌린다 — 렌더마다 같은 모양(재렌더에 튀지 않게)
        const ang = ((k / per) * Math.PI * 2) + (n * 0.9);
        const dist = cell * (0.9 + ((k * 7 + n * 3) % 5) * 0.18);
        out.push({ x: cx, y: cy, dx: Math.cos(ang) * dist, dy: Math.sin(ang) * dist - cell * 0.3, color, s: cell * (0.16 + ((k + n) % 3) * 0.05) });
      }
    });
    return out;
  }, [cells, board, cell]);

  const opacity = t.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] });
  return (
    <View style={[styles.abs, { left: 0, top: 0, right: 0, bottom: 0 }]} pointerEvents="none">
      {shards.map((sh, k) => (
        <Animated.View
          key={k}
          style={[
            styles.abs,
            {
              left: sh.x - sh.s / 2,
              top: sh.y - sh.s / 2,
              width: sh.s,
              height: sh.s,
              borderRadius: sh.s / 2,
              backgroundColor: sh.color,
              opacity,
              transform: [
                { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, sh.dx] }) },
                { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, sh.dy] }) },
                { scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, 0.4] }) },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = themedStyles((colors) => ({
  board: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  dim: { opacity: 0.55 },
  abs: { position: 'absolute' },
  axis: { borderWidth: 2, borderColor: 'rgba(255,255,255,0.75)' },
  ghost: { opacity: 0.22 },
}));
