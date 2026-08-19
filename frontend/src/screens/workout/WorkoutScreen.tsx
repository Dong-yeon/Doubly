/** 운동 메인 — 설계서 2.4 (오늘 기록 + 히스토리 + 캘린더 진입). WORKOUT-02/03
 *  트레이너가 배정한 루틴은 이 화면에서 뺐다 — 필요하면 git 히스토리(이 파일의 이전 버전)에서
 *  복원할 수 있다. 트레이너 기능 자체는 src/screens/trainer 에 살아있다. */
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { WorkoutStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { WorkoutCard } from '../../components/WorkoutCard';
import { EmptyState } from '../../components/EmptyState';
import { MaterialCommunityIcons } from '../../components/Icon';
import { useWorkoutStore } from '../../store/workoutStore';
import { useRelationStore } from '../../store/relationStore';
import { QuickLinkChips } from '../../components/QuickLinkChips';
import { streakApi } from '../../api/streak';
import { getErrorMessage } from '../../utils/error';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { Streak, Workout } from '../../types';
import { themedStyles } from '../../theme/themedStyles';
import { layout } from '../../theme/layout';

type Props = NativeStackScreenProps<WorkoutStackParamList, 'WorkoutMain'>;

const WEEKDAY_LETTERS = ['일', '월', '화', '수', '목', '금', '토'];

/** 이번 주(월~일) 날짜 7개 — 상단 요일 스트립용. 일요일이면 지난주로 안 넘어가게 월요일 기준으로 계산 */
function thisWeekDates(): Date[] {
  const today = new Date();
  const day = today.getDay(); // 0=일 … 6=토
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

export function WorkoutScreen({ navigation }: Props) {
  const { today, history, loading, loadingMore, fetchToday, fetchHistory, loadMoreHistory, remove } =
    useWorkoutStore();
  // 커플 연결 여부 — "함께 N일"은 연결됐을 때만 의미가 있다 (식단 탭과 동일한 기준)
  const couple = useRelationStore((s) => s.couple);
  const connected = !!couple?.partner;
  const [myStreak, setMyStreak] = useState<Streak | null>(null);
  const [coupleStreak, setCoupleStreak] = useState<Streak | null>(null);
  // 화면이 떠 있는 동안(자정을 넘기지 않는 한) 매번 다시 계산할 필요 없음
  const weekDates = useMemo(() => thisWeekDates(), []);
  const todayKey = useMemo(() => new Date().toDateString(), []);

  // 운동 스트릭 — 부가 정보라 실패해도 화면은 정상 동작 (0일로 표시)
  const refreshStreaks = useCallback(() => {
    streakApi.me().then(setMyStreak).catch(() => setMyStreak(null));
    if (connected) {
      streakApi.couple().then(setCoupleStreak).catch(() => setCoupleStreak(null));
    }
  }, [connected]);

  useFocusEffect(
    useCallback(() => {
      fetchToday();
      fetchHistory();
      refreshStreaks();
    }, [fetchToday, fetchHistory, refreshStreaks]),
  );

  const onLongPress = (w: Workout) => {
    Alert.alert('운동 기록 삭제', `${w.workoutDate} 기록을 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await remove(w.id);
          } catch (e) {
            Alert.alert('오류', getErrorMessage(e));
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* 이번 주 한눈에 보기 — 연속 기록 배지 + 요일별 날짜. 특정 날짜를 눌러 그날 기록으로
          바로 가는 기능까진 아직 없고(캘린더 화면이 그 역할), 지금은 "이번 주 어디쯤인가"를
          보여주는 용도로만 쓴다. */}
      <View style={styles.weekHeader}>
        <View style={styles.streakBadge}>
          <MaterialCommunityIcons name="fire" size={16} color={colors.white} />
          <Text style={styles.streakBadgeText}>{myStreak?.currentCount ?? 0}</Text>
        </View>
        <View style={styles.weekStrip}>
          {weekDates.map((d) => {
            const isToday = d.toDateString() === todayKey;
            return (
              <View key={d.toISOString()} style={styles.weekCell}>
                <Text style={styles.weekCellLabel}>{WEEKDAY_LETTERS[d.getDay()]}</Text>
                <View style={[styles.weekCellDateWrap, isToday && styles.weekCellDateWrapToday]}>
                  <Text style={[styles.weekCellDate, isToday && styles.weekCellDateToday]}>
                    {d.getDate()}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* 아이콘 칩 6개 — 식단 탭과 같은 QuickLinkChips 를 써서 톤을 맞춘다.
          좁은 화면에선 넘치는 만큼 가로 스크롤되고, 오른쪽 페이드가 그 힌트를 준다. */}
      <QuickLinkChips
        links={[
          { icon: 'notebook-outline', label: '내 루틴', onPress: () => navigation.navigate('WorkoutRoutines') },
          { icon: 'human', label: '몸 변화', onPress: () => navigation.navigate('BodyMetric') },
          { icon: 'sword-cross', label: '대결', onPress: () => navigation.navigate('Challenge') },
          { icon: 'creation', label: 'AI 추천', onPress: () => navigation.navigate('WorkoutRecommend') },
          { icon: 'microphone-outline', label: '음성 응원', onPress: () => navigation.navigate('VoiceClips') },
          { icon: 'chart-bar', label: '통계', onPress: () => navigation.navigate('WorkoutStats') },
          { icon: 'calendar-blank-outline', label: '캘린더', onPress: () => navigation.navigate('WorkoutCalendar') },
        ]}
      />

      <FlatList
        data={history}
        keyExtractor={(w) => String(w.id)}
        contentContainerStyle={styles.list}
        refreshing={loading}
        onRefresh={() => {
          fetchToday();
          fetchHistory();
        }}
        onEndReachedThreshold={0.3}
        onEndReached={loadMoreHistory}
        ListHeaderComponent={
          <View>
            {/* 운동 스트릭 — 식단 탭과 같은 표시 형식(연속/함께/최고) */}
            <View style={styles.streakRow}>
              <Text style={styles.streakText}>연속 {myStreak?.currentCount ?? 0}일</Text>
              {connected ? (
                <Text style={styles.streakText}>함께 {coupleStreak?.currentCount ?? 0}일</Text>
              ) : null}
              <Text style={styles.streakMax}>최고 {myStreak?.maxCount ?? 0}일</Text>
            </View>

            {/* 기록이 하나도 없으면 섹션을 숨긴다 — "오늘 없어요" 카드와 EmptyState 가
                겹쳐 빈 안내가 두 번 보이던 중복 제거 (ListEmptyComponent 하나로 통일) */}
            {today.length > 0 || history.length > 0 ? (
              <>
                <Text style={styles.sectionTitle}>오늘</Text>
                {today.length > 0 ? (
                  today.map((w) => <WorkoutCard key={w.id} workout={w} onLongPress={onLongPress} />)
                ) : (
                  <View style={styles.emptyToday}>
                    <Text style={styles.emptyText}>오늘 운동 기록이 아직 없어요 </Text>
                  </View>
                )}
                <Text style={[styles.sectionTitle, styles.historyTitle]}>히스토리</Text>
              </>
            ) : null}
          </View>
        }
        renderItem={({ item }) => <WorkoutCard workout={item} onLongPress={onLongPress} />}
        ListEmptyComponent={
          !loading ? (
            <EmptyState icon="dumbbell" title="아직 운동 기록이 없어요" description="아래 버튼으로 첫 운동을 기록해보세요!" />
          ) : null
        }
        ListFooterComponent={
          loadingMore ? <Text style={styles.footer}>불러오는 중…</Text> : null
        }
      />

      <View style={styles.fabWrap}>
        <View style={styles.fabRow}>
          <Button
            title="세션 시작"
            variant="secondary"
            onPress={() => navigation.navigate('WorkoutSession')}
            style={styles.fabBtn}
          />
          <Button
            title="＋ 기록하기"
            onPress={() => navigation.navigate('WorkoutRecord')}
            style={styles.fabBtn}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  weekHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  streakBadgeText: { color: colors.white, fontSize: fontSize.caption, fontWeight: '800' },
  weekStrip: { flex: 1, flexDirection: 'row', justifyContent: 'space-between' },
  weekCell: { alignItems: 'center', gap: 4 },
  weekCellLabel: { fontSize: fontSize.micro, color: colors.textMuted, fontWeight: '600' },
  weekCellDateWrap: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekCellDateWrapToday: { backgroundColor: colors.primary },
  weekCellDate: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700' },
  weekCellDateToday: { color: colors.white },
  list: { padding: spacing.lg, paddingBottom: layout.listBottomWithFab },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  streakText: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary },
  streakMax: { fontSize: fontSize.caption, color: colors.textSecondary, marginLeft: 'auto' },
  sectionTitle: {
    fontSize: fontSize.subtitle,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  historyTitle: { marginTop: spacing.lg },
  emptyToday: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  emptyText: { color: colors.textSecondary, fontSize: fontSize.body },
  footer: { textAlign: 'center', color: colors.textSecondary, paddingVertical: spacing.md },
  fabWrap: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg },
  fabRow: { flexDirection: 'row', gap: spacing.sm },
  fabBtn: { flex: 1 },
}));
