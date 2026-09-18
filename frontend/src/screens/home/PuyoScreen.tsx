/**
 * 연쇄 퍼즐(뿌요뿌요형) — 로컬 1인 플레이. docs/COUPLE_PUZZLE_BATTLE_2026-09-18.md §9 단계 5.
 *
 * <p>규칙은 한 줄도 없다 — 전부 {@code games/puyo} 엔진이고, 이 화면은 입력을 엔진 함수로
 * 바꾸고 결과({@link LockOutcome})를 순서대로 그린다. 대전(단계 3·4)이 붙으면 같은 화면에
 * 상대 판과 방해 수신이 얹히는 구조라, 여기서 "내 판" 부분은 그대로 남는다.
 *
 * <p><b>조작(한 손 엄지, §2-1)</b>: 판 위에서 좌우로 끌면 열 이동, 탭하면 회전, 아래로 쓸면
 * 바로 떨어진다. 같은 조작이 아래 버튼 줄에도 있다(웹·접근성). 웹에서는 방향키·스페이스.
 *
 * <p><b>시간은 화면의 것이다.</b> 엔진은 수(手) 기준으로만 진행되고(§4-2 4번), 중력 타이머는
 * 이 화면이 {@code softDrop} 을 주기적으로 부르는 것뿐이다. 연쇄 연출 중에는 타이머와 입력을
 * 멈춘다 — 연출은 이미 확정된 결과를 보여주는 것이라 그동안 판이 바뀌면 안 된다.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PanResponder, Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { MaterialCommunityIcons } from '../../components/Icon';
import { useContentWidth } from '../../hooks/useContentWidth';
import { haptics } from '../../utils/haptics';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';
import {
  type Board,
  type Cell,
  type LockOutcome,
  type Piece,
  type PlayerState,
  EMPTY,
  GARBAGE,
  HIDDEN_ROWS,
  VISIBLE_HEIGHT,
  WIDTH,
  createPlayer,
  dropToBottom,
  hardDrop,
  moveLeft,
  moveRight,
  pieceCells,
  rotate,
  softDrop,
} from '../../games/puyo';

type Props = NativeStackScreenProps<HomeStackParamList, 'Puyo'>;

/** 중력 — 이 간격마다 한 칸 내려간다 */
const GRAVITY_MS = 800;
/** 연출 — 터지는 프레임 · 떨어지는 프레임 */
const CLEAR_FLASH_MS = 260;
const GRAVITY_FRAME_MS = 160;
/** 좌우 끌기 — 이만큼 움직이면 "끌었다"로 보고 탭(회전)으로 치지 않는다 */
const DRAG_DEAD_ZONE = 8;
/** 아래로 쓸기 — 바로 떨어뜨리기 */
const SWIPE_DOWN_DY = 56;

const BEST_KEY = 'doubly.puyoBest';

/** 조각 색 — 테마와 무관하게 서로 확실히 갈리는 4색. 방해는 회색 */
const PIECE_COLORS: Record<Cell, string> = {
  0: 'transparent',
  1: '#E5484D',
  2: '#3B82F6',
  3: '#22A06B',
  4: '#F5B301',
  5: '#9AA09A',
};

interface Best {
  score: number;
  maxChain: number;
}

async function loadBest(): Promise<Best | null> {
  try {
    const raw = await AsyncStorage.getItem(BEST_KEY);
    return raw ? (JSON.parse(raw) as Best) : null;
  } catch {
    return null;
  }
}

async function saveBest(best: Best): Promise<void> {
  try {
    await AsyncStorage.setItem(BEST_KEY, JSON.stringify(best));
  } catch {
    // 기록 저장 실패는 조용히 — 판 자체와 무관하다
  }
}

type Phase = 'IDLE' | 'PLAYING' | 'ANIMATING' | 'LOST';

/**
 * 입력 처리가 보는 "지금" 상태 — 중력 타이머·PanResponder·키보드 핸들러가 옛 클로저를 들지
 * 않게 렌더 상태와 별도로 든다. 화면은 한 번에 하나만 떠 있으므로 모듈 변수로 충분하다
 * (SudokuScreen 의 moveSeq 와 같은 판단 — ref 로 두면 react-hooks/refs 가 렌더 중 접근으로 오탐한다).
 * 마운트 때 초기화한다.
 */
let live: PlayerState | null = null;
let livePhase: Phase = 'IDLE';
/** 연출용 setTimeout 들 — 새 판을 열거나 화면을 나갈 때 전부 거둔다(같은 이유로 모듈 변수) */
let animationTimers: ReturnType<typeof setTimeout>[] = [];

function clearAnimationTimers(): void {
  animationTimers.forEach(clearTimeout);
  animationTimers = [];
}

export function PuyoScreen(_: Props) {
  const width = useContentWidth();
  const { height } = useWindowDimensions();

  const [phase, setPhase] = useState<Phase>('IDLE');
  const [best, setBest] = useState<Best | null>(null);
  /** 엔진 상태 — 렌더용. 입력 처리는 모듈 변수 live 를 본다 */
  const [state, setState] = useState<PlayerState | null>(null);
  /** 연출 중에 보여줄 판 — null 이면 엔진 판을 그대로 */
  const [shownBoard, setShownBoard] = useState<Board | null>(null);
  const [flashing, setFlashing] = useState<Set<number>>(() => new Set());
  const [chainLabel, setChainLabel] = useState<string | null>(null);
  useEffect(() => {
    live = null;
    livePhase = 'IDLE';
    loadBest().then(setBest);
    return () => {
      clearAnimationTimers();
      livePhase = 'IDLE';
    };
  }, []);

  const commit = useCallback((next: PlayerState) => {
    live = next;
    setState(next);
  }, []);

  const setPhaseBoth = useCallback((p: Phase) => {
    livePhase = p;
    setPhase(p);
  }, []);

  /* 판 크기 — 가로는 여백을 뺀 폭, 세로는 헤더·버튼 줄을 뺀 높이 중 작은 쪽에 맞춘다 */
  const cell = useMemo(() => {
    const byWidth = Math.floor((width - spacing.lg * 2) / WIDTH);
    const byHeight = Math.floor((height - 300) / VISIBLE_HEIGHT);
    return Math.max(18, Math.min(byWidth, byHeight, 44));
  }, [width, height]);
  const boardW = cell * WIDTH;
  const boardH = cell * VISIBLE_HEIGHT;

  const finish = useCallback(
    (final: PlayerState) => {
      setPhaseBoth('LOST');
      haptics.medium();
      const candidate: Best = { score: final.score, maxChain: final.maxChain };
      if (!best || candidate.score > best.score || (candidate.score === best.score && candidate.maxChain > best.maxChain)) {
        setBest(candidate);
        void saveBest(candidate);
      }
    },
    [best, setPhaseBoth],
  );

  /**
   * 착지 결과 재생 — 착지 판 → (터짐 → 낙하)* → 방해 투입 → 다음 조각.
   * 연쇄가 없으면 바로 다음 조각으로 간다(연출 없이).
   */
  const playOutcome = useCallback(
    (outcome: LockOutcome) => {
      const after = () => {
        setShownBoard(null);
        setFlashing(new Set());
        setChainLabel(null);
        if (outcome.lost) finish(outcome.state);
        else setPhaseBoth('PLAYING');
      };

      if (outcome.steps.length === 0 && outcome.garbageDropped.length === 0) {
        after();
        return;
      }

      setPhaseBoth('ANIMATING');
      setShownBoard(outcome.boardAfterLock);
      let t = 0;
      const schedule = (fn: () => void, delay: number) => {
        animationTimers.push(setTimeout(fn, delay));
      };
      for (const step of outcome.steps) {
        schedule(() => {
          setFlashing(new Set(step.cleared));
          setChainLabel(step.chain >= 2 ? `${step.chain}연쇄!` : null);
          if (step.chain >= 3) haptics.medium();
          else haptics.light();
        }, t);
        t += CLEAR_FLASH_MS;
        schedule(() => {
          setFlashing(new Set());
          setShownBoard(step.boardAfterGravity);
        }, t);
        t += GRAVITY_FRAME_MS;
      }
      if (outcome.garbageDropped.length > 0) {
        schedule(() => setShownBoard(outcome.boardAfterGarbage), t);
        t += GRAVITY_FRAME_MS;
      }
      if (outcome.steps.length >= 3) {
        schedule(() => haptics.success(), t);
      }
      schedule(after, t + 80);
    },
    [finish, setPhaseBoth],
  );

  const start = useCallback(() => {
    clearAnimationTimers();
    const seed = Date.now() % 2147483647;
    commit(createPlayer(seed));
    setShownBoard(null);
    setFlashing(new Set());
    setChainLabel(null);
    setPhaseBoth('PLAYING');
    haptics.light();
  }, [commit, setPhaseBoth]);

  /* ─── 입력 ─── */
  const canAct = () => livePhase === 'PLAYING' && live?.piece != null;

  const onLeft = useCallback(() => {
    if (!canAct()) return;
    const next = moveLeft(live as PlayerState);
    if (next !== live) commit(next);
  }, [commit]);

  const onRight = useCallback(() => {
    if (!canAct()) return;
    const next = moveRight(live as PlayerState);
    if (next !== live) commit(next);
  }, [commit]);

  const onRotate = useCallback(() => {
    if (!canAct()) return;
    const next = rotate(live as PlayerState, 1);
    if (next !== live) {
      commit(next);
      haptics.light();
    }
  }, [commit]);

  const onSoftDrop = useCallback(() => {
    if (!canAct()) return;
    const { state: next, locked } = softDrop(live as PlayerState);
    commit(next);
    if (locked) playOutcome(locked);
  }, [commit, playOutcome]);

  const onHardDrop = useCallback(() => {
    if (!canAct()) return;
    const outcome = hardDrop(live as PlayerState);
    commit(outcome.state);
    haptics.light();
    playOutcome(outcome);
  }, [commit, playOutcome]);

  /* 중력 — PLAYING 일 때만 돈다. 연출·게임오버·대기에서는 멈춘다 */
  useEffect(() => {
    if (phase !== 'PLAYING') return undefined;
    const id = setInterval(onSoftDrop, GRAVITY_MS);
    return () => clearInterval(id);
  }, [phase, onSoftDrop]);

  /* 웹 키보드 */
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft':
          onLeft();
          break;
        case 'ArrowRight':
          onRight();
          break;
        case 'ArrowUp':
        case 'x':
          onRotate();
          break;
        case 'ArrowDown':
          onSoftDrop();
          break;
        case ' ':
          e.preventDefault();
          onHardDrop();
          break;
        default:
          return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onLeft, onRight, onRotate, onSoftDrop, onHardDrop]);

  /*
   * 판 위 제스처 — 끌기(열 이동)·탭(회전)·아래로 쓸기(바로 떨어뜨리기).
   * 끈 거리를 칸 수로 바꿔 "지금까지 적용한 칸 수"와의 차이만큼 엔진을 부른다 — 손가락이
   * 왔다 갔다 해도 조각이 손가락 아래 열을 따라간다.
   */
  const pan = useMemo(() => {
    // 한 번의 터치 동안만 사는 값 — 리스폰더와 같이 만들어져 ref 가 필요 없다
    const cur = { appliedCols: 0, dragged: false, dropped: false };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        cur.appliedCols = 0;
        cur.dragged = false;
        cur.dropped = false;
      },
      onPanResponderMove: (_e, g) => {
        if (cur.dropped) return;
        if (Math.abs(g.dx) > DRAG_DEAD_ZONE) cur.dragged = true;
        const target = Math.round(g.dx / cell);
        while (cur.appliedCols < target) {
          onRight();
          cur.appliedCols++;
        }
        while (cur.appliedCols > target) {
          onLeft();
          cur.appliedCols--;
        }
        if (!cur.dragged && g.dy > SWIPE_DOWN_DY) {
          cur.dropped = true;
          onHardDrop();
        }
      },
      onPanResponderRelease: () => {
        if (!cur.dragged && !cur.dropped) onRotate();
      },
    });
  }, [cell, onLeft, onRight, onRotate, onHardDrop]);

  /* ─── 그리기 ─── */
  const board = shownBoard ?? state?.board ?? null;
  const piece = phase === 'PLAYING' ? state?.piece ?? null : null;
  const ghost = piece && state ? dropToBottom(state.board, piece) : null;

  const renderCells = () => {
    if (!board) return null;
    const nodes: React.ReactNode[] = [];
    for (let row = HIDDEN_ROWS; row < HIDDEN_ROWS + VISIBLE_HEIGHT; row++) {
      for (let col = 0; col < WIDTH; col++) {
        const i = row * WIDTH + col;
        const v = board[i];
        if (v === EMPTY) continue;
        nodes.push(
          <View
            key={i}
            style={[
              styles.puyo,
              cellStyle(cell, col, row),
              { backgroundColor: PIECE_COLORS[v] },
              v === GARBAGE && styles.garbage,
              flashing.has(i) && styles.flash,
            ]}
          />,
        );
      }
    }
    return nodes;
  };

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

  const renderNext = () =>
    state?.next.map((pair, i) => (
      <View key={i} style={[styles.nextPair, i > 0 && styles.nextPairDim]}>
        <View style={[styles.nextDot, { backgroundColor: PIECE_COLORS[pair[1]] }]} />
        <View style={[styles.nextDot, { backgroundColor: PIECE_COLORS[pair[0]] }]} />
      </View>
    ));

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.body}>
        <View style={[styles.hud, { width: boardW }]}>
          <View>
            <Text style={styles.hudLabel}>점수</Text>
            <Text style={styles.hudValue}>{state?.score ?? 0}</Text>
          </View>
          <View>
            <Text style={styles.hudLabel}>최고 연쇄</Text>
            <Text style={styles.hudValue}>{state?.maxChain ?? 0}</Text>
          </View>
          <View style={styles.nextBox}>
            <Text style={styles.hudLabel}>다음</Text>
            <View style={styles.nextRow}>{renderNext()}</View>
          </View>
        </View>

        <View
          style={[styles.board, { width: boardW, height: boardH }]}
          {...(phase === 'PLAYING' ? pan.panHandlers : {})}
          accessibilityLabel="퍼즐 판. 좌우로 끌면 이동, 탭하면 회전, 아래로 쓸면 바로 떨어져요"
        >
          {renderCells()}
          {ghost ? renderPiece(ghost, true) : null}
          {piece ? renderPiece(piece, false) : null}

          {chainLabel ? (
            <View style={styles.chainBadge} pointerEvents="none">
              <Text style={styles.chainText}>{chainLabel}</Text>
            </View>
          ) : null}

          {phase === 'IDLE' || phase === 'LOST' ? (
            <View style={styles.overlay}>
              {phase === 'LOST' && state ? (
                <>
                  <Text style={styles.overlayTitle}>판이 가득 찼어요</Text>
                  <Text style={styles.overlayScore}>{state.score}점</Text>
                  <Text style={styles.overlayDesc}>
                    최고 {state.maxChain}연쇄 · {state.moves}수
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.overlayTitle}>연쇄 퍼즐</Text>
                  <Text style={styles.overlayDesc}>
                    같은 색 4개를 붙이면 사라져요.{'\n'}위의 조각이 내려오며 또 터지면 연쇄!
                  </Text>
                </>
              )}
              {best ? (
                <Text style={styles.overlayBest}>
                  내 기록 {best.score}점 · {best.maxChain}연쇄
                </Text>
              ) : null}
              <Button
                title={phase === 'LOST' ? '다시 하기' : '시작'}
                size="md"
                onPress={start}
                style={styles.overlayBtn}
              />
            </View>
          ) : null}
        </View>

        <View style={[styles.controls, { width: boardW }]}>
          <ControlButton icon="chevron-left" label="왼쪽" onPress={onLeft} disabled={phase !== 'PLAYING'} />
          <ControlButton icon="restart" label="회전" onPress={onRotate} disabled={phase !== 'PLAYING'} />
          <ControlButton icon="chevron-right" label="오른쪽" onPress={onRight} disabled={phase !== 'PLAYING'} />
          <ControlButton icon="chevron-down" label="떨어뜨리기" onPress={onHardDrop} disabled={phase !== 'PLAYING'} />
        </View>

        <Text style={styles.footnote}>
          {Platform.OS === 'web'
            ? '방향키로 이동·회전, 스페이스로 바로 떨어뜨려요.'
            : '판을 좌우로 끌면 이동, 탭하면 회전, 아래로 쓸면 바로 떨어져요.'}
        </Text>
      </View>
    </SafeAreaView>
  );
}

function cellStyle(cell: number, col: number, row: number) {
  const size = cell - 3;
  return {
    width: size,
    height: size,
    left: col * cell + 1.5,
    top: (row - HIDDEN_ROWS) * cell + 1.5,
    borderRadius: size / 2,
  };
}

function ControlButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.control, pressed && styles.pressed, disabled && styles.controlDisabled]}
    >
      <MaterialCommunityIcons name={icon} size={28} color={colors.textPrimary} />
    </Pressable>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1, alignItems: 'center', paddingTop: spacing.md, paddingHorizontal: spacing.lg },
  pressed: { opacity: 0.6 },

  hud: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: spacing.sm,
  },
  hudLabel: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700' },
  hudValue: { fontSize: fontSize.title, color: colors.textPrimary, fontWeight: '800', marginTop: spacing.xxs },
  nextBox: { alignItems: 'flex-end' },
  nextRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xxs },
  nextPair: { gap: 2 },
  nextPairDim: { opacity: 0.5 },
  nextDot: { width: 16, height: 16, borderRadius: 8 },

  board: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  puyo: { position: 'absolute' },
  axis: { borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)' },
  ghost: { opacity: 0.22 },
  garbage: { borderRadius: 6, opacity: 0.85 },
  flash: { backgroundColor: colors.white, opacity: 0.9, transform: [{ scale: 1.12 }] },

  chainBadge: {
    position: 'absolute',
    top: '38%',
    alignSelf: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  chainText: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.white },

  overlay: {
    ...({ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 } as const),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  overlayTitle: { fontSize: fontSize.title, fontWeight: '800', color: colors.textPrimary },
  overlayScore: { fontSize: fontSize.heading, fontWeight: '800', color: colors.primary },
  overlayDesc: { fontSize: fontSize.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  overlayBest: { fontSize: fontSize.caption, color: colors.textMuted, fontWeight: '700', marginTop: spacing.xs },
  overlayBtn: { marginTop: spacing.md, minWidth: 140 },

  controls: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md, gap: spacing.sm },
  control: {
    flex: 1,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlDisabled: { opacity: 0.4 },
  footnote: { fontSize: fontSize.caption, color: colors.textMuted, textAlign: 'center', marginTop: spacing.md, lineHeight: 18 },
}));
