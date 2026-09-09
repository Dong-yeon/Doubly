/**
 * 오목 — 15×15, 번갈아 두고 다섯을 이으면 승리. docs/COUPLE_GAMES_DESIGN_2026-09-09.md 5절.
 *
 * <p>판을 연 사람이 백(후공), 상대가 흑(선공). 내 차례가 아니면 판이 잠기고, 상대의 수는
 * 커플 소켓 이벤트(GAME)로 즉시 따라온다. 순수 View 로 그린다 — 교차점마다 Pressable 하나.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { MaterialCommunityIcons } from '../../components/Icon';
import { omokApi } from '../../api/game';
import { connectSocket, subscribeCouple, unsubscribeCouple } from '../../api/chatSocket';
import { useRelationStore } from '../../store/relationStore';
import { getErrorMessage } from '../../utils/error';
import { relativeDateLabel } from '../../utils/date';
import { Alert } from '../../utils/alert';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { OmokGame } from '../../types';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<HomeStackParamList, 'Omok'>;

const SIZE = 15;
const CELLS = SIZE * SIZE;
/** 화점(별) — 판의 기준점. 15줄 판의 관행 위치 */
const STAR_POINTS = new Set([3 * SIZE + 3, 3 * SIZE + 11, 7 * SIZE + 7, 11 * SIZE + 3, 11 * SIZE + 11]);

/** 착수 요청 순번 — 옛 응답이 새 판 상태를 덮지 않도록(SudokuScreen 과 같은 이유로 모듈 변수) */
let placeSeq = 0;

export function OmokScreen(_: Props) {
  const { width } = useWindowDimensions();
  const relationId = useRelationStore((s) => s.couple?.id);

  const [game, setGame] = useState<OmokGame | null>(null);
  /** 방금 끝난 판 — current 가 null 이 된 뒤에도 결과와 이긴 줄을 보여주기 위해 따로 든다 */
  const [justFinished, setJustFinished] = useState<OmokGame | null>(null);
  const [history, setHistory] = useState<OmokGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [starting, setStarting] = useState(false);
  const [placing, setPlacing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setLoadError(false);
    try {
      const [g, h] = await Promise.all([omokApi.current(), omokApi.history()]);
      setGame(g);
      setHistory(h);
      // 상대가 이겨서 끝났으면 current 가 null 이 된다 — 최신 기록을 결과 화면으로 올린다
      if (!g && h.length > 0) {
        setJustFinished((prev) => (prev && prev.id === h[0].id ? prev : h[0]));
      }
      if (g) setJustFinished(null);
    } catch (e) {
      if (!silent) toast.error(getErrorMessage(e, '판을 불러오지 못했어요.'));
      setLoadError(true);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useFocusEffect(
    useCallback(() => {
      if (!relationId) return undefined;
      let active = true;
      connectSocket()
        .then(() => {
          if (!active) return;
          subscribeCouple(relationId, (type) => {
            if (type === 'GAME') void load(true);
          });
        })
        .catch(() => undefined);
      return () => {
        active = false;
        unsubscribeCouple(relationId);
      };
    }, [relationId, load]),
  );

  const start = async () => {
    setStarting(true);
    try {
      const g = await omokApi.start();
      setGame(g);
      setJustFinished(null);
      haptics.light();
      if (!g.myTurn) toast.success(`${g.partnerName ?? '상대'}에게 선공을 줬어요. 두면 알려드릴게요.`);
    } catch (e) {
      toast.error(getErrorMessage(e, '새 판을 열지 못했어요.'));
    } finally {
      setStarting(false);
    }
  };

  const place = async (index: number) => {
    if (!game || placing) return;
    if (!game.myTurn) {
      toast.error('지금은 상대 차례예요.');
      return;
    }
    if (game.stones[index] !== '0') return;

    // 낙관적 반영 — 내 돌을 바로 놓고 차례를 넘긴 것으로 보여준다. 실패하면 서버 상태로 되돌린다.
    setGame({
      ...game,
      stones: game.stones.slice(0, index) + 'M' + game.stones.slice(index + 1),
      myTurn: false,
      lastMove: index,
      moveCount: game.moveCount + 1,
    });
    haptics.light();
    setPlacing(true);
    const seq = ++placeSeq;
    try {
      const updated = await omokApi.place(game.id, index);
      if (seq !== placeSeq) return;
      if (updated.status === 'COMPLETED') {
        setJustFinished(updated);
        setGame(null);
        if (updated.winner === 'ME') haptics.success();
        omokApi.history().then(setHistory).catch(() => undefined);
      } else {
        setGame(updated);
      }
    } catch (e) {
      if (seq !== placeSeq) return;
      toast.error(getErrorMessage(e, '돌을 놓지 못했어요.'));
      void load(true);
    } finally {
      if (seq === placeSeq) setPlacing(false);
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
          omokApi
            .giveUp(game.id)
            .then(() => { setGame(null); toast.success('이 판은 접었어요.'); })
            .catch((e) => toast.error(getErrorMessage(e, '접지 못했어요.')));
        },
      },
    ]);
  };

  // ── 판 ─────────────────────────────────────────────────────────────

  const boardSize = Math.min(width - spacing.lg * 2, 420);
  const cell = boardSize / SIZE;
  const stoneSize = Math.max(12, cell * 0.78);

  const record = useMemo(
    () => ({
      me: history.filter((g) => g.winner === 'ME').length,
      partner: history.filter((g) => g.winner === 'PARTNER').length,
      draw: history.filter((g) => g.winner === 'DRAW').length,
    }),
    [history],
  );

  const renderBoard = (g: OmokGame, interactive: boolean) => {
    const winning = new Set(g.winningLine ?? []);
    // 색은 내 돌/상대 돌이 아니라 흑/백으로 그린다 — 오목의 관행이고 둘의 화면이 같아 보여야 대화가 된다
    const myIsBlack = g.myColor === 'BLACK';
    return (
      <View style={[styles.board, { width: boardSize, height: boardSize }]}>
        {Array.from({ length: CELLS }, (_, index) => {
          const row = Math.floor(index / SIZE);
          const col = index % SIZE;
          const s = g.stones[index];
          const isBlack = s === 'M' ? myIsBlack : s === 'P' ? !myIsBlack : false;
          const half = cell / 2;
          return (
            <Pressable
              key={index}
              disabled={!interactive}
              onPress={() => place(index)}
              accessibilityRole="button"
              accessibilityLabel={`${row + 1}행 ${col + 1}열 ${s === '0' ? '빈 자리' : isBlack ? '흑돌' : '백돌'}`}
              style={{ width: cell, height: cell }}
            >
              {/* 격자선 — 가장자리는 판 중앙 쪽 절반만 그려 교차점이 선 끝에 오게 한다 */}
              <View
                style={[
                  styles.lineH,
                  { top: half - 0.5, left: col === 0 ? half : 0, right: col === SIZE - 1 ? half : 0 },
                ]}
              />
              <View
                style={[
                  styles.lineV,
                  { left: half - 0.5, top: row === 0 ? half : 0, bottom: row === SIZE - 1 ? half : 0 },
                ]}
              />
              {STAR_POINTS.has(index) && s === '0' ? (
                <View style={[styles.star, { left: half - 2.5, top: half - 2.5 }]} />
              ) : null}
              {s !== '0' ? (
                <View
                  style={[
                    styles.stone,
                    isBlack ? styles.stoneBlack : styles.stoneWhite,
                    winning.has(index) && styles.stoneWinning,
                    {
                      width: stoneSize,
                      height: stoneSize,
                      borderRadius: stoneSize / 2,
                      left: half - stoneSize / 2,
                      top: half - stoneSize / 2,
                    },
                  ]}
                >
                  {g.lastMove === index ? (
                    <View style={[styles.lastDot, isBlack ? styles.lastDotOnBlack : styles.lastDotOnWhite]} />
                  ) : null}
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    );
  };

  const renderTurnBar = (g: OmokGame) => (
    <View style={styles.turnRow}>
      <View style={[styles.turnChip, g.myTurn && styles.turnChipActive]}>
        <View style={[styles.miniStone, g.myColor === 'BLACK' ? styles.stoneBlack : styles.stoneWhite]} />
        <Text style={[styles.turnText, g.myTurn && styles.turnTextActive]}>나</Text>
      </View>
      <Text style={styles.turnHint}>{g.myTurn ? '내 차례예요' : `${g.partnerName ?? '상대'} 차례예요`} · {g.moveCount}수</Text>
      <View style={[styles.turnChip, !g.myTurn && styles.turnChipActive]}>
        <View style={[styles.miniStone, g.myColor === 'BLACK' ? styles.stoneWhite : styles.stoneBlack]} />
        <Text style={[styles.turnText, !g.myTurn && styles.turnTextActive]} numberOfLines={1}>
          {g.partnerName ?? '상대'}
        </Text>
      </View>
    </View>
  );

  const renderResult = (g: OmokGame) => {
    const title = g.winner === 'ME' ? '이겼어요!' : g.winner === 'PARTNER' ? `${g.partnerName ?? '상대'}가 이겼어요` : '무승부';
    return (
      <View style={[styles.card, styles.resultCard]}>
        <MaterialCommunityIcons
          name={g.winner === 'DRAW' ? 'handshake-outline' : 'trophy-outline'}
          size={26}
          color={colors.primary}
        />
        <Text style={styles.resultTitle}>{title}</Text>
        <Text style={styles.cardDesc}>{g.moveCount}수 · 채팅에 결과 카드를 남겼어요.</Text>
        {renderBoard(g, false)}
      </View>
    );
  };

  const renderStart = (title: string) => (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>오목</Text>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardDesc}>
        판을 열면 상대가 흑(선공), 나는 백이에요. 다섯을 먼저 이으면 이겨요. 삼삼 같은 제한은 없어요.
      </Text>
      {record.me + record.partner + record.draw > 0 ? (
        <Text style={styles.record}>
          전적 {record.me}승 {record.partner}패{record.draw > 0 ? ` ${record.draw}무` : ''}
        </Text>
      ) : null}
      <Button title="판 열기" onPress={start} loading={starting} style={styles.startBtn} />
    </View>
  );

  const header = (
    <View>
      {game ? (
        <View>
          {renderTurnBar(game)}
          {renderBoard(game, game.myTurn && !placing)}
          <Text style={styles.hint}>
            {game.myTurn ? '교차점을 누르면 돌이 놓여요.' : '상대가 두면 바로 보여요. 2분 넘게 조용하면 상대에게 알림이 가요.'}
          </Text>
          <Button title="이 판 접기" variant="ghost" size="sm" onPress={confirmGiveUp} style={styles.giveUp} />
        </View>
      ) : justFinished ? (
        <>
          {renderResult(justFinished)}
          {renderStart('한 판 더?')}
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
          <View style={styles.histCard}>
            <View style={styles.histRow}>
              <Text style={styles.histDate}>{item.completedAt ? relativeDateLabel(item.completedAt.slice(0, 10)) : ''}</Text>
              <Text style={[styles.histResult, item.winner === 'ME' && styles.histWin]}>
                {item.winner === 'ME' ? '승' : item.winner === 'PARTNER' ? '패' : '무'}
              </Text>
            </View>
            <Text style={styles.histText}>
              {item.moveCount}수 · 나 {item.myColor === 'BLACK' ? '흑' : '백'}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          !loading && loadError && !game ? (
            <EmptyState error onRetry={() => load()} title="불러오지 못했어요" description="네트워크 상태를 확인하고 다시 시도해주세요." />
          ) : null
        }
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
  cardDesc: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: spacing.xs, lineHeight: 18 },
  record: { fontSize: fontSize.body, color: colors.textPrimary, fontWeight: '700', marginTop: spacing.sm },
  startBtn: { marginTop: spacing.md },
  resultCard: { alignItems: 'center', gap: spacing.xs },
  resultTitle: { fontSize: fontSize.title, fontWeight: '800', color: colors.textPrimary },

  turnRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm, gap: spacing.xs },
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
    maxWidth: '34%',
  },
  turnChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryBg },
  turnText: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textSecondary, flexShrink: 1 },
  turnTextActive: { color: colors.primary, fontWeight: '800' },
  turnHint: { flex: 1, textAlign: 'center', fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '600' },
  miniStone: { width: 12, height: 12, borderRadius: 6 },

  board: {
    alignSelf: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    // 나무색 판 — 일러스트 고유값이라 테마 토큰을 쓰지 않는다(다크에서도 같은 판이어야 돌 색이 읽힌다)
    backgroundColor: '#E8C48A',
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  lineH: { position: 'absolute', height: 1, backgroundColor: '#8B6A3A' },
  lineV: { position: 'absolute', width: 1, backgroundColor: '#8B6A3A' },
  star: { position: 'absolute', width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#8B6A3A' },
  stone: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  stoneBlack: { backgroundColor: '#1E1E1E', borderWidth: 1, borderColor: '#000000' },
  stoneWhite: { backgroundColor: '#F7F5EF', borderWidth: 1, borderColor: '#9A9A9A' },
  stoneWinning: { borderWidth: 2, borderColor: colors.primary },
  lastDot: { width: 5, height: 5, borderRadius: 2.5 },
  lastDotOnBlack: { backgroundColor: '#F7F5EF' },
  lastDotOnWhite: { backgroundColor: '#1E1E1E' },

  hint: { fontSize: fontSize.caption, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.md, lineHeight: 18 },
  giveUp: { alignSelf: 'center', marginTop: spacing.xs },

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
  histText: { fontSize: fontSize.body, color: colors.textPrimary, marginTop: 2, fontWeight: '600' },
}));
