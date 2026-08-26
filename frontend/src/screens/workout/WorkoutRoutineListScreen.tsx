/**
 * 내 운동 루틴 목록 — 탭하면 세션으로 실행, 길게 눌러 삭제.
 * 요일이 배정된 루틴(짐워크 스타일 "Day1은 월/목")은 카드에 요일 점을 보여주고,
 * 오늘 요일과 겹치면 "오늘" 배지를 달아 목록 맨 위로 올린다 — 오늘 뭘 할지 고민 없이
 * 첫 카드를 탭하면 그게 오늘 루틴이 되게 한다.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { WorkoutStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { MaterialCommunityIcons } from '../../components/Icon';
import { workoutApi } from '../../api/workout';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { useDeleteAction } from '../../hooks/useDeleteAction';
import { WEEK_DAYS, todayWeekDay } from '../../utils/date';
import { routineToSessionParams } from '../../utils/routine';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { WorkoutProgram, WorkoutRoutine } from '../../types';
import { themedStyles } from '../../theme/themedStyles';
import { layout } from '../../theme/layout';

type Props = NativeStackScreenProps<WorkoutStackParamList, 'WorkoutRoutines'>;

// FlatList 는 단일 아이템 타입만 받아서, 프로그램 카드와 자유 루틴 카드를 하나의 목록에
// 함께 보여주기 위한 구분 유니언 — "오늘" 정렬도 이 위에서 함께 처리한다.
type ListItem =
  | { kind: 'program'; program: WorkoutProgram }
  | { kind: 'routine'; routine: WorkoutRoutine };

export function WorkoutRoutineListScreen({ navigation }: Props) {
  const [routines, setRoutines] = useState<WorkoutRoutine[]>([]);
  const [programs, setPrograms] = useState<WorkoutProgram[]>([]);
  const [loading, setLoading] = useState(false);
  // 로드 실패를 "아직 루틴이 없어요"로 위장하지 않는다 (QA_CHECKLIST.md 전역 반복 패턴 1)
  const [loadError, setLoadError] = useState(false);
  const [pendingGiftCount, setPendingGiftCount] = useState(0);
  const [giftingId, setGiftingId] = useState<number | null>(null);
  // 루틴/프로그램은 별도 id 공간이라 삭제 in-flight 가드도 각각 둔다 (QA_CHECKLIST.md 전역 반복 패턴 7)
  const { deletingId: deletingRoutineId, runDelete: runDeleteRoutine } = useDeleteAction<number>();
  const { deletingId: deletingProgramId, runDelete: runDeleteProgram } = useDeleteAction<number>();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [r, p] = await Promise.all([workoutApi.routines(), workoutApi.programs()]);
      setRoutines(r);
      setPrograms(p);
    } catch (e) {
      toast.error(getErrorMessage(e, '루틴을 불러오지 못했어요.'));
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // 받은 선물 배지 — 실패해도 화면 전체를 막을 정도는 아니라 조용히 무시한다
  const loadPendingGiftCount = useCallback(async () => {
    try {
      const gifts = await workoutApi.receivedRoutineGifts();
      setPendingGiftCount(gifts.filter((g) => g.status === 'PENDING').length);
    } catch {
      // 배지는 선택 정보 — 실패해도 토스트로 방해하지 않는다
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      loadPendingGiftCount();
    }, [load, loadPendingGiftCount]),
  );

  const onGift = (routine: WorkoutRoutine) => {
    Alert.alert('루틴 선물하기', `"${routine.title}"을(를) 애인에게 선물할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '선물하기',
        onPress: async () => {
          haptics.light();
          setGiftingId(routine.id);
          try {
            await workoutApi.sendRoutineGift(routine.id);
            haptics.success();
            toast.success('루틴을 선물했어요!');
          } catch (e) {
            toast.error(getErrorMessage(e, '선물에 실패했어요.'));
          } finally {
            setGiftingId(null);
          }
        },
      },
    ]);
  };

  const today = todayWeekDay();
  const programIsToday = (p: WorkoutProgram) =>
    p.days.some((d) => d.routine.scheduledDays.includes(today));

  // 프로그램 카드 + 자유 루틴 카드를 하나의 목록으로 합치고, 오늘 해당하는 걸 앞으로 —
  // Array.sort 는 안정 정렬이라 같은 그룹 안에서는 원래 순서(최근 만든 순)가 유지된다
  const items = useMemo<ListItem[]>(() => {
    const combined: ListItem[] = [
      ...programs.map((program): ListItem => ({ kind: 'program', program })),
      ...routines.map((routine): ListItem => ({ kind: 'routine', routine })),
    ];
    return combined.sort((a, b) => {
      const aToday = a.kind === 'program' ? programIsToday(a.program) : a.routine.scheduledDays.includes(today);
      const bToday = b.kind === 'program' ? programIsToday(b.program) : b.routine.scheduledDays.includes(today);
      return Number(bToday) - Number(aToday);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routines, programs, today]);

  const startSession = (routine: WorkoutRoutine) => {
    haptics.light();
    navigation.navigate('WorkoutSession', routineToSessionParams(routine));
  };

  const onDelete = (routine: WorkoutRoutine) => {
    Alert.alert('루틴 삭제', `"${routine.title}"을(를) 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () =>
          runDeleteRoutine(routine.id, async () => {
            await workoutApi.removeRoutine(routine.id);
            haptics.light();
            setRoutines((prev) => prev.filter((r) => r.id !== routine.id));
          }),
      },
    ]);
  };

  const onDeleteProgram = (program: WorkoutProgram) => {
    Alert.alert('프로그램 삭제', `"${program.title}"과(와) Day ${program.days.length}개를 모두 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () =>
          runDeleteProgram(program.id, async () => {
            await workoutApi.removeProgram(program.id);
            haptics.light();
            setPrograms((prev) => prev.filter((p) => p.id !== program.id));
          }),
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={items}
        keyExtractor={(item) => (item.kind === 'program' ? `p${item.program.id}` : `r${item.routine.id}`)}
        contentContainerStyle={styles.list}
        refreshing={loading}
        onRefresh={load}
        renderItem={({ item }) => {
          if (item.kind === 'program') {
            const { program } = item;
            const isToday = programIsToday(program);
            const deleting = deletingProgramId === program.id;
            return (
              <TouchableOpacity
                style={[styles.card, styles.programCard, isToday && styles.cardToday, deleting && styles.cardDeleting]}
                activeOpacity={0.8}
                disabled={deleting}
                onPress={() => navigation.navigate('WorkoutProgramDetail', { programId: program.id })}
                onLongPress={() => onDeleteProgram(program)}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.titleRow}>
                    <MaterialCommunityIcons name="calendar-month-outline" size={16} color={colors.primary} />
                    <Text style={styles.title}>{program.title}</Text>
                    {isToday ? (
                      <View style={styles.todayBadge}>
                        <Text style={styles.todayBadgeText}>오늘</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.start}>Day 선택 ›</Text>
                </View>
                <Text style={styles.summary} numberOfLines={2}>
                  {program.days.map((d) => d.routine.title.split(' - ').pop()).join(' · ')}
                </Text>
                <Text style={styles.count}>
                  {program.totalWeeks}주 프로그램 · Day {program.days.length}개 · 길게 눌러 삭제
                </Text>
              </TouchableOpacity>
            );
          }

          const routine = item.routine;
          const isToday = routine.scheduledDays.includes(today);
          const deleting = deletingRoutineId === routine.id;
          return (
            <TouchableOpacity
              style={[styles.card, isToday && styles.cardToday, deleting && styles.cardDeleting]}
              activeOpacity={0.8}
              disabled={deleting}
              onPress={() => startSession(routine)}
              onLongPress={() => onDelete(routine)}
            >
              <View style={styles.cardHeader}>
                <View style={styles.titleRow}>
                  <Text style={styles.title}>{routine.title}</Text>
                  {isToday ? (
                    <View style={styles.todayBadge}>
                      <Text style={styles.todayBadgeText}>오늘</Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.headerActions}>
                  <TouchableOpacity
                    style={styles.giftBtn}
                    disabled={giftingId === routine.id}
                    onPress={() => onGift(routine)}
                    accessibilityRole="button"
                    accessibilityLabel="루틴 선물하기"
                  >
                    <Text style={styles.giftBtnText}>🎁</Text>
                  </TouchableOpacity>
                  <Text style={styles.start}>시작</Text>
                </View>
              </View>
              {/* 요일 배정 — 짐워크 스타일 미니 캘린더 점. 비어 있으면(자유 루틴) 아예 숨긴다 */}
              {routine.scheduledDays.length > 0 ? (
                <View style={styles.dayDotRow}>
                  {WEEK_DAYS.map((d) => {
                    const active = routine.scheduledDays.includes(d.value);
                    return (
                      <View key={d.value} style={[styles.dayDot, active && styles.dayDotActive]}>
                        <Text style={[styles.dayDotText, active && styles.dayDotTextActive]}>{d.label}</Text>
                      </View>
                    );
                  })}
                </View>
              ) : null}
              <Text style={styles.summary} numberOfLines={2}>
                {routine.exercises.map((e) => e.exerciseName).join(' · ') || '운동 없음'}
              </Text>
              <Text style={styles.count}>{routine.exercises.length}개 운동 · 길게 눌러 삭제</Text>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            loadError ? (
              <EmptyState
                icon="cloud-off-outline"
                title="루틴을 불러오지 못했어요"
                description="네트워크 상태를 확인하고 다시 시도해주세요."
                error
                onRetry={load}
              />
            ) : (
              <EmptyState
                icon="clipboard-text-outline"
                title="아직 루틴이 없어요"
                description="자주 하는 운동을 루틴으로 만들면 원탭으로 세션을 시작할 수 있어요."
              />
            )
          ) : null
        }
        ListFooterComponent={
          <View style={styles.footerWrap}>
            <TouchableOpacity
              style={styles.templatesLink}
              onPress={() => navigation.navigate('WorkoutRoutineGiftInbox')}
            >
              <Text style={styles.templatesLinkText}>🎁 루틴 선물함</Text>
              {pendingGiftCount > 0 ? (
                <View style={styles.giftCountBadge}>
                  <Text style={styles.giftCountBadgeText}>{pendingGiftCount}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.templatesLink}
              onPress={() => navigation.navigate('WorkoutRoutineTemplates')}
            >
              <Text style={styles.templatesLinkText}>✨ 검증된 루틴 둘러보기</Text>
            </TouchableOpacity>
          </View>
        }
      />
      <View style={styles.fabWrap}>
        <Button title="＋ 루틴 만들기" onPress={() => navigation.navigate('WorkoutRoutineForm')} />
      </View>
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, paddingBottom: layout.listBottomWithFab },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  // 오늘 요일이 배정된 루틴 — 테두리로만 강조한다(배경을 바꾸면 다크모드에서 항상 도드라져 소음이 된다)
  cardToday: { borderColor: colors.primary, borderWidth: 1.5 },
  // 삭제 진행 중인 카드 흐리게 (QA_CHECKLIST.md 전역 반복 패턴 7)
  cardDeleting: { opacity: 0.4 },
  // 프로그램 카드 — 자유 루틴과 구분되도록 은은한 배경을 살짝 얹는다
  programCard: { backgroundColor: colors.accentSoft },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 1 },
  title: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary },
  todayBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  todayBadgeText: { fontSize: 10, fontWeight: '800', color: colors.white },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  // 선물 버튼 — 카드 전체 탭(세션 시작)과 겹치지 않도록 별도 터치 영역을 넉넉히 준다
  giftBtn: { padding: spacing.xs },
  giftBtnText: { fontSize: fontSize.body },
  start: { fontSize: fontSize.caption, color: colors.primary, fontWeight: '800' },
  // 요일 배정 — 짐워크 스타일 미니 캘린더 점 7개(월→일), 배정된 요일만 채운다
  dayDotRow: { flexDirection: 'row', gap: 4, marginTop: spacing.xs },
  dayDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayDotActive: { backgroundColor: colors.primaryBg, borderColor: colors.primary },
  dayDotText: { fontSize: 10, fontWeight: '700', color: colors.textTertiary },
  dayDotTextActive: { color: colors.primary },
  summary: { fontSize: fontSize.caption, color: colors.textPrimary, marginTop: spacing.xs, lineHeight: 18 },
  count: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: spacing.xs },
  fabWrap: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg },
  footerWrap: { gap: spacing.sm, marginTop: spacing.xs, marginBottom: 80 },
  templatesLink: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    paddingVertical: spacing.md,
  },
  templatesLinkText: { fontSize: fontSize.body, fontWeight: '800', color: colors.textSecondary },
  giftCountBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  giftCountBadgeText: { fontSize: 10, fontWeight: '800', color: colors.white },
}));
