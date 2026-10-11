/**
 * 월 달력 격자 — 요일 머리 + 날짜 칸. 칸 안에 무엇을 그릴지는 호출부가 정한다.
 *
 * <p><b>왜 뽑았나</b>: 같은 격자(WEEKDAYS + firstDay 패딩 + 날짜)가 CoupleCalendar·DietCalendar·
 * WorkoutCalendar·DatePickerSheet 네 곳에 복사돼 있었다. 나만의 하루 기록이 다섯 번째가 되기 전에
 * 여기로 뽑는다. 기존 네 곳을 옮기는 건 별도 작업이다(이번 범위를 키우지 않는다 —
 * docs/PERSONAL_JOURNAL_ANALYSIS_2026-10-02.md §4-2).
 */
import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { fontSize, radius, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

interface Props {
  year: number;
  /** 1~12 */
  month: number;
  selectedDay?: number | null;
  /** 이번 달이면 오늘 날짜(테두리) */
  todayDay?: number | null;
  onPressDay?: (day: number) => void;
  /** 숫자 아래에 그릴 것(무드 이모지·점 등). 없으면 숫자만 */
  renderMark?: (day: number) => React.ReactNode;
  /** 칸마다 읽어 줄 문장 — 기본은 "N월 N일" */
  dayLabel?: (day: number) => string;
  /** 이 날 이후는 누를 수 없다(미래) */
  disableAfterDay?: number | null;
}

export function MonthGrid({
  year,
  month,
  selectedDay,
  todayDay,
  onPressDay,
  renderMark,
  dayLabel,
  disableAfterDay,
}: Props) {
  /*
   * 주 단위로 잘라 한 줄씩 그린다 — flexWrap 에 맡기지 않는다(2026-10-05).
   *
   * <p>예전엔 칸 폭을 `${100 / 7}%` 로 주고 flexWrap 으로 줄을 바꿨다. 100/7 은 문자열로 "14.285714285714286" 이라
   * 1/7 보다 아주 조금 크고, Yoga 가 float 로 일곱 칸을 더하면 <b>폭에 따라</b> 줄 폭을 0.00003 넘는다 — 그러면 토요일
   * 칸이 다음 줄로 떨어지고 그 뒤 날짜가 전부 한 칸씩 밀린다. 같은 계산을 흉내 내 보면 이 화면 폭(기기 폭 − 64)에서
   * 384dp·412dp 기기(갤럭시 S 계열에 흔하다)가 걸리고 393·411 은 안 걸린다. 그래서 기기에 따라서만 깨졌다.
   * 줄마다 flex:1 일곱 칸이면 남는 폭을 나눠 가질 뿐 넘칠 수가 없다.
   */
  const weeks = useMemo(() => {
    const firstDay = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const arr: (number | null)[] = Array(firstDay).fill(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(d);
    // 마지막 주도 일곱 칸을 채워야 flex:1 칸의 폭이 다른 줄과 같다
    while (arr.length % 7 !== 0) arr.push(null);
    const rows: (number | null)[][] = [];
    for (let i = 0; i < arr.length; i += 7) rows.push(arr.slice(i, i + 7));
    return rows;
  }, [year, month]);

  return (
    <View>
      <View style={styles.weekRow}>
        {WEEKDAYS.map((w) => (
          <Text key={w} style={styles.weekday}>
            {w}
          </Text>
        ))}
      </View>
      {weeks.map((week, w) => (
        <View key={w} style={styles.week}>
          {week.map((day, i) => {
            if (!day) return <View key={`pad-${w}-${i}`} style={styles.cell} />;
            const disabled = disableAfterDay != null && day > disableAfterDay;
            const selected = selectedDay === day;
            return (
              <View key={day} style={styles.cell}>
                <Pressable
                  onPress={onPressDay && !disabled ? () => onPressDay(day) : undefined}
                  disabled={!onPressDay || disabled}
                  style={({ pressed }) => [
                    styles.day,
                    todayDay === day && styles.today,
                    selected && styles.selected,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={dayLabel ? dayLabel(day) : `${month}월 ${day}일`}
                  accessibilityState={{ selected, disabled }}
                >
                  <Text style={[styles.dayText, disabled && styles.dayTextDisabled]}>{day}</Text>
                  <View style={styles.mark}>{renderMark ? renderMark(day) : null}</View>
                </Pressable>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = themedStyles((colors) => ({
  weekRow: { flexDirection: 'row', marginBottom: spacing.xs },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSize.caption,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  week: { flexDirection: 'row' },
  // minWidth 0 — 칸 안 내용(이모지 등)이 넓어도 일곱 칸이 같은 폭을 지킨다
  cell: { flex: 1, minWidth: 0, padding: 2 },
  day: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
    minHeight: 52,
  },
  today: { borderColor: colors.primary },
  selected: { backgroundColor: colors.primarySoft },
  pressed: { opacity: 0.7 },
  dayText: { fontSize: fontSize.caption, fontWeight: '600', color: colors.textPrimary },
  dayTextDisabled: { color: colors.textTertiary },
  /** 표시가 없어도 높이를 지켜 칸이 들쭉날쭉하지 않게 한다 */
  mark: { height: 22, alignItems: 'center', justifyContent: 'center' },
}));
