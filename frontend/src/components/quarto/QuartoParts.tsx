/**
 * 넷이 같아 판 조각 — 실전(QuartoScreen)과 연습(QuartoPracticeScreen)이 같이 쓴다.
 *
 * 말은 원작 나무 말을 따르지 않고 앱 토큰으로 그린다. 속성 넷은 색에만 기대지 않는다 — 모양(둥근/네모)·크기·
 * 속(꽉 참/구멍)은 형태로 보이고, 색 차이도 둘째 색 말에 가로 막대(−)를 그어 색을 못 가려도 구분된다.
 * 처음엔 가운데 점이었는데, 꽉 찬 말 위의 바탕색 점이 "구멍"처럼 읽혀 속 속성과 헷갈렸다(2026-10-13 웹 확인).
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '../Icon';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';
import { EMPTY, PIECES, SIZE, describePiece, pieceTraits } from '../../games/quarto';

export const QUARTO_BOARD_GAP = 6;

/**
 * 말 하나 — size 칸 안에 가운데 정렬로 그린다.
 * 색: chart1(잉크)/chart3(호박) — 앱에 secondary 토큰이 없고, primary 는 포인트 색 테마를 따라 바뀌어 둘째 색과
 * 겹칠 수 있어 테마와 무관하게 고정된 차트 색 짝을 쓴다(verify:theme 가 둘의 거리를 본다).
 */
export function QuartoPiece({ piece, size, ghost }: { piece: number; size: number; ghost?: boolean }) {
  const t = pieceTraits(piece);
  const tint = t.color === 0 ? colors.chart1 : colors.chart3;
  const body = t.big ? size : size * 0.6;
  const ring = Math.max(3, body * 0.2);
  const barH = Math.max(2, body * 0.12);
  return (
    <View
      style={[styles.pieceBox, { width: size, height: size, opacity: ghost ? 0.5 : 1 }]}
      accessible
      accessibilityLabel={describePiece(piece)}
    >
      <View
        style={{
          width: body,
          height: body,
          borderRadius: t.round ? body / 2 : body * 0.2,
          backgroundColor: t.solid ? tint : 'transparent',
          borderWidth: t.solid ? 0 : ring,
          borderColor: tint,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* 둘째 색 표시 — 색을 못 가려도 막대로 구분된다. 점은 구멍처럼 보여서 쓰지 않는다 */}
        {t.color === 1 ? (
          <View
            style={{
              width: t.solid ? body * 0.62 : Math.max(0, body - ring * 2),
              height: barH,
              borderRadius: barH / 2,
              backgroundColor: t.solid ? colors.surface : tint,
            }}
          />
        ) : null}
      </View>
    </View>
  );
}

export interface QuartoBoardProps {
  board: readonly number[];
  /** 판 한 변 길이(px) */
  size: number;
  onCellPress?: (index: number) => void;
  interactive?: boolean;
  /** 확정 전 미리 놓아 본 칸과 그 말 — 반투명으로 그린다 */
  ghostAt?: number | null;
  ghostPiece?: number | null;
  /** 이긴 줄(또는 이길 줄 미리보기) */
  highlight?: readonly number[] | null;
  /** 방금 놓인 칸 */
  lastPlace?: number | null;
  /** 코치가 가리키는 칸(튜토리얼) */
  coachCells?: readonly number[] | null;
}

export function QuartoBoard({
  board,
  size,
  onCellPress,
  interactive,
  ghostAt,
  ghostPiece,
  highlight,
  lastPlace,
  coachCells,
}: QuartoBoardProps) {
  const lit = new Set(highlight ?? []);
  const coach = new Set(coachCells ?? []);
  const cell = (size - QUARTO_BOARD_GAP * (SIZE + 1)) / SIZE;
  return (
    <View style={[styles.board, { width: size, padding: QUARTO_BOARD_GAP, gap: QUARTO_BOARD_GAP }]}>
      {Array.from({ length: SIZE }, (_, row) => (
        <View key={row} style={[styles.boardRow, { gap: QUARTO_BOARD_GAP }]}>
          {Array.from({ length: SIZE }, (__, col) => {
            const index = row * SIZE + col;
            const p = board[index];
            const ghost = ghostAt === index && ghostPiece != null && p === EMPTY;
            const shown = ghost ? (ghostPiece as number) : p;
            return (
              <Pressable
                key={index}
                disabled={!interactive || p !== EMPTY}
                onPress={() => onCellPress?.(index)}
                accessibilityRole="button"
                accessibilityLabel={`${row + 1}행 ${col + 1}열 ${p === EMPTY ? (ghost ? '여기 놓아 보는 중' : '빈 칸') : describePiece(p)}`}
                style={[
                  styles.cell,
                  { width: cell, height: cell },
                  lastPlace === index && styles.cellLast,
                  coach.has(index) && styles.cellCoach,
                  ghostAt === index && styles.cellPicked,
                  lit.has(index) && styles.cellLit,
                ]}
              >
                {shown !== EMPTY ? <QuartoPiece piece={shown} size={cell * 0.8} ghost={ghost && !lit.has(index)} /> : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** 놓을 말(또는 내가 준 말)을 크게 — 판 위에 둔다 */
export function QuartoHand({ piece, label, sub }: { piece: number | null; label: string; sub?: string }) {
  return (
    <View style={styles.hand}>
      <View style={styles.handPiece}>
        {piece != null ? <QuartoPiece piece={piece} size={72} /> : (
          <MaterialCommunityIcons name="dots-horizontal" size={28} color={colors.textMuted} />
        )}
      </View>
      <View style={styles.handText}>
        <Text style={styles.handLabel}>{label}</Text>
        {piece != null ? <Text style={styles.handDesc}>{describePiece(piece)}</Text> : null}
        {sub ? <Text style={styles.handTurn}>{sub}</Text> : null}
      </View>
    </View>
  );
}

/** 건넬 말 — 16자리를 고정해 두고 쓴 말은 빈 자리로 남긴다(위치가 흔들리지 않아 훑어보기 쉽다) */
export function QuartoTray({
  available,
  selected,
  onSelect,
  disabled,
  slot,
}: {
  available: readonly number[];
  selected: number | null;
  onSelect: (piece: number) => void;
  disabled?: boolean;
  /** 한 칸 크기(px) */
  slot: number;
}) {
  const can = new Set(available);
  return (
    <View style={styles.trayWrap}>
      <Text style={styles.trayTitle}>건넬 말 고르기</Text>
      <View style={[styles.tray, { gap: spacing.xs }]}>
        {Array.from({ length: PIECES }, (_, p) => {
          const ok = can.has(p);
          const picked = selected === p;
          return (
            <Pressable
              key={p}
              disabled={!ok || disabled}
              onPress={() => onSelect(p)}
              accessibilityRole="button"
              accessibilityState={{ selected: picked, disabled: !ok }}
              accessibilityLabel={ok ? `${describePiece(p)} 건네기` : '이미 쓴 말'}
              style={[styles.traySlot, { width: slot, height: slot }, picked && styles.traySlotPicked]}
            >
              {ok ? <QuartoPiece piece={p} size={slot * 0.82} /> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** 마지막으로 말이 놓인 칸 — 수 기록에서 찾는다 */
export function lastPlaceOf(moves: readonly { place: number | null }[]): number | null {
  for (let i = moves.length - 1; i >= 0; i -= 1) {
    const m = moves[i];
    if (m.place != null) return m.place;
  }
  return null;
}

const styles = themedStyles((colors) => ({
  pieceBox: { alignItems: 'center', justifyContent: 'center' },

  board: {
    alignSelf: 'center',
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.sm,
  },
  boardRow: { flexDirection: 'row' },
  cell: {
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellLast: { borderColor: colors.textMuted },
  cellCoach: { borderColor: colors.chart3, borderWidth: 3 },
  cellPicked: { borderColor: colors.primary },
  cellLit: { borderColor: colors.success, borderWidth: 3, backgroundColor: colors.successBg },

  hand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: spacing.sm,
  },
  handPiece: {
    width: 88,
    height: 88,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handText: { flex: 1, gap: 2 },
  handLabel: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  handDesc: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '600' },
  handTurn: { fontSize: fontSize.caption, color: colors.textMuted, fontWeight: '700', marginTop: 2 },

  trayWrap: { marginTop: spacing.md },
  trayTitle: { fontSize: fontSize.caption, fontWeight: '800', color: colors.textSecondary, marginBottom: spacing.xs },
  tray: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  traySlot: {
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  traySlotPicked: { borderColor: colors.primary, backgroundColor: colors.primaryBg },
}));
