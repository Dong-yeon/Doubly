/**
 * AI 운동 추천 — 최근 기록 기반 오늘 추천 / 5일 루틴 / 맞춤 프로그램(결과는 참고용 제안).
 *
 * <p>"저장" 버튼은 API 를 바로 부르지 않는다 — 짐워크·플랜핏 둘 다 AI/추천 결과가 바로
 * 저장되지 않고 사용자가 종목·세트·무게를 조정할 수 있는 루틴 편집 화면을 거친다.
 * 예전엔 여기서 바로 저장해 카탈로그 연결도 세트별 목표도 요일도 없는 밋밋한 루틴이
 * 만들어졌다. 지금은 루틴 만들기 폼에 초안으로 넘겨 검토·수정 후 명시적으로 저장한다.
 *
 * <p><b>맞춤 프로그램 만들기</b>(짐워크 벤치마킹)는 이 원칙에서 한 가지만 다르다 — 요일별로
 * 여러 하루를 한 번에 만드는 거라 하루씩 편집 화면을 오가면 번거롭다. 그래서 프로그램
 * 모드는 결과를 검토만 하고(수정은 저장 후 각 루틴 편집 화면에서), "프로그램으로 저장"
 * 한 번으로 요일 수만큼의 루틴을 일괄 생성한다.
 */
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { WorkoutStackParamList } from '../../navigation/types';
import { MaterialCommunityIcons } from '../../components/Icon';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { Chip } from '../../components/Chip';
import { workoutApi } from '../../api/workout';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { runBusy } from '../../store/busyStore';
import { haptics } from '../../utils/haptics';
import { WEEK_DAYS, weekDayOf } from '../../utils/date';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { WeekDay, WorkoutRecommendation } from '../../types';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<WorkoutStackParamList, 'WorkoutRecommend'>;

const PLANS = [
  { days: 1, title: '오늘 뭐하지?' },
  { days: 5, title: '5일 루틴 만들기' },
] as const;

const WEEKDAY_LABEL: Record<WeekDay, string> = Object.fromEntries(
  WEEK_DAYS.map((d) => [d.value, d.label]),
) as Record<WeekDay, string>;

// 집중 부위 — 종목 카탈로그의 muscleGroup 값과 동일(백엔드 허용 목록과 짝: 밖의 값은 무시된다)
const FOCUS_GROUPS = ['가슴', '등', '어깨', '하체', '팔', '코어'] as const;

// 운동 목적 — 백엔드 GOAL_DIRECTIVES 의 키와 정확히 일치해야 프롬프트에 반영된다
const GOALS = ['근력 향상', '근육 증가', '체지방 감량', '체력·건강 유지', '정체기 돌파'] as const;

// 프로그램 주차 — Day 구성 자체는 주차별로 안 바뀌고 진행률 표시에만 쓰인다(최대 52주, 백엔드와 동일)
const WEEKS_OPTIONS = [4, 8, 12, 16] as const;

// 아픈 부위 — 관절 기준(집중 부위의 근육군 축과 다르다). 백엔드 허용 목록과 짝: 밖의 값은 무시된다
const PAIN_AREAS = ['무릎', '허리', '어깨', '팔꿈치', '손목', '발목', '목'] as const;

// 세션당 목표 운동 시간(분) — 비우면 시간 제약 없이 구성(백엔드 최소 15 ~ 최대 180과 호환)
const SESSION_MINUTES_OPTIONS = [30, 45, 60, 90] as const;

// dayOffset → "오늘" / "내일" / "7/5 (금)"
function dayLabel(offset: number): string {
  if (offset === 0) return '오늘';
  if (offset === 1) return '내일';
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()} (${weekday})`;
}

export function WorkoutRecommendScreen({ navigation }: Props) {
  const [loadingDays, setLoadingDays] = useState<number | null>(null);
  const [result, setResult] = useState<WorkoutRecommendation | null>(null);
  // result 가 프로그램 모드(요일별) 응답인지 순차 모드(dayOffset) 응답인지 — 렌더링 분기용.
  // WorkoutRecommendation 자체엔 이 구분이 없어서(day 마다 dayOfWeek 유무로 알 수도 있지만
  // 요청 시점에 이미 아는 값이라 별도로 들고 있는 게 더 명확하다) 따로 상태로 둔다.
  const [resultIsProgram, setResultIsProgram] = useState(false);

  // 맞춤 프로그램 만들기(짐워크 스타일) — 요일·집중 부위·운동 목적·아픈 부위·운동 시간을 고르는 패널
  const [programOpen, setProgramOpen] = useState(false);
  // 프로그램 이름 — 더는 여기서 직접 입력받지 않는다. AI가 추천 결과와 함께 지어주면
  // 결과 영역에서 prefill 되고, 저장 전 자유롭게 고칠 수 있다(onRecommendProgram 참고).
  const [programTitle, setProgramTitle] = useState('');
  const [programWeekdays, setProgramWeekdays] = useState<WeekDay[]>([]);
  // 몇 주짜리 프로그램인지 — 기본 8주. Day 구성은 주차와 무관하게 그대로, 진행률 표시에만 쓰인다
  const [programWeeks, setProgramWeeks] = useState<number>(8);
  // 집중 부위(선택, 복수) — 비우면 균형 잡힌 분배
  const [focusGroups, setFocusGroups] = useState<string[]>([]);
  // 운동 목적(선택, 단일) — 다시 누르면 해제
  const [goal, setGoal] = useState<string | null>(null);
  // 아픈 부위(선택, 복수) — 관절 기준. 고르면 그 부위에 부담 주는 동작은 제외하고 구성(집중 부위보다 항상 우선)
  const [painAreas, setPainAreas] = useState<string[]>([]);
  // 세션당 목표 운동 시간(분, 선택) — 고르면 그 시간에 맞춰 종목·세트 수를 조절
  const [sessionMinutes, setSessionMinutes] = useState<number | null>(null);
  const [recommendingProgram, setRecommendingProgram] = useState(false);
  const [savingProgram, setSavingProgram] = useState(false);

  const toggleProgramWeekday = (d: WeekDay) => {
    haptics.light();
    setProgramWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  const toggleFocusGroup = (g: string) => {
    haptics.light();
    setFocusGroups((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  };

  const toggleGoal = (g: string) => {
    haptics.light();
    setGoal((prev) => (prev === g ? null : g));
  };

  const togglePainArea = (a: string) => {
    haptics.light();
    setPainAreas((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));
  };

  const toggleSessionMinutes = (m: number) => {
    haptics.light();
    setSessionMinutes((prev) => (prev === m ? null : m));
  };

  // AI 추천 하루 계획을 루틴 만들기 폼으로 — 폼에서 검토·수정한 뒤 사용자가 직접 저장한다
  // (순차 모드 전용 — 프로그램 모드는 onSaveProgram 으로 한 번에 저장한다)
  const editAsRoutine = (day: WorkoutRecommendation['days'][number]) => {
    haptics.light();
    const d = new Date();
    d.setDate(d.getDate() + day.dayOffset);
    navigation.navigate('WorkoutRoutineForm', {
      draft: {
        title: day.focus || 'AI 추천 루틴',
        exercises: day.exercises.map((ex) => ({
          name: ex.name,
          category: ex.category ?? undefined,
          targetSets: ex.sets ?? undefined,
          reps: ex.reps ?? undefined,
        })),
        // 이 날짜의 실제 요일을 미리 체크해둔다 — 매주 이 요일에 반복하고 싶으면
        // 폼에서 손댈 것 없이 "루틴 저장"만 누르면 된다
        scheduledDays: [weekDayOf(d)],
      },
    });
  };

  const onRecommend = async (days: number) => {
    setLoadingDays(days);
    try {
      const res = await runBusy('AI가 운동을 추천하고 있어요', () => workoutApi.recommend(days));
      setResult(res);
      setResultIsProgram(false);
      haptics.success();
    } catch (e) {
      toast.error(getErrorMessage(e, 'AI 추천에 실패했어요.'));
    } finally {
      setLoadingDays(null);
    }
  };

  const onRecommendProgram = async () => {
    if (programWeekdays.length === 0) {
      toast.error('운동할 요일을 하나 이상 골라주세요.');
      return;
    }
    setRecommendingProgram(true);
    try {
      const res = await runBusy('AI가 프로그램을 짜고 있어요', () =>
        workoutApi.recommendProgram(
          programWeekdays,
          focusGroups,
          goal ?? undefined,
          painAreas,
          sessionMinutes ?? undefined,
        ),
      );
      setResult(res);
      setResultIsProgram(true);
      // AI가 요일·집중 부위·운동 목적을 반영해 지어준 이름으로 채운다 — 저장 전 자유롭게 고칠 수 있다
      setProgramTitle(res.programTitle?.trim() || '맞춤 프로그램');
      haptics.success();
    } catch (e) {
      toast.error(getErrorMessage(e, 'AI 추천에 실패했어요.'));
    } finally {
      setRecommendingProgram(false);
    }
  };

  // 프로그램 결과를 한 번에 여러 루틴으로 저장 — 하루씩 편집하러 갈 필요 없이 요일 수만큼 일괄 생성
  const onSaveProgram = async () => {
    if (!result) return;
    const title = programTitle.trim() || '맞춤 프로그램';
    setSavingProgram(true);
    try {
      const saved = await workoutApi.saveProgram({
        programTitle: title,
        totalWeeks: programWeeks,
        days: result.days
          .filter((d) => d.dayOfWeek)
          .map((d) => ({
            dayOfWeek: d.dayOfWeek as WeekDay,
            exercises: d.exercises.map((ex) => ({
              exerciseName: ex.name,
              category: ex.category ?? undefined,
              targetSets: ex.sets ?? undefined,
              reps: ex.reps ?? undefined,
            })),
          })),
      });
      haptics.success();
      toast.success(`${saved.totalWeeks}주 프로그램으로 Day ${saved.days.length}개를 저장했어요!`);
      navigation.navigate('WorkoutProgramDetail', { programId: saved.id });
    } catch (e) {
      toast.error(getErrorMessage(e, '프로그램 저장에 실패했어요.'));
    } finally {
      setSavingProgram(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.hint}>최근 운동 기록을 바탕으로 AI 트레이너가 계획을 제안해요.</Text>

        <View style={styles.planRow}>
          {PLANS.map((p) => (
            <Button
              key={p.days}
              title={p.title}
              variant={p.days === 1 ? 'primary' : 'soft'}
              size="md"
              style={styles.planButton}
              onPress={() => {
                setProgramOpen(false);
                onRecommend(p.days);
              }}
              loading={loadingDays === p.days}
              disabled={loadingDays !== null || recommendingProgram}
            />
          ))}
        </View>

        {/* 맞춤 프로그램 만들기(짐워크 벤치마킹) — 매주 반복할 요일을 고르면 요일마다 다른
            하루를 짜서, 승인 한 번으로 그 요일 수만큼 루틴을 한꺼번에 만들어준다. */}
        <Button
          title={programOpen ? '맞춤 프로그램 만들기 ▲' : '✨ 맞춤 프로그램 만들기'}
          variant="soft"
          size="md"
          onPress={() => {
            haptics.light();
            setProgramOpen((v) => !v);
          }}
          disabled={loadingDays !== null || recommendingProgram}
          style={styles.programToggle}
        />
        {programOpen ? (
          <View style={styles.programPanel}>
            <Text style={styles.label}>운동할 요일</Text>
            <View style={styles.dayRow}>
              {WEEK_DAYS.map((d) => (
                <Chip
                  key={d.value}
                  label={d.label}
                  selected={programWeekdays.includes(d.value)}
                  onPress={() => toggleProgramWeekday(d.value)}
                  fill
                />
              ))}
            </View>
            <Text style={styles.dayHint}>
              {programWeekdays.length > 0
                ? `${WEEK_DAYS.filter((d) => programWeekdays.includes(d.value)).map((d) => d.label).join('·')}요일 — 요일마다 다른 루틴을 만들어드려요.`
                : '매주 운동할 요일을 골라주세요.'}
            </Text>

            {/* 몇 주짜리 프로그램인지 — Day 구성은 그대로, 진행률 표시(예: "3/8주")에만 쓰인다 */}
            <Text style={styles.label}>몇 주 프로그램인가요?</Text>
            <View style={styles.focusRow}>
              {WEEKS_OPTIONS.map((w) => (
                <Chip
                  key={w}
                  label={`${w}주`}
                  selected={programWeeks === w}
                  onPress={() => {
                    haptics.light();
                    setProgramWeeks(w);
                  }}
                />
              ))}
            </View>

            {/* 집중 부위(선택, 복수) — 고른 부위에 주간 볼륨을 더 배정한다. 안 고르면 균형 분배 */}
            <Text style={styles.label}>더 키우고 싶은 부위 (선택)</Text>
            <View style={styles.focusRow}>
              {FOCUS_GROUPS.map((g) => (
                <Chip
                  key={g}
                  label={g}
                  selected={focusGroups.includes(g)}
                  onPress={() => toggleFocusGroup(g)}
                />
              ))}
            </View>

            {/* 운동 목적(선택, 단일) — 프로그램 구성 스타일(고중량/근비대/서킷/균형)이 바뀐다 */}
            <Text style={styles.label}>운동 목적 (선택)</Text>
            <View style={styles.focusRow}>
              {GOALS.map((g) => (
                <Chip key={g} label={g} selected={goal === g} onPress={() => toggleGoal(g)} />
              ))}
            </View>

            {/* 아픈 부위(선택, 복수) — 관절 기준. 고르면 그 부위에 부담 주는 동작은 제외한다(집중 부위보다 항상 우선) */}
            <Text style={styles.label}>현재 아픈 부위 (선택)</Text>
            <View style={styles.focusRow}>
              {PAIN_AREAS.map((a) => (
                <Chip key={a} label={a} selected={painAreas.includes(a)} onPress={() => togglePainArea(a)} />
              ))}
            </View>
            {painAreas.length > 0 ? (
              <Text style={styles.dayHint}>
                {painAreas.join('·')} 부위는 부담 없는 동작으로 대체하거나 제외할게요.
              </Text>
            ) : null}

            {/* 운동 시간(선택, 단일) — 고르면 세트 간 휴식 포함 이 시간에 맞춰 종목·세트 수를 조절한다 */}
            <Text style={styles.label}>운동 시간 (선택)</Text>
            <View style={styles.focusRow}>
              {SESSION_MINUTES_OPTIONS.map((m) => (
                <Chip
                  key={m}
                  label={`${m}분`}
                  selected={sessionMinutes === m}
                  onPress={() => toggleSessionMinutes(m)}
                />
              ))}
            </View>

            <Button
              title="프로그램 추천받기"
              onPress={onRecommendProgram}
              loading={recommendingProgram}
              disabled={loadingDays !== null || programWeekdays.length === 0}
              style={styles.programRecommendBtn}
            />
          </View>
        ) : null}

        {result ? (
          <View>
            {/* AI가 요일·집중 부위·운동 목적을 반영해 지어준 이름 — 저장 전 자유롭게 고칠 수 있다 */}
            {resultIsProgram ? (
              <TextField
                label="프로그램 이름"
                placeholder="예: 전신 밸런스 프로그램"
                value={programTitle}
                onChangeText={setProgramTitle}
                maxLength={80}
              />
            ) : null}

            {result.overallComment ? (
              <View style={styles.overallCard}>
                <Text style={styles.overallText}>{result.overallComment}</Text>
              </View>
            ) : null}

            {(resultIsProgram
              ? [...result.days].sort(
                  (a, b) =>
                    WEEK_DAYS.findIndex((d) => d.value === a.dayOfWeek) -
                    WEEK_DAYS.findIndex((d) => d.value === b.dayOfWeek),
                )
              : result.days
            ).map((day) => (
              <View key={day.dayOfWeek ?? day.dayOffset} style={styles.dayCard}>
                <Text style={styles.dayTitle}>
                  {resultIsProgram && day.dayOfWeek
                    ? `${WEEKDAY_LABEL[day.dayOfWeek]}요일`
                    : dayLabel(day.dayOffset)}{' '}
                  · {day.focus}
                  {day.estimatedDurationMin ? ` · 약 ${day.estimatedDurationMin}분` : ''}
                </Text>
                {day.exercises.map((ex, i) => (
                  <View key={`${day.dayOfWeek ?? day.dayOffset}-${i}`} style={styles.exerciseRow}>
                    <View style={styles.exerciseHeader}>
                      <Text style={styles.exerciseName}>{ex.name}</Text>
                      {ex.category ? (
                        <View style={styles.categoryChip}>
                          <Text style={styles.categoryText}>{ex.category}</Text>
                        </View>
                      ) : null}
                      {ex.sets && ex.reps ? (
                        <Text style={styles.setInfo}>
                          {ex.sets}세트 × {ex.reps}회
                        </Text>
                      ) : null}
                      {/* 세트 구성법 — 표준 세트는 굳이 배지로 강조하지 않는다(대부분이 표준이라 노이즈) */}
                      {ex.setMethod && ex.setMethod !== '표준 세트' ? (
                        <View style={styles.setMethodChip}>
                          <Text style={styles.setMethodText}>{ex.setMethod}</Text>
                        </View>
                      ) : null}
                    </View>
                    {ex.comment ? <Text style={styles.exerciseComment}>{ex.comment}</Text> : null}
                  </View>
                ))}
                {day.comment ? <Text style={styles.dayComment}>{day.comment}</Text> : null}
                {/* 프로그램 모드는 하루씩 편집하러 가지 않고 전체를 아래 버튼 하나로 일괄 저장한다 */}
                {!resultIsProgram ? (
                  <Button
                    title="루틴으로 편집하기 ›"
                    variant="secondary"
                    size="md"
                    onPress={() => editAsRoutine(day)}
                    style={styles.saveRoutineBtn}
                  />
                ) : null}
              </View>
            ))}

            {resultIsProgram ? (
              <Button
                title={`${programWeeks}주 프로그램으로 저장 (Day ${result.days.length}개)`}
                onPress={onSaveProgram}
                loading={savingProgram}
                style={styles.saveProgramBtn}
              />
            ) : null}

            <Text style={styles.footnote}>
              AI 제안은 참고용이에요. 몸 상태에 맞게 조절하고, 운동 후 기록해 주세요!
            </Text>
          </View>
        ) : loadingDays === null && !recommendingProgram ? (
          <View style={styles.empty}>
            <MaterialCommunityIcons name="robot-happy-outline" size={40} color={colors.textMuted} style={styles.emptyEmoji} />
            <Text style={styles.emptyText}>위 버튼을 눌러 추천을 받아보세요</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingBottom: spacing.xl },
  hint: { fontSize: fontSize.caption, color: colors.textSecondary, marginBottom: spacing.md },
  planRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  planButton: { flex: 1 },
  programToggle: { marginBottom: spacing.lg },
  programPanel: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  label: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700', marginTop: spacing.md, marginBottom: spacing.sm },
  dayRow: { flexDirection: 'row', gap: spacing.xs },
  dayHint: { fontSize: fontSize.caption, color: colors.textTertiary, marginTop: spacing.xs },
  // 집중 부위·운동 목적 칩 — 요일과 달리 개수·글자폭이 제각각이라 균등분할(fill) 대신 줄바꿈으로 흐른다
  focusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  programRecommendBtn: { marginTop: spacing.md },
  saveProgramBtn: { marginTop: spacing.xs, marginBottom: spacing.md },
  overallCard: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  overallText: { fontSize: fontSize.body, color: colors.textPrimary, fontWeight: '600' },
  dayCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  dayTitle: {
    fontSize: fontSize.subtitle,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  exerciseRow: { marginBottom: spacing.sm },
  exerciseHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  exerciseName: { fontSize: fontSize.body, fontWeight: '700', color: colors.textPrimary },
  categoryChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryText: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '600' },
  setInfo: { fontSize: fontSize.caption, color: colors.primary, fontWeight: '700' },
  // 세트 구성법 배지 — 카테고리 칩과 달리 강조색으로 눈에 띄게 (드랍/레스트-포즈 세트 등 고급 기법 안내)
  setMethodChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
  },
  setMethodText: { fontSize: fontSize.caption, color: colors.primary, fontWeight: '700' },
  exerciseComment: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 2 },
  dayComment: { fontSize: fontSize.caption, color: colors.textPrimary, marginTop: spacing.xs },
  saveRoutineBtn: { marginTop: spacing.md },
  footnote: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  empty: { alignItems: 'center', paddingVertical: spacing.xl },
  emptyEmoji: { fontSize: 44, marginBottom: spacing.sm },
  emptyText: { fontSize: fontSize.body, color: colors.textSecondary },
}));
