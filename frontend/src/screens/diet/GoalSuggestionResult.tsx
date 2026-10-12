/**
 * 목표 칼로리 자동 계산 결과 — "이 숫자가 어떻게 나왔나"를 한 단계씩 보여준다.
 *
 * <p>예전엔 계산하자마자 목표 칸 네 개를 채우고 토스트만 띄웠다. 그래서 체지방률이 반영됐는지, 감량분이 얼마인지,
 * 하한에 걸려 올라갔는지를 볼 곳이 없었고, 같은 공식을 쓰는 다른 앱과 숫자가 다르면 이유를 알 수 없었다
 * (2026-10-12 — 짐워크 1,829 vs 럽바디 2,020, 차이는 공식이 아니라 고른 감량 속도였다). 이 숫자가 "하루에 쓰는 양"이
 * 아니라 "감량하려면 이만큼 드세요"라는 섭취 목표라는 것도 말해 준다.
 *
 * <p>근거 값(체중·체지방률·배수·감량분)은 서버가 실제로 쓴 값을 그대로 보여준다 — 앱에서 공식을 다시 계산하지 않는다.
 * 구버전 서버엔 그 필드가 없으므로 있는 줄만 그린다.
 */
import React from 'react';
import { Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { formatKcal, formatNumber } from '../../utils/format';
import { todayKst } from '../../utils/date';
import { fontSize, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';
import type { DietGoalType, NutritionGoalSuggestion } from '../../types';

/** 하한 — 서버 NutritionService.MIN_TARGET_CALORIES 와 같다(문구에만 쓴다) */
const MIN_TARGET_CALORIES = 1200;

function Step({ label, value, detail, strong }: { label: string; value: string; detail?: string | null; strong?: boolean }) {
  return (
    <View style={styles.step} accessible accessibilityLabel={`${label} ${value}${detail ? `, ${detail}` : ''}`}>
      <View style={styles.stepHead}>
        <Text style={[styles.stepLabel, strong && styles.strong]}>{label}</Text>
        <Text style={[styles.stepValue, strong && styles.strongValue]}>{value}</Text>
      </View>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </View>
  );
}

/** "2026-10-01" → "10월 1일 측정" (오늘이면 "오늘 측정") */
function measuredLabel(date?: string | null): string | null {
  if (!date) return null;
  if (date === todayKst()) return '오늘 측정';
  const [, m, d] = date.split('-').map(Number);
  return m && d ? `${m}월 ${d}일 측정` : null;
}

/** 체중 · 체지방률 · 공식 · 측정일 — 기초대사량 줄의 근거 */
function bmrBasis(r: NutritionGoalSuggestion): string | null {
  if (r.weightKg == null) return null;
  const parts = [`체중 ${r.weightKg}kg`];
  if (r.usedBodyFat && r.bodyFatPct != null) {
    parts.push(`체지방률 ${r.bodyFatPct}% 반영`);
  } else {
    parts.push('키·나이·성별 기준');
  }
  const measured = measuredLabel(r.measuredDate);
  if (measured) parts.push(measured);
  return `${parts.join(' · ')}\n${r.usedBodyFat ? 'Katch-McArdle' : 'Mifflin-St Jeor'} 공식`;
}

export function GoalSuggestionResult({
  result,
  activityLabel,
  goalType,
  weeklyRateKg,
  onApply,
  onBack,
}: {
  result: NutritionGoalSuggestion;
  activityLabel: string;
  goalType: DietGoalType;
  weeklyRateKg?: number;
  onApply: () => void;
  onBack: () => void;
}) {
  const { bmr, tdee, targetCalories, raisedFrom, goalAdjustment } = result;
  const adjustment = goalAdjustment ?? 0;
  const goalWord = goalType === 'LOSE' ? '감량' : goalType === 'GAIN' ? '증량' : null;
  const floorWord = targetCalories != null && targetCalories === bmr ? '기초대사량' : `최소 ${formatKcal(MIN_TARGET_CALORIES)}`;

  const macroDetail = [
    result.proteinPerKg != null ? `단백질은 체중 1kg당 ${result.proteinPerKg}g` : null,
    result.fatPercent != null ? `지방은 목표의 ${result.fatPercent}%` : null,
    '탄수화물은 나머지',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>계산 결과</Text>

      <View style={styles.list}>
        {bmr != null ? <Step label="기초대사량" value={formatKcal(bmr)} detail={bmrBasis(result)} /> : null}
        {tdee != null ? (
          <Step
            label="하루 소비량"
            value={`약 ${formatKcal(tdee)}`}
            detail={
              result.activityMultiplier != null
                ? `기초대사량 × ${result.activityMultiplier} (${activityLabel})`
                : activityLabel
            }
          />
        ) : null}
        {goalWord && adjustment !== 0 ? (
          <Step
            label={`주 ${weeklyRateKg ?? ''}kg ${goalWord}`}
            value={`${adjustment < 0 ? '−' : '+'}${formatKcal(Math.abs(adjustment))}`}
            detail="체지방 1kg ≈ 7,700 kcal 로 어림한 하루 몫"
          />
        ) : null}

        <View style={styles.divider} />

        {targetCalories != null ? (
          <Step
            label={goalWord ? `하루 섭취 목표 (${goalWord})` : '하루 섭취 목표 (유지)'}
            value={formatKcal(targetCalories)}
            detail={
              raisedFrom != null
                ? `계산값 ${formatKcal(raisedFrom)}가 ${floorWord}보다 낮아 여기까지 올렸어요`
                : goalWord
                  ? `하루에 쓰는 양이 아니라, ${goalWord}하려면 이만큼 드시라는 목표예요`
                  : null
            }
            strong
          />
        ) : null}
        {result.targetCarbs != null && result.targetProtein != null && result.targetFat != null ? (
          <Step
            label="탄 · 단 · 지"
            value={`${formatNumber(result.targetCarbs)} · ${formatNumber(result.targetProtein)} · ${formatNumber(result.targetFat)}g`}
            detail={macroDetail}
          />
        ) : null}
      </View>

      <Text style={styles.note}>
        참고용 추정치예요. 실제 소비량과 수백 kcal 다를 수 있고, 의학적 조언을 대신하지 않아요.
      </Text>

      <Button title="목표 칸에 채우기" onPress={onApply} />
      <Button title="다시 고르기" variant="ghost" size="md" onPress={onBack} />
    </View>
  );
}

const styles = themedStyles((colors) => ({
  wrap: { gap: spacing.md },
  title: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  list: { gap: spacing.sm },
  step: { gap: 2 },
  // 큰 글자에서 값이 다음 줄로 내려갈 수 있게 감싼다(DietScreen nutRowHead 와 같은 방식)
  stepHead: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', columnGap: spacing.sm },
  stepLabel: { flexShrink: 1, fontSize: fontSize.body, color: colors.textSecondary, fontWeight: '600' },
  stepValue: { marginLeft: 'auto', fontSize: fontSize.body, color: colors.textPrimary, fontWeight: '700' },
  strong: { color: colors.textPrimary, fontWeight: '800' },
  strongValue: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  detail: { fontSize: fontSize.caption, color: colors.textTertiary, lineHeight: 18 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
  note: { fontSize: fontSize.caption, color: colors.textTertiary, lineHeight: 18 },
}));
