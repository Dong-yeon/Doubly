/**
 * 캐치마인드 — 한 명이 그리고 한 명이 맞힌다. docs/CATCH_MIND_2026-09-14.md.
 *
 * <p><b>비동기다.</b> 그리는 동안은 서버에 아무것도 없고, 다 그린 그림을 한 번에 보낸다.
 * 상대는 아무 때나 열어서 맞힌다 — 둘이 동시에 접속해 있을 필요가 없다.
 *
 * <p>화면은 판 상태에 따라 셋 중 하나다.
 * <ul>
 *   <li>판이 없다 → <b>그리기</b>(제시어 고르고 그린 뒤 전송)</li>
 *   <li>내가 낸 판이 진행 중 → <b>기다리기</b>(내 그림 + 상대의 틀린 시도)</li>
 *   <li>상대가 낸 판이 진행 중 → <b>맞히기</b>(그림 + 입력창 + 초성)</li>
 * </ul>
 */
import React, { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { GameReactionBar } from '../../components/GameReactionBar';
import { MaterialCommunityIcons } from '../../components/Icon';
import {
  DrawingCanvas,
  DrawingView,
  type DrawingCanvasHandle,
} from '../../components/DrawingCanvas';
import { catchMindApi } from '../../api/game';
import { connectSocket, subscribeCouple, unsubscribeCouple } from '../../api/chatSocket';
import { useRelationStore } from '../../store/relationStore';
import { getErrorMessage } from '../../utils/error';
import { relativeDateLabel } from '../../utils/date';
import { Alert } from '../../utils/alert';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { CatchMindGame, CatchMindWordCandidate } from '../../types';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<HomeStackParamList, 'CatchMind'>;

export function CatchMindScreen(_: Props) {
  const { width } = useWindowDimensions();
  const relationId = useRelationStore((s) => s.couple?.id);

  const [game, setGame] = useState<CatchMindGame | null>(null);
  /** 방금 끝난 판 — current 가 null 이 된 뒤에도 정답과 그림을 보여주려고 따로 든다 */
  const [justFinished, setJustFinished] = useState<CatchMindGame | null>(null);
  const [history, setHistory] = useState<CatchMindGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // 그리기
  const canvasRef = useRef<DrawingCanvasHandle>(null);
  /*
   * 획을 긋는 동안 목록 스크롤을 잠근다 — 캔버스가 FlatList 헤더 안에 있어서, 잠그지 않으면
   * iOS 에서 위아래로 긋는 획마다 화면이 같이 내려간다(DrawingCanvas.onDrawingChange 주석).
   */
  const [drawing, setDrawing] = useState(false);
  const [candidates, setCandidates] = useState<CatchMindWordCandidate[]>([]);
  const [word, setWord] = useState('');
  const [customWord, setCustomWord] = useState(false);
  const [empty, setEmpty] = useState(true);
  const [sending, setSending] = useState(false);

  // 맞히기
  const [answer, setAnswer] = useState('');
  const [guessing, setGuessing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setLoadError(false);
    try {
      const [g, h] = await Promise.all([catchMindApi.current(), catchMindApi.history()]);
      setGame(g);
      setHistory(h);
      if (g) setJustFinished(null);
    } catch (e) {
      if (!silent) toast.error(getErrorMessage(e, '판을 불러오지 못했어요.'));
      setLoadError(true);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const loadWords = useCallback(async () => {
    try {
      setCandidates(await catchMindApi.words());
    } catch {
      // 후보를 못 받아도 직접 입력으로 그릴 수 있다 — 화면을 막지 않는다
      setCustomWord(true);
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

  // 판이 없을 때만 제시어 후보를 받는다
  useFocusEffect(
    useCallback(() => {
      if (!game && !loading && candidates.length === 0 && !customWord) void loadWords();
    }, [game, loading, candidates.length, customWord, loadWords]),
  );

  const send = async () => {
    const trimmed = word.trim();
    if (!trimmed) {
      toast.error('제시어를 고르거나 직접 적어주세요.');
      return;
    }
    const strokes = canvasRef.current?.serialize();
    if (!strokes) {
      toast.error('아직 아무것도 안 그렸어요.');
      return;
    }
    setSending(true);
    try {
      const sent = await catchMindApi.start(trimmed, strokes);
      setGame(sent);
      setJustFinished(null);
      setWord('');
      setCustomWord(false);
      setCandidates([]);
      setEmpty(true);
      haptics.success();
    } catch (e) {
      toast.error(getErrorMessage(e, '그림을 보내지 못했어요.'));
      void load(true);
    } finally {
      setSending(false);
    }
  };

  const submitGuess = async () => {
    if (!game || guessing) return;
    const trimmed = answer.trim();
    if (!trimmed) return;
    setGuessing(true);
    try {
      const result = await catchMindApi.guess(game.id, trimmed);
      setAnswer('');
      if (result.correct) {
        setJustFinished(result.game);
        setGame(null);
        haptics.success();
        catchMindApi.history().then(setHistory).catch(() => undefined);
      } else {
        setGame(result.game);
        haptics.light();
        toast.error('아니에요. 다시 볼까요?');
      }
    } catch (e) {
      toast.error(getErrorMessage(e, '정답을 보내지 못했어요.'));
      void load(true);
    } finally {
      setGuessing(false);
    }
  };

  const openHint = async () => {
    if (!game) return;
    try {
      setGame(await catchMindApi.hint(game.id));
    } catch (e) {
      toast.error(getErrorMessage(e, '힌트를 열지 못했어요.'));
    }
  };

  const confirmGiveUp = () => {
    if (!game) return;
    const drawer = game.role === 'DRAWER';
    Alert.alert(
      drawer ? '이 판을 접을까요?' : '정답을 볼까요?',
      drawer
        ? '접으면 기록에 남지 않고, 상대에게 정답이 공개돼요.'
        : '정답을 보면 이 판은 기록에 남지 않아요.',
      [
        { text: drawer ? '더 기다리기' : '더 생각하기', style: 'cancel' },
        {
          text: drawer ? '접기' : '정답 보기',
          style: 'destructive',
          onPress: () => {
            catchMindApi
              .giveUp(game.id)
              .then(() => { setGame(null); void load(true); })
              .catch((e) => toast.error(getErrorMessage(e, '접지 못했어요.')));
          },
        },
      ],
    );
  };

  const boardSize = Math.min(width - spacing.lg * 2, 420);

  // ── 그리기 ──────────────────────────────────────────────────────────

  const renderDraw = () => (
    <View>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>캐치마인드</Text>
        <Text style={styles.cardTitle}>뭘 그려볼까요?</Text>
        <Text style={styles.cardDesc}>
          그려서 보내면 {game?.partnerName ?? '상대'}가 아무 때나 열어서 맞혀요. 같이 접속해 있지 않아도 돼요.
        </Text>

        {!customWord ? (
          <>
            <View style={styles.wordRow}>
              {candidates.map((c) => (
                <Pressable
                  key={c.word}
                  onPress={() => setWord(c.word)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: word === c.word }}
                  style={({ pressed }) => [
                    styles.wordChip,
                    word === c.word && styles.wordChipOn,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.wordCategory}>{c.category}</Text>
                  <Text style={[styles.wordText, word === c.word && styles.wordTextOn]}>{c.word}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.wordActions}>
              <Pressable onPress={loadWords} accessibilityRole="button" hitSlop={8}>
                <Text style={styles.link}>다른 단어 ↻</Text>
              </Pressable>
              <Pressable
                onPress={() => { setCustomWord(true); setWord(''); }}
                accessibilityRole="button"
                hitSlop={8}
              >
                <Text style={styles.link}>직접 적기</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            {/*
              * 키보드 확인키로 바로 보낸다 — 아래 보내기 버튼과 같은 조건일 때만이다.
              * 그림이 비었는데 보내면 되돌릴 수 없는 빈 판이 상대에게 간다("보내고 나면
              * 고칠 수 없어요"). 조건이 안 맞으면 키보드만 닫힌다.
              */}
            <TextInput
              value={word}
              onChangeText={setWord}
              onSubmitEditing={() => {
                if (!empty && word.trim() && !sending) void send();
              }}
              placeholder="둘만 아는 단어도 좋아요"
              placeholderTextColor={colors.textMuted}
              maxLength={40}
              returnKeyType="send"
              style={styles.wordInput}
              accessibilityLabel="제시어 직접 입력"
            />
            <Pressable
              onPress={() => { setCustomWord(false); setWord(''); if (candidates.length === 0) void loadWords(); }}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Text style={[styles.link, styles.linkRight]}>후보에서 고르기</Text>
            </Pressable>
          </>
        )}
      </View>

      <DrawingCanvas ref={canvasRef} onChange={setEmpty} onDrawingChange={setDrawing} />
      <Button
        title="이 그림 보내기"
        onPress={send}
        loading={sending}
        disabled={empty || !word.trim()}
        style={styles.sendBtn}
      />
      <Text style={styles.hint}>
        보내고 나면 고칠 수 없어요. 제시어는 상대에게 보이지 않아요.
      </Text>
    </View>
  );

  // ── 기다리기(내가 그린 판) ────────────────────────────────────────────

  const renderWaiting = (g: CatchMindGame) => (
    <View>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>내가 낸 문제</Text>
        <Text style={styles.cardTitle}>{g.word}</Text>
        <Text style={styles.cardDesc}>
          {g.guessCount === 0
            ? `${g.partnerName ?? '상대'}가 아직 안 봤어요.`
            : `${g.partnerName ?? '상대'}가 ${g.guessCount}번 시도했어요.`}
          {g.hintUsed ? ' 초성을 열어봤어요.' : ''}
        </Text>
      </View>
      <DrawingView strokes={g.strokes} size={boardSize} />
      {g.wrongGuesses.length > 0 ? (
        <View style={styles.guessList}>
          <Text style={styles.guessListTitle}>이렇게 찍었어요</Text>
          <View style={styles.guessChips}>
            {g.wrongGuesses.map((w, i) => (
              <View key={`${w}-${i}`} style={styles.guessChip}>
                <Text style={styles.guessChipText}>{w}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
      <GameReactionBar gameType="CATCH_MIND" />
      <Button title="이 판 접기" variant="ghost" size="sm" onPress={confirmGiveUp} style={styles.giveUp} />
    </View>
  );

  // ── 맞히기(상대가 그린 판) ────────────────────────────────────────────

  const renderGuess = (g: CatchMindGame) => (
    <View>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>{g.partnerName ?? '상대'}가 보낸 그림</Text>
        <Text style={styles.cardTitle}>이게 뭘까요?</Text>
        <Text style={styles.cardDesc}>
          {g.wordLength}글자
          {g.hint ? ` · ${g.hint}` : ''}
          {g.guessCount > 0 ? ` · ${g.guessCount}번 시도` : ''}
        </Text>
      </View>
      <DrawingView strokes={g.strokes} size={boardSize} />

      <View style={styles.answerRow}>
        <TextInput
          value={answer}
          onChangeText={setAnswer}
          onSubmitEditing={submitGuess}
          placeholder="정답은?"
          placeholderTextColor={colors.textMuted}
          maxLength={40}
          returnKeyType="send"
          style={styles.answerInput}
          accessibilityLabel="정답 입력"
        />
        <Button title="확인" onPress={submitGuess} loading={guessing} disabled={!answer.trim()} />
      </View>

      {g.wrongGuesses.length > 0 ? (
        <View style={styles.guessChips}>
          {g.wrongGuesses.map((w, i) => (
            <View key={`${w}-${i}`} style={styles.guessChip}>
              <Text style={styles.guessChipText}>{w}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {!g.hintUsed ? (
        <Button title="초성 보기" variant="ghost" size="sm" onPress={openHint} style={styles.giveUp} />
      ) : null}
      <GameReactionBar gameType="CATCH_MIND" />
      <Button title="정답 보기(포기)" variant="ghost" size="sm" onPress={confirmGiveUp} style={styles.giveUp} />
    </View>
  );

  // ── 방금 끝난 판 ─────────────────────────────────────────────────────

  const renderFinished = (g: CatchMindGame) => (
    <View style={[styles.card, styles.doneCard]}>
      <MaterialCommunityIcons name="check-circle" size={28} color={colors.primary} />
      <Text style={styles.doneTitle}>정답! {g.word}</Text>
      <Text style={styles.cardDesc}>
        {g.guessCount}번 만에 맞혔어요{g.hintUsed ? ' (초성 힌트)' : ''} · 채팅에 카드를 남겼어요.
      </Text>
      <DrawingView strokes={g.strokes} size={boardSize - spacing.lg * 2} />
    </View>
  );

  if (!relationId) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <EmptyState
          icon="draw"
          title="커플 연결 후 함께 할 수 있어요"
          description="그림을 보낼 상대가 있어야 하는 기능이에요."
        />
      </SafeAreaView>
    );
  }

  const header = (
    <View>
      {game
        ? game.role === 'DRAWER'
          ? renderWaiting(game)
          : renderGuess(game)
        : justFinished
          ? (
            <>
              {renderFinished(justFinished)}
              {renderDraw()}
            </>
          )
          : !loading && !loadError
            ? renderDraw()
            : null}
      {history.length > 0 ? <Text style={styles.sectionTitle}>지난 그림</Text> : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={history}
        keyExtractor={(g) => String(g.id)}
        contentContainerStyle={styles.list}
        scrollEnabled={!drawing}
        refreshing={loading}
        onRefresh={() => load()}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <View style={styles.histCard}>
            <DrawingView strokes={item.strokes} size={72} />
            <View style={styles.histBody}>
              <Text style={styles.histWord}>{item.word}</Text>
              <Text style={styles.histText}>
                {item.role === 'DRAWER' ? '내가 그림' : '내가 맞힘'} · {item.guessCount}번
                {item.hintUsed ? ' · 초성' : ''}
              </Text>
            </View>
            <Text style={styles.histDate}>
              {item.completedAt ? relativeDateLabel(item.completedAt.slice(0, 10)) : ''}
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
  doneCard: { alignItems: 'center', gap: spacing.xs },
  doneTitle: { fontSize: fontSize.title, fontWeight: '800', color: colors.textPrimary },

  wordRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  wordChip: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  wordChipOn: { borderColor: colors.primary, backgroundColor: colors.primaryBg },
  wordCategory: { fontSize: 10, color: colors.textMuted, fontWeight: '700' },
  wordText: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary, marginTop: 2 },
  wordTextOn: { color: colors.primary },
  wordActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  link: { fontSize: fontSize.caption, color: colors.primary, fontWeight: '800' },
  linkRight: { textAlign: 'right', marginTop: spacing.sm },
  wordInput: {
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.textPrimary,
  },

  sendBtn: { marginTop: spacing.md },
  hint: { fontSize: fontSize.caption, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm, lineHeight: 18 },
  giveUp: { alignSelf: 'center', marginTop: spacing.xs },

  answerRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, alignItems: 'center' },
  answerInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.textPrimary,
  },

  guessList: { marginTop: spacing.md },
  guessListTitle: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '800', marginBottom: spacing.xs },
  guessChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  guessChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  guessChipText: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700' },

  sectionTitle: { fontSize: fontSize.subtitle, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.lg, marginBottom: spacing.sm },
  histCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  histBody: { flex: 1 },
  histWord: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary },
  histText: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 2, fontWeight: '600' },
  histDate: { fontSize: fontSize.caption, color: colors.textMuted, fontWeight: '700' },
}));
