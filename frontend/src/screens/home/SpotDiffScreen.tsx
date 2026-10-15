/**
 * 사진 틀린그림찾기 — docs/spot-diff-design_2026-10-14.md.
 *
 * <p>우리 공유 사진 한 장으로 서버가 만든 퍼즐을 둘이 <b>각자</b> 푼다. 승부는 없다 — 둘 다 끝나면(또는 퍼즐이
 * 닫히면) 서로의 기록과 정답 전체가 열린다. 그 전에는 상대가 찾은 <b>개수</b>만 보인다(서버가 그 이상을 주지 않는다).
 *
 * <p>판정·시간은 서버가 한다. 앱은 탭 좌표를 이미지 기준 0~1 로 되돌려 보내고(games/spotDiff/coords), 응답대로 원·X 를
 * 그릴 뿐이다. 같은 자리를 응답 전에 연타하면 보내지 않는다. 타임아웃이면 같은 clientTapId 로 한 번 더 보낸다
 * (서버가 저장된 판정을 돌려준다).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { MaterialCommunityIcons } from '../../components/Icon';
import { SpotDiffBoard, type BoardCircle, type BoardMark } from '../../components/spotdiff/SpotDiffBoard';
import { spotDiffApi } from '../../api/game';
import { ApiError } from '../../api/client';
import { connectSocket, newClientMessageId, subscribeCouple } from '../../api/chatSocket';
import { useRelationStore } from '../../store/relationStore';
import { toast } from '../../store/toastStore';
import { getErrorMessage } from '../../utils/error';
import { haptics } from '../../utils/haptics';
import { isDuplicateTap } from '../../games/spotDiff/coords';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { SPOT_DIFF_DISPLAY_NAME } from '../../constants/spotDiff';
import type { SpotDiffList, SpotPuzzle, SpotRecord } from '../../types';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<HomeStackParamList, 'SpotDiff'>;

/** 오답 X 가 떠 있는 시간 */
const MARK_MS = 700;

/** 서버 응답이 거꾸로 도착해도 화면이 뒤로 가지 않게 — 풀이는 늘기만 한다 */
function isNewer(next: SpotPuzzle, cur: SpotPuzzle | null): boolean {
  if (!cur || cur.id !== next.id) return true;
  if (next.status !== cur.status || next.closed !== cur.closed || (!!next.result && !cur.result)) return true;
  if (next.me.found.length !== cur.me.found.length) return next.me.found.length > cur.me.found.length;
  return next.me.wrongTaps >= cur.me.wrongTaps && next.me.hintsUsed >= cur.me.hintsUsed;
}

function formatMs(ms: number | null | undefined): string {
  if (ms == null) return '-';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function remainingLabel(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  if (h >= 1) return `${h}시간 남음`;
  return `${Math.max(1, Math.ceil(ms / 60_000))}분 남음`;
}

function dayLabel(p: SpotPuzzle): string {
  if (!p.puzzleDate) return '퍼즐';
  const [, m, d] = p.puzzleDate.split('-');
  return `${Number(m)}월 ${Number(d)}일 퍼즐`;
}

/** 목록에서 먼저 보여 줄 판 — 내가 아직 풀 수 있는 판, 없으면 가장 최근 판 */
function pickDefault(list: SpotDiffList): number | null {
  const playable = list.puzzles.find((p) => p.status === 'READY' && !p.closed && !p.me.finished);
  return (playable ?? list.puzzles[0])?.id ?? null;
}

export function SpotDiffScreen(_props: Props) {
  const relationId = useRelationStore((s) => s.couple?.id);
  const window = useWindowDimensions();
  const orientation = window.width > window.height ? 'side' : 'stacked';

  const [list, setList] = useState<SpotDiffList | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selectedRef = useRef<number | null>(null);
  const [puzzle, setPuzzleState] = useState<SpotPuzzle | null>(null);
  const puzzleRef = useRef<SpotPuzzle | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [opening, setOpening] = useState(false);
  const [hinting, setHinting] = useState(false);
  const [marks, setMarks] = useState<BoardMark[]>([]);
  const pending = useRef<{ key: string; x: number; y: number }[]>([]);
  const [area, setArea] = useState({ width: 0, height: 0 });
  /** 서버가 잰 시간 + 받은 뒤 흐른 시간 — 표시용일 뿐 기록은 서버 값이다 */
  const [clock, setClock] = useState(() => ({ base: 0, at: Date.now() }));
  /** 1초마다 갱신되는 지금 — 렌더 중에 Date.now() 를 부르지 않으려고 상태로 든다 */
  const [now, setNow] = useState(() => Date.now());

  const setPuzzle = useCallback((next: SpotPuzzle | null, force = false) => {
    if (next && !force && !isNewer(next, puzzleRef.current)) return;
    puzzleRef.current = next;
    setPuzzleState(next);
    if (next) setClock({ base: next.me.elapsedMs, at: Date.now() });
  }, []);

  const load = useCallback(async (silent = false) => {
    try {
      const l = await spotDiffApi.list();
      setList(l);
      setLoadError(false);
      const cur = selectedRef.current;
      const id = cur && l.puzzles.some((p) => p.id === cur) ? cur : pickDefault(l);
      selectedRef.current = id;
      setSelectedId(id);
      // 같은 판이면 늘어난 쪽만 받는다(탭 응답이 목록보다 새로울 수 있다)
      const p = l.puzzles.find((x) => x.id === id) ?? null;
      setPuzzle(p, !p || p.id !== puzzleRef.current?.id);
    } catch (e) {
      if (!silent) toast.error(getErrorMessage(e, '퍼즐을 불러오지 못했어요.'));
      setLoadError(true);
    }
  }, [setPuzzle]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  // 상대가 하나 찾을 때마다 커플 소켓 GAME — 상대 개수·결과 공개를 다시 읽는다
  useFocusEffect(
    useCallback(() => {
      if (!relationId) return undefined;
      let active = true;
      let off: (() => void) | undefined;
      connectSocket()
        .then(() => {
          if (!active) return;
          off = subscribeCouple(relationId, (type) => {
            if (type === 'GAME') void load(true);
          });
        })
        .catch(() => undefined);
      return () => {
        active = false;
        off?.();
      };
    }, [relationId, load]),
  );

  // 푸는 중에만 시계를 돌린다
  const running = !!puzzle && puzzle.me.started && !puzzle.me.finished && !puzzle.closed;
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  const select = (p: SpotPuzzle) => {
    selectedRef.current = p.id;
    setSelectedId(p.id);
    setPuzzle(p, true);
    setMarks([]);
    pending.current = [];
  };

  const start = async () => {
    if (!puzzle || opening) return;
    setOpening(true);
    try {
      setPuzzle(await spotDiffApi.open(puzzle.id), true);
    } catch (e) {
      toast.error(getErrorMessage(e, '퍼즐을 열지 못했어요.'));
      void load(true);
    } finally {
      setOpening(false);
    }
  };

  const sendTap = useCallback(async (id: number, key: string, x: number, y: number): Promise<void> => {
    try {
      let r;
      try {
        r = await spotDiffApi.tap(id, key, x, y);
      } catch (first) {
        // 응답을 못 받았다 — 같은 키로 한 번 더(서버가 이미 판정했으면 그 판정이 그대로 온다)
        if (!(first instanceof ApiError && first.status === 0)) throw first;
        r = await spotDiffApi.tap(id, key, x, y);
      }
      setPuzzle(r.puzzle);
      if (r.result === 'HIT') {
        haptics.success?.();
        if (r.puzzle.me.finished) toast.success('다섯 개를 다 찾았어요!');
      } else if (r.result === 'MISS') {
        haptics.light?.();
        const mark = { key, x, y };
        setMarks((m) => [...m, mark]);
        setTimeout(() => setMarks((m) => m.filter((k) => k.key !== key)), MARK_MS);
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        void load(true);
        return;
      }
      toast.error(getErrorMessage(e, '탭을 보내지 못했어요.'));
    }
  }, [setPuzzle, load]);

  const onTap = useCallback((x: number, y: number) => {
    const p = puzzleRef.current;
    if (!p || !p.width || !p.height || !p.me.started || p.me.finished || p.closed) return;
    // 응답을 기다리는 같은 자리 연타는 보내지 않는다
    if (isDuplicateTap(pending.current, x, y, p.width, p.height)) return;
    const key = newClientMessageId();
    pending.current = [...pending.current, { key, x, y }];
    void sendTap(p.id, key, x, y).finally(() => {
      pending.current = pending.current.filter((t) => t.key !== key);
    });
  }, [sendTap]);

  const hint = async () => {
    if (!puzzle || hinting) return;
    setHinting(true);
    try {
      const r = await spotDiffApi.hint(puzzle.id);
      setPuzzle(r.puzzle);
      if (!r.fresh) toast.info('남은 차이에는 이미 힌트를 다 받았어요.');
    } catch (e) {
      toast.error(getErrorMessage(e, '힌트를 받지 못했어요.'));
    } finally {
      setHinting(false);
    }
  };

  const onArea = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setArea((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
  };

  // 판 위의 원 — 결과가 열렸으면 정답 전체(내가 찾은 것 / 못 찾은 것), 아니면 내가 찾은 것 + 힌트
  const circles: BoardCircle[] = useMemo(() => {
    if (!puzzle) return [];
    if (puzzle.result) {
      const mine = new Set(puzzle.me.found.map((f) => f.id));
      return puzzle.result.answers.map((a) => ({ ...a, key: `a${a.id}`, tone: mine.has(a.id) ? 'found' : 'missed' }));
    }
    return [
      ...puzzle.me.found.map((f) => ({ ...f, key: `f${f.id}`, tone: 'found' as const })),
      ...puzzle.me.hints.map((h, i) => ({ ...h, key: `h${i}`, tone: 'hint' as const })),
    ];
  }, [puzzle]);

  if (!list) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        {loadError ? <EmptyState error title="퍼즐을 불러오지 못했어요" onRetry={() => load()} /> : null}
      </SafeAreaView>
    );
  }

  const elapsed = puzzle
    ? puzzle.me.finished || !running ? puzzle.me.elapsedMs : clock.base + Math.max(0, now - clock.at)
    : 0;
  const partner = puzzle?.partnerName ?? '상대';
  const showBoard = !!puzzle && !!puzzle.imageAUrl && !!puzzle.imageBUrl && !!puzzle.width && !!puzzle.height
    && (puzzle.me.started || !!puzzle.result);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* 여러 판이 열려 있을 때(어제 판 + 오늘 판) 고르는 줄 */}
      {list.puzzles.length > 1 ? (
        <ScrollView horizontal style={styles.chipsBar} contentContainerStyle={styles.chips} showsHorizontalScrollIndicator={false}>
          {list.puzzles.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => select(p)}
              accessibilityRole="button"
              accessibilityState={{ selected: p.id === selectedId }}
              style={[styles.chip, p.id === selectedId && styles.chipOn]}
            >
              <Text style={[styles.chipText, p.id === selectedId && styles.chipTextOn]}>
                {dayLabel(p)}{p.me.finished ? ' ✓' : ''}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {!puzzle ? (
        <EmptyState icon="image-outline" title="아직 퍼즐이 없어요" description="잠시 뒤 다시 열어 주세요." onRetry={() => load()} retryLabel="새로고침" />
      ) : (
        <View style={styles.body}>
          <StatusPanel
            puzzle={puzzle}
            partner={partner}
            elapsed={elapsed}
            together={list.completedTogether}
            opening={opening}
            hinting={hinting}
            onStart={start}
            onHint={hint}
            onRefresh={() => load()}
          />
          <View style={styles.area} onLayout={onArea}>
            {showBoard && area.width > 0 && area.height > 0 ? (
              <SpotDiffBoard
                imageA={puzzle.imageAUrl!}
                imageB={puzzle.imageBUrl!}
                imgW={puzzle.width!}
                imgH={puzzle.height!}
                areaW={area.width}
                areaH={area.height - 44 /* 확대 버튼 줄 */}
                orientation={orientation}
                circles={circles}
                marks={marks}
                onTap={running ? onTap : undefined}
              />
            ) : null}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

function StatusPanel({
  puzzle,
  partner,
  elapsed,
  together,
  opening,
  hinting,
  onStart,
  onHint,
  onRefresh,
}: {
  puzzle: SpotPuzzle;
  partner: string;
  elapsed: number;
  together: number;
  opening: boolean;
  hinting: boolean;
  onStart: () => void;
  onHint: () => void;
  onRefresh: () => void;
}) {
  const total = puzzle.diffCount;

  if (puzzle.status === 'PENDING' && !puzzle.closed) {
    return (
      <Card title="퍼즐을 만드는 중이에요" desc="우리 사진으로 다섯 군데를 바꾸고 있어요. 몇 분이면 돼요.">
        <Button title="새로고침" variant="secondary" size="sm" onPress={onRefresh} style={styles.cardBtn} />
      </Card>
    );
  }
  if (puzzle.status === 'NOT_ENOUGH_PHOTOS') {
    return (
      <Card
        title="사진이 조금 더 필요해요"
        desc={'둘이 함께 보는 사진(일상·럽슐랭·식단·공유한 운동)이 5장 이상 있어야 퍼즐을 만들 수 있어요.\n너무 작은 사진(짧은 쪽 1000px 미만)은 쓰지 않아요.'}
      />
    );
  }
  if (puzzle.status === 'FAILED') {
    return <Card title="오늘은 퍼즐을 만들지 못했어요" desc="사진이 너무 단순하면 다섯 군데를 바꾸기 어려워요. 내일 다른 사진으로 다시 만들어요." />;
  }
  if (puzzle.expireReason === 'PHOTO_REMOVED') {
    return <Card title="이 퍼즐은 닫혔어요" desc="퍼즐에 쓴 사진이 지워지거나 비공개로 바뀌어서, 만든 퍼즐도 함께 지웠어요." />;
  }

  if (puzzle.result) {
    const r = puzzle.result;
    return (
      <View style={styles.resultCard}>
        <Text style={styles.cardTitle}>
          {r.me.finished && r.partner.finished ? '둘 다 찾았어요 🔍' : '퍼즐이 닫혔어요'}
        </Text>
        <View style={styles.recordRow}>
          <RecordCol name="나" rec={r.me} total={total} />
          <RecordCol name={partner} rec={r.partner} total={total} />
        </View>
        <Text style={styles.legend}>초록 원: 내가 찾은 곳 · 빨간 원: 못 찾은 곳 · 함께 끝낸 퍼즐 {together}개</Text>
      </View>
    );
  }

  if (!puzzle.me.started) {
    return (
      <Card
        title={`${SPOT_DIFF_DISPLAY_NAME} — ${total}군데`}
        desc={`우리 사진 한 장에서 바뀐 곳 ${total}군데를 찾아요. 시작하면 시간이 재져요.\n${partner}님은 지금 ${puzzle.partnerFound}개 찾았어요 · ${remainingLabel(puzzle.remainingMs)}`}
      >
        <Button title="시작하기" onPress={onStart} loading={opening} style={styles.cardBtn} />
      </Card>
    );
  }

  return (
    <View>
      <View style={styles.hud}>
        <View style={styles.hudItem}>
          <Text style={styles.hudValue}>{puzzle.me.found.length}/{total}</Text>
          <Text style={styles.hudLabel}>찾음</Text>
        </View>
        <View style={styles.hudItem}>
          <Text style={styles.hudValue}>{formatMs(elapsed)}</Text>
          <Text style={styles.hudLabel}>{puzzle.me.finished ? '내 기록' : '시간'}</Text>
        </View>
        <View style={styles.hudItem}>
          <Text style={styles.hudValue}>{puzzle.partnerFound}/{total}</Text>
          <Text style={styles.hudLabel} numberOfLines={1}>{partner}</Text>
        </View>
        {puzzle.me.finished ? null : (
          <Pressable
            onPress={onHint}
            disabled={hinting}
            accessibilityRole="button"
            accessibilityLabel={`힌트 받기. 지금까지 ${puzzle.me.hintsUsed}번`}
            style={({ pressed }) => [styles.hintBtn, (pressed || hinting) && { opacity: 0.6 }]}
          >
            <MaterialCommunityIcons name="magnify" size={18} color={colors.textPrimary} />
            <Text style={styles.hintText}>힌트{puzzle.me.hintsUsed ? ` ${puzzle.me.hintsUsed}` : ''}</Text>
          </Pressable>
        )}
      </View>
      {/* 좁은 화면에서 HUD 줄에 끼우면 잘린다 — 따로 한 줄 */}
      {puzzle.me.finished ? (
        <Text style={styles.waiting}>다 찾았어요! 기록과 정답은 {partner}님이 끝내면 열려요.</Text>
      ) : null}
    </View>
  );
}

function RecordCol({ name, rec, total }: { name: string; rec: SpotRecord; total: number }) {
  return (
    <View style={styles.recordCol}>
      <Text style={styles.recordName} numberOfLines={1}>{name}</Text>
      {rec.started ? (
        <>
          <Text style={styles.recordMain}>{rec.finished ? formatMs(rec.elapsedMs) : `${rec.found}/${total}`}</Text>
          <Text style={styles.recordSub}>오답 {rec.wrongTaps} · 힌트 {rec.hintsUsed}</Text>
        </>
      ) : (
        <Text style={styles.recordSub}>안 풀었어요</Text>
      )}
    </View>
  );
}

function Card({ title, desc, children }: { title: string; desc: string; children?: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardDesc}>{desc}</Text>
      {children}
    </View>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  chipsBar: { flexGrow: 0 },
  chips: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.primaryFill, borderColor: colors.primaryFill },
  chipText: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700' },
  chipTextOn: { color: colors.onPrimary },
  body: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  area: { flex: 1, marginTop: spacing.md, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: 'center',
  },
  cardTitle: { fontSize: fontSize.title, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
  cardDesc: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: spacing.xs, lineHeight: 18, textAlign: 'center' },
  cardBtn: { marginTop: spacing.md, alignSelf: 'stretch' },
  hud: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  hudItem: { alignItems: 'center', minWidth: 52 },
  hudValue: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  hudLabel: { fontSize: fontSize.caption, color: colors.textMuted, maxWidth: 72 },
  waiting: { fontSize: fontSize.caption, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm },
  hintBtn: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hintText: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textPrimary },
  resultCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
  },
  recordRow: { flexDirection: 'row', alignSelf: 'stretch', marginTop: spacing.sm },
  recordCol: { flex: 1, alignItems: 'center' },
  recordName: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700' },
  recordMain: { fontSize: fontSize.title, fontWeight: '800', color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  recordSub: { fontSize: fontSize.caption, color: colors.textMuted },
  legend: { fontSize: fontSize.caption, color: colors.textMuted, marginTop: spacing.sm, textAlign: 'center' },
}));
