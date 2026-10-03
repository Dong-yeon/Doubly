/**
 * 연쇄 퍼즐(뿌요뿌요형) — 혼자 연습 + 커플 대전. docs/COUPLE_PUZZLE_BATTLE_2026-09-18.md §11.
 *
 * <p>규칙은 한 줄도 없다 — 전부 {@code games/puyo} 엔진이고, 이 화면은 입력을 엔진 함수로
 * 바꾸고 결과({@link LockOutcome})를 순서대로 그린다. 판은 {@code PuyoBoard} 가 그린다.
 *
 * <p><b>대전(§2-5·§2-6)</b>: 서버는 심판이 아니다. 판을 열면 같은 시드를 받고, 각자 자기 판을
 * 끝까지 둔다. 착지마다 결과 판·보낸 방해를 {@code /pub/games} 로 흘리고(라이브), 상대가 이미
 * 결과를 냈으면 그 기보의 방해 타임라인을 같은 시각에 재생한다(고스트). 두 경우의 수신 처리는
 * 한 함수({@code receiveGarbage})다 — 이벤트 포맷이 같기 때문이다. 내 판이 끝나면(죽었거나
 * 상대보다 오래 버텼거나) 결과를 한 번 내고, 둘 다 내면 서버가 승자를 정해 카드를 남긴다.
 *
 * <p><b>조작(한 손 엄지, §2-1)</b>: 판 위에서 좌우로 끌면 열 이동, 탭하면 회전, 아래로 쓸면
 * 바로 떨어진다. 같은 조작이 아래 버튼 줄에도 있다(웹·접근성). 웹에서는 방향키·스페이스.
 *
 * <p><b>시간은 화면의 것이다.</b> 엔진은 수(手) 기준으로만 진행되고(§4-2 4번), 중력 타이머는
 * 이 화면이 {@code softDrop} 을 주기적으로 부르는 것뿐이다. 연쇄 연출 중에는 타이머와 입력을
 * 멈춘다 — 연출은 이미 확정된 결과를 보여주는 것이라 그동안 판이 바뀌면 안 된다. 기보의 경과
 * ms 도 여기서 잰다.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Animated, Easing, type LayoutChangeEvent, PanResponder, Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/types';
import { GameNudgeButton } from '../../components/GameNudgeButton';
import { Button } from '../../components/Button';
import { MaterialCommunityIcons } from '../../components/Icon';
import { PIECE_COLORS, PuyoBoard } from '../../components/PuyoBoard';
import { useContentWidth } from '../../hooks/useContentWidth';
import { puzzleApi } from '../../api/game';
import {
  connectSocket,
  publishGameEvent,
  subscribeCouple,
  subscribeGames,
  unsubscribeGames,
} from '../../api/chatSocket';
import { useAuthStore } from '../../store/authStore';
import { useRelationStore } from '../../store/relationStore';
import { getErrorMessage } from '../../utils/error';
import { Alert } from '../../utils/alert';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';
import type { PuzzleBattleEvent, PuzzleBattleGame, PuzzleBattleRun } from '../../types';
import {
  type Board,
  type ItemCode,
  type LockOutcome,
  type Move,
  type PlayerState,
  type TimelineMove,
  ITEM_NONE,
  MAX_ITEMS,
  VISIBLE_HEIGHT,
  WIDTH,
  applyHandicap,
  createPlayer,
  decodeBoard,
  describeMove,
  dropToBottom,
  encodeBoard,
  encodeTimeline,
  ghostItems,
  ghostSchedule,
  hardDrop,
  itemOf,
  moveLeft,
  moveRight,
  receiveGarbage,
  rotate,
  softDrop,
  applyItem,
} from '../../games/puyo';

type Props = NativeStackScreenProps<HomeStackParamList, 'Puyo'>;

/** 중력 — 이 간격마다 한 칸 내려간다 */
const GRAVITY_MS = 800;
/** 연출 — 터지는 프레임 · 떨어지는 프레임 */
const CLEAR_FLASH_MS = 260;
const GRAVITY_FRAME_MS = 160;
/** 끌기 — 이만큼 움직이면 "끌었다"로 보고 탭(회전)으로 치지 않는다. 방향도 이때 정한다 */
const DRAG_DEAD_ZONE = 10;
/**
 * 아래로 튕기기 — 이 속도(px/ms)를 넘으면 바로 떨어뜨린다.
 * <p>예전엔 "가로로 8px 이상 움직이지 않은 채 아래로 56px" 여야 했다 — 엄지로 쓸면 손가락이 조금만 옆으로
 * 흘러도 가로 끌기로 판정돼 떨어지지 않았다("한번에 쭉쭉 내리는 게 잘 안 먹힌다", 2026-09-30).
 * 이제 처음 움직인 방향이 세로면 세로 조작이고, 빠르게 튕기면 떨어지고 천천히 끌면 손가락을 따라 내려온다.
 */
const FLICK_VY = 0.7;
/** 세로로 판정된 뒤 이만큼 내려가면(속도와 무관) 바로 떨어뜨린다 — 짧게 툭 쓸어도 먹게 */
const SWIPE_DOWN_DY = 40;
/**
 * 옆으로 끌 때 한 열로 치는 거리 — 칸 폭의 이만큼. 칸 폭 그대로(손가락 아래 열을 따라가게)였을 땐 판이 커질수록
 * 엄지를 멀리 끌어야 해서 둔했다(2026-09-30 실기기). 대신 최소 거리를 둬 작은 판에서 손떨림에 튀지 않게 한다.
 */
const DRAG_COL_RATIO = 0.6;
const DRAG_COL_MIN = 22;
/** 판 테두리 등 칸 밖 여유 — 잰 자리에서 뺀다 */
const BOARD_FRAME = 4;
/** 결과 제출 재시도 — 서버 재배포 중(502)·잠깐 끊김에도 결과가 사라지지 않게 */
const SUBMIT_RETRY_MS = [1500, 4000, 9000];
/** 아이템 알림이 떠 있는 시간 */
const ITEM_TOAST_MS = 1400;
/** 상대 미니 판의 칸 크기 */
const MINI_CELL = 9;

const BEST_KEY = 'doubly.puyoBest';

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

type Phase = 'IDLE' | 'PLAYING' | 'ANIMATING' | 'OVER';
type Mode = 'SOLO' | 'BATTLE';

/** 상대 패널에 보이는 것 — 라이브면 이벤트로, 고스트면 상대의 결과로 채운다 */
interface OpponentView {
  name: string;
  board: Board | null;
  score: number;
  maxChain: number;
  pending: number;
  lost: boolean;
  ghost: boolean;
}

/**
 * 한 판의 대전 세션 — 입력·소켓·타이머 핸들러가 보는 값이라 렌더 상태와 별도로 든다.
 * 렌더에 필요한 건 {@code opponent}/{@code battle} 상태로 따로 올린다.
 */
interface BattleSession {
  gameId: number;
  relationId: number;
  startAt: number;
  seq: number;
  timeline: TimelineMove[];
  /** 내가 받는 방해의 백분율 */
  handicap: number;
  ghostTimers: ReturnType<typeof setTimeout>[];
  /** 결과를 냈거나 내는 중 — 두 번 내지 않는다 */
  finished: boolean;
  /**
   * 다음 착지 때 기보에 적을 아이템(§13). 아이템은 착지 사이에 쓰이므로 쓴 즉시 여기 담아
   * 두었다가 그 수에 실어 보낸다 — 기보가 수 단위라 칸이 그때 생긴다.
   */
  pendingItem: ItemCode;
}

/**
 * 입력 처리가 보는 "지금" 상태 — 중력 타이머·PanResponder·키보드 핸들러가 옛 클로저를 들지
 * 않게 렌더 상태와 별도로 든다. 화면은 한 번에 하나만 떠 있으므로 모듈 변수로 충분하다
 * (SudokuScreen 의 moveSeq 와 같은 판단 — ref 로 두면 react-hooks/refs 가 렌더 중 접근으로 오탐한다).
 * 마운트 때 초기화한다.
 */
let live: PlayerState | null = null;
let livePhase: Phase = 'IDLE';
let session: BattleSession | null = null;
/** 방금 착지한 조각 — 기보에 적을 값. 착지 직전에 갱신된다 */
let lastLocked: Move = { col: 0, rot: 0, axis: 1, child: 1 };
/** 연출용 setTimeout 들 — 새 판을 열거나 화면을 나갈 때 전부 거둔다(같은 이유로 모듈 변수) */
let animationTimers: ReturnType<typeof setTimeout>[] = [];

function clearAnimationTimers(): void {
  animationTimers.forEach(clearTimeout);
  animationTimers = [];
}

function clearSession(): void {
  session?.ghostTimers.forEach(clearTimeout);
  session = null;
}

export function PuyoScreen({ navigation }: Props) {
  const width = useContentWidth();
  const { height } = useWindowDimensions();
  const relationId = useRelationStore((s) => s.couple?.id);
  const myId = useAuthStore((s) => s.user?.id);

  const [phase, setPhase] = useState<Phase>('IDLE');
  const [mode, setMode] = useState<Mode>('SOLO');
  const [best, setBest] = useState<Best | null>(null);
  /** 엔진 상태 — 렌더용. 입력 처리는 모듈 변수 live 를 본다 */
  const [state, setState] = useState<PlayerState | null>(null);
  /** 연출 중에 보여줄 판 — null 이면 엔진 판을 그대로 */
  const [shownBoard, setShownBoard] = useState<Board | null>(null);
  const [flashing, setFlashing] = useState<Set<number>>(() => new Set());
  const [chainLabel, setChainLabel] = useState<string | null>(null);
  /** 이번 연쇄 단계에서 얻은 점수 — 연쇄 배지 아래에 잠깐 */
  const [chainScore, setChainScore] = useState<number | null>(null);
  /** 터짐 연출을 다시 트는 값 — 연쇄 단계마다 올린다 */
  const [burstKey, setBurstKey] = useState(0);
  /** 큰 연쇄의 판 흔들림 */
  const [shake] = useState(() => new Animated.Value(0));
  /** 방금 얻은 아이템 · 상대가 쓴 아이템 — 잠깐 떴다 사라지는 알림 */
  const [itemToast, setItemToast] = useState<string | null>(null);
  /** 서버가 아는 대전 판 — 허브 카드와 같은 값. 시작 전 안내와 끝난 뒤 결과가 여기서 나온다 */
  const [battle, setBattle] = useState<PuzzleBattleGame | null>(null);
  const [battleBusy, setBattleBusy] = useState(false);
  const [opponent, setOpponent] = useState<OpponentView | null>(null);
  /** 결과 제출이 실패했을 때 다시 보낼 값 — 판은 이미 끝났으므로 다시 둘 수는 없다 */
  const [pendingRun, setPendingRun] = useState<PuzzleBattleRun | null>(null);

  useEffect(() => {
    live = null;
    livePhase = 'IDLE';
    loadBest().then(setBest);
    return () => {
      clearAnimationTimers();
      clearSession();
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

  /* ─── 서버의 대전 판 ─── */
  const loadBattle = useCallback(async () => {
    if (!relationId) return;
    try {
      setBattle(await puzzleApi.current());
    } catch {
      // 카드 없이도 혼자 연습은 되니 화면을 막지 않는다
    }
  }, [relationId]);

  useFocusEffect(
    useCallback(() => {
      void loadBattle();
    }, [loadBattle]),
  );

  /*
   * 판 크기 — 판이 앉을 자리(boardArea)를 직접 재서 맞춘다. 2026-09-30 까지는 "창 높이 − 300" 으로 어림했는데,
   * 창 높이에는 헤더·하단 탭 바·안전 영역이 다 들어 있어 판이 탭 바 밑으로 파고들고 버튼 줄이 가려졌다.
   * 재기 전 첫 프레임만 어림값을 쓴다.
   */
  const [boardArea, setBoardArea] = useState<{ w: number; h: number } | null>(null);
  const cell = useMemo(() => {
    const byWidth = Math.floor((width - spacing.lg * 2) / WIDTH);
    const byHeight = boardArea
      ? Math.floor((boardArea.h - BOARD_FRAME) / VISIBLE_HEIGHT)
      : Math.floor((height - (mode === 'BATTLE' ? 420 + MINI_CELL * VISIBLE_HEIGHT : 420)) / VISIBLE_HEIGHT);
    // 큰 화면(태블릿·폴드)에서 판이 작게 떠 있지 않게 상한을 넉넉히 — 폰은 대개 높이가 먼저 막는다
    return Math.max(18, Math.min(byWidth, byHeight, 60));
  }, [width, height, mode, boardArea]);
  const onBoardAreaLayout = useCallback((e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    setBoardArea((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
  }, []);
  const boardW = cell * WIDTH;

  /* ─── 대전: 결과 제출 ─── */
  const submitRun = useCallback(
    async (run: PuzzleBattleRun) => {
      const s = session;
      if (!s) return;
      setBattleBusy(true);
      try {
        const updated = await finishWithRetry(s.gameId, run);
        setBattle(updated);
        setPendingRun(null);
        if (updated.status === 'COMPLETED') {
          if (updated.winner === 'ME') haptics.success();
        } else {
          toast.info('결과를 보냈어요. 상대가 마치면 채팅으로 알려드릴게요.');
        }
      } catch (e) {
        setPendingRun(run);
        toast.error(getErrorMessage(e, '결과를 보내지 못했어요.'));
      } finally {
        setBattleBusy(false);
      }
    },
    [],
  );

  /** 내 판이 끝났다 — 죽었거나(lost) 상대가 먼저 끝나 살아남았거나 */
  const endBattle = useCallback(
    (final: PlayerState, lost: boolean, survivedMs: number) => {
      const s = session;
      if (!s || s.finished) return;
      s.finished = true;
      s.ghostTimers.forEach(clearTimeout);
      s.ghostTimers = [];
      void submitRun({
        score: final.score,
        maxChain: final.maxChain,
        survivedMs: Math.max(0, Math.round(survivedMs)),
        lost,
        timeline: encodeTimeline(s.timeline),
      });
    },
    [submitRun],
  );

  const finish = useCallback(
    (final: PlayerState) => {
      setPhaseBoth('OVER');
      haptics.medium();
      const candidate: Best = { score: final.score, maxChain: final.maxChain };
      if (!best || candidate.score > best.score || (candidate.score === best.score && candidate.maxChain > best.maxChain)) {
        setBest(candidate);
        void saveBest(candidate);
      }
      if (session) endBattle(final, true, Date.now() - session.startAt);
    },
    [best, setPhaseBoth, endBattle],
  );

  /** 상대가 끝났다(라이브 이벤트의 lost, 또는 고스트 기록의 끝) — 내가 살아 있으면 이긴 것 */
  const onOpponentEnded = useCallback(
    (atMs: number) => {
      const s = session;
      if (!s || s.finished) return;
      if (!live || live.status !== 'PLAYING') return;
      clearAnimationTimers();
      setShownBoard(null);
      setFlashing(new Set());
      setChainLabel(null);
      setPhaseBoth('OVER');
      setOpponent((o) => (o ? { ...o, lost: true } : o));
      endBattle(live, false, atMs);
    },
    [setPhaseBoth, endBattle],
  );

  /** 방해 수신 — 라이브와 고스트가 같은 길로 들어온다. 핸디캡은 받는 쪽이 곱한다(§2-7) */
  const receive = useCallback(
    (amount: number) => {
      const s = session;
      if (!s || s.finished || !live || live.status !== 'PLAYING') return;
      const applied = applyHandicap(amount, s.handicap);
      if (applied <= 0) return;
      commit(receiveGarbage(live, applied));
      haptics.light();
    },
    [commit],
  );

  /** 잠깐 뜨는 알림 한 줄 — 아이템 획득·상대의 아이템 사용이 같은 자리를 쓴다 */
  const flashItemToast = useCallback((message: string) => {
    setItemToast(message);
    animationTimers.push(setTimeout(() => setItemToast((cur) => (cur === message ? null : cur)), ITEM_TOAST_MS));
  }, []);

  /** 상대가 아이템을 썼다 — 라이브 이벤트와 고스트 재생이 같은 길로 들어온다(§13-3) */
  const showOpponentItem = useCallback(
    (item: ItemCode) => {
      const def = itemOf(item);
      if (!def) return;
      const s = session;
      if (!s || s.finished) return;
      flashItemToast(`${def.emoji} 상대가 ${def.label}을 썼어요`);
      haptics.medium();
    },
    [flashItemToast],
  );

  /** 내 아이템 사용 — 효과는 엔진이 내고, 화면은 연출과 기보 기록만 한다 */
  const onUseItem = useCallback(
    (index: number) => {
      if (livePhase !== 'PLAYING' || !live) return;
      const { state: next, used, cleared } = applyItem(live, index);
      if (used === ITEM_NONE) return;
      commit(next);
      haptics.medium();
      const def = itemOf(used);
      if (def) flashItemToast(`${def.emoji} ${def.label}!`);
      // 지우개는 즉시 판이 바뀐다 — 지워진 칸을 한 번 번쩍이고 엔진 판으로 돌아간다
      if (cleared.length > 0) {
        setFlashing(new Set(cleared));
        animationTimers.push(setTimeout(() => setFlashing(new Set()), CLEAR_FLASH_MS));
      }
      // 기보·중계는 수 단위라 다음 착지에 실어 보낸다
      if (session) session.pendingItem = used;
    },
    [commit, flashItemToast],
  );

  /**
   * 착지 결과 재생 — 착지 판 → (터짐 → 낙하)* → 방해 투입 → 다음 조각.
   * 연쇄가 없으면 바로 다음 조각으로 간다(연출 없이). 대전이면 기보에 적고 상대에게 흘린다 —
   * 연출과 무관하게 <b>착지 시점에</b> 보낸다(상대는 결과 판만 본다, §2-5).
   */
  const playOutcome = useCallback(
    (outcome: LockOutcome) => {
      const s = session;
      if (s && !s.finished && live) {
        const elapsedMs = Date.now() - s.startAt;
        // 기보의 수는 방금 착지한 조각(lastLocked)이다 — outcome.state.piece 는 이미 다음 조각이다
        s.timeline.push({
          ms: elapsedMs,
          col: lastLocked.col,
          rot: lastLocked.rot,
          axis: lastLocked.axis,
          child: lastLocked.child,
          sent: outcome.garbageSent,
          received: outcome.garbageDropped.length,
          item: s.pendingItem,
        });
        s.seq += 1;
        publishGameEvent(s.relationId, {
          gameId: s.gameId,
          seq: s.seq,
          elapsedMs,
          board: encodeBoard(outcome.state.board),
          garbageSent: outcome.garbageSent,
          pendingGarbage: outcome.state.pendingGarbage,
          score: outcome.state.score,
          maxChain: outcome.state.maxChain,
          lost: outcome.lost,
          item: s.pendingItem,
        });
        s.pendingItem = ITEM_NONE;
      }

      const after = () => {
        setShownBoard(null);
        setFlashing(new Set());
        setChainLabel(null);
        setChainScore(null);
        if (outcome.gainedItem !== ITEM_NONE) {
          const def = itemOf(outcome.gainedItem);
          if (def) flashItemToast(`${def.emoji} ${def.label} 획득!`);
        }
        if (outcome.lost) finish(outcome.state);
        else if (livePhase === 'ANIMATING') setPhaseBoth('PLAYING');
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
          setBurstKey((k) => k + 1);
          setChainLabel(step.chain >= 2 ? `${step.chain}연쇄!` : null);
          setChainScore(step.score > 0 ? step.score : null);
          if (step.chain >= 3) {
            haptics.medium();
            shakeBoard(shake, step.chain);
          } else haptics.light();
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
    [finish, setPhaseBoth, flashItemToast, shake],
  );

  const resetView = useCallback(() => {
    clearAnimationTimers();
    setShownBoard(null);
    setFlashing(new Set());
    setChainLabel(null);
    setPendingRun(null);
  }, []);

  /* ─── 시작: 혼자 ─── */
  const startSolo = useCallback(() => {
    resetView();
    clearSession();
    setOpponent(null);
    setMode('SOLO');
    commit(createPlayer(Date.now() % 2147483647));
    setPhaseBoth('PLAYING');
    haptics.light();
  }, [commit, resetView, setPhaseBoth]);

  /* ─── 시작: 대전(라이브 또는 고스트) ─── */
  const startBattle = useCallback(async () => {
    if (!relationId || battleBusy) return;
    setBattleBusy(true);
    try {
      const g = battle && !battle.me && battle.status === 'IN_PROGRESS' ? battle : await puzzleApi.start();
      setBattle(g);
      if (g.me) {
        toast.info('이 판의 결과는 이미 냈어요. 상대를 기다리는 중이에요.');
        return;
      }
      resetView();
      clearSession();
      const startAt = Date.now();
      const s: BattleSession = {
        gameId: g.id,
        relationId,
        startAt,
        seq: 0,
        timeline: [],
        handicap: g.myHandicap,
        ghostTimers: [],
        finished: false,
        pendingItem: ITEM_NONE,
      };
      session = s;
      const partnerName = g.partnerName ?? '상대';
      if (g.partner) {
        // 고스트 — 상대 기보의 방해를 같은 시각에 흘리고, 상대가 죽은 시각에 내가 살아 있으면 끝난다
        for (const { ms, amount } of ghostSchedule(g.partner.timeline)) {
          s.ghostTimers.push(setTimeout(() => receive(amount), ms));
        }
        // 상대가 아이템을 쓴 순간도 같은 방식으로 재생한다 — 고스트에서도 "쏘는" 게 보인다(§13-3)
        for (const { ms, item } of ghostItems(g.partner.timeline)) {
          s.ghostTimers.push(setTimeout(() => showOpponentItem(item), ms));
        }
        if (g.partner.lost) {
          const at = g.partner.survivedMs;
          s.ghostTimers.push(setTimeout(() => onOpponentEnded(at), at));
        }
        setOpponent({
          name: partnerName,
          board: null,
          score: g.partner.score,
          maxChain: g.partner.maxChain,
          pending: 0,
          lost: false,
          ghost: true,
        });
      } else {
        setOpponent({ name: partnerName, board: null, score: 0, maxChain: 0, pending: 0, lost: false, ghost: false });
      }
      setMode('BATTLE');
      commit(createPlayer(g.seed));
      setPhaseBoth('PLAYING');
      haptics.light();
    } catch (e) {
      toast.error(getErrorMessage(e, '대전 판을 열지 못했어요.'));
    } finally {
      setBattleBusy(false);
    }
  }, [relationId, battleBusy, battle, resetView, commit, setPhaseBoth, receive, onOpponentEnded, showOpponentItem]);

  const giveUpBattle = useCallback(() => {
    const id = battle?.id;
    if (!id) return;
    Alert.alert('이 판을 접을까요?', '접은 판은 기록에 남지 않고, 상대에게도 알려요.', [
      { text: '계속 하기', style: 'cancel' },
      {
        text: '접기',
        style: 'destructive',
        onPress: async () => {
          try {
            await puzzleApi.giveUp(id);
            clearSession();
            resetView();
            setOpponent(null);
            setPhaseBoth('IDLE');
            setMode('SOLO');
            setBattle(null);
          } catch (e) {
            toast.error(getErrorMessage(e, '접지 못했어요.'));
          }
        },
      },
    ]);
  }, [battle, resetView, setPhaseBoth]);

  /* ─── 소켓: 상대의 수(라이브) + 커플 이벤트(상대가 결과를 냄) ─── */
  useFocusEffect(
    useCallback(() => {
      if (!relationId) return undefined;
      let active = true;
      let offCouple: (() => void) | undefined;
      connectSocket()
        .then(() => {
          if (!active) return;
          subscribeGames(relationId, (e: PuzzleBattleEvent) => {
            const s = session;
            if (!s || e.senderId === myId || e.gameId !== s.gameId) return;
            let board: Board | null = null;
            try {
              board = decodeBoard(e.board);
            } catch {
              board = null;
            }
            setOpponent((o) => ({
              name: o?.name ?? '상대',
              board,
              score: e.score,
              maxChain: e.maxChain,
              pending: e.pendingGarbage,
              lost: e.lost,
              ghost: false,
            }));
            if (e.garbageSent > 0) receive(e.garbageSent);
            if (e.item > 0) showOpponentItem(e.item as ItemCode);
            if (e.lost) onOpponentEnded(e.elapsedMs);
          });
          offCouple = subscribeCouple(relationId, (type) => {
            if (type === 'GAME' && livePhase !== 'PLAYING' && livePhase !== 'ANIMATING') void loadBattle();
          });
        })
        .catch(() => undefined);
      return () => {
        active = false;
        unsubscribeGames(relationId);
        offCouple?.();
      };
    }, [relationId, myId, receive, onOpponentEnded, showOpponentItem, loadBattle]),
  );

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
    const before = (live as PlayerState).piece;
    const { state: next, locked } = softDrop(live as PlayerState);
    commit(next);
    if (locked) {
      if (before) lastLocked = describeMove(before);
      playOutcome(locked);
    }
  }, [commit, playOutcome]);

  const onHardDrop = useCallback(() => {
    if (!canAct()) return;
    const current = live as PlayerState;
    const landed = current.piece ? dropToBottom(current.board, current.piece) : null;
    if (landed) lastLocked = describeMove(landed);
    const outcome = hardDrop(current);
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
    const cur = { appliedCols: 0, appliedRows: 0, axis: null as 'h' | 'v' | null, done: false, moves: 0 };
    /** 이 터치 동안 조각이 착지했나 — 착지 뒤에 끌기를 이어 가면 다음 조각이 딸려 내려온다 */
    const landed = () => (live?.moves ?? 0) !== cur.moves;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        cur.appliedCols = 0;
        cur.appliedRows = 0;
        cur.axis = null;
        cur.done = false;
        cur.moves = live?.moves ?? 0;
      },
      onPanResponderMove: (_e, g) => {
        if (cur.done) return;
        if (cur.axis === null) {
          if (Math.abs(g.dx) < DRAG_DEAD_ZONE && Math.abs(g.dy) < DRAG_DEAD_ZONE) return;
          // 처음 움직인 방향으로 정한다 — 아래로 쓸다 옆으로 조금 흘러도 세로로 남는다
          cur.axis = g.dy > Math.abs(g.dx) ? 'v' : 'h';
        }
        if (cur.axis === 'h') {
          // 옆으로 옮기다 그대로 아래로 튕기면 떨어뜨린다 — 예전엔 가로로 정해지면 손을 떼고 다시 쓸어야 했다
          if (g.vy > FLICK_VY && g.vy > Math.abs(g.vx) * 1.5 && g.dy > cell) {
            cur.done = true;
            onHardDrop();
            return;
          }
          const step = Math.max(DRAG_COL_MIN, cell * DRAG_COL_RATIO);
          const target = Math.round(g.dx / step);
          while (cur.appliedCols < target) {
            onRight();
            cur.appliedCols++;
          }
          while (cur.appliedCols > target) {
            onLeft();
            cur.appliedCols--;
          }
          return;
        }
        // 세로: 빠르게 튕기거나 충분히 쓸었으면 바로 떨어뜨리고, 아니면 손가락을 따라 한 칸씩
        if (g.vy > FLICK_VY || g.dy > SWIPE_DOWN_DY + cell) {
          cur.done = true;
          onHardDrop();
          return;
        }
        const rows = Math.floor(g.dy / cell);
        while (cur.appliedRows < rows && !landed()) {
          onSoftDrop();
          cur.appliedRows++;
        }
        if (landed()) cur.done = true;
      },
      onPanResponderRelease: (_e, g) => {
        if (cur.done) return;
        if (cur.axis === null) {
          onRotate();
          return;
        }
        // 짧게 툭 쓸고 뗀 경우 — 움직일 때 속도를 못 넘었어도 떼는 순간 아래로 향했으면 떨어뜨린다
        if (cur.axis === 'v' && !landed() && (g.vy > FLICK_VY * 0.6 || g.dy > SWIPE_DOWN_DY)) onHardDrop();
      },
    });
  }, [cell, onLeft, onRight, onRotate, onSoftDrop, onHardDrop]);

  /* ─── 그리기 ─── */
  const board = shownBoard ?? state?.board ?? null;
  const piece = phase === 'PLAYING' ? state?.piece ?? null : null;
  const ghost = piece && state ? dropToBottom(state.board, piece) : null;
  const inBattle = mode === 'BATTLE';
  const playing = phase === 'PLAYING' || phase === 'ANIMATING';

  const renderNext = () =>
    state?.next.map((pair, i) => (
      <View key={i} style={[styles.nextPair, i > 0 && styles.nextPairDim]}>
        <View style={[styles.nextDot, { backgroundColor: PIECE_COLORS[pair[1]] }]} />
        <View style={[styles.nextDot, { backgroundColor: PIECE_COLORS[pair[0]] }]} />
      </View>
    ));

  /**
   * 아이템 슬롯(§13) — 폭탄은 지금 조각을 바꾸므로 조각이 없으면(연출 중) 눌러도 안 먹는다.
   * 빈 칸도 자리를 잡아 둔다 — 아이템이 생길 때마다 판이 위아래로 흔들리지 않게.
   */
  const renderItems = () => {
    if (!state) return null;
    const slots: React.ReactNode[] = [];
    for (let i = 0; i < MAX_ITEMS; i++) {
      const code = state.items[i];
      const def = code === undefined ? undefined : itemOf(code);
      slots.push(
        <Pressable
          key={i}
          onPress={() => onUseItem(i)}
          disabled={!def || phase !== 'PLAYING'}
          accessibilityRole="button"
          accessibilityLabel={def ? `${def.label} 쓰기. ${def.effect}` : '빈 아이템 칸'}
          style={({ pressed }) => [
            styles.itemSlot,
            def && styles.itemSlotFilled,
            pressed && def && styles.pressed,
          ]}
        >
          <Text style={[styles.itemEmoji, !def && styles.itemEmojiEmpty]}>{def ? def.emoji : '·'}</Text>
        </Pressable>,
      );
    }
    return (
      <View style={[styles.itemRow, { width: boardW }]}>
        {slots}
        <View style={styles.itemHintBox}>
          {state.doubleNext ? (
            <Text style={styles.itemHintOn}>⚡ 다음 공격 2배</Text>
          ) : (
            <Text style={styles.itemHint}>연쇄·상쇄로 아이템을 모아요</Text>
          )}
        </View>
      </View>
    );
  };

  const renderOpponent = () => {
    if (!inBattle || !opponent) return null;
    const status = opponent.lost
      ? '판이 가득 찼어요'
      : opponent.ghost
        ? '기록 재생 중'
        : opponent.board
          ? '플레이 중'
          : '아직 안 들어왔어요';
    return (
      <View style={[styles.opponent, { width: boardW }]}>
        <PuyoBoard board={opponent.board} cell={MINI_CELL} dim={opponent.lost} />
        <View style={styles.opponentBody}>
          <Text style={styles.opponentName}>
            {opponent.name}
            {opponent.ghost ? ' · 고스트' : ''}
          </Text>
          <Text style={styles.opponentLine}>
            {opponent.score}점 · {opponent.maxChain}연쇄
          </Text>
          <Text style={styles.opponentLine}>{status}</Text>
          {opponent.pending > 0 ? <Text style={styles.opponentPending}>대기 방해 {opponent.pending}</Text> : null}
          {state && state.pendingGarbage > 0 ? (
            <Text style={styles.myPending}>내 대기 방해 {state.pendingGarbage} — 연쇄로 상쇄!</Text>
          ) : null}
          {battle && battle.myHandicap !== 100 ? (
            <Text style={styles.handicap}>내 핸디캡 · 받는 방해 {battle.myHandicap}%</Text>
          ) : null}
        </View>
      </View>
    );
  };

  const renderOverlay = () => {
    if (phase !== 'IDLE' && phase !== 'OVER') return null;
    const partnerName = battle?.partnerName ?? '상대';

    if (phase === 'OVER' && state) {
      const result = inBattle ? battle : null;
      const title = !inBattle
        ? '판이 가득 찼어요'
        : result?.status === 'COMPLETED'
          ? result.winner === 'ME'
            ? '이겼어요! 🎉'
            : result.winner === 'DRAW'
              ? '무승부'
              : '졌어요'
          : state.status === 'LOST'
            ? '판이 가득 찼어요'
            : `${partnerName}보다 오래 버텼어요!`;
      return (
        <View style={styles.overlay}>
          <Text style={styles.overlayTitle}>{title}</Text>
          <Text style={styles.overlayScore}>{state.score}점</Text>
          <Text style={styles.overlayDesc}>
            최고 {state.maxChain}연쇄 · {state.moves}수
          </Text>
          {inBattle && result?.status === 'COMPLETED' && result.partner ? (
            <Text style={styles.overlayDesc}>
              {partnerName} {result.partner.score}점 · {result.partner.maxChain}연쇄
            </Text>
          ) : null}
          {inBattle && result?.status !== 'COMPLETED' && !pendingRun ? (
            <Text style={styles.overlayBest}>
              {battleBusy ? '결과를 보내는 중…' : `${partnerName}가 마치면 채팅으로 결과가 와요`}
            </Text>
          ) : null}
          {pendingRun ? (
            <Button
              title="결과 다시 보내기"
              size="md"
              loading={battleBusy}
              onPress={() => submitRun(pendingRun)}
              style={styles.overlayBtn}
            />
          ) : null}
          {!inBattle && best ? (
            <Text style={styles.overlayBest}>
              내 기록 {best.score}점 · {best.maxChain}연쇄
            </Text>
          ) : null}
          <Button title="혼자 한 판 더" size="md" variant={inBattle ? 'secondary' : 'primary'} onPress={startSolo} style={styles.overlayBtn} />
          {relationId && !pendingRun ? (
            <Button
              title={battle && battle.status === 'IN_PROGRESS' && battle.me ? '허브로' : '커플 대전'}
              size="md"
              variant="ghost"
              onPress={() => {
                if (battle && battle.status === 'IN_PROGRESS' && battle.me) navigation.goBack();
                else void startBattle();
              }}
              style={styles.overlayBtnSmall}
            />
          ) : null}
        </View>
      );
    }

    // IDLE — 무엇을 할지 고른다. 서버의 대전 판 상태에 따라 안내가 달라진다
    let battleTitle = '커플 대전';
    let battleDesc: string | null = null;
    let battleDisabled = false;
    if (relationId && battle && battle.status === 'IN_PROGRESS') {
      if (battle.me) {
        battleTitle = '상대를 기다리는 중';
        battleDesc = `내 결과(${battle.me.score}점 · ${battle.me.maxChain}연쇄)는 냈어요. ${partnerName}가 마치면 채팅으로 결과가 와요.`;
        battleDisabled = true;
      } else if (battle.partner) {
        battleTitle = '고스트 대전 시작';
        battleDesc = `${partnerName}의 기록(${battle.partner.score}점 · ${battle.partner.maxChain}연쇄)에 도전해요. 그때 보낸 방해가 같은 시각에 날아와요.`;
      } else {
        battleTitle = '대전 시작';
        battleDesc = `${partnerName}가 지금 들어오면 라이브, 아니면 내 기록이 상대의 고스트가 돼요.`;
      }
    }
    return (
      <View style={styles.overlay}>
        <Text style={styles.overlayTitle}>연쇄 퍼즐</Text>
        <Text style={styles.overlayDesc}>
          같은 색 4개를 붙이면 사라져요.{'\n'}위의 조각이 내려오며 또 터지면 연쇄!
        </Text>
        {best ? (
          <Text style={styles.overlayBest}>
            내 기록 {best.score}점 · {best.maxChain}연쇄
          </Text>
        ) : null}
        <Button title="혼자 연습" size="md" variant={relationId ? 'secondary' : 'primary'} onPress={startSolo} style={styles.overlayBtn} />
        {relationId ? (
          <>
            <Button
              title={battleTitle}
              size="md"
              loading={battleBusy}
              disabled={battleDisabled}
              onPress={() => void startBattle()}
              style={styles.overlayBtn}
            />
            {battleDesc ? <Text style={styles.overlayHint}>{battleDesc}</Text> : null}
            {/* 내 결과는 냈고 상대를 기다리는 중 — 도전장 푸시는 판을 열 때 한 번뿐이었다 */}
            {battle && battle.status === 'IN_PROGRESS' && battle.me && !battle.partner ? (
              <GameNudgeButton gameId={battle.id} partnerName={battle.partnerName} />
            ) : null}
            {battle && battle.status === 'IN_PROGRESS' && battle.myHandicap !== 100 ? (
              <Text style={styles.handicap}>내 핸디캡 · 받는 방해 {battle.myHandicap}%</Text>
            ) : null}
            {battle && battle.status === 'IN_PROGRESS' ? (
              <Pressable onPress={giveUpBattle} accessibilityRole="button" hitSlop={8}>
                <Text style={styles.link}>이 판 접기</Text>
              </Pressable>
            ) : null}
          </>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.body}>
        {renderOpponent()}

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

        <View style={styles.boardArea} onLayout={onBoardAreaLayout}>
        <Animated.View style={{ transform: [{ translateX: shake }] }}>
        <PuyoBoard
          board={board}
          cell={cell}
          piece={piece}
          ghost={ghost}
          flashing={flashing}
          burstKey={burstKey}
          containerProps={phase === 'PLAYING' ? pan.panHandlers : undefined}
          accessibilityLabel="퍼즐 판. 좌우로 끌면 이동, 탭하면 회전, 아래로 쓸면 떨어져요"
        >
          {chainLabel || chainScore ? <ChainBadge key={burstKey} label={chainLabel} score={chainScore} /> : null}
          {itemToast ? (
            <View style={styles.itemToast} pointerEvents="none">
              <Text style={styles.itemToastText}>{itemToast}</Text>
            </View>
          ) : null}
          {renderOverlay()}
        </PuyoBoard>
        </Animated.View>
        </View>

        {renderItems()}

        <View style={[styles.controls, { width: boardW }]}>
          <ControlButton icon="chevron-left" label="왼쪽" onPress={onLeft} disabled={phase !== 'PLAYING'} />
          <ControlButton icon="restart" label="회전" onPress={onRotate} disabled={phase !== 'PLAYING'} />
          <ControlButton icon="chevron-right" label="오른쪽" onPress={onRight} disabled={phase !== 'PLAYING'} />
          <ControlButton icon="chevron-down" label="떨어뜨리기" onPress={onHardDrop} disabled={phase !== 'PLAYING'} />
        </View>

        {inBattle && playing ? (
          <Pressable onPress={giveUpBattle} accessibilityRole="button" hitSlop={8} style={styles.giveUp}>
            <Text style={styles.link}>이 판 접기</Text>
          </Pressable>
        ) : (
          <Text style={styles.footnote}>
            {Platform.OS === 'web'
              ? '방향키로 이동·회전, 스페이스로 바로 떨어뜨려요.'
              : '판을 좌우로 끌면 이동, 탭하면 회전, 아래로 쓸면 바로 떨어져요.'}
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
}

/** 방금 착지한 조각은 위의 모듈 변수 lastLocked 에 있다 */

/**
 * 결과 제출 — 잠깐 끊겼거나 서버가 재배포 중이면(502·503·네트워크) 몇 번 더 보낸다.
 * <p>2026-09-30 실제로 났다: 백엔드 재배포 30초 사이에 제출이 502 를 받아 "결과를 보내지 못했어요".
 * 결과는 판이 끝난 순간의 값이라 다시 만들 수 없으므로, 사용자가 누르기 전에 조용히 재시도한다.
 * 4xx(이미 냈음 등)는 재시도해도 같으니 바로 올린다.
 */
async function finishWithRetry(gameId: number, run: PuzzleBattleRun): Promise<PuzzleBattleGame> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= SUBMIT_RETRY_MS.length; attempt++) {
    try {
      return await puzzleApi.finish(gameId, run);
    } catch (e) {
      lastError = e;
      const status = (e as { status?: number } | null)?.status ?? 0;
      const retryable = status === 0 || status === 502 || status === 503 || status === 504;
      if (!retryable || attempt === SUBMIT_RETRY_MS.length) break;
      await new Promise((r) => setTimeout(r, SUBMIT_RETRY_MS[attempt]));
    }
  }
  throw lastError;
}

/** 큰 연쇄의 판 흔들림 — 연쇄가 클수록 조금 더 세게(상한 있음) */
function shakeBoard(v: Animated.Value, chain: number): void {
  const a = Math.min(10, 3 + chain * 1.5);
  v.setValue(0);
  Animated.sequence([
    Animated.timing(v, { toValue: a, duration: 40, useNativeDriver: true }),
    Animated.timing(v, { toValue: -a, duration: 60, useNativeDriver: true }),
    Animated.timing(v, { toValue: a * 0.5, duration: 50, useNativeDriver: true }),
    Animated.timing(v, { toValue: 0, duration: 50, useNativeDriver: true }),
  ]).start();
}

/** 연쇄 배지 — 튀어나오며 커지고, 얻은 점수가 위로 떠오른다. key 로 단계마다 새로 재생된다 */
function ChainBadge({ label, score }: { label: string | null; score: number | null }) {
  const [pop] = useState(() => new Animated.Value(0));
  const [rise] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.parallel([
      Animated.spring(pop, { toValue: 1, friction: 4, tension: 180, useNativeDriver: true }),
      Animated.timing(rise, { toValue: 1, duration: 520, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [pop, rise]);
  return (
    <View style={styles.chainWrap} pointerEvents="none">
      {label ? (
        <Animated.View
          style={[styles.chainBadge, { transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }]}
        >
          <Text style={styles.chainText}>{label}</Text>
        </Animated.View>
      ) : null}
      {score ? (
        <Animated.Text
          style={[
            styles.chainScore,
            {
              opacity: rise.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
              transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [0, -24] }) }],
            },
          ]}
        >
          +{score.toLocaleString()}
        </Animated.Text>
      ) : null}
    </View>
  );
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

  opponent: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  opponentBody: { flex: 1, gap: spacing.xxs },
  opponentName: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary },
  opponentLine: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700' },
  opponentPending: { fontSize: fontSize.caption, color: colors.danger, fontWeight: '800' },
  myPending: { fontSize: fontSize.caption, color: colors.danger, fontWeight: '800', marginTop: spacing.xs },
  handicap: { fontSize: fontSize.caption, color: colors.textPrimary, fontWeight: '800', marginTop: spacing.xs },

  chainWrap: {
    position: 'absolute',
    top: '34%',
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: spacing.xs,
  },
  chainScore: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  chainBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  chainText: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.white },

  itemToast: {
    position: 'absolute',
    top: '12%',
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  itemToastText: { fontSize: fontSize.caption, fontWeight: '800', color: colors.textPrimary },

  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  itemSlot: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemSlotFilled: { borderColor: colors.primary, backgroundColor: colors.surface },
  itemEmoji: { fontSize: fontSize.subtitle },
  itemEmojiEmpty: { color: colors.textMuted, fontSize: fontSize.body },
  itemHintBox: { flex: 1, alignItems: 'flex-end' },
  itemHint: { fontSize: fontSize.caption, color: colors.textMuted },
  itemHintOn: { fontSize: fontSize.caption, color: colors.primary, fontWeight: '800' },

  overlay: {
    ...({ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 } as const),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  overlayTitle: { fontSize: fontSize.title, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
  overlayScore: { fontSize: fontSize.heading, fontWeight: '800', color: colors.primary },
  overlayDesc: { fontSize: fontSize.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  overlayHint: { fontSize: fontSize.caption, color: colors.textMuted, textAlign: 'center', lineHeight: 18, paddingHorizontal: spacing.sm },
  overlayBest: { fontSize: fontSize.caption, color: colors.textMuted, fontWeight: '700', marginTop: spacing.xs, textAlign: 'center' },
  overlayBtn: { marginTop: spacing.sm, minWidth: 160 },
  overlayBtnSmall: { minWidth: 160 },
  link: { fontSize: fontSize.caption, color: colors.primary, fontWeight: '800' },
  giveUp: { marginTop: spacing.md },

  /* 헤더·버튼 줄을 뺀 나머지 전부 — 여기 크기를 재서 칸 크기를 정한다 */
  boardArea: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', minHeight: 0 },
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
