/**
 * 물·단식 리포트 — 최근 4주(28일, KST) 본인 기록 비교. 무료(2026-10-16 사용자 결정).
 *
 * 원칙(docs/LOVEBODY_FASTING_WATER_ANALYSIS_2026-10-16.md §4): 몸속 일은 추정하지 않고 <b>내 기록</b>만 숫자로 보여 준다.
 * 단식한 날·안 한 날의 칼로리 차이는 "관찰된 차이"이지 원인이 아니라고 화면에서도 말한다. 체중은 나만 본다.
 * 그래프는 새 의존성 없이 View 막대로 그린다(아이콘 폰트·네이티브 의존성은 OTA 를 막는다).
 */
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { habitsApi } from '../../api/habits';
import type { HabitDay, HabitInsights } from '../../types';
import type { HealthStackParamList } from '../../navigation/types';
import { fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';
import { formatFastingDuration } from '../../utils/mealFasting';

const fmtMl = (ml: number) => (ml >= 1000 ? `${(ml / 1000).toFixed(1).replace(/\.0$/, '')}L` : `${ml}ml`);
const fmtDay = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}`;
};

/** 지난주 값 — 카드가 좁아 "지난주보다 n일 적어요"는 세 줄로 접혔다. 숫자만 나란히 둔다 */
function lastWeekText(before: number, unit: string): string {
  return `지난주 ${before}${unit}`;
}

/** 평균 공복 — 큰 글씨는 시간, 분은 작은 글씨로("15시간 …"으로 잘리던 것) */
function splitDuration(min: number): { value: string; unit: string } {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return { value: `${h}`, unit: m > 0 ? `시간 ${m}분` : '시간' };
}

export function HabitReportScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HealthStackParamList>>();
  const [data, setData] = useState<HabitInsights | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setError(false);
    habitsApi
      .insights()
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoaded(true));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (loaded && error && !data) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <EmptyState
          title="리포트를 불러오지 못했어요"
          description="네트워크 상태를 확인하고 다시 시도해주세요."
          error
          onRetry={load}
        />
      </SafeAreaView>
    );
  }
  if (!data) {
    return <SafeAreaView style={styles.safe} edges={['bottom']} />;
  }

  const { thisWeek: w, lastWeek: lw, comparison: c, couple } = data;
  const days = data.days;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* ── 최근 7일 ─────────────────────────────────────── */}
        <Text style={styles.groupTitle}>최근 7일</Text>
        <View style={styles.summaryRow}>
          <Summary
            label="단식 목표 달성"
            value={`${w.achievedCount}`}
            unit={`/${w.fastCount}번`}
            sub={lastWeekText(lw.achievedCount, '번')}
          />
          <Summary
            label="평균 공복"
            {...(w.avgFastMin != null ? splitDuration(w.avgFastMin) : { value: '-' })}
            sub={data.achievedStreak > 0 ? `${data.achievedStreak}일 연속 달성` : null}
          />
          <Summary
            label="물 목표 채운 날"
            value={`${w.waterGoalDays}`}
            unit="/7일"
            sub={lastWeekText(lw.waterGoalDays, '일')}
          />
        </View>

        {/* ── 물 4주 ─────────────────────────────────────── */}
        <Card elevation="sm" style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>물 · 4주</Text>
            <Text style={styles.sectionMeta}>
              목표 {fmtMl(data.waterTargetMl)} · 최근 7일 평균 {fmtMl(w.avgWaterMl)}
            </Text>
          </View>
          <Bars
            days={days}
            value={(d) => d.waterMl}
            max={Math.max(data.waterTargetMl, ...days.map((d) => d.waterMl))}
            hit={(d) => d.waterMl >= data.waterTargetMl}
            guide={data.waterTargetMl}
            a11y={(d) => `${fmtDay(d.date)} 물 ${d.waterMl}ml`}
          />
          <AxisLabels days={days} />
        </Card>

        {/* ── 단식 4주 ─────────────────────────────────────── */}
        <Card elevation="sm" style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>단식 · 4주</Text>
            <Text style={styles.sectionMeta}>끝난 날 기준 · 진한 칸이 목표 달성</Text>
          </View>
          <Bars
            days={days}
            value={(d) => d.fastMin ?? 0}
            max={Math.max(16 * 60, ...days.map((d) => d.fastMin ?? 0))}
            hit={(d) => d.fastAchieved}
            a11y={(d) =>
              `${fmtDay(d.date)} ${d.fastMin != null ? `공복 ${formatFastingDuration(d.fastMin)}${d.fastAchieved ? ' 목표 달성' : ''}` : '단식 없음'}`
            }
          />
          {couple.connected ? (
            // 상대가 목표를 채운 날 — 막대 아래 하늘색 점. 상대 체중·칼로리는 오지 않는다
            <View style={styles.dotRow}>
              {days.map((d) => (
                <View key={d.date} style={styles.dotCol}>
                  <View style={[styles.dot, d.partnerAchieved ? styles.dotPartner : null]} />
                </View>
              ))}
            </View>
          ) : null}
          <AxisLabels days={days} />
          {couple.connected ? (
            <Text style={styles.note}>아래 하늘색 점은 {couple.partnerName ?? '상대'}님이 목표를 채운 날이에요.</Text>
          ) : null}
        </Card>

        {/* ── 커플: 둘 다 채운 날 ─────────────────────────────────────── */}
        {couple.connected ? (
          <Card elevation="sm" style={styles.section}>
            <Text style={styles.sectionTitle}>둘 다 목표 채운 날</Text>
            <Text style={styles.bigLine}>
              <Text style={styles.bigTogether}>{couple.bothDays}일</Text>
              {couple.bothStreak > 1 ? <Text style={styles.bigSub}>  · {couple.bothStreak}일 연속 중</Text> : null}
            </Text>
            <Text style={styles.note}>
              {couple.bothDays === 0
                ? `같은 날 둘 다 단식 목표를 채우면 여기에 쌓여요.`
                : `최근 4주 동안 ${couple.partnerName ?? '상대'}님과 같은 날 함께 채웠어요.`}
            </Text>
          </Card>
        ) : null}

        {/* ── 4주 비교: 단식한 날 vs 안 한 날 ─────────────────────────────── */}
        <Card elevation="sm" style={styles.section}>
          <Text style={styles.sectionTitle}>단식한 날 vs 안 한 날</Text>
          {c.enough && c.fastDayAvgCalories != null && c.otherDayAvgCalories != null ? (
            <>
              <View style={styles.compareRow}>
                <CompareCol label={`목표 채운 날 (${c.fastDays}일)`} kcal={c.fastDayAvgCalories} strong />
                <CompareCol label={`그 밖의 날 (${c.otherDays}일)`} kcal={c.otherDayAvgCalories} />
              </View>
              <Text style={styles.compareSummary}>
                {c.fastDayAvgCalories === c.otherDayAvgCalories
                  ? '하루 섭취 칼로리가 거의 같았어요.'
                  : `단식 목표를 채운 날 하루 평균 ${Math.abs(c.fastDayAvgCalories - c.otherDayAvgCalories).toLocaleString()}kcal ${
                      c.fastDayAvgCalories < c.otherDayAvgCalories ? '덜' : '더'
                    } 먹었어요.`}
              </Text>
              <Text style={styles.note}>내 기록에서 관찰된 차이예요. 원인이라고 단정할 수는 없어요.</Text>
            </>
          ) : (
            <Text style={styles.note}>
              칼로리를 적은 날 중 단식 목표를 채운 날과 아닌 날이 각각 3일 이상 쌓이면 비교해 드려요. (지금 {c.fastDays}일 ·{' '}
              {c.otherDays}일)
            </Text>
          )}
        </Card>

        {/* ── 체중 겹쳐 보기 ─────────────────────────────────────── */}
        <Card elevation="sm" style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>체중과 단식</Text>
            <Text style={styles.sectionMeta}>나만 볼 수 있어요</Text>
          </View>
          {c.weightCount >= 2 ? (
            <>
              <WeightChart days={days} />
              <AxisLabels days={days} />
              <Text style={styles.compareSummary}>
                4주 동안{' '}
                {c.weightChangeKg == null || Number(c.weightChangeKg) === 0
                  ? '변화가 없었어요'
                  : `${Number(c.weightChangeKg) > 0 ? '+' : ''}${Number(c.weightChangeKg).toFixed(1)}kg`}
                {' '}· 체중 기록 {c.weightCount}번
              </Text>
              <Text style={styles.note}>점은 체중, 아래 진한 칸은 단식 목표를 채운 날이에요.</Text>
            </>
          ) : (
            <Pressable
              onPress={() => navigation.navigate('BodyMetric')}
              accessibilityRole="button"
              accessibilityLabel="체중 기록하러 가기"
              style={({ pressed }) => [pressed && styles.pressed]}
            >
              <Text style={styles.note}>
                체중을 2번 이상 기록하면 단식한 날과 겹쳐 보여 드려요. <Text style={styles.link}>체중 기록하기 ›</Text>
              </Text>
            </Pressable>
          )}
        </Card>

        {/* 근거 — 과장하지 않는다(§2-2) */}
        <Text style={styles.footnote}>
          간헐적 단식은 먹는 시간을 정해 덜 먹기 쉽게 하는 방법이에요. 연구에서는 같은 칼로리를 먹으면 일반적인 식단 조절과 감량 효과가
          비슷했어요. 물은 식사 전에 한 컵 마시면 덜 먹는 데 도움이 될 수 있어요.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Summary({ label, value, unit, sub }: { label: string; value: string; unit?: string; sub?: string | null }) {
  return (
    <Card elevation="sm" style={styles.summaryCard}>
      <Text style={styles.summaryValue} numberOfLines={1}>
        {value}
        {unit ? <Text style={styles.summaryUnit}>{unit}</Text> : null}
      </Text>
      <Text style={styles.summaryLabel}>{label}</Text>
      {sub ? <Text style={styles.summarySub}>{sub}</Text> : null}
    </Card>
  );
}

function CompareCol({ label, kcal, strong }: { label: string; kcal: number; strong?: boolean }) {
  return (
    <View style={styles.compareCol}>
      <Text style={[styles.compareValue, strong && styles.compareStrong]}>{kcal.toLocaleString()}kcal</Text>
      <Text style={styles.compareLabel}>{label}</Text>
    </View>
  );
}

/** 28칸 막대 — 진한 칸(hit)과 옅은 칸. guide 가 있으면 그 높이에 목표선 */
function Bars({
  days,
  value,
  max,
  hit,
  guide,
  a11y,
}: {
  days: HabitDay[];
  value: (d: HabitDay) => number;
  max: number;
  hit: (d: HabitDay) => boolean;
  guide?: number;
  a11y: (d: HabitDay) => string;
}) {
  const top = Math.max(1, max);
  return (
    <View style={styles.barsWrap}>
      {guide ? <View style={[styles.guide, { bottom: `${(guide / top) * 100}%` }]} /> : null}
      <View style={styles.barsRow}>
        {days.map((d) => {
          const v = value(d);
          return (
            <View key={d.date} style={styles.barCol} accessible accessibilityLabel={a11y(d)}>
              {v > 0 ? (
                <View
                  style={[
                    styles.bar,
                    { height: `${Math.max(4, (v / top) * 100)}%` },
                    hit(d) ? styles.barHit : styles.barMiss,
                  ]}
                />
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** 체중 점 그래프 — 위아래 범위는 기간 안 최소~최대(+여유). 아래 띠는 단식 목표 달성일 */
function WeightChart({ days }: { days: HabitDay[] }) {
  const ws = days.map((d) => (d.weightKg != null ? Number(d.weightKg) : null));
  const vals = ws.filter((x): x is number => x != null);
  const lo = Math.min(...vals) - 0.5;
  const hi = Math.max(...vals) + 0.5;
  return (
    <View>
      <View style={styles.weightBox}>
        {ws.map((w, i) =>
          w == null ? null : (
            <View
              key={days[i].date}
              accessible
              accessibilityLabel={`${fmtDay(days[i].date)} 체중 ${w}kg`}
              style={[
                styles.weightDot,
                { left: `${((i + 0.5) / days.length) * 100}%`, bottom: `${((w - lo) / (hi - lo)) * 100}%` },
              ]}
            />
          ),
        )}
        <Text style={[styles.weightScale, { top: 0 }]}>{hi.toFixed(1)}</Text>
        <Text style={[styles.weightScale, { bottom: 0 }]}>{lo.toFixed(1)}</Text>
      </View>
      <View style={styles.fastBand}>
        {days.map((d) => (
          <View key={d.date} style={[styles.fastBandCell, d.fastAchieved && styles.barHit]} />
        ))}
      </View>
    </View>
  );
}

function AxisLabels({ days }: { days: HabitDay[] }) {
  return (
    <View style={styles.axis}>
      <Text style={styles.axisText}>{fmtDay(days[0].date)}</Text>
      <Text style={styles.axisText}>{fmtDay(days[Math.floor(days.length / 2)].date)}</Text>
      <Text style={styles.axisText}>오늘</Text>
    </View>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  groupTitle: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  summaryRow: { flexDirection: 'row', gap: spacing.sm },
  summaryCard: { flex: 1, alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.xs },
  summaryValue: { fontSize: fontSize.title, fontWeight: '800', color: colors.textPrimary },
  summaryUnit: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textSecondary },
  summaryLabel: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: spacing.xs, fontWeight: '600', textAlign: 'center' },
  summarySub: { fontSize: 11, color: colors.textSecondary, marginTop: 2, fontWeight: '600', textAlign: 'center' },
  section: { gap: spacing.sm },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.sm },
  sectionTitle: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  sectionMeta: { fontSize: fontSize.caption, color: colors.textSecondary, flexShrink: 1, textAlign: 'right' },
  barsWrap: { height: 96, justifyContent: 'flex-end' },
  barsRow: { flexDirection: 'row', alignItems: 'flex-end', height: '100%', gap: 2 },
  barCol: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 3 },
  // 내 기록 = 코랄(보는 사람 기준 색 규칙)
  barHit: { backgroundColor: colors.meFill },
  barMiss: { backgroundColor: colors.mePastelBg },
  guide: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: colors.textTertiary, opacity: 0.6 },
  dotRow: { flexDirection: 'row', gap: 2 },
  dotCol: { flex: 1, alignItems: 'center' },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'transparent' },
  dotPartner: { backgroundColor: colors.partnerFill },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
  axisText: { fontSize: 11, color: colors.textTertiary },
  note: { fontSize: fontSize.caption, color: colors.textSecondary, lineHeight: 18 },
  link: { color: colors.textPrimary, fontWeight: '700' },
  pressed: { opacity: 0.7 },
  bigLine: { marginTop: spacing.xs },
  bigTogether: { fontSize: fontSize.heading, fontWeight: '800', color: colors.togetherText },
  bigSub: { fontSize: fontSize.body, fontWeight: '700', color: colors.textSecondary },
  compareRow: { flexDirection: 'row', gap: spacing.sm },
  compareCol: { flex: 1, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, alignItems: 'center' },
  compareValue: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textSecondary },
  compareStrong: { color: colors.meText },
  compareLabel: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 2 },
  compareSummary: { fontSize: fontSize.body, color: colors.textPrimary, fontWeight: '700' },
  weightBox: { height: 110, position: 'relative', marginHorizontal: 2 },
  weightDot: { position: 'absolute', width: 8, height: 8, marginLeft: -4, marginBottom: -4, borderRadius: 4, backgroundColor: colors.meText },
  weightScale: { position: 'absolute', right: 0, fontSize: 10, color: colors.textTertiary },
  fastBand: { flexDirection: 'row', gap: 2, marginTop: spacing.xs },
  fastBandCell: { flex: 1, height: 6, borderRadius: 2, backgroundColor: colors.surfaceAlt },
  footnote: { fontSize: fontSize.caption, color: colors.textTertiary, lineHeight: 18, marginTop: spacing.sm },
}));
