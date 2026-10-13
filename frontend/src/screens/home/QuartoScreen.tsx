/**
 * 넷이 같아 — 4×4 판, 말 16개. docs/game-current-state.md 11절. 화면 골격은 오목(OmokScreen)과 같다.
 *
 * <p>한 수 = 상대가 준 말을 놓기 + 남은 말 하나를 건네기. 흐름은 "빈 칸 탭 → 미리보기 → 건넬 말 고르기 →
 * [확정]"이고 API 는 확정 때 <b>한 번</b>만 부른다. 확정 전에는 칸도 말도 자유롭게 바꾼다.
 *
 * <p>판정은 서버가 한다. 앱은 games/quarto 로 "여기 놓으면 이기나"만 미리 계산해, 이기는 칸이면 건넬 말 줄을
 * 숨기고 [놓고 승리] 를 띄운다(이기는 수에 말을 같이 보내면 서버가 거절한다). 건넬 말 줄에 "이 말을 주면 상대가
 * 이긴다" 같은 경고는 일부러 하지 않는다 — 그걸 읽어 내는 게 이 게임의 재미다.
 *
 * <p>말은 원작 나무 말을 따르지 않고 앱 토큰으로 그린다. 속성 넷은 색에만 기대지 않는다 — 모양(둥근/네모)·
 * 크기·속(꽉 참/구멍)은 형태로 보이고, 색 차이도 둘째 색 말에 가운데 점을 찍어 색을 못 가려도 구분된다.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/types';
import { useContentWidth } from '../../hooks/useContentWidth';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { GameNudgeButton } from '../../components/GameNudgeButton';
import { GameReactionBar } from '../../components/GameReactionBar';
import { GameHelpButton, GameHelpSheet, useGameHelp } from '../../components/GameHelpSheet';
import { MaterialCommunityIcons } from '../../components/Icon';
import { quartoApi } from '../../api/game';
import { ApiError } from '../../api/client';
import { connectSocket, newClientMessageId, subscribeCouple } from '../../api/chatSocket';
import { useRelationStore } from '../../store/relationStore';
import { toast } from '../../store/toastStore';
import { getErrorMessage } from '../../utils/error';
import { relativeTimestampLabel } from '../../utils/date';
import { Alert } from '../../utils/alert';
import { haptics } from '../../utils/haptics';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { QUARTO_DISPLAY_NAME } from '../../constants/quarto';
import { CELLS, EMPTY, SIZE, commonTraitLabels, describePiece, previewPlace } from '../../games/quarto';
import { QuartoBoard, type QuartoBoardProps, QuartoHand, QuartoTray, lastPlaceOf } from '../../components/quarto/QuartoParts';
import type { GameRecord, QuartoGame, QuartoMoveBody } from '../../types';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<HomeStackParamList, 'Quarto'>;

/** 수 요청 순번 — 옛 응답이 새 판 상태를 덮지 않도록(OmokScreen 과 같은 이유로 모듈 변수) */
let moveSeq = 0;

export function QuartoScreen({ navigation }: Props) {
  const width = useContentWidth();
  const relationId = useRelationStore((s) => s.couple?.id);
  const help = useGameHelp('QUARTO');

  const [game, setGame] = useState<QuartoGame | null>(null);
  /** 방금 끝난 판 — current 가 null 이 된 뒤에도 결과와 이긴 줄을 보여주기 위해 따로 든다 */
  const [justFinished, setJustFinished] = useState<QuartoGame | null>(null);
  /** 보던 판을 상대가 접었다 — 그 사람 이름 */
  const [foldedBy, setFoldedBy] = useState<string | null>(null);
  /** 지금 보고 있는 진행 중 판 — 사라졌을 때 끝났는지(기록에 있음) 접혔는지(없음) 가른다. 길막기·오목과 같다 */
  const watchingRef = useRef<QuartoGame | null>(null);
  const [history, setHistory] = useState<QuartoGame[]>([]);
  const [serverRecord, setServerRecord] = useState<GameRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [starting, setStarting] = useState(false);
  const [sending, setSending] = useState(false);
  /**
   * 확정 전 고른 것 — 놓을 칸, 건넬 말. 어느 수에서 고른 것인지(key)를 함께 들어, 판이 한 수 움직이면
   * 저절로 비어 보이게 한다 — 낡은 칸·말로 확정하지 않게.
   */
  const [pick, setPick] = useState<{ key: string; cell: number | null; give: number | null }>({ key: '', cell: null, give: null });
  const turnKey = game ? `${game.id}:${game.moveNo}` : '';
  const selCell = pick.key === turnKey ? pick.cell : null;
  const selGive = pick.key === turnKey ? pick.give : null;
  /** 복기 — step 은 "지금까지 둔 수" 개수 */
  const [replay, setReplay] = useState<{ game: QuartoGame; step: number } | null>(null);

  const refreshRecord = useCallback(() => {
    quartoApi.record().then(setServerRecord).catch(() => undefined);
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setLoadError(false);
    try {
      const [g, h] = await Promise.all([quartoApi.current(), quartoApi.history()]);
      refreshRecord();
      setGame(g);
      setHistory(h);
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

  // 앱에 돌아오면(포커스) 다시 읽고, 상대가 두면 커플 소켓 GAME 이벤트로 다시 읽는다 — 길막기와 같은 방식
  useFocusEffect(useCallback(() => { load(); }, [load]));

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
      const g = await quartoApi.start();
      setGame(g);
      setJustFinished(null);
      setFoldedBy(null);
      haptics.light();
      if (!g.myTurn) toast.success(`${g.partnerName ?? '상대'}가 먼저 건넬 말을 골라요. 고르면 알려드릴게요.`);
    } catch (e) {
      toast.error(getErrorMessage(e, '새 판을 열지 못했어요.'));
    } finally {
      setStarting(false);
    }
  };

  // ── 확정 전 미리보기 ─────────────────────────────────────────────────

  const placing = !!game && game.myAction === 'PLACE' && game.pendingPiece != null;
  const preview = useMemo(
    () => (placing && game && selCell != null ? previewPlace(game.board, selCell, game.pendingPiece as number) : null),
    [placing, game, selCell],
  );
  const winning = !!preview?.winLine;
  /** 16번째 말 — 놓으면 끝(줄이 없으면 무승부), 건넬 말이 없다 */
  const lastCell = !!preview && !winning && preview.remainingAfter.length === 0;
  /** 15번째 말 — 남은 말이 하나뿐이라 건넬 말을 고를 것이 없다 */
  const autoGive = !!preview && !winning && preview.remainingAfter.length === 1 ? preview.remainingAfter[0] : null;
  const showTray = !!game && game.myTurn && (game.myAction === 'GIVE' || (placing && !winning && !lastCell && autoGive == null));

  const tapCell = (index: number) => {
    if (!placing || !game || sending) return;
    if (game.board[index] !== EMPTY) return;
    haptics.light();
    setPick({ key: turnKey, cell: selCell === index ? null : index, give: selGive });
  };

  const tapTray = (piece: number) => {
    if (!game || sending) return;
    haptics.light();
    setPick({ key: turnKey, cell: selCell, give: selGive === piece ? null : piece });
  };

  /** 지금 고른 것으로 보낼 수 — 아직 확정할 수 없으면 null */
  const pendingBody = (): Omit<QuartoMoveBody, 'clientMoveId'> | null => {
    if (!game || !game.myTurn) return null;
    if (game.myAction === 'GIVE') return selGive == null ? null : { give: selGive };
    if (!placing || selCell == null) return null;
    const piece = game.pendingPiece as number;
    if (winning || lastCell) return { place: selCell, piece };
    if (autoGive != null) return { place: selCell, piece, give: autoGive };
    if (selGive == null || !preview?.remainingAfter.includes(selGive)) return null;
    return { place: selCell, piece, give: selGive };
  };

  const confirm = async () => {
    if (!game || sending) return;
    const picked = pendingBody();
    if (!picked) return;
    // 멱등키는 확정 한 번에 하나 — 응답을 못 받아 다시 보내도 서버가 같은 수로 알아본다
    const body: QuartoMoveBody = { ...picked, clientMoveId: newClientMessageId() };
    setSending(true);
    const seq = ++moveSeq;
    try {
      let updated: QuartoGame;
      try {
        updated = await quartoApi.move(game.id, body);
      } catch (e) {
        // 응답을 못 받았다(끊김·타임아웃) — 서버에는 들어갔을 수 있으니 같은 키로 한 번만 더 묻는다
        if (e instanceof ApiError && e.status === 0) updated = await quartoApi.move(game.id, body);
        else throw e;
      }
      if (seq !== moveSeq) return;
      if (updated.status === 'COMPLETED') {
        watchingRef.current = null;
        setJustFinished(updated);
        setGame(null);
        if (updated.winner === 'ME') haptics.success();
        quartoApi.history().then(setHistory).catch(() => undefined);
        refreshRecord();
      } else {
        haptics.light();
        setGame(updated);
      }
    } catch (e) {
      if (seq !== moveSeq) return;
      toast.error(getErrorMessage(e, '두지 못했어요.'));
      void load(true);
    } finally {
      if (seq === moveSeq) setSending(false);
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
          // 내가 접는다 — 소켓 이벤트가 응답보다 먼저 와도 "상대가 접었어요"가 뜨지 않게 요청 전에 잊는다
          const watching = watchingRef.current;
          watchingRef.current = null;
          quartoApi
            .giveUp(game.id)
            .then(() => { setGame(null); toast.success('이 판은 접었어요.'); })
            .catch((e) => {
              watchingRef.current = watching;
              toast.error(getErrorMessage(e, '접지 못했어요.'));
            });
        },
      },
    ]);
  };

  // ── 그리기 ──────────────────────────────────────────────────────────

  const boardSize = Math.min(width - spacing.lg * 2, 360);
  const traySlot = Math.min(44, (width - spacing.lg * 2 - spacing.xs * 7) / 8);

  const record = useMemo(
    () => serverRecord ?? {
      me: history.filter((g) => g.winner === 'ME').length,
      partner: history.filter((g) => g.winner === 'PARTNER').length,
      draw: history.filter((g) => g.winner === 'DRAW').length,
    },
    [serverRecord, history],
  );

  const renderBoard = (board: number[], opts: Omit<QuartoBoardProps, 'board' | 'size' | 'onCellPress'>) => (
    <QuartoBoard board={board} size={boardSize} onCellPress={tapCell} {...opts} />
  );

  /** 놓을 말(또는 내가 준 말)을 크게 — 판 위에 둔다 */
  const renderHand = (g: QuartoGame) => {
    const partner = g.partnerName ?? '상대';
    let label: string;
    if (g.myTurn && g.myAction === 'GIVE') label = `먼저 ${partner}에게 건넬 말을 골라요`;
    else if (g.myTurn) label = `${partner}가 준 말`;
    else if (g.pendingPiece != null) label = '내가 준 말';
    else label = `${partner}가 건넬 말을 고르는 중`;
    const sub = `${g.myTurn ? '내 차례예요' : `${partner} 차례예요`} · ${Math.max(0, g.moveNo - 1)}/${CELLS}칸`;
    return <QuartoHand piece={g.pendingPiece} label={label} sub={sub} />;
  };

  const renderTray = (available: number[]) => (
    <QuartoTray available={available} selected={selGive} onSelect={tapTray} disabled={sending} slot={traySlot} />
  );

  const renderActions = (g: QuartoGame) => {
    if (!g.myTurn) return null;
    let title: string;
    let hint: string | null = null;
    if (g.myAction === 'GIVE') {
      title = '이 말 건네기';
      if (selGive == null) hint = '아래에서 건넬 말을 하나 골라요.';
    } else if (selCell == null) {
      title = '놓고 건네기';
      hint = '빈 칸을 눌러 받은 말을 놓아 보세요. 확정 전에는 몇 번이고 바꿔도 돼요.';
    } else if (winning) {
      title = '놓고 승리';
      hint = '여기 놓으면 넷이 같은 줄이 생겨요!';
    } else if (lastCell) {
      title = '마지막 칸에 놓기';
    } else if (autoGive != null) {
      title = '놓기';
      hint = '남은 말이 하나뿐이라 저절로 건네져요.';
    } else {
      title = '놓고 건네기';
      if (selGive == null) hint = '건넬 말을 골라 주세요.';
    }
    return (
      <View style={styles.actions}>
        {hint ? <Text style={[styles.hint, winning && styles.hintWin]}>{hint}</Text> : null}
        <Button
          title={title}
          onPress={confirm}
          loading={sending}
          disabled={!pendingBody()}
        />
      </View>
    );
  };

  const winText = (g: QuartoGame) => {
    if (!g.winLine) return null;
    const labels = commonTraitLabels(g.winLine.map((i) => g.board[i]));
    return labels.length > 0 ? labels.join(' · ') : null;
  };

  const renderResult = (g: QuartoGame) => {
    const title = g.winner === 'ME' ? '이겼어요!' : g.winner === 'PARTNER' ? `${g.partnerName ?? '상대'}가 이겼어요` : '무승부';
    const traits = winText(g);
    return (
      <View style={[styles.card, styles.resultCard]}>
        <MaterialCommunityIcons
          name={g.winner === 'DRAW' ? 'handshake-outline' : 'trophy-outline'}
          size={26}
          color={colors.primary}
        />
        <Text style={styles.resultTitle}>{title}</Text>
        <Text style={styles.cardDesc}>
          {traits ?? (g.winner === 'DRAW' ? '16칸이 다 찼는데 넷이 같은 줄이 없었어요.' : '')}
        </Text>
        {renderBoard(g.board, { highlight: g.winLine, lastPlace: lastPlaceOf(g.moves) })}
        {g.moves.length > 0 ? (
          <Button title="복기 보기" variant="ghost" size="sm" onPress={() => setReplay({ game: g, step: 0 })} />
        ) : null}
      </View>
    );
  };

  /** 복기 — 수 기록을 step 개까지 다시 놓는다. 첫 수(말 주기)는 판을 바꾸지 않는다 */
  const renderReplay = (r: { game: QuartoGame; step: number }) => {
    const { game: g, step } = r;
    const total = g.moves.length;
    const board = Array<number>(CELLS).fill(EMPTY);
    let last: number | null = null;
    for (let i = 0; i < step; i += 1) {
      const m = g.moves[i];
      if (m.place != null && m.piece != null) {
        board[m.place] = m.piece;
        last = m.place;
      }
    }
    const current = step > 0 ? g.moves[step - 1] : null;
    const setStep = (next: number) => setReplay({ game: g, step: Math.max(0, Math.min(total, next)) });
    const keys: { icon: 'skip-backward' | 'chevron-left' | 'chevron-right' | 'skip-forward'; label: string; to: number; off: boolean }[] = [
      { icon: 'skip-backward', label: '처음으로', to: 0, off: step === 0 },
      { icon: 'chevron-left', label: '한 수 뒤로', to: step - 1, off: step === 0 },
      { icon: 'chevron-right', label: '한 수 앞으로', to: step + 1, off: step === total },
      { icon: 'skip-forward', label: '끝으로', to: total, off: step === total },
    ];
    return (
      <View style={styles.replayWrap}>
        <View style={styles.replayHead}>
          <Text style={styles.replayTitle}>복기 · {step}/{total}수</Text>
          <Pressable onPress={() => setReplay(null)} accessibilityRole="button" accessibilityLabel="복기 닫기">
            <Text style={styles.replayClose}>닫기</Text>
          </Pressable>
        </View>
        {current ? (
          <Text style={styles.replayNote}>
            {current.mine ? '내가' : `${g.partnerName ?? '상대'}가`}{' '}
            {current.place != null ? `${Math.floor(current.place / SIZE) + 1}행 ${current.place % SIZE + 1}열에 놓고` : ''}
            {current.give != null ? ` ${describePiece(current.give)}을 건넸어요` : ' 끝냈어요'}
          </Text>
        ) : null}
        {renderBoard(board, { lastPlace: last, highlight: step === total ? g.winLine : null })}
        <View style={styles.replayControls}>
          {keys.map((k) => (
            <Pressable
              key={k.label}
              onPress={() => setStep(k.to)}
              disabled={k.off}
              accessibilityRole="button"
              accessibilityLabel={k.label}
              style={({ pressed }) => [styles.replayKey, k.off && styles.replayKeyOff, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons name={k.icon} size={22} color={colors.textPrimary} />
            </Pressable>
          ))}
        </View>
      </View>
    );
  };

  const renderGame = (g: QuartoGame) => (
    <View>
      {renderHand(g)}
      {!g.myTurn ? <GameNudgeButton gameId={g.id} partnerName={g.partnerName} /> : null}
      {renderBoard(preview ? preview.board.map((p, i) => (i === selCell ? EMPTY : p)) : g.board, {
        interactive: placing && !sending,
        ghostAt: selCell,
        ghostPiece: placing ? g.pendingPiece : null,
        highlight: preview?.winLine ?? null,
        lastPlace: lastPlaceOf(g.moves),
      })}
      {renderActions(g)}
      {showTray ? renderTray(preview ? preview.remainingAfter : g.remainingPieces) : null}
      {!g.myTurn ? (
        <Text style={styles.hint}>상대가 두면 바로 보여요. 2분 넘게 조용하면 상대에게 알림이 가요.</Text>
      ) : null}
      <GameReactionBar gameType="QUARTO" />
      <Button title="이 판 접기" variant="ghost" size="sm" onPress={confirmGiveUp} style={styles.giveUp} />
    </View>
  );

  const renderStart = (title: string) => (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>{QUARTO_DISPLAY_NAME}</Text>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardDesc}>
        판을 열면 상대가 먼저 건넬 말을 골라요. 받은 말을 놓고, 남은 말 중 하나를 건네요. 색·모양·크기·속 중
        하나라도 같은 말 넷으로 한 줄을 내가 채우면 이겨요.
      </Text>
      {record.me + record.partner + record.draw > 0 ? (
        <Text style={styles.record}>
          전적 {record.me}승 {record.partner}패{record.draw > 0 ? ` ${record.draw}무` : ''}
        </Text>
      ) : null}
      <Button title="판 열기" onPress={start} loading={starting} style={styles.startBtn} />
      {/* 연습 판 — 앱 안에서만 돌고 기록에 남지 않는다(docs/game-practice-tutorial_2026-10-13.md) */}
      <Button
        title="AI와 연습하기"
        variant="ghost"
        size="sm"
        onPress={() => navigation.navigate('QuartoPractice')}
        style={styles.practiceBtn}
      />
    </View>
  );

  const header = (
    <View>
      <GameHelpButton onPress={help.open} />
      {replay ? (
        renderReplay(replay)
      ) : game ? (
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
      {history.length > 0 ? <Text style={styles.sectionTitle}>지난 판</Text> : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={history}
        keyExtractor={(g) => String(g.id)}
        contentContainerStyle={styles.list}
        refreshing={loading}
        onRefresh={() => load()}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setReplay({ game: item, step: item.moves.length })}
            accessibilityRole="button"
            accessibilityLabel={`${Math.max(0, item.moveNo - 1)}칸 판 복기 보기`}
            style={({ pressed }) => [styles.histCard, pressed && styles.pressed]}
          >
            <View style={styles.histRow}>
              <Text style={styles.histDate}>{item.completedAt ? relativeTimestampLabel(item.completedAt) : ''}</Text>
              <Text style={[styles.histResult, item.winner === 'ME' && styles.histWin]}>
                {item.winner === 'ME' ? '승' : item.winner === 'PARTNER' ? '패' : '무'}
              </Text>
            </View>
            <View style={styles.histRow}>
              <Text style={styles.histText}>{winText(item) ?? `${Math.max(0, item.moveNo - 1)}칸`}</Text>
              <Text style={styles.histReplay}>복기 ▸</Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          !loading && loadError && !game ? (
            <EmptyState error onRetry={() => load()} title="불러오지 못했어요" description="네트워크 상태를 확인하고 다시 시도해주세요." />
          ) : null
        }
      />
      <GameHelpSheet
        game="QUARTO"
        visible={help.visible}
        onClose={help.close}
        onPractice={() => {
          help.close();
          navigation.navigate('QuartoPractice');
        }}
      />
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
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
  cardDesc: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: spacing.xs, lineHeight: 18, textAlign: 'center' },
  record: { fontSize: fontSize.body, color: colors.textPrimary, fontWeight: '700', marginTop: spacing.sm },
  startBtn: { marginTop: spacing.md },
  practiceBtn: { alignSelf: 'center', marginTop: spacing.xs },
  resultCard: { alignItems: 'center', gap: spacing.xs },
  resultTitle: { fontSize: fontSize.title, fontWeight: '800', color: colors.textPrimary },



  actions: { marginTop: spacing.md, gap: spacing.sm },
  hint: { fontSize: fontSize.caption, color: colors.textSecondary, textAlign: 'center', lineHeight: 18 },
  hintWin: { color: colors.success, fontWeight: '800' },


  giveUp: { alignSelf: 'center', marginTop: spacing.xs },
  pressed: { opacity: 0.6 },

  replayWrap: { marginBottom: spacing.md },
  replayHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  replayTitle: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  replayClose: { fontSize: fontSize.caption, fontWeight: '800', color: colors.primary },
  replayNote: { fontSize: fontSize.caption, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xs },
  replayControls: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.md },
  replayKey: {
    width: 52,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  replayKeyOff: { opacity: 0.35 },

  sectionTitle: { fontSize: fontSize.subtitle, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.lg, marginBottom: spacing.sm },
  histCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  histRow: { flexDirection: 'row', justifyContent: 'space-between' },
  histDate: { fontSize: fontSize.caption, color: colors.textMuted, fontWeight: '700' },
  histResult: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '800' },
  histWin: { color: colors.primary },
  histReplay: { fontSize: fontSize.caption, color: colors.primary, fontWeight: '800', marginTop: 2 },
  histText: { fontSize: fontSize.body, color: colors.textPrimary, marginTop: 2, fontWeight: '600', flexShrink: 1 },
}));
