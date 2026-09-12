/**
 * 협동 스도쿠 — 둘이 같은 판을 차례 없이 채운다. docs/COUPLE_GAMES_DESIGN_2026-09-09.md 3-7절.
 *
 * <p>칸마다 누가 채웠는지 색으로 남고(나=primary, 상대=accent), 상대의 입력은 커플 소켓
 * 이벤트(GAME)로 즉시 따라온다. 순수 View/Text 로 그린다 — SVG·Skia 없음.
 *
 * <p><b>틀린 칸은 기본적으로 보여주지 않는다.</b> 서버는 늘 {@code wrongCells} 를 내려주지만,
 * 그걸 바로 칠하면 아무 숫자나 넣어보고 색만 보는 게 최적 전략이 돼 퍼즐이 사라진다.
 * "확인"을 눌렀을 때만 그 시점의 판에 대해 보여주고, 한 칸이라도 고치면 다시 감춘다 —
 * 검사를 <b>의도적인 행동</b>으로 만든다.
 *
 * <p>메모(연필 표시)는 서버에 올리지 않는다 — {@code sudokuMemo} 주석 참고.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { MaterialCommunityIcons } from '../../components/Icon';
import { sudokuApi } from '../../api/game';
import { clearMemos, loadMemos, pruneMemos, saveMemos, type SudokuMemos } from './sudokuMemo';
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
  /** 연필 표시 — 숫자 패드가 값 입력 대신 메모를 토글한다 */
  const [memoMode, setMemoMode] = useState(false);
  /**
   * 메모는 판 id 와 함께 든다 — selection 과 같은 이유다. 판이 바뀌면 effect 로 비우는 대신
   * 파생값이 저절로 빈 메모가 되게 한다(같은 칸 번호가 다른 판에서 전혀 다른 뜻이 된다).
   */
  const [memoState, setMemoState] = useState<{ gameId: number; memos: SudokuMemos } | null>(null);
  /**
   * "확인"을 누른 시점의 판. 지금 판과 같을 때만 틀린 칸을 보여준다 — 한 칸이라도 바뀌면
   * 저절로 감춰져, 색을 보고 숫자를 갈아 끼우는 식으로는 풀 수 없다.
   */
  const [checkedBoard, setCheckedBoard] = useState<string | null>(null);

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

  const gameId = game?.id;
  const board = game?.board;

  /*
   * 판이 바뀌면 그 판의 메모를 읽는다(다른 판 것은 sudokuMemo 가 버린다). 판이 없어지면
   * (완성·접기) 저장소만 비운다 — 화면 쪽은 아래 파생값이 알아서 빈 메모가 된다.
   */
  useEffect(() => {
    if (!gameId) {
      void clearMemos();
      return;
    }
    let active = true;
    void loadMemos(gameId).then((loaded) => {
      if (active) setMemoState({ gameId, memos: loaded });
    });
    return () => {
      active = false;
    };
  }, [gameId]);

  /**
   * 화면에 쓰는 메모 — <b>판 상태에 맞게 정리한 결과를 파생으로 얻는다.</b> 내 입력뿐 아니라
   * 상대 입력(소켓 → load)에도 똑같이 걸려야 하는데, 그걸 effect + setState 로 맞추면 board
   * 가 바뀔 때마다 렌더가 한 번 더 돌고 동기화 버그의 자리가 생긴다. 정리는 순수 함수이므로
   * 계산해 쓰는 편이 맞다.
   */
  const memos = useMemo(() => {
    const raw = memoState && memoState.gameId === gameId ? memoState.memos : {};
    return board ? pruneMemos(raw, board) : raw;
  }, [memoState, gameId, board]);

  // 정리된 결과를 기기에 쓴다 — 읽은 직후에도 한 번 쓰이는데, 그게 저장소의 묵은 메모를 씻는다
  useEffect(() => {
    if (!gameId || memoState?.gameId !== gameId) return;
    void saveMemos(gameId, memos);
  }, [gameId, memoState, memos]);

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

  /** 메모 토글 — 값은 건드리지 않는다. 이미 값이 찬 칸에는 적지 않는다(클래식 규칙). */
  const toggleMemo = (digit: number) => {
    if (!game || selected === null) return;
    if (game.board[selected] !== '0') return;
    haptics.light();
    const current = memos[selected] ?? [];
    const next = current.includes(digit)
      ? current.filter((d) => d !== digit)
      : [...current, digit].sort((a, b) => a - b);
    const copy = { ...memos };
    if (next.length > 0) copy[selected] = next;
    else delete copy[selected];
    setMemoState({ gameId: game.id, memos: copy });
  };

  /** 메모 지우기 — 패드의 지우개가 메모 모드에서 하는 일 */
  const clearCellMemo = () => {
    if (!game || selected === null || !memos[selected]) return;
    const copy = { ...memos };
    delete copy[selected];
    setMemoState({ gameId: game.id, memos: copy });
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
  /** 지금 판이 "확인"을 누른 그 판인가 — 한 칸이라도 바뀌면 false 가 되어 표시가 사라진다 */
  const showWrong = !!game && checkedBoard === game.board;
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
    const wrong = showWrong && wrongSet.has(index);
    const cellMemo = value === '0' ? memos[index] : undefined;
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
        {cellMemo && cellMemo.length > 0 ? (
          /* 메모 — 3×3 배치로 숫자 자리를 고정한다. 개수에 따라 위치가 흔들리면 읽기 어렵다 */
          <View style={styles.memoGrid}>
            {DIGITS.map((d) => (
              <Text
                key={d}
                style={[styles.memoText, { fontSize: Math.max(7, cell * 0.24) }]}
              >
                {cellMemo.includes(d) ? d : ''}
              </Text>
            ))}
          </View>
        ) : (
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
        )}
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
                onPress={() => (memoMode ? toggleMemo(d) : applyValue(d))}
                disabled={selected === null}
                accessibilityRole="button"
                accessibilityLabel={`${d} 입력`}
                style={({ pressed }) => [
                  styles.padKey,
                  memoMode && styles.padKeyMemo,
                  selected === null && styles.padKeyDisabled,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.padKeyText, !memoMode && exhausted && styles.padKeyExhausted]}>{d}</Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => (memoMode ? clearCellMemo() : applyValue(0))}
            disabled={selected === null || (memoMode ? !memos[selected] : selectedValue === '0')}
            accessibilityRole="button"
            accessibilityLabel={memoMode ? '메모 지우기' : '지우기'}
            style={({ pressed }) => [
              styles.padKey,
              memoMode && styles.padKeyMemo,
              (selected === null || (memoMode ? !memos[selected] : selectedValue === '0')) &&
                styles.padKeyDisabled,
              pressed && styles.pressed,
            ]}
          >
            <MaterialCommunityIcons name="eraser" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        {/*
          메모 · 확인 — 둘 다 "지금 무엇을 하는 중인가"를 바꾸는 버튼이라 패드 바로 아래 둔다.
          확인은 누른 시점의 판에 대해서만 답하고(showWrong), 한 칸이라도 고치면 다시 감춰진다.
        */}
        <View style={styles.toolRow}>
          <Pressable
            onPress={() => { haptics.light(); setMemoMode((v) => !v); }}
            accessibilityRole="switch"
            accessibilityState={{ checked: memoMode }}
            accessibilityLabel="메모 모드"
            style={({ pressed }) => [styles.tool, memoMode && styles.toolOn, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons
              name="pencil-outline"
              size={18}
              color={memoMode ? colors.surface : colors.textSecondary}
            />
            <Text style={[styles.toolText, memoMode && styles.toolTextOn]}>메모</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              const wrongCount = g.wrongCells.length;
              setCheckedBoard(g.board);
              if (wrongCount === 0) {
                haptics.success();
                toast.success('여기까지 다 맞아요!');
              } else {
                haptics.light();
                toast.info(`틀린 칸 ${wrongCount}개를 빨갛게 표시했어요.`);
              }
            }}
            accessibilityRole="button"
            accessibilityLabel="지금까지 채운 칸 확인하기"
            style={({ pressed }) => [styles.tool, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="check-circle" size={18} color={colors.textSecondary} />
            <Text style={styles.toolText}>확인</Text>
          </Pressable>
        </View>

        <Text style={styles.hint}>
          {memoMode
            ? '메모는 내 기기에만 남아요. 숫자를 눌러 여러 개 적어두세요.'
            : showWrong
              ? '확인한 시점의 결과예요. 한 칸이라도 고치면 다시 감춰져요.'
              : selected === null
                ? '빈칸을 누르고 숫자를 고르세요. 차례 없이 아무 칸이나 괜찮아요.'
                : '맞았는지 궁금하면 "확인"을 눌러요. 상대가 고쳐줄 수도 있어요.'}
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
  /*
   * 메모 — 9칸 자리를 늘 차지하게 둔다(있는 숫자만 글자, 없으면 빈 문자열). 개수에 따라
   * 위치가 움직이면 "3이 왼쪽 위"라는 기억이 깨져 메모를 읽는 속도가 떨어진다.
   */
  memoGrid: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row', flexWrap: 'wrap' },
  memoText: {
    width: '33.33%',
    height: '33.33%',
    textAlign: 'center',
    textAlignVertical: 'center',
    color: colors.textTertiary,
    fontWeight: '700',
  },
  cellSelected: { backgroundColor: colors.primaryBg, borderColor: colors.primary },
  cellText: { fontWeight: '600', color: colors.textSecondary },
  cellGiven: { fontWeight: '800', color: colors.textPrimary },
  cellMine: { color: colors.primary, fontWeight: '800' },
  cellPartner: { color: colors.accent, fontWeight: '800' },
  cellWrong: { color: colors.danger },

  pad: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, justifyContent: 'center', marginTop: spacing.md },
  /** 메모 모드 — 패드 전체가 다른 일을 하므로 키 자체의 테두리를 바꿔 모드를 드러낸다 */
  padKeyMemo: { borderColor: colors.primary, backgroundColor: colors.primaryBg },
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
  toolRow: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', marginTop: spacing.sm },
  tool: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  toolOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  toolText: { fontSize: fontSize.caption, fontWeight: '800', color: colors.textSecondary },
  toolTextOn: { color: colors.surface },

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
