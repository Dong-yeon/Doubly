/**
 * 오목 연습 — 튜토리얼(정해진 수순 + 코치 말풍선)과 AI 대전. docs/game-practice-tutorial_2026-10-13.md.
 * 넷이 같아 연습(QuartoPracticeScreen)과 같은 틀이다.
 *
 * <p>앱 안에서만 돈다 — 서버를 부르지 않아 전적·스트릭·푸시·채팅 카드 어디에도 남지 않는다. 규칙은 games/omok
 * (서버 OmokRules 와 같은 케이스를 verify-omok.mjs 가 대조), 상대는 games/omok/ai.
 *
 * <p>AI 대전 코치는 사후 설명이 기본이다("아까 ○행 ○열에 두면 다섯이었어요", "제 넷을 막아야 했어요").
 * '쉬움'만 미리 한 마디 한다("지금 다섯을 만들 수 있어요", "제 돌이 넷이에요") — 처음 하는 사람이 이기고 막는 걸 겪게.
 * 연습이라 무르기는 상대 동의 없이 바로 된다.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/types';
import { useContentWidth } from '../../hooks/useContentWidth';
import { Button } from '../../components/Button';
import { CoachBubble, PracticeBanner, type CoachTone } from '../../components/practice/CoachBubble';
import { OmokBoard, toStones } from '../../components/omok/OmokBoard';
import { fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';
import { haptics } from '../../utils/haptics';
import { isTutorialDone, markTutorialDone } from '../../utils/practiceProgress';
import { BLACK, EMPTY, WHITE, cellName, emptyBoard, isFull, other, winningCells, winningLine, type Stone } from '../../games/omok';
import { chooseMove, type AiLevel } from '../../games/omok/ai';
import { OMOK_LESSONS } from '../../games/omok/lessons';

type Props = NativeStackScreenProps<HomeStackParamList, 'OmokPractice'>;

type Mode = 'menu' | 'lesson' | 'free';
interface Coach {
  text: string;
  tone: CoachTone;
}

interface FreeGame {
  board: number[];
  me: Stone;
  turn: Stone;
  winner: Stone | 'DRAW' | null;
  winLine: number[] | null;
  moves: number[];
}

/** AI 가 "생각하는" 시간 — 바로 두면 어디에 뒀는지 못 본다 */
const AI_DELAY_MS = 500;

export function OmokPracticeScreen(_: Props) {
  const width = useContentWidth();
  const boardSize = Math.min(width - spacing.lg * 2, 420);

  const [mode, setMode] = useState<Mode>('menu');
  const [tutorialDone, setTutorialDone] = useState(false);
  const [coach, setCoach] = useState<Coach | null>(null);

  // ── 튜토리얼 ──
  const [lessonIdx, setLessonIdx] = useState(0);
  const [stepIdx, setStepIdx] = useState(0);
  const [lessonBoard, setLessonBoard] = useState<number[]>(OMOK_LESSONS[0].board);
  const [lessonLast, setLessonLast] = useState<number | null>(null);
  const [lessonWin, setLessonWin] = useState<number[] | null>(null);
  const [stepCleared, setStepCleared] = useState(false);
  const [showTargets, setShowTargets] = useState(false);

  // ── AI 대전 ──
  const [level, setLevel] = useState<AiLevel>('EASY');
  const [game, setGame] = useState<FreeGame | null>(null);
  /** 내가 두기 직전 판들 — 무르기는 여기로 돌아간다(AI 의 응수까지 함께 사라진다) */
  const [undoStack, setUndoStack] = useState<FreeGame[]>([]);
  /** 다음 판의 내 돌 — 판마다 흑백을 바꾼다(첫 판은 흑 = 먼저) */
  const nextMe = useRef<Stone>(BLACK);

  const startLesson = useCallback((i: number) => {
    setMode('lesson');
    setLessonIdx(i);
    setStepIdx(0);
    setLessonBoard([...OMOK_LESSONS[i].board]);
    setLessonLast(null);
    setLessonWin(null);
    setStepCleared(false);
    setShowTargets(false);
    setCoach(null);
  }, []);

  const startFree = useCallback((lv: AiLevel) => {
    const me = nextMe.current;
    nextMe.current = other(me);
    setLevel(lv);
    setMode('free');
    setUndoStack([]);
    setGame({ board: emptyBoard(), me, turn: BLACK, winner: null, winLine: null, moves: [] });
    setCoach(
      me === BLACK
        ? { text: '이번 판은 내가 흑이라 먼저 둬요. 가운데 근처에서 시작해 보세요.', tone: 'info' }
        : { text: '이번 판은 내가 백이에요. 제가 먼저 둘게요.', tone: 'info' },
    );
  }, []);

  useEffect(() => {
    let alive = true;
    isTutorialDone('OMOK').then((done) => {
      if (!alive) return;
      setTutorialDone(done);
      if (!done) startLesson(0);
    });
    return () => {
      alive = false;
    };
  }, [startLesson]);

  // ── 튜토리얼 ─────────────────────────────────────────────────────────

  const lesson = OMOK_LESSONS[lessonIdx];
  const step = lesson.steps[stepIdx];

  const nextStep = () => {
    setCoach(null);
    setStepCleared(false);
    setShowTargets(false);
    if (stepIdx + 1 < lesson.steps.length) {
      setStepIdx(stepIdx + 1);
      return;
    }
    if (lessonIdx + 1 < OMOK_LESSONS.length) {
      startLesson(lessonIdx + 1);
      return;
    }
    markTutorialDone('OMOK');
    setTutorialDone(true);
    startFree('EASY');
  };

  const tapLesson = (index: number) => {
    if (step.kind !== 'place' || stepCleared || lessonBoard[index] !== EMPTY) return;
    if (!step.targets.includes(index)) {
      haptics.light();
      setCoach({ text: step.wrong, tone: 'warn' });
      setShowTargets(true);
      return;
    }
    const next = [...lessonBoard];
    next[index] = BLACK;
    const line = winningLine(next, index);
    setLessonBoard(next);
    setLessonLast(index);
    setLessonWin(line);
    setStepCleared(true);
    setCoach({ text: step.done, tone: 'good' });
    if (line) haptics.success();
    else haptics.light();
  };

  const renderLesson = () => {
    const isLast = lessonIdx === OMOK_LESSONS.length - 1 && stepIdx === lesson.steps.length - 1;
    const placing = step.kind === 'place' && !stepCleared;
    return (
      <View>
        <View style={styles.head}>
          <Text style={styles.headTitle}>
            튜토리얼 {lessonIdx + 1}/{OMOK_LESSONS.length} · {lesson.title}
          </Text>
          <Pressable
            onPress={() => {
              markTutorialDone('OMOK');
              setTutorialDone(true);
              setMode('menu');
            }}
            accessibilityRole="button"
            hitSlop={8}
          >
            <Text style={styles.headLink}>건너뛰기</Text>
          </Pressable>
        </View>
        <Text style={styles.sub}>나는 흑(검은 돌)이에요</Text>
        <OmokBoard
          stones={toStones(lessonBoard, BLACK)}
          myIsBlack
          size={boardSize}
          interactive={placing}
          onPress={tapLesson}
          winningLine={lessonWin}
          lastMove={lessonLast}
          coachCells={placing && showTargets && step.kind === 'place' ? step.targets : null}
        />
        {!stepCleared ? <CoachBubble text={step.coach} /> : null}
        {coach ? (
          <CoachBubble
            text={coach.text}
            tone={coach.tone}
            actionLabel={stepCleared ? (isLast ? 'AI와 한 판 하기' : '다음') : undefined}
            onAction={nextStep}
          />
        ) : null}
        {step.kind === 'read' ? (
          <Button title={isLast ? 'AI와 한 판 하기' : '다음'} onPress={nextStep} style={styles.action} />
        ) : null}
      </View>
    );
  };

  // ── AI 대전 ──────────────────────────────────────────────────────────

  const ai = game ? other(game.me) : WHITE;

  // AI 차례 — 잠깐 뒤에 둔다
  useEffect(() => {
    if (mode !== 'free' || !game || game.winner || game.turn === game.me) return undefined;
    const timer = setTimeout(() => {
      const aiColor = other(game.me);
      const m = chooseMove(game.board, aiColor, level, Math.random);
      const board = [...game.board];
      board[m] = aiColor;
      const line = winningLine(board, m);
      const next: FreeGame = {
        ...game,
        board,
        turn: game.me,
        moves: [...game.moves, m],
        winLine: line,
        winner: line ? aiColor : isFull(board) ? 'DRAW' : null,
      };
      setGame(next);
      if (line) {
        setCoach({ text: '제가 다섯을 이었어요. 상대 돌이 넷(또는 양쪽이 열린 셋)이 되면 먼저 막아야 해요. "한 수 무르기"로 다시 해 봐도 돼요.', tone: 'warn' });
      } else if (next.winner === 'DRAW') {
        setCoach({ text: '판이 다 찼어요 — 무승부예요.', tone: 'info' });
      } else if (level === 'EASY' && winningCells(board, game.me).length > 0) {
        setCoach({ text: '지금 다섯을 만들 수 있는 자리가 있어요. 찾아보세요!', tone: 'info' });
      } else if (level === 'EASY' && winningCells(board, aiColor).length > 0) {
        setCoach({ text: '제 돌이 넷이에요 — 막아 보세요!', tone: 'warn' });
      }
    }, AI_DELAY_MS);
    return () => clearTimeout(timer);
  }, [mode, game, level]);

  const tapFree = (index: number) => {
    if (!game || game.winner || game.turn !== game.me || game.board[index] !== EMPTY) return;
    // 사후 설명용 — 두기 전 판에서 내 다섯 자리·상대 다섯 자리를 봐 둔다
    const myWins = winningCells(game.board, game.me);
    const theirWins = winningCells(game.board, ai);
    const board = [...game.board];
    board[index] = game.me;
    const line = winningLine(board, index);
    setUndoStack((st) => [...st, game]);
    setGame({
      ...game,
      board,
      turn: ai,
      moves: [...game.moves, index],
      winLine: line,
      winner: line ? game.me : isFull(board) ? 'DRAW' : null,
    });
    if (line) {
      haptics.success();
      setCoach({ text: '다섯! 이겼어요.', tone: 'good' });
    } else if (myWins.length > 0) {
      haptics.light();
      setCoach({ text: `아까 ${cellName(myWins[0])}에 두면 다섯이었어요.`, tone: 'warn' });
    } else if (theirWins.length > 0 && !theirWins.includes(index)) {
      haptics.light();
      setCoach({ text: `제 넷을 막지 않았어요 — ${cellName(theirWins[0])}을 막아야 했어요.`, tone: 'warn' });
    } else {
      haptics.light();
      setCoach(null);
    }
  };

  const undo = () => {
    const prev = undoStack[undoStack.length - 1];
    if (!prev) return;
    setUndoStack(undoStack.slice(0, -1));
    setGame(prev);
    setCoach({ text: '한 수 물렀어요. 다시 둬 보세요.', tone: 'info' });
  };

  const renderFree = (g: FreeGame) => {
    const myTurn = !g.winner && g.turn === g.me;
    const status = g.winner
      ? g.winner === 'DRAW' ? '무승부' : g.winner === g.me ? '이겼어요!' : 'AI가 이겼어요'
      : myTurn ? '내 차례예요' : 'AI가 생각하는 중…';
    return (
      <View>
        <View style={styles.head}>
          <Text style={styles.headTitle}>AI와 한 판 · {level === 'EASY' ? '쉬움' : '보통'}</Text>
          <Pressable onPress={() => setMode('menu')} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.headLink}>그만하기</Text>
          </Pressable>
        </View>
        <Text style={styles.sub}>
          나 {g.me === BLACK ? '흑(먼저)' : '백(나중)'} · {status} · {g.moves.length}수
        </Text>
        <OmokBoard
          stones={toStones(g.board, g.me)}
          myIsBlack={g.me === BLACK}
          size={boardSize}
          interactive={myTurn}
          onPress={tapFree}
          winningLine={g.winLine}
          lastMove={g.moves.length > 0 ? g.moves[g.moves.length - 1] : null}
          moves={g.moves}
        />
        {coach ? <CoachBubble text={coach.text} tone={coach.tone} /> : null}
        <View style={styles.row}>
          <Button
            title="한 수 무르기"
            variant="ghost"
            onPress={undo}
            disabled={undoStack.length === 0 || (!g.winner && g.turn !== g.me)}
            style={styles.rowBtn}
          />
          {g.winner ? <Button title="한 판 더" onPress={() => startFree(level)} style={styles.rowBtn} /> : null}
        </View>
      </View>
    );
  };

  // ── 메뉴 ─────────────────────────────────────────────────────────────

  const renderMenu = () => (
    <View style={styles.menu}>
      <Pressable
        onPress={() => startLesson(0)}
        accessibilityRole="button"
        style={({ pressed }) => [styles.menuCard, !tutorialDone && styles.menuCardHot, pressed && styles.pressed]}
      >
        <Text style={styles.menuTitle}>튜토리얼 {tutorialDone ? '다시 보기' : '— 처음이라면 여기부터'}</Text>
        <Text style={styles.menuDesc}>{OMOK_LESSONS.length}단계 · 다섯 잇기, 넷 막기, 열린 셋 막기, 두 줄 노리기</Text>
      </Pressable>
      <View style={styles.menuCard}>
        <Text style={styles.menuTitle}>AI와 한 판</Text>
        <Text style={styles.menuDesc}>실제 판과 똑같아요(15×15, 금지 규칙 없음). 판마다 흑백이 바뀌고, 무르기는 마음껏.</Text>
        <View style={styles.row}>
          <Button title="쉬움" variant="secondary" onPress={() => startFree('EASY')} style={styles.rowBtn} />
          <Button title="보통" onPress={() => startFree('NORMAL')} style={styles.rowBtn} />
        </View>
        <Text style={styles.menuNote}>쉬움은 막을 곳을 가끔 놓치고, 보통은 넷과 열린 셋을 막아요.</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.list}>
        <PracticeBanner />
        {mode === 'lesson' ? renderLesson() : mode === 'free' && game ? renderFree(game) : renderMenu()}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, paddingBottom: spacing.xl },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  headTitle: { flex: 1, fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  headLink: { fontSize: fontSize.caption, fontWeight: '800', color: colors.primary },
  sub: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700', marginBottom: spacing.sm },
  action: { marginTop: spacing.md },
  row: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  rowBtn: { flex: 1 },
  menu: { gap: spacing.md },
  menuCard: {
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.xs,
  },
  menuCardHot: { borderColor: colors.primary, backgroundColor: colors.primaryBg },
  menuTitle: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  menuDesc: { fontSize: fontSize.caption, color: colors.textSecondary, lineHeight: 18 },
  menuNote: { fontSize: fontSize.caption, color: colors.textMuted, marginTop: spacing.xs },
  pressed: { opacity: 0.6 },
}));
