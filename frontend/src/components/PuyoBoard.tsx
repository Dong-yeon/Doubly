/**
 * 연쇄 퍼즐 판 — 엔진 {@code Board} 를 그대로 그린다. 규칙 없음, 상태 없음.
 *
 * <p>내 판(조각·고스트·터짐 연출 포함)과 상대 미니 판(판만)이 같은 컴포넌트다 — 셀 크기만 다르다.
 * 절대 위치 View 로 그린다(Skia 없음, svg 도 굳이 필요 없다 — docs/COUPLE_PUZZLE_BATTLE §11-3).
 */
import React from 'react';
import { View, type GestureResponderHandlers, type StyleProp, type ViewStyle } from 'react-native';
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

interface Props {
  board: Board | null;
  /** 한 칸의 px — 판 크기는 여기서 나온다(6×12) */
  cell: number;
  piece?: Piece | null;
  /** 착지 예상 자리 — 반투명 */
  ghost?: Piece | null;
  /** 터지는 프레임의 칸 */
  flashing?: Set<number>;
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
  dim,
  style,
  children,
  accessibilityLabel,
  containerProps,
}: Props) {
  const width = cell * WIDTH;
  const height = cell * VISIBLE_HEIGHT;

  const cells: React.ReactNode[] = [];
  if (board) {
    for (let row = HIDDEN_ROWS; row < HIDDEN_ROWS + VISIBLE_HEIGHT; row++) {
      for (let col = 0; col < WIDTH; col++) {
        const i = row * WIDTH + col;
        const v = board[i];
        if (v === EMPTY) continue;
        cells.push(
          <View
            key={i}
            style={[
              styles.puyo,
              cellStyle(cell, col, row),
              { backgroundColor: PIECE_COLORS[v] },
              v === GARBAGE && styles.garbage,
              flashing?.has(i) && styles.flash,
            ]}
          />,
        );
      }
    }
  }

  const renderPiece = (p: Piece, ghosted: boolean) =>
    pieceCells(p).map(([c, r], idx) => {
      if (r < HIDDEN_ROWS) return null;
      const color = idx === 0 ? p.axis : p.child;
      return (
        <View
          key={`${ghosted ? 'g' : 'p'}${idx}`}
          style={[
            styles.puyo,
            cellStyle(cell, c, r),
            { backgroundColor: PIECE_COLORS[color] },
            ghosted ? styles.ghost : idx === 0 ? styles.axis : null,
          ]}
        />
      );
    });

  return (
    <View
      style={[styles.board, { width, height }, dim && styles.dim, style]}
      accessibilityLabel={accessibilityLabel}
      {...(containerProps ?? {})}
    >
      {cells}
      {ghost ? renderPiece(ghost, true) : null}
      {piece ? renderPiece(piece, false) : null}
      {children}
    </View>
  );
}

function cellStyle(cell: number, col: number, row: number) {
  const gap = cell >= 20 ? 3 : 1;
  const size = cell - gap;
  return {
    width: size,
    height: size,
    left: col * cell + gap / 2,
    top: (row - HIDDEN_ROWS) * cell + gap / 2,
    borderRadius: size / 2,
  };
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
  puyo: { position: 'absolute' },
  axis: { borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)' },
  ghost: { opacity: 0.22 },
  garbage: { borderRadius: 6, opacity: 0.85 },
  flash: { backgroundColor: colors.white, opacity: 0.9, transform: [{ scale: 1.12 }] },
}));

