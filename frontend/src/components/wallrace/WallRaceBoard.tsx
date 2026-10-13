/**
 * 길막기 판 + 벽 트레이 — 실전(WallRaceScreen)과 연습(WallRacePracticeScreen)이 같이 쓴다. 실전 화면에서 그대로 떼어 냈다
 * (그림·조작 동일). docs/PATH_LOCK_ANALYSIS_2026-09-21.md, docs/pathlock-ux-analysis_2026-10-08.md.
 *
 * <p>벽은 트레이의 가로·세로 조각을 판으로 <b>끌어</b> 놓는다. 손을 떼면 바로 두지 않고 판 위 [놓기]/✕ 로 남긴다 — 벽은
 * 되돌리기 어려운 자원이다. 끌지 않고 누르면 탭 모드(교차점을 눌러 고르기, 같은 점을 다시 누르면 방향 전환).
 *
 * <p>고르던 벽(미리보기)·벽 모드는 {@code resetKey} 가 바뀌면 저절로 비워진다 — 판이 한 수 움직이면 낡은 자리로 두지 않게.
 * 판 위치는 인스턴스마다 따로 든다. 예전엔 모듈 변수 하나여서, 실전 화면 위에 연습 화면을 겹쳐 열면 덮여 버렸다.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '../Icon';
import { fontSize, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';
import { palettes } from '../../theme/palette';
import { haptics } from '../../utils/haptics';

const SIZE = 9;
const WALL_SIZE = SIZE - 1;

/*
 * 게임 화면 색 — 판을 두는 동안은 앱 테마와 상관없이 어두운 게임판이다(사용자가 보여 준 PathLock 화면, 2026-10-08).
 * 테마 토큰을 쓰지 않는 이유는 오목과 같다 — 라이트·다크 어느 쪽에서도 같은 판이어야 말과 벽이 읽힌다.
 */
export const WR_COLORS = {
  bg: '#0E0F13',
  card: '#1A1C24',
  line: '#2A2E3A',
  text: '#E9EBF0',
  sub: '#8D93A3',
  groove: '#3A4050',
  /*
   * 말·목표줄은 소유자 색 — 판이 다크에서도 같은 밝은 판이라 라이트 팔레트로 고정한다.
   * CELL_BG 위 대비: 나 4.90 · 상대 4.88.
   */
  me: palettes.light.me,
  partner: palettes.light.partner,
};
const BOARD_BG = '#262A35'; // 칸 사이 홈 — 칸보다 밝아 격자선처럼 보인다
const CELL_BG = '#161922';
const BOARD_FRAME = '#3B3528';
/** 주인을 모르는 벽(기보가 잘린 옛 판) — 내·상대 색 어느 쪽도 아닌 중립 */
const WALL_COLOR = '#B9C0CE';
const GOAL_ME = withAlpha(WR_COLORS.me, 0.16);
const GOAL_PARTNER = withAlpha(WR_COLORS.partner, 0.16);
/** 코치가 짚는 자리 — 판 색과 겹치지 않는 초록 */
const COACH = '#3DDC84';

export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function inRange(value: number, limit: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < limit;
}

/**
 * 벽의 주인 — 기보를 처음부터 훑어 "누가 몇 번째 수에 놓았나"로 정한다. 선공은 판을 연 사람의 상대이므로
 * 짝수 번째 수가 상대 쪽이다(WallRaceGame.sideAt). 기보가 잘린 옛 판은 일부 벽의 주인을 모른다 — 중립색.
 */
function wallOwners(moves: string[], iAmCreator: boolean): Map<number, 'me' | 'partner'> {
  const owners = new Map<number, 'me' | 'partner'>();
  moves.forEach((move, i) => {
    if (!move.startsWith('W') || move.length < 3) return;
    const slot = Number(move.slice(1, -1));
    if (!inRange(slot, WALL_SIZE * WALL_SIZE)) return;
    const moverIsCreator = i % 2 === 1;
    owners.set(slot, moverIsCreator === iAmCreator ? 'me' : 'partner');
  });
  return owners;
}

/**
 * 기보의 마지막 수 — 'P12' 면 그 칸, 'W35H' 면 그 벽 자리. 비동기 게임이라 며칠 만에 들어오는데, 벽은 어디 생겼는지
 * 보이지 않아서 마지막 수를 표시한다.
 */
function lastMoveOf(moves: string[]): { cell: number | null; slot: number | null } {
  const last = moves.length > 0 ? moves[moves.length - 1] : undefined;
  if (!last) return { cell: null, slot: null };
  if (last.startsWith('P') && last.length > 1) {
    const cell = Number(last.slice(1));
    return { cell: inRange(cell, SIZE * SIZE) ? cell : null, slot: null };
  }
  if (last.startsWith('W') && last.length > 2) {
    const slot = Number(last.slice(1, -1));
    return { cell: null, slot: inRange(slot, WALL_SIZE * WALL_SIZE) ? slot : null };
  }
  return { cell: null, slot: null };
}

export type WallKind = 'H' | 'V';
type Pending = { slot: number; kind: WallKind };

/** 끄는 벽 미리보기를 손가락보다 이만큼 위에 띄운다 — 손가락이 벽을 가리면 어디에 붙는지 보이지 않는다(§3-4) */
const DRAG_LIFT = 48;
/** 이 거리보다 덜 움직였으면 끈 게 아니라 누른 것이다 — 탭 모드로 들어간다 */
const TAP_SLOP = 8;

/** 놓을 수 없는 이유 — 서버 ErrorCode 의 문장과 같은 뜻으로 맞춘다 */
const ILLEGAL_REASON: Record<string, string> = {
  OVERLAP: '이미 벽이 있는 자리예요',
  BLOCKS_PATH: '길을 완전히 막을 수는 없어요',
};

const PAD = 4;
/** 홈(벽이 놓이는 칸 사이 틈)의 폭 — 칸 한 변에 대한 비율 */
const GROOVE_RATIO = 0.2;

/** 판 한 변에서 칸·홈 치수 — 대국판과 지난 판의 작은 판이 같은 식을 쓴다 */
function geometry(boardSize: number) {
  const cell = (boardSize - PAD * 2) / (SIZE + WALL_SIZE * GROOVE_RATIO);
  const gap = cell * GROOVE_RATIO;
  const pitch = cell + gap;
  return {
    cell,
    gap,
    pitch,
    cellX: (col: number) => PAD + col * pitch,
    cellY: (row: number) => PAD + row * pitch,
    jointX: (c: number) => PAD + (c + 1) * pitch - gap / 2,
    jointY: (r: number) => PAD + (r + 1) * pitch - gap / 2,
  };
}

/** 손가락 위치를 가장 가까운 교차점으로 — 판 밖이면 null. 손가락보다 DRAG_LIFT 위를 겨눈다 */
function snapToSlot(frame: { x: number; y: number; size: number } | null, pageX: number, pageY: number): number | null {
  if (!frame) return null;
  const x = pageX - frame.x;
  const y = pageY - DRAG_LIFT - frame.y;
  const margin = frame.size * 0.08;
  if (x < -margin || y < -margin || x > frame.size + margin || y > frame.size + margin) return null;
  const { pitch, gap } = geometry(frame.size);
  const c = Math.round((x - PAD + gap / 2) / pitch - 1);
  const r = Math.round((y - PAD + gap / 2) / pitch - 1);
  const clamp = (v: number) => Math.max(0, Math.min(WALL_SIZE - 1, v));
  return clamp(r) * WALL_SIZE + clamp(c);
}

type TrayActions = {
  getBoard: () => View | null;
  isFlipped: () => boolean;
  setDrag: (d: { kind: WallKind; slot: number | null } | null) => void;
  chooseKind: (k: WallKind) => void;
  placePending: (slot: number, kind: WallKind) => void;
};

/**
 * 트레이 조각 하나의 제스처 — 끌면 판 위 교차점에 스냅된 미리보기, 손을 떼면 "놓을까요?"로 남긴다.
 * 끌지 않고 누르면 탭 모드. 판 밖에서 놓으면 취소. docs/pathlock-ux-analysis_2026-10-08.md §3-1.
 */
function createTrayResponder(kind: WallKind, a: TrayActions) {
  const cur = { frame: null as { x: number; y: number; size: number } | null, slot: null as number | null, dragging: false };
  const end = () => {
    cur.dragging = false;
    a.setDrag(null);
  };
  return PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      cur.frame = null;
      cur.slot = null;
      cur.dragging = false;
      a.getBoard()?.measure((_x, _y, w, _h, pageX, pageY) => {
        cur.frame = { x: pageX, y: pageY, size: w };
      });
    },
    onPanResponderMove: (e, g) => {
      if (!cur.dragging && Math.abs(g.dx) < TAP_SLOP && Math.abs(g.dy) < TAP_SLOP) return;
      const shown = snapToSlot(cur.frame, e.nativeEvent.pageX, e.nativeEvent.pageY);
      const slot = shown === null ? null : a.isFlipped() ? WALL_SIZE * WALL_SIZE - 1 - shown : shown;
      if (cur.dragging && slot === cur.slot) return;
      if (slot !== null) haptics.light();
      cur.dragging = true;
      cur.slot = slot;
      a.setDrag({ kind, slot });
    },
    onPanResponderRelease: () => {
      const { dragging, slot } = cur;
      end();
      if (!dragging) {
        a.chooseKind(kind);
        return;
      }
      if (slot === null) return;
      a.placePending(slot, kind);
    },
    onPanResponderTerminate: end,
  });
}

/** 판이 그리는 데 필요한 것 — 실전 WallRaceGame 응답이 그대로 맞고, 연습 엔진도 이 모양으로 만든다 */
export interface WallRaceView {
  myPawn: number;
  partnerPawn: number;
  /** 0 또는 8 — 8(판을 연 쪽)이면 판을 180° 돌려 그려 "나는 언제나 아래"가 된다 */
  myGoalRow: number;
  walls: string;
  legalMoves: number[];
  illegalWalls?: { slot: number; kind: WallKind | string; reason: string }[];
  moves: string[];
  myWallsLeft: number;
  myTurn: boolean;
}

export interface WallRaceBoardProps {
  view: WallRaceView;
  size: number;
  /** 지금 둘 수 있는가 — 아니면 판만 그린다 */
  interactive: boolean;
  /** 판 아래 트레이 줄을 그리는가(지난 판의 작은 판·결과 판은 false) */
  showTray?: boolean;
  /** 트레이 대신 그릴 것(실전의 무르기 안내) */
  belowBoard?: React.ReactNode;
  busy?: boolean;
  /** 말 얼굴(우리 이모지) — 없으면 말 모양 */
  faces?: { me: string | null; partner: string | null };
  /** 이 값이 바뀌면 고르던 벽·벽 모드를 비운다(보통 "판 id:수 번호") */
  resetKey?: string;
  onMove?: (cell: number) => void;
  onWall?: (slot: number, kind: WallKind) => void;
  /** 끌기 시작·끝 — 바깥 목록의 스크롤을 잠그는 데 쓴다 */
  onDragChange?: (dragging: boolean) => void;
  /** 연습용 — 벽을 쓰지 못하게(말 이동만 가르치는 단계) */
  wallsDisabled?: boolean;
  /** 연습용 — 말을 못 움직이게(벽만 가르치는 단계) */
  movesDisabled?: boolean;
  /** 연습용 — 코치가 짚는 칸과 벽 자리 */
  coachCells?: number[] | null;
  coachWall?: { slot: number; kind: WallKind } | null;
}

export function WallRaceBoard({
  view: g,
  size,
  interactive,
  showTray = true,
  belowBoard,
  busy = false,
  faces,
  resetKey = '',
  onMove,
  onWall,
  onDragChange,
  wallsDisabled,
  movesDisabled,
  coachCells,
  coachWall,
}: WallRaceBoardProps) {
  /*
   * 고르던 것 — 어느 판·수에서 고른 것인지(key)를 함께 들어, resetKey 가 바뀌면 저절로 비어 보이게 한다
   * (이펙트에서 setState 하지 않으려고 — QuartoScreen 의 pick 과 같은 방식).
   */
  const [sel, setSel] = useState<{ key: string; pending: Pending | null; wallMode: boolean; tapKind: WallKind }>({
    key: '',
    pending: null,
    wallMode: false,
    tapKind: 'H',
  });
  const fresh = sel.key === resetKey;
  const pending = fresh ? sel.pending : null;
  const wallMode = fresh ? sel.wallMode : false;
  const tapKind = sel.tapKind;
  const [drag, setDragState] = useState<{ kind: WallKind; slot: number | null } | null>(null);

  const boardRef = useRef<View | null>(null);
  const flipped = g.myGoalRow === SIZE - 1;
  const flippedRef = useRef(flipped);
  useEffect(() => {
    flippedRef.current = flipped;
  }, [flipped]);
  const resetKeyRef = useRef(resetKey);
  useEffect(() => {
    resetKeyRef.current = resetKey;
  }, [resetKey]);
  const onDragChangeRef = useRef(onDragChange);
  useEffect(() => {
    onDragChangeRef.current = onDragChange;
  }, [onDragChange]);

  // 처리기는 한 번만 만든다 — 최신 값은 ref 로 읽는다(PanResponder 는 만든 순간의 클로저를 든다)
  const tray = useMemo(() => {
    const actions: TrayActions = {
      getBoard: () => boardRef.current,
      isFlipped: () => flippedRef.current,
      setDrag: (d) => {
        setDragState(d);
        onDragChangeRef.current?.(d !== null);
      },
      chooseKind: (kind) =>
        setSel((s) => {
          const live = s.key === resetKeyRef.current;
          const p = live ? s.pending : null;
          return { key: resetKeyRef.current, wallMode: true, tapKind: kind, pending: p ? { slot: p.slot, kind } : null };
        }),
      placePending: (slot, kind) =>
        setSel({ key: resetKeyRef.current, wallMode: true, tapKind: kind, pending: { slot, kind } }),
    };
    // 처리기는 ref 를 터치 이벤트(PanResponder 콜백) 안에서만 읽는다 — 렌더 중 읽기가 아니라서 이 규칙의 오탐이다
    // eslint-disable-next-line react-hooks/refs
    return { H: createTrayResponder('H', actions), V: createTrayResponder('V', actions) };
  }, []);

  const setPending = (p: Pending | null) => setSel({ key: resetKey, wallMode, tapKind, pending: p });
  const startTapMode = (kind: WallKind) =>
    setSel({ key: resetKey, wallMode: true, tapKind: kind, pending: pending ? { slot: pending.slot, kind } : null });
  const stopWallMode = () => setSel({ key: resetKey, wallMode: false, tapKind, pending: null });

  const illegalReason = (slot: number, kind: WallKind): string | null => {
    const hit = g.illegalWalls?.find((w) => w.slot === slot && w.kind === kind);
    return hit ? (ILLEGAL_REASON[hit.reason] ?? '여기는 놓을 수 없어요') : null;
  };

  const confirmWall = () => {
    if (!pending || busy) return;
    if (illegalReason(pending.slot, pending.kind)) return;
    haptics.light();
    onWall?.(pending.slot, pending.kind);
  };

  const { cell, gap, pitch, cellX, cellY, jointX, jointY } = geometry(size);
  const preview: Pending | null = !interactive
    ? null
    : drag
      ? drag.slot === null
        ? null
        : { slot: drag.slot, kind: drag.kind }
      : pending;
  const previewIllegal = preview ? illegalReason(preview.slot, preview.kind) : null;
  const legal = new Set(interactive && !wallMode && !movesDisabled ? g.legalMoves : []);
  const pawnSize = cell * 0.62;
  const dotSize = cell * 0.46;
  const iAmCreator = flipped;
  /*
   * 나는 언제나 아래에서 출발한다(사용자 요청, 2026-10-08). 판을 연 쪽은 저장상 맨 윗줄에서 출발하므로 판을 180° 돌려
   * 그린다. 칸 번호(80−i)와 벽 자리(63−s)만 뒤집으면 된다. 상태·요청은 전부 저장 좌표 그대로다.
   */
  const vc = (i: number) => (flipped ? SIZE * SIZE - 1 - i : i);
  const vs = (sl: number) => (flipped ? WALL_SIZE * WALL_SIZE - 1 - sl : sl);
  const shownMyGoalRow = flipped ? SIZE - 1 - g.myGoalRow : g.myGoalRow;
  const owners = wallOwners(g.moves, iAmCreator);
  const meFace = faces?.me ?? null;
  const partnerFace = faces?.partner ?? null;
  const last = lastMoveOf(g.moves);
  const ringSize = pawnSize * 1.45;
  /** 교차점 탭 영역은 서로 닿을 만큼 크게 — 한 변을 pitch 로 두면 빈틈도 겹침도 없이 8×8 을 덮는다 */
  const jointHit = pitch;
  const coach = new Set(coachCells ?? []);

  /** 벽 하나의 사각형 — 두 칸 길이로 홈을 덮는다. grow 는 사방으로 넓히는 여백(후광) */
  const wallRect = (slot: number, kind: WallKind, grow = 0) => {
    const r = Math.floor(slot / WALL_SIZE);
    const c = slot % WALL_SIZE;
    const long = cell * 2 + gap;
    return kind === 'H'
      ? { left: cellX(c) - grow, top: jointY(r) - gap / 2 - grow, width: long + grow * 2, height: gap + grow * 2 }
      : { left: jointX(c) - gap / 2 - grow, top: cellY(r) - grow, width: gap + grow * 2, height: long + grow * 2 };
  };

  /** 미리보기 벽 옆의 [놓기]/✕ — 가로 벽은 위(맨 윗줄이면 아래), 세로 벽은 오른쪽(오른쪽 끝이면 왼쪽) */
  const renderConfirm = (p: Pending) => {
    const r = Math.floor(vs(p.slot) / WALL_SIZE);
    const c = vs(p.slot) % WALL_SIZE;
    const btn = Math.max(32, Math.min(40, cell * 1.1));
    const okW = btn * 1.7;
    const w = okW + btn + 6;
    const cx = jointX(c);
    const cy = jointY(r);
    let left: number;
    let top: number;
    if (p.kind === 'H') {
      left = cx - w / 2;
      top = r === 0 ? cy + gap + 4 : cy - gap / 2 - btn - 6;
    } else {
      left = c >= WALL_SIZE - 2 ? cx - gap / 2 - w - 6 : cx + gap / 2 + 6;
      top = cy - btn / 2;
    }
    left = Math.max(2, Math.min(size - w - 2, left));
    top = Math.max(2, Math.min(size - btn - 2, top));
    return (
      <View style={[styles.confirmRow, { left, top }]}>
        <Pressable
          onPress={confirmWall}
          disabled={busy || !!previewIllegal}
          accessibilityRole="button"
          accessibilityLabel={p.kind === 'H' ? '가로 벽 놓기' : '세로 벽 놓기'}
          style={({ pressed }) => [
            styles.confirmBtn,
            { width: okW, height: btn, borderRadius: btn / 2 },
            previewIllegal ? styles.confirmBtnOff : styles.confirmBtnOk,
            pressed && styles.confirmPressed,
          ]}
        >
          <Text style={styles.confirmText}>놓기</Text>
        </Pressable>
        <Pressable
          onPress={() => setPending(null)}
          accessibilityRole="button"
          accessibilityLabel="이 자리 취소"
          style={({ pressed }) => [
            styles.confirmBtn,
            styles.confirmBtnCancel,
            { width: btn, height: btn, borderRadius: btn / 2 },
            pressed && styles.confirmPressed,
          ]}
        >
          <MaterialCommunityIcons name="close" size={btn * 0.55} color={WR_COLORS.text} />
        </Pressable>
      </View>
    );
  };

  const board = (
    <View ref={interactive ? boardRef : undefined} style={[styles.board, { width: size, height: size }]}>
      {/* 칸 — 목표 줄은 옅게 칠해 "어디로 가야 하는지"가 판에서 바로 읽히게 한다 */}
      {Array.from({ length: SIZE * SIZE }, (_, index) => {
        const row = Math.floor(index / SIZE);
        const col = index % SIZE;
        const isMyGoal = row === shownMyGoalRow;
        const isPartnerGoal = row === (shownMyGoalRow === 0 ? SIZE - 1 : 0);
        return (
          <View
            key={`c${index}`}
            style={[
              styles.cell,
              { left: cellX(col), top: cellY(row), width: cell, height: cell },
              isMyGoal && { backgroundColor: GOAL_ME },
              isPartnerGoal && { backgroundColor: GOAL_PARTNER },
              coach.has(vc(index)) && styles.cellCoach,
            ]}
          />
        );
      })}

      {/* 갈 수 있는 자리 */}
      {[...legal].map((index) => {
        const row = Math.floor(vc(index) / SIZE);
        const col = vc(index) % SIZE;
        return (
          <Pressable
            key={`m${index}`}
            onPress={() => {
              haptics.light();
              onMove?.(index);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${row + 1}행 ${col + 1}열로 이동`}
            style={[styles.moveHit, { left: cellX(col), top: cellY(row), width: cell, height: cell }]}
          >
            <View
              style={[
                styles.moveDot,
                { width: dotSize, height: dotSize, borderRadius: dotSize / 2, left: (cell - dotSize) / 2, top: (cell - dotSize) / 2 },
              ]}
            />
          </Pressable>
        );
      })}

      {/* 마지막 수가 말이었으면 그 자리에 테두리 — 말보다 먼저 그려 밖으로 테가 남는다 */}
      {last.cell !== null ? (
        <View
          pointerEvents="none"
          style={[
            styles.lastRing,
            {
              width: ringSize,
              height: ringSize,
              borderRadius: ringSize / 2,
              left: cellX(vc(last.cell) % SIZE) + (cell - ringSize) / 2,
              top: cellY(Math.floor(vc(last.cell) / SIZE)) + (cell - ringSize) / 2,
            },
          ]}
        />
      ) : null}

      {/* 말 — 우리 이모지가 있으면 그 사람의 얼굴, 없으면 말 모양. 발밑 받침은 주인 색 */}
      {([[g.myPawn, WR_COLORS.me, '내 말', meFace], [g.partnerPawn, WR_COLORS.partner, '상대 말', partnerFace]] as const).map(
        ([pos, color, label, face]) => (
          <View
            key={label}
            accessible
            accessibilityLabel={`${label} ${Math.floor(vc(pos) / SIZE) + 1}행 ${(vc(pos) % SIZE) + 1}열`}
            pointerEvents="none"
            style={[styles.pawnBox, { left: cellX(vc(pos) % SIZE), top: cellY(Math.floor(vc(pos) / SIZE)), width: cell, height: cell }]}
          >
            <View
              style={[
                styles.pawnBase,
                { backgroundColor: color, width: cell * 0.7, height: cell * 0.2, borderRadius: cell * 0.1, bottom: cell * 0.04 },
              ]}
            />
            {face ? (
              <Image source={{ uri: face }} style={{ width: cell * 0.92, height: cell * 0.92 }} contentFit="contain" />
            ) : (
              <View style={styles.pawnFallback}>
                <View style={{ width: pawnSize * 0.5, height: pawnSize * 0.5, borderRadius: pawnSize * 0.25, backgroundColor: color }} />
                <View
                  style={{
                    width: pawnSize * 0.86,
                    height: pawnSize * 0.5,
                    marginTop: pawnSize * 0.04,
                    borderTopLeftRadius: pawnSize * 0.43,
                    borderTopRightRadius: pawnSize * 0.43,
                    borderBottomLeftRadius: pawnSize * 0.1,
                    borderBottomRightRadius: pawnSize * 0.1,
                    backgroundColor: color,
                  }}
                />
              </View>
            )}
          </View>
        ),
      )}

      {/* 마지막 수가 벽이었으면 그 벽 뒤에 후광 */}
      {last.slot !== null && (g.walls[last.slot] === 'H' || g.walls[last.slot] === 'V') ? (
        <View pointerEvents="none" style={[styles.lastWall, wallRect(vs(last.slot), g.walls[last.slot] as WallKind, 3)]} />
      ) : null}

      {/* 코치가 권하는 벽 자리 — 옅은 테두리만 */}
      {coachWall ? <View pointerEvents="none" style={[styles.coachWall, wallRect(vs(coachWall.slot), coachWall.kind, 2)]} /> : null}

      {/* 놓인 벽 — 놓은 사람 색 */}
      {Array.from({ length: WALL_SIZE * WALL_SIZE }, (_, slot) => {
        const kind = g.walls[slot];
        if (kind !== 'H' && kind !== 'V') return null;
        const owner = owners.get(slot);
        const color = owner === 'me' ? WR_COLORS.me : owner === 'partner' ? WR_COLORS.partner : WALL_COLOR;
        return <View key={`w${slot}`} style={[styles.wall, { backgroundColor: color }, wallRect(vs(slot), kind)]} />;
      })}

      {/* 미리보기 — 아직 두지 않은 벽. 놓을 수 없는 자리면 빨갛게 */}
      {preview ? (
        <View
          pointerEvents="none"
          style={[
            styles.wall,
            previewIllegal ? styles.wallIllegal : [styles.wallPreview, { backgroundColor: WR_COLORS.me }],
            wallRect(vs(preview.slot), preview.kind),
          ]}
        />
      ) : null}

      {/* 벽 모드일 때만 교차점 탭 영역을 깐다 — 평소엔 말 이동을 가리지 않게 없앤다 */}
      {interactive && wallMode && !drag
        ? Array.from({ length: WALL_SIZE * WALL_SIZE }, (_, shown) => {
            const r = Math.floor(shown / WALL_SIZE);
            const c = shown % WALL_SIZE;
            const slot = vs(shown);
            const chosen = pending?.slot === slot;
            return (
              <Pressable
                key={`j${slot}`}
                onPress={() =>
                  // 같은 자리를 다시 누르면 방향이 바뀐다 — 손가락 하나로 둘 다 고를 수 있게
                  setPending(pending && pending.slot === slot ? { slot, kind: pending.kind === 'H' ? 'V' : 'H' } : { slot, kind: tapKind })
                }
                accessibilityRole="button"
                accessibilityLabel={`${r + 1}·${c + 1} 교차점에 벽 놓기`}
                style={[styles.joint, { left: jointX(c) - jointHit / 2, top: jointY(r) - jointHit / 2, width: jointHit, height: jointHit }]}
              >
                <View style={[styles.jointDot, chosen && styles.jointDotOn, { left: jointHit / 2 - 3, top: jointHit / 2 - 3 }]} />
              </Pressable>
            );
          })
        : null}

      {interactive && pending && !drag ? renderConfirm(pending) : null}
    </View>
  );

  if (!showTray && !belowBoard) return board;

  /**
   * 내 차례의 조작 줄 — 벽 트레이(가로·세로 조각)를 늘 보여 준다. 조각을 끌어 판에 놓거나, 눌러 탭 모드로 들어간다.
   */
  const renderActionBar = () => {
    if (!g.myTurn) return <Text style={styles.dHint}>상대가 두면 바로 보여요.</Text>;
    const hasWalls = g.myWallsLeft > 0 && !wallsDisabled;
    const dragIllegal = drag && drag.slot !== null ? illegalReason(drag.slot, drag.kind) : null;
    const pendingIllegal = pending ? illegalReason(pending.slot, pending.kind) : null;
    let hint: string;
    if (drag) {
      hint = drag.slot === null ? '판 위로 끌어 오세요. 판 밖에서 놓으면 취소돼요.' : (dragIllegal ?? '손을 떼면 그 자리에 미리 놓여요.');
    } else if (pending) {
      hint = pendingIllegal ?? "'놓기'를 누르면 놓여요. 다른 자리면 다시 끌어 오세요.";
    } else if (wallMode) {
      hint = '칸과 칸이 만나는 점을 눌러도 돼요. 같은 점을 다시 누르면 방향이 바뀌어요.';
    } else if (movesDisabled) {
      hint = '아래 조각을 판으로 끌어 놓아요.';
    } else {
      hint = hasWalls ? '고리를 누르면 말이 움직여요. 벽은 아래 조각을 판으로 끌어 놓아요.' : wallsDisabled ? '고리를 누르면 말이 움직여요.' : '벽을 다 썼어요. 말을 움직여요.';
    }
    const activeKind = drag?.kind ?? (wallMode ? (pending?.kind ?? tapKind) : null);
    return (
      <View style={styles.wallPanel}>
        {hasWalls ? (
          <View style={styles.tray}>
            {(['H', 'V'] as const).map((kind) => (
              <View
                key={kind}
                {...tray[kind].panHandlers}
                accessible
                accessibilityRole="button"
                accessibilityLabel={kind === 'H' ? '가로 벽, 끌어서 놓거나 눌러서 자리 고르기' : '세로 벽, 끌어서 놓거나 눌러서 자리 고르기'}
                onAccessibilityTap={() => startTapMode(kind)}
                pointerEvents={busy || !interactive ? 'none' : 'auto'}
                style={[styles.trayPiece, activeKind === kind && styles.trayPieceOn, (busy || !interactive) && styles.trayPieceOff]}
              >
                <View style={[kind === 'H' ? styles.trayWallH : styles.trayWallV, { backgroundColor: WR_COLORS.me }]} />
              </View>
            ))}
            <View style={styles.trayCount}>
              <Text style={styles.trayCountNum}>{g.myWallsLeft}</Text>
              <Text style={styles.trayCountLabel}>개의 벽</Text>
            </View>
            {wallMode ? (
              <Pressable onPress={stopWallMode} disabled={busy} accessibilityRole="button" hitSlop={8} style={styles.dTextBtn}>
                <Text style={styles.dTextBtnLabel}>벽 그만</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        <Text style={[styles.dHint, dragIllegal || pendingIllegal ? styles.hintBad : null]}>{hint}</Text>
      </View>
    );
  };

  return (
    <View>
      <View style={styles.boardWrap}>{board}</View>
      {belowBoard ?? renderActionBar()}
    </View>
  );
}

const styles = themedStyles((colors) => ({
  boardWrap: { alignItems: 'center', paddingVertical: spacing.xs },
  board: {
    alignSelf: 'center',
    backgroundColor: BOARD_BG,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BOARD_FRAME,
    overflow: 'hidden',
  },
  cell: { position: 'absolute', backgroundColor: CELL_BG, borderRadius: 3 },
  cellCoach: { borderWidth: 2, borderColor: COACH },
  moveHit: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  moveDot: { position: 'absolute', borderWidth: 2.5, borderColor: WR_COLORS.me, backgroundColor: withAlpha(WR_COLORS.me, 0.18) },
  pawnBox: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  pawnBase: { position: 'absolute', opacity: 0.85 },
  pawnFallback: { alignItems: 'center', marginTop: -2 },
  wall: { position: 'absolute', backgroundColor: WALL_COLOR, borderRadius: 2 },
  wallPreview: { opacity: 0.45 },
  wallIllegal: { backgroundColor: colors.danger, opacity: 0.7 },
  coachWall: { position: 'absolute', borderWidth: 2, borderColor: COACH, borderRadius: 3, borderStyle: 'dashed' },
  confirmRow: { position: 'absolute', flexDirection: 'row', gap: 6 },
  confirmBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  confirmBtnOk: { backgroundColor: WR_COLORS.me },
  confirmBtnOff: { backgroundColor: WR_COLORS.groove },
  confirmBtnCancel: { backgroundColor: WR_COLORS.card, borderWidth: 1, borderColor: WR_COLORS.groove },
  confirmPressed: { opacity: 0.7 },
  confirmText: { color: '#FFFFFF', fontWeight: '800', fontSize: fontSize.caption },
  tray: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  /* 벽 트레이 — PathLock 처럼 가로 조각은 넓게, 세로 조각은 높게 */
  trayPiece: {
    height: 56,
    minWidth: 56,
    paddingHorizontal: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: WR_COLORS.line,
    backgroundColor: WR_COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trayPieceOn: { borderColor: WR_COLORS.me, borderWidth: 2 },
  trayPieceOff: { opacity: 0.4 },
  trayWallH: { width: 56, height: 10, borderRadius: 5 },
  trayWallV: { width: 10, height: 38, borderRadius: 5 },
  trayCount: { alignItems: 'center', marginLeft: spacing.xs },
  trayCountNum: { fontSize: fontSize.subtitle, fontWeight: '800', color: WR_COLORS.text },
  trayCountLabel: { fontSize: 10, color: WR_COLORS.sub, fontWeight: '700' },
  wallPanel: { marginTop: spacing.md },
  dHint: { fontSize: fontSize.caption, color: WR_COLORS.sub, lineHeight: 18 },
  dTextBtn: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  dTextBtnLabel: { fontSize: fontSize.caption, fontWeight: '800', color: WR_COLORS.text },
  hintBad: { color: colors.danger, fontWeight: '700' },
  /* 마지막 수 표시 — 말에는 테두리, 벽에는 후광 */
  lastRing: { position: 'absolute', borderWidth: 2, borderColor: '#F5A524' },
  lastWall: { position: 'absolute', backgroundColor: '#F5A524', borderRadius: 3 },
  joint: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  jointDot: { position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: WR_COLORS.groove },
  jointDotOn: { backgroundColor: WALL_COLOR },
}));
