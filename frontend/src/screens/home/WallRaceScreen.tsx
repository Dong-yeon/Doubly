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
import { FlatList, Pressable, Text, View } from 'react-native';
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
import { WallRaceBoard, WR_COLORS, type WallKind } from '../../components/wallrace/WallRaceBoard';
import { gamePieceApi, wallRaceApi } from '../../api/game';
import { GameHelpButton, GameHelpSheet, useGameHelp } from '../../components/GameHelpSheet';
import { GamePieceSheet } from '../../components/GamePieceSheet';
import { connectSocket, subscribeCouple } from '../../api/chatSocket';
import { useRelationStore } from '../../store/relationStore';
import { useCoupleEmojiStore } from '../../store/coupleEmojiStore';
import { getErrorMessage } from '../../utils/error';
import { relativeTimestampLabel } from '../../utils/date';
import { Alert } from '../../utils/alert';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { fontSize, radius, spacing } from '../../constants/theme';
import type { GamePieces, GameRecord, WallRaceGame } from '../../types';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<HomeStackParamList, 'WallRace'>;

/*
 * 게임 화면 색 — 판·트레이와 같은 어두운 게임판 색(components/wallrace/WallRaceBoard 의 WR_COLORS).
 * 판 그리기·벽 끌어 놓기는 그 컴포넌트로 옮겼다 — 연습 판(WallRacePracticeScreen)이 같은 그림·조작을 쓴다.
 */
const D_BG = WR_COLORS.bg;
const D_CARD = WR_COLORS.card;
const D_LINE = WR_COLORS.line;
const D_TEXT = WR_COLORS.text;
const D_SUB = WR_COLORS.sub;
const PAWN_ME = WR_COLORS.me;
const PAWN_PARTNER = WR_COLORS.partner;

/** 수 요청 순번 — 옛 응답이 새 상태를 덮지 않도록(OmokScreen.placeSeq 와 같은 이유) */
let moveSeq = 0;

export function WallRaceScreen({ navigation }: Props) {
  const width = useContentWidth();
  const relationId = useRelationStore((s) => s.couple?.id);
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
  /*
   * 말 얼굴 — 사람이 고른 우리 이모지 하나(서버 저장, 상대도 같은 얼굴을 본다). 예전엔 판 상황마다 표정을
   * 바꿨는데 어지럽다는 의견이 있었다(2026-10-12). 비었거나 지워졌으면 기본 말.
   */
  const [pieces, setPieces] = useState<GamePieces | null>(null);
  const [pieceSheet, setPieceSheet] = useState(false);
  const refreshPieces = useCallback(() => {
    gamePieceApi.get().then(setPieces).catch(() => undefined);
  }, []);
  const choosePiece = (emojiId: number | null) => {
    setPieceSheet(false);
    gamePieceApi
      .set(emojiId)
      .then(setPieces)
      .catch((e) => toast.error(getErrorMessage(e, '말을 바꾸지 못했어요.')));
  };
  const help = useGameHelp('WALL_RACE');
  const refreshRecord = useCallback(() => {
    wallRaceApi.record().then(setServerRecord).catch(() => undefined);
  }, []);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [starting, setStarting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [undoBusy, setUndoBusy] = useState(false);
  /** 판에서 벽을 끄는 중 — 끄는 동안 목록 스크롤을 잠근다(위아래로 끌면 화면이 같이 내려간다) */
  const [dragging, setDragging] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setLoadError(false);
    try {
      const [g, h] = await Promise.all([wallRaceApi.current(), wallRaceApi.history()]);
      refreshRecord();
      refreshPieces();
      setGame(g);
      setHistory(h);
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
  }, [refreshRecord, refreshPieces]);

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
    if (updated.status === 'COMPLETED') {
      setJustFinished(updated);
      setGame(null);
      if (updated.winner === 'ME') haptics.success();
      wallRaceApi.history().then(setHistory).catch(() => undefined);
      refreshRecord();
    } else {
      setGame(updated);
    }
  };

  const movePawn = async (target: number) => {
    if (!game || busy || !game.myTurn) return;
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

  const placeWall = async (slot: number, kind: WallKind) => {
    if (!game || busy) return;
    setBusy(true);
    const seq = ++moveSeq;
    try {
      const updated = await wallRaceApi.placeWall(game.id, slot, kind);
      if (seq !== moveSeq) return;
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

  const askUndo = async () => {
    if (!game || undoBusy) return;
    setUndoBusy(true);
    try {
      setGame(await wallRaceApi.requestUndo(game.id));
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

  const faces = { me: pieces?.myImageUrl ?? null, partner: pieces?.partnerImageUrl ?? null };
  /** 조작 없는 판(결과·지난 판) */
  const renderBoard = (g: WallRaceGame, size = boardSize) => (
    <WallRaceBoard view={g} size={size} interactive={false} showTray={false} faces={faces} />
  );

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

  const renderResult = (g: WallRaceGame) => (
    <View style={[styles.card, styles.resultCard]}>
      <MaterialCommunityIcons name="trophy-outline" size={26} color="#7A5C3A" />
      <Text style={styles.resultTitle}>
        {g.winner === 'ME' ? '이겼어요!' : `${g.partnerName ?? '상대'}가 이겼어요`}
      </Text>
      <Text style={styles.cardDesc}>{g.moveCount}수 · 채팅에 결과 카드를 남겼어요.</Text>
      {renderBoard(g)}
    </View>
  );

  const renderStart = (title: string) => (
    <View style={styles.card}>
      <GameHelpButton onPress={help.open} />
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
      {/* 연습 판 — 앱 안에서만 돌고 기록에 남지 않는다(docs/game-practice-tutorial_2026-10-13.md) */}
      <Button
        title="AI와 연습하기"
        variant="ghost"
        size="sm"
        onPress={() => navigation.navigate('WallRacePractice')}
        style={styles.practiceBtn}
      />
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
    const face = pieces?.partnerImageUrl ?? null;
    return (
      <View style={[styles.dCard, !g.myTurn && { borderColor: PAWN_PARTNER }]}>
        <View style={styles.dCount}>
          <Text style={styles.dCountNum}>{g.partnerWallsLeft}</Text>
          <Text style={styles.dCountLabel}>개의 벽</Text>
        </View>
        <View style={styles.dCardBody}>
          <Text style={styles.dName} numberOfLines={1}>{g.partnerName ?? '상대'}</Text>
          <Text style={[styles.dSub, !g.myTurn && { color: PAWN_PARTNER }]}>
            {g.myTurn ? '기다리는 중' : '두는 중'}
            {g.partnerDistance != null && g.partnerDistance >= 0 ? ` · 도착까지 ${g.partnerDistance}칸` : ''}
          </Text>
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
    const face = pieces?.myImageUrl ?? null;
    return (
      <View style={[styles.dCard, g.myTurn && { borderColor: PAWN_ME }]}>
        {/* 얼굴을 누르면 내 말을 고른다 */}
        <Pressable onPress={() => setPieceSheet(true)} accessibilityRole="button" accessibilityLabel="내 말 고르기" hitSlop={6}>
          {face ? (
            <Image source={{ uri: face }} style={styles.dAvatar} contentFit="contain" />
          ) : (
            <View style={[styles.dAvatar, { backgroundColor: PAWN_ME, borderRadius: 22 }]} />
          )}
          <Text style={styles.dAvatarHint}>바꾸기</Text>
        </Pressable>
        <View style={styles.dCardBody}>
          <Text style={styles.dName}>나</Text>
          <Text style={[styles.dSub, g.myTurn && { color: PAWN_ME }]}>
            {g.myTurn ? '내 차례' : `${g.partnerName ?? '상대'} 차례`} · {g.moveCount}수
            {g.myDistance != null && g.myDistance >= 0 ? ` · 도착까지 ${g.myDistance}칸` : ''}
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
        <Pressable onPress={help.open} accessibilityRole="button" accessibilityLabel="게임 하는 법" hitSlop={10} style={styles.dMenu}>
          <MaterialCommunityIcons name="comment-question-outline" size={20} color={D_TEXT} />
        </Pressable>
        <Pressable onPress={() => openMenu(g)} accessibilityRole="button" accessibilityLabel="메뉴" hitSlop={10} style={styles.dMenu}>
          <MaterialCommunityIcons name="dots-horizontal" size={22} color={D_TEXT} />
        </Pressable>
      </View>
      {renderOpponentCard(g)}
      {!g.myTurn && !g.undoRequest ? <GameNudgeButton gameId={g.id} partnerName={g.partnerName} /> : null}
      {renderHandicap(g)}
      {/* 판 + 벽 트레이(끌어 놓기) — 고르던 벽은 수가 바뀌거나 무르기 요청이 생기면 저절로 비워진다 */}
      <WallRaceBoard
        view={g}
        size={boardSize}
        interactive={g.myTurn && !busy && !g.undoRequest}
        busy={busy}
        faces={faces}
        resetKey={`${g.id}:${g.moveCount}:${g.undoRequest ?? ''}`}
        onMove={movePawn}
        onWall={placeWall}
        onDragChange={setDragging}
        belowBoard={g.undoRequest ? renderUndoBanner(g) : undefined}
      />
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
        scrollEnabled={!dragging}
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
            <View style={styles.histBoard}>{renderBoard(item, historyBoardSize)}</View>
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
      <GameHelpSheet
        game="WALL_RACE"
        visible={help.visible}
        onClose={help.close}
        onPractice={() => {
          help.close();
          navigation.navigate('WallRacePractice');
        }}
      />
      <GamePieceSheet
        visible={pieceSheet}
        onClose={() => setPieceSheet(false)}
        emojis={coupleEmojis}
        selectedId={pieces?.myImageUrl ? pieces.myEmojiId : null}
        onSelect={choosePiece}
        baseColor={PAWN_ME}
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
  practiceBtn: { alignSelf: 'center', marginTop: spacing.xs },
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
  dAvatarHint: { fontSize: 10, fontWeight: '700', color: D_SUB, textAlign: 'center', marginTop: 2 },
  dHint: { fontSize: fontSize.caption, color: D_SUB, lineHeight: 18 },
  dTextBtn: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  dTextBtnLabel: { fontSize: fontSize.caption, fontWeight: '800', color: D_TEXT },
  dBanner: { backgroundColor: D_CARD, borderRadius: 14, borderWidth: 1, borderColor: PAWN_PARTNER, padding: spacing.md, gap: spacing.sm },
  dBannerText: { fontSize: fontSize.body, color: D_TEXT, fontWeight: '700' },

  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
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
