/**
 * 미니게임 허브 — 협동 스도쿠·오목·캐치마인드 중 고른다.
 * docs/COUPLE_GAMES_DESIGN_2026-09-09.md 5절 · COUPLE_GAMES_EXPANSION_2026-09-14.md · CATCH_MIND_2026-09-14.md.
 *
 * <p>카드 하나가 게임 하나. 진행 중인 판이 있으면 그 상태(채운 칸 수·누구 차례)를 카드에 띄워
 * "이어서" 들어가게 한다. 세 게임의 진행 상태는 같은 커플 소켓 이벤트(GAME)로 갱신된다.
 *
 * <p>맨 위의 스트릭과 오늘의 판은 종목에 걸리지 않는다 — 스트릭은 어느 게임이든 하나 끝내면
 * 이어지고, 오늘의 판은 스도쿠지만 "오늘 할 것"이라 게임 카드보다 위에 둔다.
 */
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/types';
import { MaterialCommunityIcons } from '../../components/Icon';
import { EmptyState } from '../../components/EmptyState';
import { catchMindApi, gameStreakApi, omokApi, puzzleApi, sudokuApi, wallRaceApi } from '../../api/game';
import { connectSocket, subscribeCouple, unsubscribeCouple } from '../../api/chatSocket';
import { useRelationStore } from '../../store/relationStore';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type {
  CatchMindGame,
  DailySudoku,
  GameStreak,
  OmokGame,
  PuzzleBattleGame,
  SudokuGame,
  WallRaceGame,
} from '../../types';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<HomeStackParamList, 'MiniGames'>;

export function MiniGamesScreen({ navigation }: Props) {
  const relationId = useRelationStore((s) => s.couple?.id);
  const [sudoku, setSudoku] = useState<SudokuGame | null>(null);
  const [omok, setOmok] = useState<OmokGame | null>(null);
  const [omokRecord, setOmokRecord] = useState<{ me: number; partner: number } | null>(null);
  const [catchMind, setCatchMind] = useState<CatchMindGame | null>(null);
  const [puzzle, setPuzzle] = useState<PuzzleBattleGame | null>(null);
  const [wallRace, setWallRace] = useState<WallRaceGame | null>(null);
  const [daily, setDaily] = useState<DailySudoku | null>(null);
  const [streak, setStreak] = useState<GameStreak | null>(null);
  const [openingDaily, setOpeningDaily] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, o, h, d, st, cm, pz, wr] = await Promise.all([
        sudokuApi.current(),
        omokApi.current(),
        omokApi.history(),
        sudokuApi.daily(),
        gameStreakApi.get(),
        catchMindApi.current(),
        puzzleApi.current(),
        wallRaceApi.current(),
      ]);
      setSudoku(s);
      setOmok(o);
      setCatchMind(cm);
      setPuzzle(pz);
      setWallRace(wr);
      setOmokRecord({
        me: h.filter((g) => g.winner === 'ME').length,
        partner: h.filter((g) => g.winner === 'PARTNER').length,
      });
      setDaily(d);
      setStreak(st);
      setLoadError(false);
    } catch {
      // 카드는 상태 없이도 들어갈 수 있으니 화면을 막지 않는다 — 오류 배너만 한 줄
      setLoadError(true);
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
            if (type === 'GAME') void load();
          });
        })
        .catch(() => undefined);
      return () => {
        active = false;
        unsubscribeCouple(relationId);
      };
    }, [relationId, load]),
  );

  const sudokuStatus = sudoku
    ? `진행 중 · ${sudoku.myCells + sudoku.partnerCells}/${81 - sudoku.puzzle.replace(/0/g, '').length}칸`
    : '둘이 같은 판을 채워요';
  const omokStatus = omok
    ? omok.myTurn
      ? `내 차례 · ${omok.moveCount}수`
      : `${omok.partnerName ?? '상대'} 차례 · ${omok.moveCount}수`
    : omokRecord && omokRecord.me + omokRecord.partner > 0
      ? `전적 ${omokRecord.me}승 ${omokRecord.partner}패`
      : '번갈아 두는 5목';

  const wallRaceStatus = wallRace
    ? wallRace.myTurn
      ? `내 차례 · ${wallRace.moveCount}수`
      : `${wallRace.partnerName ?? '상대'} 차례 · ${wallRace.moveCount}수`
    : '벽으로 길을 돌리는 9×9 대결';

  /* 내 차례인가 = 상대가 낸 문제를 내가 아직 못 맞혔는가 */
  const catchMindMine = catchMind?.role === 'GUESSER';
  const catchMindStatus = catchMind
    ? catchMindMine
      ? `맞힐 차례 · ${catchMind.wordLength}글자`
      : catchMind.guessCount > 0
        ? `${catchMind.partnerName ?? '상대'}가 ${catchMind.guessCount}번 시도했어요`
        : `${catchMind.partnerName ?? '상대'}가 아직 안 봤어요`
    : '그려서 보내면 아무 때나 맞혀요';

  /* 대전은 둘 다 결과를 내야 끝난다 — 상대가 냈고 내가 아직이면 "내 차례"다 */
  const puzzleMine = !!puzzle && !puzzle.me;
  const puzzleStatus = puzzle
    ? puzzle.me
      ? `${puzzle.partnerName ?? '상대'}를 기다리는 중 · 내 ${puzzle.me.maxChain}연쇄`
      : puzzle.partner
        ? `${puzzle.partnerName ?? '상대'}의 ${puzzle.partner.maxChain}연쇄 기록에 도전`
        : `${puzzle.partnerName ?? '상대'}가 대전 판을 열었어요`
    : '연쇄로 방해를 주고받는 대전 · 혼자 연습도';

  const dailyStatus = !daily
    ? ''
    : daily.state === 'COMPLETED'
      ? '오늘은 마쳤어요. 내일 새 판이 열려요'
      : daily.state === 'IN_PROGRESS'
        ? '풀던 판을 이어서'
        : daily.blockedByOtherGame
          ? '지금은 열 수 없어요'
          : '아직 안 열었어요';

  /*
   * 오늘의 판은 허브에서 바로 연다 — 스도쿠 화면에 들어가 난이도를 고르는 흐름과 섞이면
   * "오늘 것"이라는 성격이 흐려진다. 열고 나서 화면으로 넘긴다.
   */
  const openDaily = async () => {
    if (!daily || openingDaily) return;
    if (daily.state === 'IN_PROGRESS' || daily.blockedByOtherGame) {
      navigation.navigate('Sudoku');
      return;
    }
    setOpeningDaily(true);
    try {
      await sudokuApi.startDaily();
      navigation.navigate('Sudoku');
      void load();
    } catch (e) {
      toast.error(getErrorMessage(e, '오늘의 판을 열지 못했어요.'));
      void load();
    } finally {
      setOpeningDaily(false);
    }
  };

  if (!relationId) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <EmptyState
          icon="gamepad-variant-outline"
          title="커플 연결 후 함께 할 수 있어요"
          description="게임은 둘이 같은 판을 보는 기능이라 연결이 먼저예요."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.list}>
        {loadError ? <Text style={styles.errorLine}>진행 상태를 불러오지 못했어요. 들어가면 다시 시도해요.</Text> : null}

        {streak && streak.current > 0 ? (
          <View style={styles.streakRow}>
            <Text style={styles.streakFlame}>🔥</Text>
            <Text style={styles.streakText}>
              같이 한 판 <Text style={styles.streakNumber}>{streak.current}일째</Text>
              {streak.playedToday ? '' : ' · 오늘 한 판이면 이어져요'}
            </Text>
            {streak.best > streak.current ? (
              <Text style={styles.streakBest}>최고 {streak.best}일</Text>
            ) : null}
          </View>
        ) : null}

        {daily ? (
          <Pressable
            onPress={openDaily}
            disabled={openingDaily || daily.state === 'COMPLETED'}
            accessibilityRole="button"
            accessibilityLabel={`오늘의 판. ${dailyStatus}`}
            style={({ pressed }) => [
              styles.dailyCard,
              daily.state === 'COMPLETED' && styles.dailyCardDone,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.dailyHead}>
              <Text style={styles.dailyLabel}>오늘의 판 · {daily.difficultyLabel}</Text>
              {daily.state === 'COMPLETED' ? (
                <MaterialCommunityIcons name="check-circle" size={18} color={colors.primary} />
              ) : null}
            </View>
            <Text style={styles.dailyTitle}>{dailyStatus}</Text>
            <Text style={styles.dailyDesc}>
              {daily.blockedByOtherGame
                ? '먼저 풀던 판이 있어요. 그 판을 마치거나 접으면 오늘의 판을 열 수 있어요.'
                : '날짜로 만든 판이라 오늘은 모든 커플이 같은 문제를 풀어요.'}
            </Text>
          </Pressable>
        ) : null}

        <GameCard
          icon="grid"
          title="협동 스도쿠"
          subtitle={sudokuStatus}
          badge={sudoku ? '이어서' : undefined}
          onPress={() => navigation.navigate('Sudoku')}
        />
        <GameCard
          icon="checkerboard"
          title="오목"
          subtitle={omokStatus}
          badge={omok ? (omok.myTurn ? '내 차례' : '기다리는 중') : undefined}
          highlight={!!omok?.myTurn}
          onPress={() => navigation.navigate('Omok')}
        />

        {/* 길막기 — 오목의 대체가 아니라 한 수 깊은 쪽으로 둔다(분석 §7-1) */}
        <GameCard
          icon="contain"
          title="길막기"
          subtitle={wallRaceStatus}
          badge={wallRace ? (wallRace.myTurn ? '내 차례' : '기다리는 중') : undefined}
          highlight={!!wallRace?.myTurn}
          onPress={() => navigation.navigate('WallRace')}
        />

        <GameCard
          icon="draw"
          title="캐치마인드"
          subtitle={catchMindStatus}
          badge={catchMind ? (catchMindMine ? '맞힐 차례' : '기다리는 중') : undefined}
          highlight={catchMindMine}
          onPress={() => navigation.navigate('CatchMind')}
        />

        {/* 연쇄 퍼즐 — 혼자 연습 + 커플 대전(라이브·고스트). docs/COUPLE_PUZZLE_BATTLE_2026-09-18.md §11 */}
        <GameCard
          icon="puzzle"
          title="연쇄 퍼즐"
          subtitle={puzzleStatus}
          badge={puzzle ? (puzzleMine ? '내 차례' : '기다리는 중') : undefined}
          highlight={puzzleMine}
          onPress={() => navigation.navigate('Puyo')}
        />

        <Text style={styles.footnote}>
          둘 다 승패보다 “같이 한 판”이 남는 게임이에요. 접은 판은 기록에 남지 않아요.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function GameCard({
  icon,
  title,
  subtitle,
  badge,
  highlight,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  title: string;
  subtitle: string;
  badge?: string;
  highlight?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      style={({ pressed }) => [styles.card, highlight && styles.cardHighlight, pressed && styles.pressed]}
    >
      <View style={styles.iconBox}>
        <MaterialCommunityIcons name={icon} size={26} color={colors.primary} />
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle}>{title}</Text>
          {badge ? (
            <View style={[styles.badge, highlight && styles.badgeHighlight]}>
              <Text style={[styles.badgeText, highlight && styles.badgeTextHighlight]}>{badge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.cardSubtitle}>{subtitle}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, gap: spacing.sm },
  pressed: { opacity: 0.7 },
  errorLine: { fontSize: fontSize.caption, color: colors.textSecondary, marginBottom: spacing.xs },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  cardHighlight: { borderColor: colors.primary, backgroundColor: colors.primaryBg },

  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginBottom: spacing.xs,
  },
  streakFlame: { fontSize: fontSize.subtitle },
  streakText: { flex: 1, fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700' },
  streakNumber: { color: colors.primary, fontWeight: '800' },
  streakBest: { fontSize: 10, color: colors.textMuted, fontWeight: '800' },

  dailyCard: {
    backgroundColor: colors.primaryBg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: spacing.md,
    gap: 2,
  },
  dailyCardDone: { borderColor: colors.border, backgroundColor: colors.surface },
  dailyHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dailyLabel: { fontSize: fontSize.caption, color: colors.primary, fontWeight: '800' },
  dailyTitle: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  dailyDesc: { fontSize: fontSize.caption, color: colors.textSecondary, lineHeight: 18 },
  iconBox: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryBg,
  },
  cardBody: { flex: 1, gap: 2 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  cardTitle: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  cardSubtitle: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '600' },
  badge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  badgeHighlight: { backgroundColor: colors.primary },
  badgeText: { fontSize: 10, fontWeight: '800', color: colors.textSecondary },
  badgeTextHighlight: { color: colors.white },
  footnote: { fontSize: fontSize.caption, color: colors.textMuted, textAlign: 'center', marginTop: spacing.md, lineHeight: 18 },
}));
