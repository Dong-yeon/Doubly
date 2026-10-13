/**
 * 넷이 같아 연습 — 튜토리얼(정해진 수순 + 코치 말풍선)과 AI 대전. docs/game-practice-tutorial_2026-10-13.md.
 *
 * <p>앱 안에서만 돈다. 서버를 부르지 않으므로 전적·스트릭·푸시·채팅 카드 어디에도 남지 않는다. 규칙은 games/quarto/local.ts
 * (서버 QuartoGame.apply 와 같은 규칙, verify-quarto.mjs 가 대조), 상대는 games/quarto/ai.ts.
 *
 * <p>조작은 실전과 같다 — 빈 칸 탭 → 미리보기 → 건넬 말 고르기 → [확정]. 튜토리얼도 같은 조작으로 배우게 한다.
 * AI 대전의 코치는 <b>사후 설명만</b> 한다("아까 그 칸에 놓았으면 이겼어요"). 둘 때 미리 경고하지 않는 건 실전과 같은
 * 이유다. 예외는 '쉬움'의 "지금 이길 수 있는 칸이 있어요" 한 마디 — 처음 하는 사람이 이기는 경험부터 하게.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/types';
import { useContentWidth } from '../../hooks/useContentWidth';
import { Button } from '../../components/Button';
import { CoachBubble, PracticeBanner, type CoachTone } from '../../components/practice/CoachBubble';
import { QuartoBoard, QuartoHand, QuartoTray, lastPlaceOf } from '../../components/quarto/QuartoParts';
import { fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';
import { haptics } from '../../utils/haptics';
import { isTutorialDone, markTutorialDone } from '../../utils/practiceProgress';
import { SIZE, commonTraitLabels, describePiece, previewPlace, remainingPieces } from '../../games/quarto';
import { applyLocal, newLocalGame, turnOf, type LocalGame, type Side } from '../../games/quarto/local';
import { chooseFirstGive, chooseMove, isSafeGive, winningCells, type AiLevel } from '../../games/quarto/ai';
import { QUARTO_LESSONS } from '../../games/quarto/lessons';

type Props = NativeStackScreenProps<HomeStackParamList, 'QuartoPractice'>;

type Mode = 'menu' | 'lesson' | 'free';
interface Coach {
  text: string;
  tone: CoachTone;
}

/** AI 가 "생각하는" 시간 — 바로 두면 무슨 일이 일어났는지 못 본다 */
const AI_DELAY_MS = 700;

const cellName = (c: number) => `${Math.floor(c / SIZE) + 1}행 ${(c % SIZE) + 1}열`;

/** 이 칸에 이 말을 놓으면 생기는 줄의 공통점 — "모두 큰 말" */
function traitOfWin(board: readonly number[], cell: number, piece: number): string {
  const pv = previewPlace(board, cell, piece);
  return pv.winLine ? commonTraitLabels(pv.winLine.map((i) => pv.board[i])).join(' · ') : '';
}

/**
 * 확정 전 고른 것으로 할 수 있는 일 — 실전 화면과 같은 판단(이기는 칸이면 건넬 말 없음, 15번째면 저절로,
 * 16번째면 마지막 칸).
 */
function planOf(board: readonly number[], pending: number | null, cell: number | null) {
  const preview = pending != null && cell != null ? previewPlace(board, cell, pending) : null;
  const winning = !!preview?.winLine;
  const lastCell = !!preview && !winning && preview.remainingAfter.length === 0;
  const autoGive = !!preview && !winning && preview.remainingAfter.length === 1 ? preview.remainingAfter[0] : null;
  return { preview, winning, lastCell, autoGive };
}

export function QuartoPracticeScreen(_: Props) {
  const width = useContentWidth();
  const boardSize = Math.min(width - spacing.lg * 2, 360);
  const traySlot = Math.min(44, (width - spacing.lg * 2 - spacing.xs * 7) / 8);

  const [mode, setMode] = useState<Mode>('menu');
  const [tutorialDone, setTutorialDone] = useState(false);
  const [coach, setCoach] = useState<Coach | null>(null);
  const [selCell, setSelCell] = useState<number | null>(null);
  const [selGive, setSelGive] = useState<number | null>(null);

  // ── 튜토리얼 상태 ──
  const [lessonIdx, setLessonIdx] = useState(0);
  const [stepIdx, setStepIdx] = useState(0);
  const [lessonBoard, setLessonBoard] = useState<number[]>(QUARTO_LESSONS[0].board);
  const [lessonPending, setLessonPending] = useState<number | null>(QUARTO_LESSONS[0].pending);
  /** 지금 단계를 해냈는가 — 해내면 [다음] 이 뜬다 */
  const [stepCleared, setStepCleared] = useState(false);
  const [lessonWinLine, setLessonWinLine] = useState<number[] | null>(null);
  /** 틀린 뒤엔 목표 칸을 짚어 준다 */
  const [showTargets, setShowTargets] = useState(false);
  /** 레슨에서 방금 건넨 말 — 카드에 "내가 준 말"로 보여 준다 */
  const [lessonGiven, setLessonGiven] = useState<number | null>(null);

  // ── AI 대전 상태 ──
  const [level, setLevel] = useState<AiLevel>('EASY');
  const [game, setGame] = useState<LocalGame | null>(null);
  /** 다음 판의 첫 말 주기 — 판마다 번갈아 */
  const nextFirst = useRef<Side>('AI');

  const resetPick = () => {
    setSelCell(null);
    setSelGive(null);
  };

  const startLesson = useCallback((i: number) => {
    const l = QUARTO_LESSONS[i];
    setMode('lesson');
    setLessonIdx(i);
    setStepIdx(0);
    setLessonBoard([...l.board]);
    setLessonPending(l.pending);
    setStepCleared(false);
    setLessonWinLine(null);
    setShowTargets(false);
    setLessonGiven(null);
    setCoach(null);
    setSelCell(null);
    setSelGive(null);
  }, []);

  const startFree = useCallback((lv: AiLevel) => {
    const first = nextFirst.current;
    nextFirst.current = first === 'AI' ? 'ME' : 'AI';
    setLevel(lv);
    setMode('free');
    setGame(newLocalGame(first));
    setCoach(
      first === 'AI'
        ? { text: '제가 먼저 말을 건넬게요. 받으면 놓을 칸을 골라요.', tone: 'info' }
        : { text: '먼저 저에게 건넬 말을 골라 주세요.', tone: 'info' },
    );
    setSelCell(null);
    setSelGive(null);
  }, []);

  // 처음 들어오면 튜토리얼부터, 끝낸 적이 있으면 메뉴
  useEffect(() => {
    let alive = true;
    isTutorialDone('QUARTO').then((done) => {
      if (!alive) return;
      setTutorialDone(done);
      if (!done) startLesson(0);
    });
    return () => {
      alive = false;
    };
  }, [startLesson]);

  // ── 튜토리얼 ─────────────────────────────────────────────────────────

  const lesson = QUARTO_LESSONS[lessonIdx];
  const step = lesson.steps[stepIdx];

  const nextStep = () => {
    resetPick();
    setCoach(null);
    setStepCleared(false);
    setShowTargets(false);
    if (stepIdx + 1 < lesson.steps.length) {
      setStepIdx(stepIdx + 1);
      return;
    }
    if (lessonIdx + 1 < QUARTO_LESSONS.length) {
      startLesson(lessonIdx + 1);
      return;
    }
    markTutorialDone('QUARTO');
    setTutorialDone(true);
    startFree('EASY');
  };

  const lessonPlan = planOf(lessonBoard, lessonPending, step.kind === 'place' && !stepCleared ? selCell : null);

  const confirmLessonPlace = () => {
    if (step.kind !== 'place' || selCell == null || lessonPending == null) return;
    const ok = step.targets === 'any' || step.targets.includes(selCell);
    if (!ok) {
      haptics.light();
      setCoach({ text: step.wrong ?? '다른 칸을 골라 보세요.', tone: 'warn' });
      setShowTargets(true);
      setSelCell(null);
      return;
    }
    const pv = previewPlace(lessonBoard, selCell, lessonPending);
    setLessonBoard(pv.board);
    setLessonPending(null);
    setLessonWinLine(pv.winLine);
    setSelCell(null);
    setStepCleared(true);
    setCoach({ text: step.done, tone: 'good' });
    if (pv.winLine) haptics.success();
    else haptics.light();
  };

  const confirmLessonGive = () => {
    if (step.kind !== 'give' || selGive == null) return;
    if (step.rule === 'safe' && !isSafeGive(lessonBoard, selGive)) {
      const cell = winningCells(lessonBoard, selGive)[0];
      const why = traitOfWin(lessonBoard, cell, selGive);
      haptics.light();
      setCoach({ text: `${step.wrong ?? ''} ${cellName(cell)}에 놓으면 "${why}" 줄이 돼요. 다른 말을 골라 보세요.`.trim(), tone: 'warn' });
      setSelGive(null);
      return;
    }
    setLessonGiven(selGive);
    setSelGive(null);
    setStepCleared(true);
    setCoach({ text: step.done, tone: 'good' });
    haptics.light();
  };

  const renderLesson = () => {
    const placing = step.kind === 'place' && !stepCleared;
    const giving = step.kind === 'give' && !stepCleared;
    const isLast = lessonIdx === QUARTO_LESSONS.length - 1 && stepIdx === lesson.steps.length - 1;
    return (
      <View>
        <View style={styles.lessonHead}>
          <Text style={styles.lessonStep}>
            튜토리얼 {lessonIdx + 1}/{QUARTO_LESSONS.length} · {lesson.title}
          </Text>
          <Pressable
            onPress={() => {
              markTutorialDone('QUARTO');
              setTutorialDone(true);
              setMode('menu');
            }}
            accessibilityRole="button"
            hitSlop={8}
          >
            <Text style={styles.skip}>건너뛰기</Text>
          </Pressable>
        </View>
        <QuartoHand
          piece={lessonPending ?? lessonGiven}
          label={
            lessonPending != null
              ? '상대가 준 말'
              : lessonGiven != null
                ? '내가 준 말'
                : giving || lesson.pending == null
                  ? '건넬 말을 고를 차례'
                  : '말을 놓았어요'
          }
        />
        <QuartoBoard
          board={lessonBoard}
          size={boardSize}
          interactive={placing}
          onCellPress={(c) => {
            haptics.light();
            // 다시 고르면 "틀렸어요" 말풍선은 걷는다 — 짚어 준 칸 표시는 남긴다
            setCoach(null);
            setSelCell((cur) => (cur === c ? null : c));
          }}
          ghostAt={placing ? selCell : null}
          ghostPiece={placing ? lessonPending : null}
          highlight={lessonWinLine ?? lessonPlan.preview?.winLine ?? null}
          coachCells={placing && showTargets && Array.isArray(step.targets) ? step.targets : null}
        />
        {/* 지시는 해내기 전까지만 — 해낸 뒤엔 칭찬 말풍선 하나만 남긴다 */}
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
        {placing ? (
          <Button
            title={lessonPlan.winning ? '놓고 승리' : '여기 놓기'}
            onPress={confirmLessonPlace}
            disabled={selCell == null}
            style={styles.action}
          />
        ) : null}
        {giving ? (
          <>
            <QuartoTray
              available={remainingPieces(lessonBoard, null)}
              selected={selGive}
              onSelect={(p) => setSelGive((cur) => (cur === p ? null : p))}
              slot={traySlot}
            />
            <Button title="건네기" onPress={confirmLessonGive} disabled={selGive == null} style={styles.action} />
          </>
        ) : null}
      </View>
    );
  };

  // ── AI 대전 ──────────────────────────────────────────────────────────

  const myTurn = !!game && !game.winner && turnOf(game) === 'ME';
  const placingFree = myTurn && !!game && game.moveNo > 0 && game.pending != null;
  const freePlan = useMemo(
    () => (game && placingFree ? planOf(game.board, game.pending, selCell) : planOf([], null, null)),
    [game, placingFree, selCell],
  );

  // AI 차례 — 잠깐 뒤에 둔다. 끝나면 결과를 코치가 설명한다
  useEffect(() => {
    if (mode !== 'free' || !game || game.winner || turnOf(game) !== 'AI') return undefined;
    const timer = setTimeout(() => {
      let next: LocalGame;
      if (game.moveNo === 0) {
        next = applyLocal(game, 'AI', null, chooseFirstGive(Math.random));
      } else {
        const m = chooseMove(game.board, game.pending as number, level, Math.random);
        next = applyLocal(game, 'AI', m.place, m.give);
      }
      setGame(next);
      if (next.winner === 'AI' && next.winLine) {
        const given = next.history[next.history.length - 1].piece as number;
        const why = commonTraitLabels(next.winLine.map((i) => next.board[i])).join(' · ');
        setCoach({ text: `제가 이겼어요. 건네준 ${describePiece(given)}로 "${why}" 줄이 채워졌어요. 건넬 땐 그 말로 어디서 줄이 생기는지 살펴보세요.`, tone: 'warn' });
      } else if (next.winner === 'DRAW') {
        setCoach({ text: '16칸이 다 찼어요 — 무승부예요.', tone: 'info' });
      } else if (level === 'EASY' && next.pending != null && winningCells(next.board, next.pending).length > 0) {
        setCoach({ text: '지금 이길 수 있는 칸이 있어요. 찾아보세요!', tone: 'info' });
      } else {
        setCoach(null);
      }
    }, AI_DELAY_MS);
    return () => clearTimeout(timer);
  }, [mode, game, level]);

  const freeBody = (): { place: number | null; give: number | null } | null => {
    if (!game || !myTurn) return null;
    if (game.moveNo === 0) return selGive == null ? null : { place: null, give: selGive };
    if (selCell == null) return null;
    if (freePlan.winning || freePlan.lastCell) return { place: selCell, give: null };
    if (freePlan.autoGive != null) return { place: selCell, give: freePlan.autoGive };
    if (selGive == null || !freePlan.preview?.remainingAfter.includes(selGive)) return null;
    return { place: selCell, give: selGive };
  };

  const confirmFree = () => {
    const body = freeBody();
    if (!game || !body) return;
    // 이길 칸을 놓쳤는지 — 놓기 전에 봐 둔다(사후 설명용)
    const missed = body.place != null && game.pending != null ? winningCells(game.board, game.pending) : [];
    const next = applyLocal(game, 'ME', body.place, body.give);
    setGame(next);
    resetPick();
    if (next.winner === 'ME' && next.winLine) {
      haptics.success();
      const why = commonTraitLabels(next.winLine.map((i) => next.board[i])).join(' · ');
      setCoach({ text: `이겼어요! "${why}" 줄을 만들었어요.`, tone: 'good' });
    } else if (next.winner === 'DRAW') {
      setCoach({ text: '16칸이 다 찼어요 — 무승부예요.', tone: 'info' });
    } else if (missed.length > 0 && body.place != null && !missed.includes(body.place)) {
      setCoach({ text: `아까 ${cellName(missed[0])}에 놓았으면 이겼어요("${traitOfWin(game.board, missed[0], game.pending as number)}").`, tone: 'warn' });
    } else {
      setCoach(null);
      haptics.light();
    }
  };

  const renderFree = (g: LocalGame) => {
    const over = !!g.winner;
    const showTray = myTurn && (g.moveNo === 0 || (placingFree && !freePlan.winning && !freePlan.lastCell && freePlan.autoGive == null));
    let title = '놓고 건네기';
    if (g.moveNo === 0) title = '이 말 건네기';
    else if (freePlan.winning) title = '놓고 승리';
    else if (freePlan.lastCell) title = '마지막 칸에 놓기';
    else if (freePlan.autoGive != null) title = '놓기';
    const handLabel = over
      ? g.winner === 'ME' ? '이겼어요!' : g.winner === 'AI' ? 'AI가 이겼어요' : '무승부'
      : myTurn
        ? g.moveNo === 0 ? 'AI에게 건넬 말을 골라요' : 'AI가 준 말'
        : g.pending != null ? '내가 준 말' : 'AI가 건넬 말을 고르는 중';
    return (
      <View>
        <View style={styles.lessonHead}>
          <Text style={styles.lessonStep}>AI와 한 판 · {level === 'EASY' ? '쉬움' : '보통'}</Text>
          <Pressable onPress={() => setMode('menu')} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.skip}>그만하기</Text>
          </Pressable>
        </View>
        <QuartoHand
          piece={over ? null : g.pending}
          label={handLabel}
          sub={over ? undefined : `${myTurn ? '내 차례예요' : 'AI 차례예요'} · ${Math.max(0, g.moveNo - 1)}/16칸`}
        />
        <QuartoBoard
          board={g.board}
          size={boardSize}
          interactive={placingFree}
          onCellPress={(c) => {
            haptics.light();
            setSelCell((cur) => (cur === c ? null : c));
          }}
          ghostAt={placingFree ? selCell : null}
          ghostPiece={placingFree ? g.pending : null}
          highlight={g.winLine ?? freePlan.preview?.winLine ?? null}
          lastPlace={lastPlaceOf(g.history)}
        />
        {coach ? <CoachBubble text={coach.text} tone={coach.tone} /> : null}
        {myTurn ? (
          <Button title={title} onPress={confirmFree} disabled={!freeBody()} style={styles.action} />
        ) : null}
        {showTray ? (
          <QuartoTray
            available={g.moveNo === 0 ? remainingPieces(g.board, null) : freePlan.preview ? freePlan.preview.remainingAfter : remainingPieces(g.board, g.pending)}
            selected={selGive}
            onSelect={(p) => setSelGive((cur) => (cur === p ? null : p))}
            slot={traySlot}
          />
        ) : null}
        {over ? (
          <View style={styles.overRow}>
            <Button title="한 판 더" onPress={() => startFree(level)} style={styles.overBtn} />
            <Button title="처음으로" variant="ghost" onPress={() => setMode('menu')} style={styles.overBtn} />
          </View>
        ) : null}
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
        <Text style={styles.menuDesc}>{QUARTO_LESSONS.length}단계 · 받고 놓고 건네기, 공통점 찾기, 건넬 때 조심</Text>
      </Pressable>
      <View style={styles.menuCard}>
        <Text style={styles.menuTitle}>AI와 한 판</Text>
        <Text style={styles.menuDesc}>실제 판과 똑같아요. 판마다 먼저 건네는 쪽이 바뀌어요.</Text>
        <View style={styles.overRow}>
          <Button title="쉬움" variant="secondary" onPress={() => startFree('EASY')} style={styles.overBtn} />
          <Button title="보통" onPress={() => startFree('NORMAL')} style={styles.overBtn} />
        </View>
        <Text style={styles.menuNote}>쉬움은 이길 수 있는 칸을 가끔 놓치고, 보통은 놓치지 않아요.</Text>
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
  lessonHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  lessonStep: { flex: 1, fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  skip: { fontSize: fontSize.caption, fontWeight: '800', color: colors.primary },
  action: { marginTop: spacing.md },
  overRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  overBtn: { flex: 1 },
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
