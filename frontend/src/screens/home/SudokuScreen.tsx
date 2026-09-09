/**
 * 협동 스도쿠 — 둘이 같은 판을 차례 없이 채운다. docs/COUPLE_GAMES_DESIGN_2026-09-09.md 3-7절.
 *
 * <p>칸마다 누가 채웠는지 색으로 남고(나=primary, 상대=accent), 틀린 칸은 서버가 알려준
 * 인덱스로 빨갛게 표시한다. 상대의 입력은 커플 소켓 이벤트(GAME)로 즉시 따라온다.
 * 순수 View/Text 로 그린다 — SVG·Skia 없음.
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
import { sudokuApi } from '../../api/game';
import { connectSocket, subscribeCouple, unsubscribeCouple } from '../../api/chatSocket';
import { useRelationStore } from '../../store/relationStore';
import { getErrorMessage } from '../../utils/error';
import { relativeDateLabel } from '../../utils/date';
import { Alert } from '../../utils/alert';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { SudokuDifficulty, SudokuGame } from '../../types';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<HomeStackParamList, 'Sudoku'>;

const DIFFICULTIES: { key: SudokuDifficulty; label: string; hint: string }[] = [
  { key: 'EASY', label: '쉬움', hint: '41칸을 같이 채워요' },
  { key: 'NORMAL', label: '보통', hint: '49칸을 같이 채워요' },
  { key: 'HARD', label: '어려움', hint: '55칸을 같이 채워요' },
];

const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/**
 * 입력 요청 순번 — 응답 순서가 뒤바뀌어 옛 판 상태가 새 것을 덮지 않도록 마지막 요청만 반영한다.
 * 화면은 한 번에 하나만 떠 있으므로 모듈 변수로 충분하다(ref 로 두면 react-hooks/refs 가
 * 렌더 중 접근으로 오탐한다).
 */
let moveSeq = 0;

export function SudokuScreen(_: Props) {
  const { width } = useWindowDimensions();
  const relationId = useRelationStore((s) => s.couple?.id);

  const [game, setGame] = useState<SudokuGame | null>(null);
  /** 방금 완성한 판 — current 가 null 이 된 뒤에도 축하 카드를 보여주기 위해 따로 든다 */
  const [justCompleted, setJustCompleted] = useState<SudokuGame | null>(null);
  const [history, setHistory] = useState<SudokuGame[]>([]);
  const [loading, setLoading] = useState(false);
  // 로드 실패가 "판이 없는 빈 상태"로 위장하지 않도록 별도로 추적한다 (QA_CHECKLIST.md 패턴 1)
  const [loadError, setLoadError] = useState(false);
  const [starting, setStarting] = useState(false);
  // 선택 칸은 판 id 와 함께 든다 — 판이 바뀌면(새 판·완성) 다른 판의 칸을 가리키지 않도록
  // effect 로 초기화하는 대신 파생값으로 푼다.
  const [selection, setSelection] = useState<{ gameId: number; index: number } | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setLoadError(false);
    try {
      const [g, h] = await Promise.all([sudokuApi.current(), sudokuApi.history()]);
      setGame(g);
      setHistory(h);
      if (g) setJustCompleted(null);
    } catch (e) {
      if (!silent) toast.error(getErrorMessage(e, '판을 불러오지 못했어요.'));
      setLoadError(true);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // 상대의 입력·새 판·포기는 커플 소켓 이벤트로 온다 — 데이터는 싣지 않으므로 다시 읽는다
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

  const selected = game && selection && selection.gameId === game.id ? selection.index : null;
  const setSelected = (index: number | null) =>
    setSelection(index === null || !game ? null : { gameId: game.id, index });

  const start = async (difficulty: SudokuDifficulty) => {
    setStarting(true);
    try {
      const g = await sudokuApi.start(difficulty);
      setGame(g);
      setJustCompleted(null);
      haptics.light();
    } catch (e) {
      toast.error(getErrorMessage(e, '새 판을 열지 못했어요.'));
    } finally {
      setStarting(false);
    }
  };

  const applyValue = async (value: number) => {
    if (!game || selected === null) return;
    if (game.puzzle[selected] !== '0') return; // given 은 선택 자체가 안 되지만 방어
    if (value !== 0 && game.board[selected] === String(value)) return;

    // 낙관적 반영 — 내 손가락이 서버 왕복을 기다리지 않게. 실패하면 서버 상태로 되돌린다.
    const optimistic: SudokuGame = {
      ...game,
      board: replaceAt(game.board, selected, String(value)),
      owners: replaceAt(game.owners, selected, value === 0 ? '0' : 'M'),
    };
    setGame(optimistic);
    haptics.light();

    const seq = ++moveSeq;
    try {
      const updated = await sudokuApi.move(game.id, selected, value);
      if (seq !== moveSeq) return;
      if (updated.status === 'COMPLETED') {
        setJustCompleted(updated);
        setGame(null);
        haptics.success();
        sudokuApi.history().then(setHistory).catch(() => undefined);
      } else {
        setGame(updated);
      }
    } catch (e) {
      if (seq !== moveSeq) return;
      toast.error(getErrorMessage(e, '입력하지 못했어요.'));
      void load(true);
    }
  };

  const confirmGiveUp = () => {
    if (!game) return;
    Alert.alert('이 판을 접을까요?', '접은 판은 기록에 남지 않고, 상대 화면에서도 사라져요.', [
      { text: '계속 풀기', style: 'cancel' },
      {
        text: '접기',
        style: 'destructive',
        onPress: () => {
          sudokuApi
            .giveUp(game.id)
            .then(() => { setGame(null); toast.success('이 판은 접었어요.'); })
            .catch((e) => toast.error(getErrorMessage(e, '접지 못했어요.')));
        },
      },
    ]);
  };

  // ── 격자 ───────────────────────────────────────────────────────────

  const boardSize = Math.min(width - spacing.lg * 2, 420);
  const cell = boardSize / 9;
  const wrongSet = useMemo(() => new Set(game?.wrongCells ?? []), [game?.wrongCells]);
  /** 숫자별 놓인 개수 — 9개가 다 놓인 숫자는 패드에서 흐리게 */
  const digitCounts = useMemo(() => {
    const counts = new Array<number>(10).fill(0);
    if (game) for (const ch of game.board) counts[Number(ch)]++;
    return counts;
  }, [game]);

  const selectedValue = game && selected !== null ? game.board[selected] : '0';

  const renderCell = (index: number) => {
    if (!game) return null;
    const row = Math.floor(index / 9);
    const col = index % 9;
    const value = game.board[index];
    const given = game.puzzle[index] !== '0';
    const owner = game.owners[index];
    const wrong = wrongSet.has(index);
    const isSelected = selected === index;
    const related =
      selected !== null &&
      !isSelected &&
      (Math.floor(selected / 9) === row ||
        selected % 9 === col ||
        (Math.floor(Math.floor(selected / 9) / 3) === Math.floor(row / 3) &&
          Math.floor((selected % 9) / 3) === Math.floor(col / 3)));
    const sameNumber = !isSelected && selectedValue !== '0' && value === selectedValue;

    return (
      <Pressable
        key={index}
        onPress={() => setSelected(given ? null : index)}
        accessibilityRole="button"
        accessibilityLabel={`${row + 1}행 ${col + 1}열 ${value === '0' ? '빈칸' : value}`}
        style={[
          styles.cell,
          { width: cell, height: cell },
          col % 3 === 0 && styles.cellLeftThick,
          row % 3 === 0 && styles.cellTopThick,
          col === 8 && styles.cellRightThick,
          row === 8 && styles.cellBottomThick,
          related && styles.cellRelated,
          sameNumber && styles.cellSameNumber,
          isSelected && styles.cellSelected,
        ]}
      >
        <Text
          style={[
            styles.cellText,
            { fontSize: Math.max(14, cell * 0.5) },
            given && styles.cellGiven,
            owner === 'M' && styles.cellMine,
            owner === 'P' && styles.cellPartner,
            wrong && styles.cellWrong,
          ]}
        >
          {value === '0' ? '' : value}
        </Text>
      </Pressable>
    );
  };

  // ── 상단 카드 ──────────────────────────────────────────────────────

  const renderPicker = (title: string, subtitle: string) => (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>협동 스도쿠</Text>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardDesc}>{subtitle}</Text>
      <View style={styles.pickerRow}>
        {DIFFICULTIES.map((d) => (
          <Pressable
            key={d.key}
            onPress={() => start(d.key)}
            disabled={starting}
            accessibilityRole="button"
            style={({ pressed }) => [styles.pickerItem, pressed && styles.pressed]}
          >
            <Text style={styles.pickerLabel}>{d.label}</Text>
            <Text style={styles.pickerHint}>{d.hint}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  const renderCompleted = (g: SudokuGame) => (
    <View style={[styles.card, styles.doneCard]}>
      <MaterialCommunityIcons name="check-circle" size={28} color={colors.primary} />
      <Text style={styles.doneTitle}>같이 완성했어요!</Text>
      <Text style={styles.doneDesc}>
        나 {g.myCells}칸 · {g.partnerName ?? '상대'} {g.partnerCells}칸 ({g.difficultyLabel})
      </Text>
      <Text style={styles.cardDesc}>채팅에 결과 카드를 남겼어요.</Text>
    </View>
  );

  const renderBoard = (g: SudokuGame) => {
    const total = 81 - g.puzzle.replace(/0/g, '').length;
    const done = g.myCells + g.partnerCells;
    return (
      <View>
        <View style={styles.statusRow}>
          <View style={styles.statusLeft}>
            <Text style={styles.statusDifficulty}>{g.difficultyLabel}</Text>
            <Text style={styles.statusCount}>
              {done}/{total}칸
            </Text>
          </View>
          <View style={styles.legend}>
            <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
            <Text style={styles.legendText}>나 {g.myCells}</Text>
            <View style={[styles.legendDot, { backgroundColor: colors.accent }]} />
            <Text style={styles.legendText}>
              {g.partnerName ?? '상대'} {g.partnerCells}
            </Text>
          </View>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.round((done / total) * 100)}%` }]} />
        </View>

        <View style={[styles.board, { width: boardSize, height: boardSize }]}>
          {Array.from({ length: 81 }, (_, i) => renderCell(i))}
        </View>

        <View style={styles.pad}>
          {DIGITS.map((d) => {
            const exhausted = digitCounts[d] >= 9;
            return (
              <Pressable
                key={d}
                onPress={() => applyValue(d)}
                disabled={selected === null}
                accessibilityRole="button"
                accessibilityLabel={`${d} 입력`}
                style={({ pressed }) => [
                  styles.padKey,
                  selected === null && styles.padKeyDisabled,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.padKeyText, exhausted && styles.padKeyExhausted]}>{d}</Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => applyValue(0)}
            disabled={selected === null || selectedValue === '0'}
            accessibilityRole="button"
            accessibilityLabel="지우기"
            style={({ pressed }) => [
              styles.padKey,
              (selected === null || selectedValue === '0') && styles.padKeyDisabled,
              pressed && styles.pressed,
            ]}
          >
            <MaterialCommunityIcons name="eraser" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        <Text style={styles.hint}>
          {selected === null ? '빈칸을 누르고 숫자를 고르세요. 차례 없이 아무 칸이나 괜찮아요.' : '틀린 숫자는 빨갛게 보여요. 상대가 고쳐줄 수도 있어요.'}
        </Text>
        <Button title="이 판 접기" variant="ghost" size="sm" onPress={confirmGiveUp} style={styles.giveUp} />
      </View>
    );
  };

  const header = (
    <View>
      {game
        ? renderBoard(game)
        : justCompleted
          ? (
            <>
              {renderCompleted(justCompleted)}
              {renderPicker('한 판 더?', '난이도를 고르면 상대에게도 알려줘요.')}
            </>
          )
          : !loading && !loadError
            ? renderPicker('같이 풀 판을 열어볼까요?', '둘이 같은 판을 채워요. 차례 없이, 아무 칸이나.')
            : null}
      {history.length > 0 ? <Text style={styles.sectionTitle}>같이 완성한 판</Text> : null}
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
              <Text style={styles.histDate}>
                {item.completedAt ? relativeDateLabel(item.completedAt.slice(0, 10)) : ''}
              </Text>
              <Text style={styles.histDifficulty}>{item.difficultyLabel}</Text>
            </View>
            <Text style={styles.histText}>
              나 {item.myCells}칸 · {item.partnerName ?? '상대'} {item.partnerCells}칸
            </Text>
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

function replaceAt(s: string, index: number, ch: string): string {
  return s.slice(0, index) + ch + s.slice(index + 1);
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, paddingBottom: spacing.xl },
  pressed: { opacity: 0.6 },

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
  pickerRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  pickerItem: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  pickerLabel: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary },
  pickerHint: { fontSize: 10, color: colors.textMuted, marginTop: 2, fontWeight: '600' },

  doneCard: { alignItems: 'center' },
  doneTitle: { fontSize: fontSize.title, fontWeight: '800', color: colors.textPrimary, marginTop: spacing.xs },
  doneDesc: { fontSize: fontSize.body, color: colors.textPrimary, marginTop: spacing.xs, fontWeight: '700' },

  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusLeft: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  statusDifficulty: { fontSize: fontSize.caption, color: colors.primary, fontWeight: '800' },
  statusCount: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700' },
  legend: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginLeft: spacing.xs },
  legendText: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700' },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceAlt,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: colors.primary },

  board: {
    alignSelf: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.surface,
  },
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  cellLeftThick: { borderLeftWidth: 2, borderLeftColor: colors.textPrimary },
  cellTopThick: { borderTopWidth: 2, borderTopColor: colors.textPrimary },
  cellRightThick: { borderRightWidth: 2, borderRightColor: colors.textPrimary },
  cellBottomThick: { borderBottomWidth: 2, borderBottomColor: colors.textPrimary },
  cellRelated: { backgroundColor: colors.surfaceAlt },
  cellSameNumber: { backgroundColor: colors.primaryBg },
  cellSelected: { backgroundColor: colors.primaryBg, borderColor: colors.primary },
  cellText: { fontWeight: '600', color: colors.textSecondary },
  cellGiven: { fontWeight: '800', color: colors.textPrimary },
  cellMine: { color: colors.primary, fontWeight: '800' },
  cellPartner: { color: colors.accent, fontWeight: '800' },
  cellWrong: { color: colors.danger },

  pad: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, justifyContent: 'center', marginTop: spacing.md },
  padKey: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  padKeyDisabled: { opacity: 0.4 },
  padKeyText: { fontSize: fontSize.title, fontWeight: '800', color: colors.textPrimary },
  padKeyExhausted: { color: colors.textMuted, fontWeight: '600' },
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
  histDifficulty: { fontSize: fontSize.caption, color: colors.primary, fontWeight: '800' },
  histText: { fontSize: fontSize.body, color: colors.textPrimary, marginTop: 2, fontWeight: '600' },
}));
