/**
 * 길막기 — 9×9 판에서 말을 반대편 끝줄까지 먼저 보내면 이긴다.
 * docs/PATH_LOCK_ANALYSIS_2026-09-21.md.
 *
 * <p>매 턴 <b>한 칸 이동</b> 또는 <b>벽 하나</b> 중 하나를 고른다. 벽은 길을 돌게 만들 수는
 * 있어도 막을 수는 없다 — 그 판정(BFS)은 서버에만 있다(§4-2 2번). 그래서 이 화면은 놓을 수
 * 없는 벽을 미리 흐리게 만들지 않고 <b>거절 메시지를 토스트로</b> 띄운다. 대신 말이 갈 수 있는
 * 자리는 서버가 {@code legalMoves} 로 내려주므로 점으로 찍는다.
 *
 * <p>벽은 칸이 아니라 <b>칸 사이</b>에 놓이고 한 번 놓으면 되돌릴 수 없는 자원이라, 탭 한 번에
 * 바로 놓지 않는다 — 교차점을 누르면 미리보기가 뜨고 한 번 더 눌러야 확정된다.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, PanResponder, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/types';
import { useContentWidth } from '../../hooks/useContentWidth';
import { GameNudgeButton } from '../../components/GameNudgeButton';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { GameReactionBar } from '../../components/GameReactionBar';
import { MaterialCommunityIcons } from '../../components/Icon';
import { wallRaceApi } from '../../api/game';
import { connectSocket, subscribeCouple } from '../../api/chatSocket';
import { useRelationStore } from '../../store/relationStore';
import { useAuthStore } from '../../store/authStore';
import { useCoupleEmojiStore } from '../../store/coupleEmojiStore';
import { getErrorMessage } from '../../utils/error';
import { relativeTimestampLabel } from '../../utils/date';
import { Alert } from '../../utils/alert';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { fontSize, radius, spacing } from '../../constants/theme';
import type { CoupleEmoji, GameRecord, WallRaceGame } from '../../types';
import { themedStyles } from '../../theme/themedStyles';
import { palettes } from '../../theme/palette';

type Props = NativeStackScreenProps<HomeStackParamList, 'WallRace'>;

const SIZE = 9;
const WALL_SIZE = SIZE - 1;

/*
 * 게임 화면 색 — 판을 두는 동안은 앱 테마와 상관없이 어두운 게임판이다(사용자가 보여 준 PathLock 화면, 2026-10-08).
 * 테마 토큰을 쓰지 않는 이유는 오목과 같다 — 라이트·다크 어느 쪽에서도 같은 판이어야 말과 벽이 읽힌다.
 */
const D_BG = '#0E0F13';
const D_CARD = '#1A1C24';
const D_LINE = '#2A2E3A';
const D_TEXT = '#E9EBF0';
const D_SUB = '#8D93A3';
const BOARD_BG = '#262A35'; // 칸 사이 홈 — 칸보다 밝아 격자선처럼 보인다
const CELL_BG = '#161922';
const BOARD_FRAME = '#3B3528';
const GROOVE = '#3A4050';
/** 주인을 모르는 벽(기보가 잘린 옛 판) — 내·상대 색 어느 쪽도 아닌 중립 */
const WALL_COLOR = '#B9C0CE';
/*
 * 말·목표줄은 소유자 색 — 판이 다크에서도 같은 밝은 판이라 <b>라이트 팔레트로 고정</b>한다.
 * 예전엔 나 파랑·상대 빨강 하드코딩이라 앱의 나(코랄)/상대(하늘)와 정반대였다(2026-10-05).
 * CELL_BG 위 대비: 나 4.90 · 상대 4.88.
 */
const PAWN_ME = palettes.light.me;
const PAWN_PARTNER = palettes.light.partner;
/** 목표 줄 — 어두운 판 위에 주인 색을 옅게 */
const GOAL_ME = withAlpha(PAWN_ME, 0.16);
const GOAL_PARTNER = withAlpha(PAWN_PARTNER, 0.16);

function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * 벽의 주인 — 기보를 처음부터 훑어 "누가 몇 번째 수에 놓았나"로 정한다. 선공은 판을 연 사람의 상대이므로
 * 짝수 번째 수가 상대 쪽이다(WallRaceGame.sideAt). 서버에 주인을 따로 저장하지 않아도 된다(V97 주석).
 * 기보가 잘린 옛 판은 일부 벽의 주인을 모른다 — 그 벽은 중립색으로 그린다.
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

/** 말 얼굴 — 그 사람의 우리 이모지 중 상황에 맞는 표정. 최신 세트부터 찾고, 없으면 그 사람 아무 표정이나 */
function pickFace(emojis: CoupleEmoji[], subjectId: number | undefined, prefs: string[]): string | null {
  if (subjectId == null) return null;
  const mine = emojis.filter((e) => e.subjectUserId === subjectId).sort((a, b) => b.id - a.id);
  if (mine.length === 0) return null;
  for (const emotion of prefs) {
    const hit = mine.find((e) => e.emotion === emotion);
    if (hit) return hit.imageUrl;
  }
  return mine[0].imageUrl;
}
const FACE_THINKING = ['HARD_AT_WORK', 'HAPPY'];
const FACE_IDLE = ['HAPPY', 'LOVE', 'EXCITED'];
const FACE_WIN = ['EXCITED', 'CHEER', 'HAPPY'];
const FACE_LOSE = ['SAD', 'SORRY', 'HAPPY'];

/** 수 요청 순번 — 옛 응답이 새 상태를 덮지 않도록(OmokScreen.placeSeq 와 같은 이유) */
let moveSeq = 0;

type WallKind = 'H' | 'V';
type Pending = { slot: number; kind: WallKind };

/**
 * 끄는 벽 미리보기를 손가락보다 이만큼 위에 띄운다 — 손가락이 벽을 가리면 어디에 붙는지 보이지 않는다
 * (Quoridor.II 리뷰의 "원하는 자리에 놓기가 거의 불가능"이 이것이다. docs/pathlock-ux-analysis_2026-10-08.md §3-4)
 */
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

/**
 * 판 한 변에서 칸·홈 치수를 뽑는다. 대국판과 지난 판의 작은 판이 <b>같은 식</b>을 쓰도록
 * 컴포넌트 밖에 둔다 — 벽 위치를 두 벌로 계산하면 작은 판에서만 어긋난다.
 */
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
    /** 교차점 (r,c) 의 홈 중심 */
    jointX: (c: number) => PAD + (c + 1) * pitch - gap / 2,
    jointY: (r: number) => PAD + (r + 1) * pitch - gap / 2,
  };
}

/**
 * 기보의 마지막 수 — 'P12' 면 그 칸, 'W35H' 면 그 벽 자리.
 *
 * <p>비동기 게임이라 며칠 만에 들어오는데, <b>돌은 개수가 늘어 보이지만 벽은 어디 생겼는지
 * 보이지 않는다.</b> 64자리 중에서 눈으로 찾게 두지 않으려고 마지막 수를 표시한다.
 * 차례가 번갈아 오므로 "내가 마지막으로 본 뒤 바뀐 것"이 정확히 이 한 수다.
 */
function lastMoveOf(moves: string[]): { cell: number | null; slot: number | null } {
  const last = moves.length > 0 ? moves[moves.length - 1] : undefined;
  if (!last) return { cell: null, slot: null };
  // 범위를 벗어난 값이 오면 조용히 표시를 접는다 — 표시 하나 때문에 판이 깨지면 안 된다
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

/**
 * 대국판 View — 끌기를 시작할 때 화면 위치를 잰다. 트레이 처리기를 한 번만 만들려고 모듈 변수에 둔다
 * (PuyoScreen 의 live·session 과 같은 이유 — 처리기는 만든 순간의 클로저를 든다). 대국판은 화면에 하나뿐이다.
 */
let boardNode: View | null = null;
/** 대국판이 180° 돌려 그려졌는가 — 손가락이 가리킨 교차점(화면 좌표)을 저장 좌표로 되돌릴 때 쓴다 */
let boardFlipped = false;
function setBoardNode(view: View | null) {
  boardNode = view;
}

type TrayActions = {
  setDrag: (d: { kind: WallKind; slot: number | null } | null) => void;
  setTapKind: (k: WallKind) => void;
  setWallMode: (on: boolean) => void;
  setPending: (u: (prev: Pending | null) => Pending | null) => void;
};

/**
 * 트레이 조각 하나의 제스처 — 끌면 판 위 교차점에 스냅된 미리보기, 손을 떼면 "놓을까요?"로 남긴다.
 * 끌지 않고 누르면 탭 모드(교차점을 눌러 고르기). 판 밖에서 놓으면 취소.
 * docs/pathlock-ux-analysis_2026-10-08.md §3-1.
 */
function createTrayResponder(kind: WallKind, a: TrayActions) {
  // 한 번의 터치 동안만 사는 값 — 처리기와 같이 만들어져 ref 가 필요 없다(PuyoScreen 의 pan 과 같다)
  const cur = { frame: null as { x: number; y: number; size: number } | null, slot: null as number | null, dragging: false };
  const end = () => {
    cur.dragging = false;
    a.setDrag(null);
  };
  return PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    // 끄는 도중 목록·화면이 손가락을 가져가지 못하게 한다
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      cur.frame = null;
      cur.slot = null;
      cur.dragging = false;
      boardNode?.measure((_x, _y, w, _h, pageX, pageY) => {
        cur.frame = { x: pageX, y: pageY, size: w };
      });
    },
    onPanResponderMove: (e, g) => {
      if (!cur.dragging && Math.abs(g.dx) < TAP_SLOP && Math.abs(g.dy) < TAP_SLOP) return;
      const shown = snapToSlot(cur.frame, e.nativeEvent.pageX, e.nativeEvent.pageY);
      const slot = shown === null ? null : boardFlipped ? WALL_SIZE * WALL_SIZE - 1 - shown : shown;
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
        // 끌지 않고 눌렀다 — 탭 모드. 정밀 조작이 어려운 경우·스크린리더용
        a.setTapKind(kind);
        a.setWallMode(true);
        a.setPending((prev) => (prev ? { slot: prev.slot, kind } : null));
        return;
      }
      if (slot === null) return; // 판 밖에서 놓았다 — 취소
      a.setTapKind(kind);
      a.setWallMode(true);
      a.setPending(() => ({ slot, kind }));
    },
    onPanResponderTerminate: end,
  });
}

/**
 * 손가락 위치를 가장 가까운 교차점으로 — 판 밖이면 null. 손가락보다 DRAG_LIFT 위를 겨눈다.
 * 스냅 반경은 교차점 간격의 절반이라 판 안이면 어디서든 한 점에 붙는다(빈틈 없음).
 */
function snapToSlot(frame: { x: number; y: number; size: number } | null, pageX: number, pageY: number): number | null {
  if (!frame) return null;
  const x = pageX - frame.x;
  const y = pageY - DRAG_LIFT - frame.y;
  const margin = frame.size * 0.08;
  if (x < -margin || y < -margin || x > frame.size + margin || y > frame.size + margin) return null;
  const { pitch, gap } = geometry(frame.size);
  // jointX(c) = PAD + (c + 1)·pitch − gap/2 를 거꾸로 푼다
  const c = Math.round((x - PAD + gap / 2) / pitch - 1);
  const r = Math.round((y - PAD + gap / 2) / pitch - 1);
  const clamp = (v: number) => Math.max(0, Math.min(WALL_SIZE - 1, v));
  return clamp(r) * WALL_SIZE + clamp(c);
}

function inRange(value: number, limit: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < limit;
}

export function WallRaceScreen({ navigation }: Props) {
  const width = useContentWidth();
  const relationId = useRelationStore((s) => s.couple?.id);
  const partnerId = useRelationStore((s) => s.couple?.partner?.id);
  const myId = useAuthStore((s) => s.user?.id);
  const coupleEmojis = useCoupleEmojiStore((s) => s.emojis);
  const loadCoupleEmojis = useCoupleEmojiStore((s) => s.load);

  const [game, setGame] = useState<WallRaceGame | null>(null);
  /** 방금 끝난 판 — current 가 null 이 된 뒤에도 결과를 보여주기 위해 따로 든다 */
  const [justFinished, setJustFinished] = useState<WallRaceGame | null>(null);
  /** 상대가 접은 판 — 기록에 안 남으므로 결과 카드 대신 이 안내를 띄운다. 값은 상대 이름 */
  const [foldedBy, setFoldedBy] = useState<string | null>(null);
  /**
   * 이 화면에서 보고 있던 진행 중 판 — current 가 null 로 바뀌었을 때 "그 판이 끝났나, 접혔나"를 가른다.
   * 예전엔 current 가 null 이면 무조건 기록의 맨 위 판을 결과로 올려서, 상대가 판을 접거나 처음 들어왔을 때
   * 몇 주 전 판의 "이겼어요"가 방금 끝난 판처럼 떴다(docs/WALL_RACE_UX_REVIEW_2026-09-30.md P1-1).
   */
  const watchingRef = useRef<WallRaceGame | null>(null);
  const [history, setHistory] = useState<WallRaceGame[]>([]);
  /** 서버가 센 전적(끝낸 판 전부) — 못 받으면 null 이고 그때만 기록 목록으로 센다 */
  const [serverRecord, setServerRecord] = useState<GameRecord | null>(null);
  const refreshRecord = useCallback(() => {
    wallRaceApi.record().then(setServerRecord).catch(() => undefined);
  }, []);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [starting, setStarting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [undoBusy, setUndoBusy] = useState(false);
  /** 벽 모드에서 고른 자리 — 확정 전이라 아직 서버에 가지 않았다 */
  const [pending, setPending] = useState<Pending | null>(null);
  const [wallMode, setWallMode] = useState(false);
  /** 탭 모드에서 새로 고르는 자리에 쓸 방향 — 트레이에서 누른 조각 */
  const [tapKind, setTapKind] = useState<WallKind>('H');
  /**
   * 트레이에서 끌고 있는 벽 — slot 은 지금 붙을 교차점(판 밖이면 null).
   * 끄는 동안 목록 스크롤을 잠근다(캐치마인드 캔버스와 같은 이유 — 위아래로 끌면 화면이 같이 내려간다).
   */
  const [drag, setDrag] = useState<{ kind: WallKind; slot: number | null } | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setLoadError(false);
    try {
      const [g, h] = await Promise.all([wallRaceApi.current(), wallRaceApi.history()]);
      refreshRecord();
      setGame(g);
      setHistory(h);
      // 내 차례가 아니게 됐으면 고르던 벽은 의미가 없다 — 모드째 내린다
      if (!g?.myTurn) {
        setPending(null);
        setWallMode(false);
      }
      // 보고 있던 판이 사라졌다 — 기록에 있으면 끝난 것(결과), 없으면 상대가 접은 것(안내).
      // 보고 있던 판이 없었으면(처음 들어옴) 아무것도 올리지 않는다 — 지난 판은 아래 목록에 있다
      const watching = watchingRef.current;
      if (!g && watching) {
        const done = h.find((x) => x.id === watching.id);
        if (done) setJustFinished(done);
        else setFoldedBy(watching.partnerName ?? '상대');
        watchingRef.current = null;
      }
      if (g) {
        setJustFinished(null);
        setFoldedBy(null);
      }
    } catch (e) {
      if (!silent) toast.error(getErrorMessage(e, '판을 불러오지 못했어요.'));
      setLoadError(true);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [refreshRecord]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  // 말 얼굴(우리 이모지) — 없거나 실패하면 말 모양으로 그린다
  useFocusEffect(useCallback(() => { loadCoupleEmojis().catch(() => undefined); }, [loadCoupleEmojis]));

  /*
   * 두는 동안은 헤더를 숨기고 화면 전체를 어두운 게임판으로 쓴다(PathLock 식). 뒤로 가기는 판 위 상단 줄이 맡는다.
   * 헤더 아이콘은 테마 글자색으로 고정이라 헤더만 어둡게 칠하면 라이트 테마에서 뒤로가기가 안 보인다.
   */
  const inGame = game !== null;
  useEffect(() => {
    navigation.setOptions({ headerShown: !inGame });
  }, [navigation, inGame]);
  // 트레이 제스처가 화면 좌표를 저장 좌표로 되돌릴 때 쓴다 — 판을 연 쪽이면 판을 180° 돌려 그린다(renderBoard)
  const flipped = game !== null && game.myGoalRow === SIZE - 1;
  useEffect(() => {
    boardFlipped = flipped;
  }, [flipped]);

  // 진행 중 판을 볼 때마다 기억해 둔다 — 사라졌을 때 끝났는지 접혔는지 가르는 기준
  useEffect(() => {
    if (game) watchingRef.current = game;
  }, [game]);

  useFocusEffect(
    useCallback(() => {
      if (!relationId) return undefined;
      let active = true;
      let offCouple: (() => void) | undefined;
      connectSocket()
        .then(() => {
          if (!active) return;
          offCouple = subscribeCouple(relationId, (type) => {
            if (type === 'GAME') void load(true);
          });
        })
        .catch(() => undefined);
      return () => {
        active = false;
        offCouple?.();
      };
    }, [relationId, load]),
  );

  const start = async () => {
    setStarting(true);
    try {
      const g = await wallRaceApi.start();
      setGame(g);
      setJustFinished(null);
      setFoldedBy(null);
      setPending(null);
      setWallMode(false);
      haptics.light();
      if (!g.myTurn) toast.success(`${g.partnerName ?? '상대'}에게 선공을 줬어요. 두면 알려드릴게요.`);
    } catch (e) {
      toast.error(getErrorMessage(e, '새 판을 열지 못했어요.'));
    } finally {
      setStarting(false);
    }
  };

  /** 수를 둔 뒤 공통 — 끝났으면 결과 화면으로 넘긴다 */
  const applyResult = (updated: WallRaceGame) => {
    setPending(null);
    if (updated.status === 'COMPLETED') {
      setJustFinished(updated);
      setGame(null);
      setWallMode(false);
      if (updated.winner === 'ME') haptics.success();
      wallRaceApi.history().then(setHistory).catch(() => undefined);
      refreshRecord();
    } else {
      setGame(updated);
    }
  };

  const movePawn = async (target: number) => {
    if (!game || busy || !game.myTurn) return;
    haptics.light();
    setBusy(true);
    const seq = ++moveSeq;
    try {
      const updated = await wallRaceApi.movePawn(game.id, target);
      if (seq !== moveSeq) return;
      applyResult(updated);
    } catch (e) {
      if (seq !== moveSeq) return;
      toast.error(getErrorMessage(e, '말을 옮기지 못했어요.'));
      void load(true);
    } finally {
      if (seq === moveSeq) setBusy(false);
    }
  };

  const confirmWall = async () => {
    if (!game || !pending || busy) return;
    const reason = illegalReason(game, pending.slot, pending.kind);
    if (reason) {
      toast.error(reason);
      return;
    }
    haptics.light();
    setBusy(true);
    const seq = ++moveSeq;
    try {
      const updated = await wallRaceApi.placeWall(game.id, pending.slot, pending.kind);
      if (seq !== moveSeq) return;
      setWallMode(false);
      applyResult(updated);
    } catch (e) {
      if (seq !== moveSeq) return;
      // 서버 메시지가 곧 설명이다 — "길을 완전히 막을 수는 없어요" 같은 문장이 그대로 온다
      toast.error(getErrorMessage(e, '벽을 놓지 못했어요.'));
      void load(true);
    } finally {
      if (seq === moveSeq) setBusy(false);
    }
  };

  /*
   * ── 드래그로 벽 놓기 (docs/pathlock-ux-analysis_2026-10-08.md §3) ─────────────────
   * 트레이의 가로·세로 조각을 끌어 판에 놓는다. 손을 떼면 바로 서버에 보내지 않고 "놓을까요?"(판 위 [놓기]/✕)로
   * 남긴다 — 벽은 되돌리기 어려운 자원이고 무르기는 상대 동의가 필요해서다(§3-2).
   * 제스처 처리기는 한 번 만들고 최신 값은 ref 로 읽는다(PanResponder 는 만든 순간의 클로저를 든다).
   */
  const startTapMode = (kind: WallKind) => {
    setTapKind(kind);
    setWallMode(true);
    // 이미 고른 자리가 있으면 방향만 바꾼다 — 트레이 조각이 곧 방향 토글이다
    setPending((prev) => (prev ? { slot: prev.slot, kind } : null));
  };

  // 처리기는 한 번만 만든다 — 상태 setter 만 쓰므로 다시 만들 이유가 없다
  const trayH = useMemo(() => createTrayResponder('H', { setDrag, setTapKind, setWallMode, setPending }), []);
  const trayV = useMemo(() => createTrayResponder('V', { setDrag, setTapKind, setWallMode, setPending }), []);

  /** 지금 판에서 그 자리에 벽을 놓을 수 없는 이유 — 서버가 내려준 목록에서 찾는다(규칙은 서버에 한 벌) */
  const illegalReason = (g: WallRaceGame, slot: number, kind: WallKind): string | null => {
    const hit = g.illegalWalls?.find((w) => w.slot === slot && w.kind === kind);
    return hit ? (ILLEGAL_REASON[hit.reason] ?? '여기는 놓을 수 없어요') : null;
  };

  const askUndo = async () => {
    if (!game || undoBusy) return;
    setUndoBusy(true);
    try {
      setGame(await wallRaceApi.requestUndo(game.id));
      setPending(null);
      setWallMode(false);
      toast.success('무르기를 부탁했어요. 상대가 받아주면 다시 둘 수 있어요.');
    } catch (e) {
      toast.error(getErrorMessage(e, '무르기를 부탁하지 못했어요.'));
      void load(true);
    } finally {
      setUndoBusy(false);
    }
  };

  const answerUndo = async (accept: boolean) => {
    if (!game || undoBusy) return;
    setUndoBusy(true);
    try {
      setGame(await wallRaceApi.respondUndo(game.id, accept));
      setPending(null);
      setWallMode(false);
      if (accept) haptics.light();
      toast.success(accept ? '한 수 물러줬어요.' : '그냥 두기로 했어요.');
    } catch (e) {
      toast.error(getErrorMessage(e, '응답하지 못했어요.'));
      void load(true);
    } finally {
      setUndoBusy(false);
    }
  };

  const confirmGiveUp = () => {
    if (!game) return;
    Alert.alert('이 판을 접을까요?', '접은 판은 전적에 남지 않고, 상대 화면에서도 사라져요.', [
      { text: '계속 두기', style: 'cancel' },
      {
        text: '접기',
        style: 'destructive',
        onPress: () => {
          /*
           * 내가 접는다 — "상대가 접었어요" 안내가 뜨지 않게 보던 판을 잊는다. 응답을 받은 뒤에 잊으면
           * 소켓 GAME 이벤트가 먼저 와서 load 가 "보던 판이 기록에 없다 = 상대가 접었다"로 읽는다
           * (docs/game-current-state.md 8-1 #16). 그래서 요청 <b>전에</b> 잊고, 실패하면 되돌린다.
           */
          const watching = watchingRef.current;
          watchingRef.current = null;
          wallRaceApi
            .giveUp(game.id)
            .then(() => {
              setGame(null);
              setPending(null);
              toast.success('이 판은 접었어요.');
            })
            .catch((e) => {
              watchingRef.current = watching;
              toast.error(getErrorMessage(e, '접지 못했어요.'));
            });
        },
      },
    ]);
  };

  // ── 판 기하 ────────────────────────────────────────────────────────
  /*
   * 벽이 칸 사이에 놓이므로 칸 사이에 홈(groove)을 둔다. 홈이 곧 벽의 두께이자 탭 영역의
   * 중심이다. 칸 9개 + 홈 8개 + 양쪽 여백이 판 한 변이다.
   */
  const boardSize = Math.min(width - spacing.lg * 2, 380);
  /** 지난 판 카드에 들어가는 작은 판 — 훑어보는 용도라 조작은 없다 */
  const historyBoardSize = Math.min(boardSize * 0.55, 200);

  // 전적은 서버가 센 값(끝낸 판 전부). 기록 목록은 최근 20판뿐이라 21판째부터 줄어든다(8-1 #9)
  const record = useMemo(
    () => serverRecord ?? {
      me: history.filter((g) => g.winner === 'ME').length,
      partner: history.filter((g) => g.winner === 'PARTNER').length,
      draw: 0,
    },
    [serverRecord, history],
  );

  const renderBoard = (g: WallRaceGame, interactive: boolean, size = boardSize) => {
    const { cell, gap, pitch, cellX, cellY, jointX, jointY } = geometry(size);
    // 끄는 중이면 끄는 벽이, 아니면 확정을 기다리는 벽이 미리보기다
    const preview: Pending | null = !interactive
      ? null
      : drag
        ? drag.slot === null
          ? null
          : { slot: drag.slot, kind: drag.kind }
        : pending;
    const previewIllegal = preview ? illegalReason(g, preview.slot, preview.kind) : null;
    const legal = new Set(interactive && !wallMode ? g.legalMoves : []);
    const pawnSize = cell * 0.62;
    const dotSize = cell * 0.46;
    const iAmCreator = g.myGoalRow === SIZE - 1;
    /*
     * 나는 언제나 아래에서 출발한다(사용자 요청, 2026-10-08). 판을 연 쪽은 저장상 맨 윗줄에서 출발하므로 판을
     * 180° 돌려 그린다. 180° 회전은 가로 벽을 가로로, 세로 벽을 세로로 남기므로 칸 번호(80−i)와 벽 자리(63−s)만
     * 뒤집으면 된다. 상태·서버 요청은 전부 저장 좌표 그대로이고, 그리는 자리와 손가락 좌표만 바꾼다.
     * (예전 §10-4 의 "판을 돌리지 않는다"는 좌표로 말을 주고받으려던 것인데, 좌표 표시는 넣지 않았다.)
     */
    const flip = iAmCreator;
    const vc = (i: number) => (flip ? SIZE * SIZE - 1 - i : i);
    const vs = (sl: number) => (flip ? WALL_SIZE * WALL_SIZE - 1 - sl : sl);
    const shownMyGoalRow = flip ? SIZE - 1 - g.myGoalRow : g.myGoalRow;
    const owners = wallOwners(g.moves, iAmCreator);
    const over = g.winner != null;
    const meFace = pickFace(coupleEmojis, myId, over ? (g.winner === 'ME' ? FACE_WIN : FACE_LOSE) : g.myTurn ? FACE_THINKING : FACE_IDLE);
    const partnerFace = pickFace(coupleEmojis, partnerId, over ? (g.winner === 'PARTNER' ? FACE_WIN : FACE_LOSE) : !g.myTurn ? FACE_THINKING : FACE_IDLE);
    const last = lastMoveOf(g.moves);
    // 말보다 충분히 커야 테가 남는다. 칸을 넘지 않는 선(0.62 × 1.45 ≈ 0.9칸)에서 잡았다
    const ringSize = pawnSize * 1.45;
    /*
     * 교차점 탭 영역은 서로 닿을 만큼 크게 잡는다 — 벽은 칸이 아니라 칸 사이에 놓여서
     * 홈(gap)만큼만 주면 손가락으로 집을 수가 없다(분석 §4-2 4번이 지목한 자리).
     * 한 변을 pitch 로 두면 빈틈도 겹침도 없이 8×8 을 덮는다.
     */
    const jointHit = pitch;

    return (
      <View ref={interactive ? setBoardNode : undefined} style={[styles.board, { width: size, height: size }]}>
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
              ]}
            />
          );
        })}

        {/* 갈 수 있는 자리 — 서버가 계산해 내려준 것만 찍는다 */}
        {[...legal].map((index) => {
          const row = Math.floor(vc(index) / SIZE);
          const col = vc(index) % SIZE;
          return (
            <Pressable
              key={`m${index}`}
              onPress={() => movePawn(index)}
              accessibilityRole="button"
              accessibilityLabel={`${row + 1}행 ${col + 1}열로 이동`}
              style={[styles.moveHit, { left: cellX(col), top: cellY(row), width: cell, height: cell }]}
            >
              {/* 갈 수 있는 칸 — 내 색 테두리의 고리(PathLock 의 금색 고리 자리) */}
              <View
                style={[
                  styles.moveDot,
                  {
                    width: dotSize,
                    height: dotSize,
                    borderRadius: dotSize / 2,
                    left: (cell - dotSize) / 2,
                    top: (cell - dotSize) / 2,
                  },
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

        {/*
          말 — 우리 이모지가 있으면 그 사람의 얼굴, 없으면 말 모양. 발밑 받침은 주인 색이라 얼굴이어도 누구 말인지 읽힌다.
          표정은 판 상황을 따른다(차례면 고민, 이기면 신남, 지면 슬픔).
        */}
        {([[g.myPawn, PAWN_ME, '내 말', meFace], [g.partnerPawn, PAWN_PARTNER, '상대 말', partnerFace]] as const).map(
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

        {/* 마지막 수가 벽이었으면 그 벽 뒤에 후광 — 벽 위에 테두리를 두면 홈이 얇아 안 읽힌다 */}
        {last.slot !== null && (g.walls[last.slot] === 'H' || g.walls[last.slot] === 'V') ? (
          <View
            pointerEvents="none"
            style={[styles.lastWall, wallRect(vs(last.slot), g.walls[last.slot] as 'H' | 'V', 3)]}
          />
        ) : null}

        {/* 놓인 벽 */}
        {Array.from({ length: WALL_SIZE * WALL_SIZE }, (_, slot) => {
          const kind = g.walls[slot];
          if (kind !== 'H' && kind !== 'V') return null;
          // 벽은 놓은 사람 색 — 누가 어디를 막았는지 한눈에(기보로 주인을 찾는다)
          const owner = owners.get(slot);
          const color = owner === 'me' ? PAWN_ME : owner === 'partner' ? PAWN_PARTNER : WALL_COLOR;
          return <View key={`w${slot}`} style={[styles.wall, { backgroundColor: color }, wallRect(vs(slot), kind)]} />;
        })}

        {/* 미리보기 — 아직 서버에 가지 않은 벽. 놓을 수 없는 자리면 빨갛게(서버가 내려준 목록) */}
        {preview ? (
          <View
            pointerEvents="none"
            style={[
              styles.wall,
              previewIllegal ? styles.wallIllegal : [styles.wallPreview, { backgroundColor: PAWN_ME }],
              wallRect(vs(preview.slot), preview.kind),
            ]}
          />
        ) : null}

        {/* 벽 모드일 때만 교차점 탭 영역을 깐다 — 평소엔 말 이동을 가리지 않게 없앤다 */}
        {interactive && wallMode && !drag
          ? Array.from({ length: WALL_SIZE * WALL_SIZE }, (_, shown) => {
              const r = Math.floor(shown / WALL_SIZE);
              const c = shown % WALL_SIZE;
              const slot = vs(shown); // 저장 좌표 — 상태와 서버는 이것만 안다
              const chosen = pending?.slot === slot;
              return (
                <Pressable
                  key={`j${slot}`}
                  onPress={() =>
                    setPending((prev) =>
                      // 같은 자리를 다시 누르면 방향이 바뀐다 — 손가락 하나로 둘 다 고를 수 있게
                      prev && prev.slot === slot
                        ? { slot, kind: prev.kind === 'H' ? 'V' : 'H' }
                        : { slot, kind: tapKind },
                    )
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`${r + 1}·${c + 1} 교차점에 벽 놓기`}
                  style={[
                    styles.joint,
                    {
                      left: jointX(c) - jointHit / 2,
                      top: jointY(r) - jointHit / 2,
                      width: jointHit,
                      height: jointHit,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.jointDot,
                      chosen && styles.jointDotOn,
                      { left: jointHit / 2 - 3, top: jointHit / 2 - 3 },
                    ]}
                  />
                </Pressable>
              );
            })
          : null}

        {/* 판 위 확인 — 놓을 자리 바로 옆에 [놓기]/✕. 끄는 중에는 숨긴다 */}
        {interactive && pending && !drag ? renderConfirm(pending) : null}
      </View>
    );

    /** 미리보기 벽 옆의 [놓기]/✕ — 가로 벽은 위(맨 윗줄이면 아래), 세로 벽은 오른쪽(오른쪽 끝이면 왼쪽)에 붙인다 */
    function renderConfirm(p: Pending) {
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
            <MaterialCommunityIcons name="close" size={btn * 0.55} color={D_TEXT} />
          </Pressable>
        </View>
      );
    }

    /** 벽 하나의 사각형 — 두 칸 길이로 홈을 덮는다. {@code grow} 는 사방으로 넓히는 여백(후광) */
    function wallRect(slot: number, kind: 'H' | 'V', grow = 0) {
      const r = Math.floor(slot / WALL_SIZE);
      const c = slot % WALL_SIZE;
      const long = cell * 2 + gap;
      return kind === 'H'
        ? {
            left: cellX(c) - grow,
            top: jointY(r) - gap / 2 - grow,
            width: long + grow * 2,
            height: gap + grow * 2,
          }
        : {
            left: jointX(c) - gap / 2 - grow,
            top: cellY(r) - grow,
            width: gap + grow * 2,
            height: long + grow * 2,
          };
    }
  };

  /** 핸디캡 줄 — 접어준 것은 숨기지 않는다(연쇄 퍼즐과 같은 규칙) */
  const renderHandicap = (g: WallRaceGame) => {
    if (g.myWallsStart === g.partnerWallsStart) return null;
    const mine = g.myWallsStart > g.partnerWallsStart;
    return (
      <Text style={styles.handicap}>
        {mine
          ? `최근 판을 생각해서 벽을 ${g.myWallsStart - g.partnerWallsStart}개 더 받았어요.`
          : `${g.partnerName ?? '상대'}가 벽을 ${g.partnerWallsStart - g.myWallsStart}개 더 받았어요.`}
      </Text>
    );
  };

  /**
   * 내 차례의 조작 줄 — 벽 트레이(가로·세로 조각)를 늘 보여 준다. 조각을 <b>끌어</b> 판에 놓거나, <b>눌러</b>
   * 탭 모드(교차점 고르기)로 들어간다. 예전의 "벽 놓기 → 점 누르기 → 같은 점 다시 눌러 방향 → 확정" 4단계를
   * 끌기·놓기 두 단계로 줄였다(docs/pathlock-ux-analysis_2026-10-08.md).
   */
  const renderActionBar = (g: WallRaceGame) => {
    if (!g.myTurn) return <Text style={styles.dHint}>상대가 두면 바로 보여요.</Text>;
    const hasWalls = g.myWallsLeft > 0;
    const dragIllegal = drag && drag.slot !== null ? illegalReason(g, drag.slot, drag.kind) : null;
    const pendingIllegal = pending ? illegalReason(g, pending.slot, pending.kind) : null;
    let hint: string;
    if (drag) {
      hint = drag.slot === null
        ? '판 위로 끌어 오세요. 판 밖에서 놓으면 취소돼요.'
        : (dragIllegal ?? '손을 떼면 그 자리에 미리 놓여요.');
    } else if (pending) {
      hint = pendingIllegal ?? "'놓기'를 누르면 놓여요. 다른 자리면 다시 끌어 오세요.";
    } else if (wallMode) {
      hint = '칸과 칸이 만나는 점을 눌러도 돼요. 같은 점을 다시 누르면 방향이 바뀌어요.';
    } else {
      hint = hasWalls
        ? '고리를 누르면 말이 움직여요. 벽은 아래 조각을 판으로 끌어 놓아요.'
        : '벽을 다 썼어요. 말을 움직여요.';
    }
    const activeKind = drag?.kind ?? (wallMode ? (pending?.kind ?? tapKind) : null);
    return (
      <View style={styles.wallPanel}>
        {hasWalls ? (
          <View style={styles.tray}>
            {(['H', 'V'] as const).map((kind) => (
              <View
                key={kind}
                {...(kind === 'H' ? trayH : trayV).panHandlers}
                accessible
                accessibilityRole="button"
                accessibilityLabel={kind === 'H' ? '가로 벽, 끌어서 놓거나 눌러서 자리 고르기' : '세로 벽, 끌어서 놓거나 눌러서 자리 고르기'}
                onAccessibilityTap={() => startTapMode(kind)}
                pointerEvents={busy ? 'none' : 'auto'}
                style={[styles.trayPiece, activeKind === kind && styles.trayPieceOn, busy && styles.trayPieceOff]}
              >
                <View style={[kind === 'H' ? styles.trayWallH : styles.trayWallV, { backgroundColor: PAWN_ME }]} />
              </View>
            ))}
            <View style={styles.trayCount}>
              <Text style={styles.trayCountNum}>{g.myWallsLeft}</Text>
              <Text style={styles.trayCountLabel}>개의 벽</Text>
            </View>
            {wallMode ? (
              <Pressable
                onPress={() => { setWallMode(false); setPending(null); }}
                disabled={busy}
                accessibilityRole="button"
                hitSlop={8}
                style={styles.dTextBtn}
              >
                <Text style={styles.dTextBtnLabel}>벽 그만</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        <Text style={[styles.dHint, dragIllegal || pendingIllegal ? styles.hintBad : null]}>{hint}</Text>
      </View>
    );
  };

  const renderResult = (g: WallRaceGame) => (
    <View style={[styles.card, styles.resultCard]}>
      <MaterialCommunityIcons name="trophy-outline" size={26} color="#7A5C3A" />
      <Text style={styles.resultTitle}>
        {g.winner === 'ME' ? '이겼어요!' : `${g.partnerName ?? '상대'}가 이겼어요`}
      </Text>
      <Text style={styles.cardDesc}>{g.moveCount}수 · 채팅에 결과 카드를 남겼어요.</Text>
      {renderBoard(g, false)}
    </View>
  );

  const renderStart = (title: string) => (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>길막기</Text>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardDesc}>
        내 말을 반대편 끝줄까지 먼저 보내면 이겨요. 한 턴에 한 칸 가거나 벽 하나를 놓을 수 있고,
        상대 길을 <Text style={styles.bold}>돌게</Text> 만들 수는 있어도 완전히 막을 수는 없어요.
        판을 열면 상대가 선공이에요.
      </Text>
      {record.me + record.partner > 0 ? (
        <Text style={styles.record}>전적 {record.me}승 {record.partner}패</Text>
      ) : null}
      <Button title="판 열기" onPress={start} loading={starting} style={styles.startBtn} />
    </View>
  );

  /** ··· 메뉴 — 무르기·접기를 판 주변에서 치워 한곳에 모은다(PathLock 의 ··· 자리) */
  const openMenu = (g: WallRaceGame) => {
    const items: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [];
    if (g.canUndo && !g.undoRequest) items.push({ text: '한 수 무르기 부탁', onPress: () => void askUndo() });
    items.push({ text: '이 판 접기', style: 'destructive', onPress: confirmGiveUp });
    items.push({ text: '닫기', style: 'cancel' });
    Alert.alert('길막기', undefined, items);
  };

  /** 상대 카드(위) — 남은 벽 · 이름 · 얼굴. 기다리는 쪽이면 살짝 찌르기 */
  const renderOpponentCard = (g: WallRaceGame) => {
    const face = pickFace(coupleEmojis, partnerId, FACE_IDLE);
    return (
      <View style={[styles.dCard, !g.myTurn && { borderColor: PAWN_PARTNER }]}>
        <View style={styles.dCount}>
          <Text style={styles.dCountNum}>{g.partnerWallsLeft}</Text>
          <Text style={styles.dCountLabel}>개의 벽</Text>
        </View>
        <View style={styles.dCardBody}>
          <Text style={styles.dName} numberOfLines={1}>{g.partnerName ?? '상대'}</Text>
          <Text style={[styles.dSub, !g.myTurn && { color: PAWN_PARTNER }]}>{g.myTurn ? '기다리는 중' : '두는 중'}</Text>
        </View>
        {face ? (
          <Image source={{ uri: face }} style={styles.dAvatar} contentFit="contain" />
        ) : (
          <View style={[styles.dAvatar, { backgroundColor: PAWN_PARTNER, borderRadius: 22 }]} />
        )}
      </View>
    );
  };

  /** 내 카드(아래) — 얼굴 · 차례 · 남은 벽. 내 차례면 테두리가 켜진다 */
  const renderMyCard = (g: WallRaceGame) => {
    const face = pickFace(coupleEmojis, myId, FACE_IDLE);
    return (
      <View style={[styles.dCard, g.myTurn && { borderColor: PAWN_ME }]}>
        {face ? (
          <Image source={{ uri: face }} style={styles.dAvatar} contentFit="contain" />
        ) : (
          <View style={[styles.dAvatar, { backgroundColor: PAWN_ME, borderRadius: 22 }]} />
        )}
        <View style={styles.dCardBody}>
          <Text style={styles.dName}>나</Text>
          <Text style={[styles.dSub, g.myTurn && { color: PAWN_ME }]}>
            {g.myTurn ? '내 차례' : `${g.partnerName ?? '상대'} 차례`} · {g.moveCount}수
          </Text>
        </View>
        <View style={[styles.dCount, styles.dCountRight]}>
          <Text style={styles.dCountNum}>{g.myWallsLeft}</Text>
          <Text style={styles.dCountLabel}>개의 벽</Text>
        </View>
      </View>
    );
  };

  /** 상대가 무르기를 부탁했거나 내가 부탁해 둔 상태 — 판 아래 한 줄 */
  const renderUndoBanner = (g: WallRaceGame) => {
    if (g.undoRequest === 'PARTNER') {
      return (
        <View style={styles.dBanner}>
          <Text style={styles.dBannerText}>{g.partnerName ?? '상대'}님이 방금 둔 수를 무르고 싶대요.</Text>
          <View style={styles.actionRow}>
            <Button title="물러주기" size="sm" onPress={() => answerUndo(true)} loading={undoBusy} />
            <Pressable onPress={() => answerUndo(false)} disabled={undoBusy} accessibilityRole="button" hitSlop={8} style={styles.dTextBtn}>
              <Text style={styles.dTextBtnLabel}>그냥 두기</Text>
            </Pressable>
          </View>
        </View>
      );
    }
    if (g.undoRequest === 'MINE') {
      return <Text style={styles.dHint}>무르기를 부탁했어요. {g.partnerName ?? '상대'}의 답을 기다리는 중…</Text>;
    }
    return null;
  };

  /** 두는 화면 — PathLock 처럼 위 상대 카드 · 판 · 벽 트레이 · 아래 내 카드 */
  const renderGame = (g: WallRaceGame) => (
    <View style={styles.dRoot}>
      <View style={styles.dTop}>
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="뒤로 가기" hitSlop={10}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={D_TEXT} />
        </Pressable>
        <Text style={styles.dTitle}>길막기</Text>
        <Pressable onPress={() => openMenu(g)} accessibilityRole="button" accessibilityLabel="메뉴" hitSlop={10} style={styles.dMenu}>
          <MaterialCommunityIcons name="dots-horizontal" size={22} color={D_TEXT} />
        </Pressable>
      </View>
      {renderOpponentCard(g)}
      {!g.myTurn && !g.undoRequest ? <GameNudgeButton gameId={g.id} partnerName={g.partnerName} /> : null}
      {renderHandicap(g)}
      <View style={styles.dBoardWrap}>{renderBoard(g, g.myTurn && !busy && !g.undoRequest)}</View>
      {g.undoRequest ? renderUndoBanner(g) : renderActionBar(g)}
      {renderMyCard(g)}
      <GameReactionBar gameType="WALL_RACE" />
    </View>
  );

  const header = (
    <View>
      {game ? (
        renderGame(game)
      ) : justFinished ? (
        <>
          {renderResult(justFinished)}
          {renderStart('한 판 더?')}
        </>
      ) : foldedBy ? (
        <>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{foldedBy}님이 이 판을 접었어요</Text>
            <Text style={styles.cardDesc}>접은 판은 전적에 남지 않아요. 새 판을 열어 볼까요?</Text>
          </View>
          {renderStart('새 판 열까요?')}
        </>
      ) : !loading && !loadError ? (
        renderStart('한 판 둘까요?')
      ) : null}
      {!game && history.length > 0 ? <Text style={styles.sectionTitle}>지난 판</Text> : null}
    </View>
  );

  return (
    <SafeAreaView style={[styles.safe, inGame && styles.safeGame]} edges={inGame ? ['top', 'bottom'] : ['bottom']}>
      {inGame ? <StatusBar style="light" /> : null}
      <FlatList
        data={inGame ? [] : history}
        keyExtractor={(g) => String(g.id)}
        contentContainerStyle={styles.list}
        /* 카드마다 9×9 판이 들어가 View 가 90개씩이다 — 처음에 다 그리지 않게 줄인다 */
        initialNumToRender={3}
        windowSize={5}
        refreshing={loading}
        onRefresh={() => load()}
        scrollEnabled={!drag}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          /*
           * 이 게임의 결과물은 수순이 아니라 <b>끝났을 때의 벽 배치</b>다. 숫자만 적어두면
           * "어떻게 막혔더라"가 남지 않아서, 지난 판마다 최종 판을 작게 그려 둔다.
           * 대국판과 같은 renderBoard 를 크기만 줄여 쓴다.
           */
          <View style={styles.histCard}>
            <View style={styles.histRow}>
              <Text style={styles.histDate}>
                {item.completedAt ? relativeTimestampLabel(item.completedAt) : ''}
              </Text>
              <Text style={[styles.histResult, item.winner === 'ME' && styles.histWin]}>
                {item.winner === 'ME' ? '승' : '패'}
              </Text>
            </View>
            <Text style={styles.histText}>
              {item.moveCount}수 · 쓴 벽 나 {item.myWallsStart - item.myWallsLeft} · 상대{' '}
              {item.partnerWallsStart - item.partnerWallsLeft}
            </Text>
            <View style={styles.histBoard}>{renderBoard(item, false, historyBoardSize)}</View>
          </View>
        )}
        ListEmptyComponent={
          !loading && loadError && !game ? (
            <EmptyState
              error
              onRetry={() => load()}
              title="불러오지 못했어요"
              description="네트워크 상태를 확인하고 다시 시도해주세요."
            />
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  safeGame: { backgroundColor: D_BG },
  list: { padding: spacing.lg, paddingBottom: spacing.xl },

  card: {
    backgroundColor: colors.primaryBg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardLabel: { fontSize: fontSize.caption, color: colors.primary, fontWeight: '800' },
  cardTitle: { fontSize: fontSize.title, fontWeight: '800', color: colors.textPrimary, marginTop: spacing.xs },
  cardDesc: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: spacing.xs, lineHeight: 18 },
  bold: { fontWeight: '800', color: colors.textPrimary },
  record: { fontSize: fontSize.body, color: colors.textPrimary, fontWeight: '700', marginTop: spacing.sm },
  startBtn: { marginTop: spacing.md },
  resultCard: { alignItems: 'center', gap: spacing.xs },
  resultTitle: { fontSize: fontSize.title, fontWeight: '800', color: colors.textPrimary },

  turnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  turnChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    maxWidth: '36%',
  },
  turnChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryBg },
  turnText: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textSecondary, flexShrink: 1 },
  turnTextActive: { color: colors.primary, fontWeight: '800' },
  turnHint: { flex: 1, textAlign: 'center', fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '600' },
  miniPawn: { width: 12, height: 12, borderRadius: 6 },
  handicap: {
    fontSize: fontSize.caption,
    color: D_SUB,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },

  board: {
    alignSelf: 'center',
    backgroundColor: BOARD_BG,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BOARD_FRAME,
    overflow: 'hidden',
  },
  cell: { position: 'absolute', backgroundColor: CELL_BG, borderRadius: 3 },
  moveHit: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  moveDot: { position: 'absolute', borderWidth: 2.5, borderColor: PAWN_ME, backgroundColor: withAlpha(PAWN_ME, 0.18) },
  pawnBox: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  pawnBase: { position: 'absolute', opacity: 0.85 },
  pawnFallback: { alignItems: 'center', marginTop: -2 },
  wall: { position: 'absolute', backgroundColor: WALL_COLOR, borderRadius: 2 },
  wallPreview: { opacity: 0.45 },
  wallIllegal: { backgroundColor: colors.danger, opacity: 0.7 },
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
  confirmBtnOk: { backgroundColor: PAWN_ME },
  confirmBtnOff: { backgroundColor: GROOVE },
  confirmBtnCancel: { backgroundColor: D_CARD, borderWidth: 1, borderColor: GROOVE },
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
    borderColor: D_LINE,
    backgroundColor: D_CARD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trayPieceOn: { borderColor: PAWN_ME, borderWidth: 2 },
  trayPieceOff: { opacity: 0.4 },
  trayWallH: { width: 56, height: 10, borderRadius: 5 },
  trayWallV: { width: 10, height: 38, borderRadius: 5 },
  trayCount: { alignItems: 'center', marginLeft: spacing.xs },
  trayCountNum: { fontSize: fontSize.subtitle, fontWeight: '800', color: D_TEXT },
  trayCountLabel: { fontSize: 10, color: D_SUB, fontWeight: '700' },

  /* ── 두는 화면(어두운 게임판) ── */
  dRoot: { gap: spacing.sm },
  dTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  dTitle: { flex: 1, fontSize: fontSize.subtitle, fontWeight: '800', color: D_TEXT },
  dMenu: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: D_CARD,
    borderWidth: 1,
    borderColor: D_LINE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: D_CARD,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: D_LINE,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  dCardBody: { flex: 1, gap: 2 },
  dName: { fontSize: fontSize.body, fontWeight: '800', color: D_TEXT },
  dSub: { fontSize: fontSize.caption, fontWeight: '700', color: D_SUB },
  dCount: { alignItems: 'center', minWidth: 44 },
  dCountRight: { alignItems: 'flex-end' },
  dCountNum: { fontSize: 24, fontWeight: '800', color: D_TEXT, lineHeight: 28 },
  dCountLabel: { fontSize: 11, fontWeight: '700', color: D_SUB },
  dAvatar: { width: 44, height: 44 },
  dBoardWrap: { alignItems: 'center', paddingVertical: spacing.xs },
  dHint: { fontSize: fontSize.caption, color: D_SUB, lineHeight: 18 },
  dTextBtn: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  dTextBtnLabel: { fontSize: fontSize.caption, fontWeight: '800', color: D_TEXT },
  dBanner: { backgroundColor: D_CARD, borderRadius: 14, borderWidth: 1, borderColor: PAWN_PARTNER, padding: spacing.md, gap: spacing.sm },
  dBannerText: { fontSize: fontSize.body, color: D_TEXT, fontWeight: '700' },
  hintBad: { color: colors.danger, fontWeight: '700' },
  /* 마지막 수 표시 — 말에는 테두리, 벽에는 후광. 둘 다 판 색과 다른 쪽으로 튀어야 눈에 걸린다 */
  lastRing: { position: 'absolute', borderWidth: 2, borderColor: '#F5A524' },
  lastWall: { position: 'absolute', backgroundColor: '#F5A524', borderRadius: 3 },
  joint: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  jointDot: { position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: GROOVE },
  jointDotOn: { backgroundColor: WALL_COLOR },

  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  wallPanel: { marginTop: spacing.md },
  hint: { flex: 1, fontSize: fontSize.caption, color: colors.textSecondary, lineHeight: 18 },
  giveUp: { alignSelf: 'center', marginTop: spacing.xs },
  undoAsk: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primaryBg,
  },
  undoAskText: { fontSize: fontSize.caption, color: colors.textPrimary, lineHeight: 18 },
  undoWaiting: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
  },

  sectionTitle: {
    fontSize: fontSize.body,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  histCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  histRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  histDate: { fontSize: fontSize.caption, color: colors.textSecondary },
  histResult: { fontSize: fontSize.caption, fontWeight: '800', color: colors.textSecondary },
  histWin: { color: colors.primary },
  histText: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 2 },
  histBoard: { marginTop: spacing.sm },
}));
