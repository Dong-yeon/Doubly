/**
 * 미니게임 허브 — 협동 스도쿠·오목 중 고른다. docs/COUPLE_GAMES_DESIGN_2026-09-09.md 5절.
 *
 * <p>카드 하나가 게임 하나. 진행 중인 판이 있으면 그 상태(채운 칸 수·누구 차례)를 카드에 띄워
 * "이어서" 들어가게 한다. 두 게임의 진행 상태는 같은 커플 소켓 이벤트(GAME)로 갱신된다.
 */
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/types';
import { MaterialCommunityIcons } from '../../components/Icon';
import { EmptyState } from '../../components/EmptyState';
import { omokApi, sudokuApi } from '../../api/game';
import { connectSocket, subscribeCouple, unsubscribeCouple } from '../../api/chatSocket';
import { useRelationStore } from '../../store/relationStore';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { OmokGame, SudokuGame } from '../../types';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<HomeStackParamList, 'MiniGames'>;

export function MiniGamesScreen({ navigation }: Props) {
  const relationId = useRelationStore((s) => s.couple?.id);
  const [sudoku, setSudoku] = useState<SudokuGame | null>(null);
  const [omok, setOmok] = useState<OmokGame | null>(null);
  const [omokRecord, setOmokRecord] = useState<{ me: number; partner: number } | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, o, h] = await Promise.all([sudokuApi.current(), omokApi.current(), omokApi.history()]);
      setSudoku(s);
      setOmok(o);
      setOmokRecord({
        me: h.filter((g) => g.winner === 'ME').length,
        partner: h.filter((g) => g.winner === 'PARTNER').length,
      });
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
