/**
 * 종목별 기록 추이 — "이 종목에서 내가 세지고 있나"에 답하는 화면.
 *
 * <p><b>왜 필요한가</b>: 기록 앱을 계속 쓰는 이유는 기록 자체가 아니라 기록이 만들어주는
 * 그래프다. 지금까지는 넣기만 하고 돌려주는 게 없었다 —
 * 통계는 "며칠 했나"뿐이라 무게가 늘고 있는지 볼 방법이 아예 없었다
 * (docs/WORKOUT_UX_ANALYSIS_2026-09-01.md 2순위).
 *
 * <p><b>기본 지표가 e1RM 인 이유</b>: 무게만 보면 그날 몇 회를 들었는지가 지워진다.
 * 60kg×12 에서 65kg×5 로 갔으면 무게는 늘었지만 실제로 세진 건 아닐 수 있다. e1RM 은
 * 무게와 횟수를 한 숫자로 합쳐서, 회수를 바꿔가며 훈련해도 추세가 이어져 보인다.
 * 대신 무게·볼륨도 함께 고를 수 있게 둔다 — 사람마다 보는 축이 다르다.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { WorkoutStackParamList } from '../../navigation/types';
import { workoutApi } from '../../api/workout';
import type { ExerciseHistory, ExerciseHistorySession } from '../../types';
import { EmptyState } from '../../components/EmptyState';
import { getErrorMessage } from '../../utils/error';
import { formatCardioSummary } from '../../utils/cardio';
import { fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<WorkoutStackParamList, 'ExerciseHistory'>;

/** 그래프에 그릴 축 — 사람마다 "세졌다"의 기준이 다르다. */
type Metric = 'e1rm' | 'weight' | 'volume' | 'distance' | 'duration';

const STRENGTH_METRICS: { key: Metric; label: string; unit: string }[] = [
  { key: 'e1rm', label: '추정 1RM', unit: 'kg' },
  { key: 'weight', label: '최고 무게', unit: 'kg' },
  { key: 'volume', label: '볼륨', unit: 'kg' },
];

/**
 * 유산소는 축이 다르다 — 무게·1RM·볼륨은 아예 없는 값이라, 근력용 축만 두면 러닝은
 * 빈 그래프만 보게 된다. "세졌나"에 해당하는 질문이 여기서는 "더 멀리·더 오래"다.
 */
const CARDIO_METRICS: { key: Metric; label: string; unit: string }[] = [
  { key: 'distance', label: '거리', unit: 'km' },
  { key: 'duration', label: '시간', unit: '분' },
];

const valueOf = (s: ExerciseHistorySession, metric: Metric): number | null => {
  switch (metric) {
    case 'e1rm':
      return s.bestE1rmKg ?? null;
    case 'weight':
      return s.maxWeightKg ?? null;
    case 'volume':
      return s.totalVolumeKg ?? null;
    case 'distance':
      return s.totalDistanceKm ?? null;
    case 'duration':
      // 그래프 축은 분 단위 — 초로 그리면 눈금 숫자가 쓸데없이 커진다
      return s.totalDurationSec != null ? Math.round((s.totalDurationSec / 60) * 10) / 10 : null;
  }
};

/** "9/1" — 축 라벨은 짧을수록 좋다. 정확한 날짜는 아래 목록에 있다. */
const shortDate = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}`;
};

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * 경량 막대 그래프 — BodyMetricScreen 의 체중 그래프와 같은 방식이다.
 * 차트 라이브러리를 들이지 않는 이유도 같다: 점 10여 개를 보여주는 데 번들을 늘릴 이유가 없다.
 */
function TrendChart({
  sessions,
  metric,
  unit,
}: {
  sessions: ExerciseHistorySession[];
  metric: Metric;
  unit: string;
}) {
  const points = sessions.filter((s) => valueOf(s, metric) != null).slice(-14);
  if (points.length < 2) {
    return (
      <Text style={styles.chartHint}>
        두 번 이상 기록하면 여기에 추이가 그려져요.
      </Text>
    );
  }
  const values = points.map((p) => valueOf(p, metric) as number);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  return (
    <View>
      <View style={styles.chartBars}>
        {points.map((p, i) => {
          const v = valueOf(p, metric) as number;
          // 12~88 로 정규화 — 최저값도 막대가 보여야 "그날은 기록이 없다"와 구분된다
          const height = 12 + ((v - min) / range) * 76;
          const isLast = i === points.length - 1;
          return (
            <View key={p.workoutDate} style={styles.chartCol}>
              <Text style={[styles.chartVal, isLast && styles.chartValLast]}>{fmt(v)}</Text>
              <View style={[styles.chartBar, { height }, isLast && styles.chartBarLast]} />
              <Text style={styles.chartDate}>{shortDate(p.workoutDate)}</Text>
            </View>
          );
        })}
      </View>
      <Text style={styles.chartCaption}>
        최근 {points.length}회 · {fmt(min)}~{fmt(max)}{unit}
      </Text>
    </View>
  );
}

export function ExerciseHistoryScreen({ route }: Props) {
  const { exerciseName } = route.params;
  const [history, setHistory] = useState<ExerciseHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>('e1rm');

  const fetchHistory = useCallback(
    (onDone: (result: ExerciseHistory | null, message: string | null) => void) =>
      workoutApi
        .exerciseHistory(exerciseName)
        .then((h) => onDone(h, null))
        .catch((e) => onDone(null, getErrorMessage(e, '기록을 불러오지 못했어요.'))),
    [exerciseName],
  );

  /* 재시도 버튼용 — 여기서는 스피너를 다시 켜는 게 맞다(사용자가 방금 눌렀다) */
  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    void fetchHistory((h, message) => {
      setHistory(h);
      setError(message);
      setLoading(false);
    });
  }, [fetchHistory]);

  /*
   * 첫 조회는 effect 안에서 setState 를 동기로 부르지 않는다 — loading 은 이미 true 로
   * 시작하므로 다시 켤 필요가 없고, 그렇게 하면 불필요한 연쇄 렌더도 생기지 않는다.
   */
  useEffect(() => {
    let cancelled = false;
    void fetchHistory((h, message) => {
      if (cancelled) return;
      setHistory(h);
      setError(message);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchHistory]);

  // 최신이 위 — 목록은 "최근에 뭘 했더라"를 보는 곳이라 그래프와 순서가 반대다
  const recent = useMemo(
    () => (history ? [...history.sessions].reverse() : []),
    [history],
  );

  if (!loading && (error || !history || history.sessions.length === 0)) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <EmptyState
          icon={error ? 'cloud-off-outline' : 'chart-box-outline'}
          title={error ? '기록을 불러오지 못했어요' : '아직 기록이 없어요'}
          description={error ?? `${exerciseName}을(를) 기록하면 여기에 추이가 쌓여요.`}
          error={!!error}
          onRetry={error ? load : undefined}
        />
      </SafeAreaView>
    );
  }

  const best = history?.best;
  /*
   * 이 종목을 무슨 축으로 볼지는 카테고리가 아니라 <b>쌓인 기록</b>으로 정한다 —
   * 이 화면은 종목 이름만 받고(카테고리를 모른다), 시간·거리가 남아 있다는 사실 자체가
   * 유산소로 기록해 왔다는 뜻이다.
   */
  const cardio = (history?.sessions ?? []).some(
    (s) => s.totalDistanceKm != null || s.totalDurationSec != null,
  );
  const metrics = cardio ? CARDIO_METRICS : STRENGTH_METRICS;
  // 축 목록이 바뀌면 골라둔 축이 목록 밖일 수 있다 — 그때는 첫 축으로 되돌린다
  const activeMetric = metrics.some((m) => m.key === metric) ? metric : metrics[0].key;
  const activeUnit = metrics.find((m) => m.key === activeMetric)?.unit ?? '';

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* 개인 최고 기록 — 화면에서 가장 먼저 보이는 게 "내 최고치"여야 한다 */}
        <View style={styles.bestRow}>
          {cardio ? (
            <>
              <BestCard label="최장 거리" value={best?.maxDistanceKm} unit="km" />
              <BestCard
                label="최장 시간"
                value={best?.maxDurationSec != null ? Math.round(best.maxDurationSec / 60) : null}
                unit="분"
              />
            </>
          ) : (
            <>
              <BestCard label="최고 무게" value={best?.maxWeightKg} unit="kg" />
              <BestCard label="추정 1RM" value={best?.maxE1rmKg} unit="kg" />
              <BestCard label="최고 볼륨" value={best?.maxVolumeKg} unit="kg" />
            </>
          )}
        </View>

        <View style={styles.metricTabs}>
          {metrics.map((m) => (
            <TouchableOpacity
              key={m.key}
              style={[styles.metricTab, activeMetric === m.key && styles.metricTabActive]}
              onPress={() => setMetric(m.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: activeMetric === m.key }}
            >
              <Text style={[styles.metricTabText, activeMetric === m.key && styles.metricTabTextActive]}>
                {m.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TrendChart sessions={history?.sessions ?? []} metric={activeMetric} unit={activeUnit} />

        <Text style={styles.sectionTitle}>기록</Text>
        {recent.map((s) => (
          <View key={s.workoutDate} style={styles.row}>
            <Text style={styles.rowDate}>{s.workoutDate}</Text>
            <Text style={styles.rowDetail}>
              {cardio
                ? formatCardioSummary(s.totalDurationSec, s.totalDistanceKm) || '—'
                : `${s.maxWeightKg != null ? `${fmt(s.maxWeightKg)}kg` : '—'} · ${s.totalSets}세트${
                    s.totalVolumeKg != null ? ` · 볼륨 ${fmt(s.totalVolumeKg)}kg` : ''
                  }`}
            </Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function BestCard({ label, value, unit }: { label: string; value?: number | null; unit: string }) {
  return (
    <View style={styles.bestCard}>
      <Text style={styles.bestValue}>
        {value != null ? fmt(value) : '—'}
        <Text style={styles.bestUnit}>{value != null ? unit : ''}</Text>
      </Text>
      <Text style={styles.bestLabel}>{label}</Text>
    </View>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, gap: spacing.md },

  bestRow: { flexDirection: 'row', gap: spacing.sm },
  bestCard: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceCard,
    alignItems: 'center',
  },
  bestValue: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  bestUnit: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textSecondary },
  bestLabel: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 2 },

  metricTabs: { flexDirection: 'row', gap: spacing.sm },
  metricTab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  metricTabActive: { borderColor: colors.primary, backgroundColor: colors.primaryBg },
  metricTabText: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textSecondary },
  metricTabTextActive: { color: colors.primary },

  chartBars: { flexDirection: 'row', alignItems: 'flex-end', height: 130, gap: 4 },
  chartCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 2 },
  chartVal: { fontSize: 9, color: colors.textTertiary },
  chartValLast: { color: colors.primary, fontWeight: '800' },
  chartBar: { width: '70%', borderRadius: 3, backgroundColor: colors.primaryBg },
  chartBarLast: { backgroundColor: colors.primary },
  chartDate: { fontSize: 9, color: colors.textTertiary },
  chartCaption: { fontSize: fontSize.caption, color: colors.textSecondary, textAlign: 'center' },
  chartHint: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },

  sectionTitle: {
    fontSize: fontSize.subtitle,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowDate: { fontSize: fontSize.body, color: colors.textPrimary, fontWeight: '700' },
  rowDetail: { fontSize: fontSize.caption, color: colors.textSecondary },
}));
