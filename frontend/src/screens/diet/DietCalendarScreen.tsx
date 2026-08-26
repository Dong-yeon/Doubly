/** 식단 캘린더 — 월별 기록 캘린더. 운동(WorkoutCalendarScreen) 미러링 */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { DietStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { dietApi } from '../../api/diet';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';
import { onColor } from '../../theme/onColor';

type Props = NativeStackScreenProps<DietStackParamList, 'DietCalendar'>;

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** (2026, 8, 4) → "2026-08-04" */
function dateStringOf(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function DietCalendarScreen({ navigation }: Props) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [completedDays, setCompletedDays] = useState<Set<number>>(new Set());
  /** 선택한 날짜(일) — 그 날의 상태를 보여주고 바로 기록할 수 있게 한다 */
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  // 실패해도 빈 Set 으로 조용히 넘어가면 "이번 달 기록 안 했나?"로 오해한다
  // (QA_CHECKLIST.md P1-8). 배너로 알리고 다시 시도할 수 있게 한다.
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const retry = () => setReloadKey((k) => k + 1);

  const goToday = () => {
    const today = new Date();
    setYear(today.getFullYear());
    setMonth(today.getMonth() + 1);
    setSelectedDay(null);
  };

  useEffect(() => {
    let active = true;
    setLoadError(false);
    dietApi
      .calendar(year, month)
      .then((days) => {
        if (!active) return;
        const set = new Set(days.filter((d) => d.completed).map((d) => Number(d.date.slice(8, 10))));
        setCompletedDays(set);
      })
      .catch(() => {
        if (!active) return;
        setCompletedDays(new Set());
        setLoadError(true);
      });
    return () => {
      active = false;
    };
  }, [year, month, reloadKey]);

  const cells = useMemo(() => {
    const firstDay = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const arr: (number | null)[] = Array(firstDay).fill(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(d);
    return arr;
  }, [year, month]);

  const changeMonth = (delta: number) => {
    let m = month + delta;
    let y = year;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    setMonth(m);
    setYear(y);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => changeMonth(-1)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="이전 달"
        >
          <Text style={styles.nav}>‹</Text>
        </TouchableOpacity>
        {/* 제목을 누르면 이번 달로 — 먼 달에서 돌아오려면 ‹ 를 여러 번 눌러야 했다 */}
        <TouchableOpacity
          onPress={goToday}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="이번 달로 이동"
        >
          <Text style={styles.title}>
            {year}년 {month}월
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => changeMonth(1)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="다음 달"
        >
          <Text style={styles.nav}>›</Text>
        </TouchableOpacity>
      </View>

      {loadError ? (
        <TouchableOpacity
          onPress={retry}
          style={styles.errorBanner}
          accessibilityRole="button"
          accessibilityLabel="캘린더 불러오기 재시도"
        >
          <Text style={styles.errorBannerText}>이번 달 기록을 불러오지 못했어요 — 탭해서 다시 시도</Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.weekRow}>
        {WEEKDAYS.map((w) => (
          <Text key={w} style={styles.weekday}>
            {w}
          </Text>
        ))}
      </View>

      {/* 날짜를 누를 수 있게 — 예전엔 View 라 눌러도 반응이 없었다 */}
      <View style={styles.grid}>
        {cells.map((day, i) => (
          <View key={i} style={styles.cell}>
            {day ? (
              <TouchableOpacity
                onPress={() => setSelectedDay(day === selectedDay ? null : day)}
                accessibilityRole="button"
                accessibilityLabel={`${year}년 ${month}월 ${day}일`}
                accessibilityState={{ selected: selectedDay === day }}
                style={styles.dayTouch}
              >
                <View
                  style={[
                    styles.dayCircle,
                    completedDays.has(day) && styles.dayDone,
                    selectedDay === day && styles.daySelected,
                  ]}
                >
                  <Text style={[styles.dayText, completedDays.has(day) && styles.dayTextDone]}>
                    {day}
                  </Text>
                </View>
              </TouchableOpacity>
            ) : null}
          </View>
        ))}
      </View>

      {selectedDay ? (
        <View style={styles.selectedBox}>
          <Text style={styles.selectedText}>
            {month}월 {selectedDay}일 ·{' '}
            {completedDays.has(selectedDay) ? '식단을 기록한 날이에요' : '기록이 없어요'}
          </Text>
          <Button
            title="이 날 기록하기"
            size="md"
            variant="secondary"
            onPress={() =>
              navigation.navigate('DietRecord', { date: dateStringOf(year, month, selectedDay) })
            }
          />
        </View>
      ) : (
        <View style={styles.legend}>
          <View style={[styles.dayCircle, styles.dayDone, styles.legendDot]} />
          <Text style={styles.legendText}>식단 기록한 날</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const CELL = `${100 / 7}%`;

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  nav: { fontSize: 28, color: colors.primary, paddingHorizontal: spacing.md },
  title: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  errorBanner: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  errorBannerText: { color: colors.danger, fontSize: fontSize.caption, fontWeight: '700', textAlign: 'center' },
  weekRow: { flexDirection: 'row' },
  weekday: { width: CELL, textAlign: 'center', color: colors.textSecondary, fontSize: fontSize.caption },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.sm },
  cell: { width: CELL, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  /* 셀 전체를 터치 영역으로 — 36px 원만 누르게 하면 타깃이 작다 */
  dayTouch: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  dayCircle: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  /* 선택 표시는 테두리로 — 기록(채움)과 겹쳐도 둘 다 읽힌다 */
  daySelected: { borderWidth: 2, borderColor: colors.primary },
  dayDone: { backgroundColor: colors.accent },
  dayText: { fontSize: fontSize.body, color: colors.textPrimary },
  // 다크 accent 위 white 는 1.50:1 — 선택 여부와 무관하게 완료된 모든 날짜가 이랬다
  dayTextDone: { color: onColor(colors.accent), fontWeight: '700' },
  legend: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xl, gap: spacing.sm },
  selectedBox: { marginTop: spacing.xl, gap: spacing.sm },
  selectedText: { fontSize: fontSize.body, fontWeight: '700', color: colors.textPrimary },
  legendDot: { width: 20, height: 20 },
  legendText: { color: colors.textSecondary, fontSize: fontSize.caption },
}));
