/**
 * 길막기 연습 — 튜토리얼(정해진 수순 + 코치 말풍선)과 AI 대전. docs/game-practice-tutorial_2026-10-13.md.
 * 넷이 같아·오목 연습과 같은 틀이고, 판과 벽 트레이는 실전과 같은 components/wallrace/WallRaceBoard 를 쓴다 —
 * 연습에서 익힌 조작(고리 눌러 이동, 조각 끌어 벽 놓기)이 실전과 똑같다.
 *
 * <p>앱 안에서만 돈다 — 서버를 부르지 않아 전적·스트릭·푸시 어디에도 남지 않는다. 규칙은 games/wallrace(서버 WallRaceRules 를
 * 옮김, verify-wallrace.mjs 가 서버 테스트와 같은 케이스로 대조), 상대는 games/wallrace/ai. 나는 늘 아래에서 먼저 둔다.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/types';
import { useContentWidth } from '../../hooks/useContentWidth';
import { Button } from '../../components/Button';
import { CoachBubble, PracticeBanner, type CoachTone } from '../../components/practice/CoachBubble';
import { WallRaceBoard, WR_COLORS, type WallKind, type WallRaceView } from '../../components/wallrace/WallRaceBoard';
import { fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';
import { haptics } from '../../utils/haptics';
import { isTutorialDone, markTutorialDone } from '../../utils/practiceProgress';
import { distance, illegalWalls, isLegalWall, legalMoves, placeWall } from '../../games/wallrace';
import { AI_GOAL, ME_GOAL, legalMovesOf, moveLocal, newWallGame, wallLocal, type WallGame } from '../../games/wallrace/local';
import { chooseAiMove, wallEffect, type AiLevel } from '../../games/wallrace/ai';
import { WALL_LESSONS } from '../../games/wallrace/lessons';

type Props = NativeStackScreenProps<HomeStackParamList, 'WallRacePractice'>;

type Mode = 'menu' | 'lesson' | 'free';
interface Coach {
  text: string;
  tone: CoachTone;
}

/** AI 가 "생각하는" 시간 — 바로 두면 무엇을 했는지 못 본다 */
const AI_DELAY_MS = 600;

/** 연습 판 상태를 실전 판 그림이 받는 모양으로 */
function viewOf(walls: string, me: number, ai: number, moves: string[], myWallsLeft: number, myTurn: boolean): WallRaceView {
  return {
    myPawn: me,
    partnerPawn: ai,
    myGoalRow: ME_GOAL,
    walls,
    legalMoves: myTurn ? legalMoves(walls, me, ai) : [],
    illegalWalls: myTurn ? illegalWalls(walls, me, ME_GOAL, ai, AI_GOAL) : [],
    moves,
    myWallsLeft,
    myTurn,
  };
}

export function WallRacePracticeScreen(_: Props) {
  const width = useContentWidth();
  const boardSize = Math.min(width - spacing.lg * 2, 380);

  const [mode, setMode] = useState<Mode>('menu');
  const [tutorialDone, setTutorialDone] = useState(false);
  const [coach, setCoach] = useState<Coach | null>(null);
  const [dragging, setDragging] = useState(false);

  // ── 튜토리얼 ──
  const [lessonIdx, setLessonIdx] = useState(0);
  const [stepIdx, setStepIdx] = useState(0);
  const [lessonWalls, setLessonWalls] = useState(WALL_LESSONS[0].walls);
  const [lessonMe, setLessonMe] = useState(WALL_LESSONS[0].me);
  const [lessonMoves, setLessonMoves] = useState<string[]>([]);
  const [stepCleared, setStepCleared] = useState(false);
  const [showTargets, setShowTargets] = useState(false);
  /** 틀린 시도마다 늘린다 — 판의 고르던 벽을 비우는 데 쓴다 */
  const [attempt, setAttempt] = useState(0);

  // ── AI 대전 ──
  const [level, setLevel] = useState<AiLevel>('EASY');
  const [game, setGame] = useState<WallGame | null>(null);
  const [undoStack, setUndoStack] = useState<WallGame[]>([]);
  /** 몇 번째 판 — 판의 고르던 벽을 새 판에서 비우는 데 쓴다 */
  const [gameNo, setGameNo] = useState(0);

  const startLesson = useCallback((i: number) => {
    const l = WALL_LESSONS[i];
    setMode('lesson');
    setLessonIdx(i);
    setStepIdx(0);
    setLessonWalls(l.walls);
    setLessonMe(l.me);
    setLessonMoves([]);
    setStepCleared(false);
    setShowTargets(false);
    setCoach(null);
  }, []);

  const startFree = useCallback((lv: AiLevel) => {
    setGameNo((n) => n + 1);
    setLevel(lv);
    setMode('free');
    setUndoStack([]);
    setGame(newWallGame());
    setCoach({ text: '내가 먼저예요. 고리를 눌러 위로 가거나, 아래 조각을 끌어 벽을 놓아요.', tone: 'info' });
  }, []);

  useEffect(() => {
    let alive = true;
    isTutorialDone('WALL_RACE').then((done) => {
      if (!alive) return;
      setTutorialDone(done);
      if (!done) startLesson(0);
    });
    return () => {
      alive = false;
    };
  }, [startLesson]);

  // ── 튜토리얼 ─────────────────────────────────────────────────────────

  const lesson = WALL_LESSONS[lessonIdx];
  const step = lesson.steps[stepIdx];
  const lessonAi = lesson.ai;

  const nextStep = () => {
    setCoach(null);
    setStepCleared(false);
    setShowTargets(false);
    if (stepIdx + 1 < lesson.steps.length) {
      setStepIdx(stepIdx + 1);
      return;
    }
    if (lessonIdx + 1 < WALL_LESSONS.length) {
      startLesson(lessonIdx + 1);
      return;
    }
    markTutorialDone('WALL_RACE');
    setTutorialDone(true);
    startFree('EASY');
  };

  const lessonMove = (cell: number) => {
    if (step.kind !== 'move' || stepCleared) return;
    if (!step.targets.includes(cell)) {
      setCoach({ text: step.wrong, tone: 'warn' });
      setShowTargets(true);
      return;
    }
    setLessonMe(cell);
    setLessonMoves((m) => [...m, `P${cell}`]);
    setStepCleared(true);
    setCoach({ text: step.done, tone: 'good' });
  };

  const lessonWall = (slot: number, kind: WallKind) => {
    if (step.kind !== 'wall' || stepCleared) return;
    const now = distance(lessonWalls, lessonAi, AI_GOAL);
    const legal = isLegalWall(lessonWalls, slot, kind, lessonMe, ME_GOAL, lessonAi, AI_GOAL);
    const after = legal ? distance(placeWall(lessonWalls, slot, kind), lessonAi, AI_GOAL) : now;
    if (!legal || after <= now) {
      haptics.light();
      setAttempt((a) => a + 1);
      setCoach({ text: step.wrong, tone: 'warn' });
      setShowTargets(true);
      return;
    }
    setLessonWalls(placeWall(lessonWalls, slot, kind));
    setLessonMoves((m) => [...m, `W${slot}${kind}`]);
    setStepCleared(true);
    haptics.success();
    setCoach({ text: `${step.done} (상대 도착까지 ${now}칸 → ${after}칸)`, tone: 'good' });
  };

  const renderLesson = () => {
    const isLast = lessonIdx === WALL_LESSONS.length - 1 && stepIdx === lesson.steps.length - 1;
    const acting = (step.kind === 'move' || step.kind === 'wall') && !stepCleared;
    const view = viewOf(lessonWalls, lessonMe, lessonAi, lessonMoves, 10, acting);
    // 권하는 벽 자리가 있는 레슨이면 처음부터 옅게 보여 준다(처음 벽을 놓는 사람에게 "어디쯤"이 가장 어렵다)
    const coachWall = step.kind === 'wall' && !stepCleared && step.hint ? { slot: step.hint.slot, kind: step.hint.wall } : null;
    return (
      <View>
        <View style={styles.head}>
          <Text style={styles.headTitle}>
            튜토리얼 {lessonIdx + 1}/{WALL_LESSONS.length} · {lesson.title}
          </Text>
          <Pressable
            onPress={() => {
              markTutorialDone('WALL_RACE');
              setTutorialDone(true);
              setMode('menu');
            }}
            accessibilityRole="button"
            hitSlop={8}
          >
            <Text style={styles.headLink}>건너뛰기</Text>
          </Pressable>
        </View>
        <Text style={styles.sub}>
          도착까지 나 {distance(lessonWalls, lessonMe, ME_GOAL)}칸 · 상대 {distance(lessonWalls, lessonAi, AI_GOAL)}칸
        </Text>
        <WallRaceBoard
          view={view}
          size={boardSize}
          interactive={acting}
          showTray={step.kind === 'wall' && !stepCleared}
          resetKey={`${lessonIdx}:${stepIdx}:${attempt}`}
          onMove={lessonMove}
          onWall={lessonWall}
          onDragChange={setDragging}
          movesDisabled={step.kind === 'wall'}
          wallsDisabled={step.kind !== 'wall'}
          coachCells={step.kind === 'move' && showTargets ? step.targets : null}
          coachWall={coachWall}
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
          <Button title={isLast ? 'AI와 한 판 하기' : '다음'} variant="secondary" onPress={nextStep} style={styles.action} />
        ) : null}
      </View>
    );
  };

  // ── AI 대전 ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (mode !== 'free' || !game || game.winner || game.turn !== 'AI') return undefined;
    const timer = setTimeout(() => {
      const m = chooseAiMove(game, level, Math.random);
      const next = m.kind === 'move' ? moveLocal(game, 'AI', m.cell) : wallLocal(game, 'AI', m.slot, m.wall);
      setGame(next);
      const meDist = distance(next.walls, next.me, ME_GOAL);
      const aiDist = distance(next.walls, next.ai, AI_GOAL);
      if (next.winner === 'AI') {
        setCoach({
          text: '제가 먼저 도착했어요. "도착까지" 칸 수를 비교해서 내 쪽이 길면 벽으로 상대를 돌게 하세요. "한 수 무르기"로 다시 해 봐도 돼요.',
          tone: 'warn',
        });
      } else if (m.kind === 'wall') {
        setCoach({ text: `제가 벽을 놓았어요 — 이제 도착까지 나 ${meDist}칸 · 저 ${aiDist}칸.`, tone: 'info' });
      } else if (level === 'EASY' && aiDist <= 2 && next.meWalls > 0 && aiDist < meDist) {
        setCoach({ text: `제가 ${aiDist}칸 남았어요! 벽으로 길을 돌게 해 보세요.`, tone: 'warn' });
      } else {
        setCoach(null);
      }
    }, AI_DELAY_MS);
    return () => clearTimeout(timer);
  }, [mode, game, level]);

  const freeMove = (cell: number) => {
    if (!game || game.turn !== 'ME' || game.winner) return;
    if (!legalMovesOf(game, 'ME').includes(cell)) return;
    setUndoStack((st) => [...st, game]);
    const next = moveLocal(game, 'ME', cell);
    setGame(next);
    if (next.winner === 'ME') {
      haptics.success();
      setCoach({ text: '도착! 이겼어요.', tone: 'good' });
    } else {
      setCoach(null);
    }
  };

  const freeWall = (slot: number, kind: WallKind) => {
    if (!game || game.turn !== 'ME' || game.winner) return;
    if (!isLegalWall(game.walls, slot, kind, game.me, ME_GOAL, game.ai, AI_GOAL)) return;
    const before = distance(game.walls, game.ai, AI_GOAL);
    const after = wallEffect(game, slot, kind).ai;
    setUndoStack((st) => [...st, game]);
    setGame(wallLocal(game, 'ME', slot, kind));
    haptics.light();
    // 사후 설명 — 벽이 상대를 얼마나 돌게 했는지
    setCoach(
      after > before
        ? { text: `상대가 ${after - before}칸 더 돌아가야 해요(도착까지 ${after}칸).`, tone: 'good' }
        : { text: '이 벽은 상대 길을 늘리지 못했어요. 상대 말과 도착 줄 사이를 막아야 효과가 있어요.', tone: 'warn' },
    );
  };

  const undo = () => {
    const prev = undoStack[undoStack.length - 1];
    if (!prev) return;
    setUndoStack(undoStack.slice(0, -1));
    setGame(prev);
    setCoach({ text: '한 수 물렀어요. 다시 둬 보세요.', tone: 'info' });
  };

  const renderFree = (g: WallGame) => {
    const myTurn = !g.winner && g.turn === 'ME';
    const status = g.winner ? (g.winner === 'ME' ? '이겼어요!' : 'AI가 이겼어요') : myTurn ? '내 차례예요' : 'AI가 생각하는 중…';
    return (
      <View>
        <View style={styles.head}>
          <Text style={styles.headTitle}>AI와 한 판 · {level === 'EASY' ? '쉬움' : '보통'}</Text>
          <Pressable onPress={() => setMode('menu')} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.headLink}>그만하기</Text>
          </Pressable>
        </View>
        <Text style={styles.sub}>
          {status} · 도착까지 나 {distance(g.walls, g.me, ME_GOAL)}칸 · AI {distance(g.walls, g.ai, AI_GOAL)}칸 · AI 벽 {g.aiWalls}개
        </Text>
        <WallRaceBoard
          view={viewOf(g.walls, g.me, g.ai, g.moves, g.meWalls, myTurn)}
          size={boardSize}
          interactive={myTurn}
          resetKey={`${gameNo}:${g.moves.length}`}
          onMove={freeMove}
          onWall={freeWall}
          onDragChange={setDragging}
        />
        {coach ? <CoachBubble text={coach.text} tone={coach.tone} /> : null}
        <View style={styles.row}>
          <Button
            title="한 수 무르기"
            variant="secondary"
            onPress={undo}
            disabled={undoStack.length === 0 || (!g.winner && g.turn !== 'ME')}
            style={styles.rowBtn}
          />
          {g.winner ? <Button title="한 판 더" variant="secondary" onPress={() => startFree(level)} style={styles.rowBtn} /> : null}
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
        <Text style={styles.menuDesc}>{WALL_LESSONS.length}단계 · 이동, 뛰어넘기, 벽으로 돌게 하기, 완전히 막을 수 없음</Text>
      </Pressable>
      <View style={styles.menuCard}>
        <Text style={styles.menuTitle}>AI와 한 판</Text>
        <Text style={styles.menuDesc}>실제 판과 똑같아요(9×9, 벽 10개씩). 내가 아래에서 먼저 두고, 무르기는 마음껏.</Text>
        <View style={styles.row}>
          <Button title="쉬움" variant="secondary" onPress={() => startFree('EASY')} style={styles.rowBtn} />
          <Button title="보통" variant="secondary" onPress={() => startFree('NORMAL')} style={styles.rowBtn} />
        </View>
        <Text style={styles.menuNote}>쉬움은 벽을 덜 쓰고, 보통은 지고 있으면 가장 아픈 자리에 벽을 놓아요.</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.list} scrollEnabled={!dragging}>
        <PracticeBanner />
        {mode === 'lesson' ? renderLesson() : mode === 'free' && game ? renderFree(game) : renderMenu()}
      </ScrollView>
    </SafeAreaView>
  );
}

/* 판이 어두운 게임판이라 화면 바탕도 실전 두는 화면처럼 어둡게 맞춘다 */
const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: WR_COLORS.bg },
  list: { padding: spacing.lg, paddingBottom: spacing.xl },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  headTitle: { flex: 1, fontSize: fontSize.subtitle, fontWeight: '800', color: WR_COLORS.text },
  headLink: { fontSize: fontSize.caption, fontWeight: '800', color: WR_COLORS.me },
  sub: { fontSize: fontSize.caption, color: WR_COLORS.sub, fontWeight: '700', marginBottom: spacing.sm },
  action: { marginTop: spacing.md },
  row: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  rowBtn: { flex: 1 },
  menu: { gap: spacing.md },
  menuCard: {
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: WR_COLORS.line,
    backgroundColor: WR_COLORS.card,
    gap: spacing.xs,
  },
  menuCardHot: { borderColor: WR_COLORS.me },
  menuTitle: { fontSize: fontSize.subtitle, fontWeight: '800', color: WR_COLORS.text },
  menuDesc: { fontSize: fontSize.caption, color: WR_COLORS.sub, lineHeight: 18 },
  menuNote: { fontSize: fontSize.caption, color: colors.textMuted, marginTop: spacing.xs },
  pressed: { opacity: 0.6 },
}));
