/**
 * 날짜 선택 달력 — 앱 전역에 하나만 떠 있고 {@link pickDate} 로 호출한다.
 *
 * <p>예전에는 날짜를 전부 손으로 타이핑(YYYY-MM-DD)하게 했다. 오타가 나기 쉽고,
 * "2월 30일"처럼 없는 날짜도 형식만 맞으면 통과해 서버에서야 걸렸다.
 * 모바일에서는 숫자 키보드로 10자를 치는 것 자체가 번거롭다. 그래서 전부 골라 쓰게 바꿨다.
 *
 * <p>네이티브 날짜 피커 모듈을 쓰지 않고 직접 그린다 — 웹(PWA)과 앱에서 생김새·동작이
 * 완전히 같아야 하고, 새 네이티브 의존성이 늘면 그때마다 EAS 빌드를 다시 돌려야 한다.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from './Icon';
import { useDatePickerStore } from '../store/datePickerStore';
import { parseDateString, toDateString } from '../utils/date';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';
import { layout } from '../theme/layout';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 연도 목록 한 칸의 높이 — 선택된 해로 스크롤을 맞추려면 고정값이어야 한다 */
const YEAR_ITEM_HEIGHT = 40;
const YEAR_LIST_HEIGHT = 240;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function DatePickerSheet() {
  const request = useDatePickerStore((s) => s.request);
  const close = useDatePickerStore((s) => s.close);

  const todayStr = toDateString();
  const [year, setYear] = useState(0);
  const [month, setMonth] = useState(1);
  // 'day' = 날짜 그리드, 'ym' = 연·월 빠른 이동 (기념일·생일은 몇 년 전일 수 있다)
  const [mode, setMode] = useState<'day' | 'ym'>('day');
  const yearListRef = useRef<ScrollView | null>(null);

  // 열릴 때마다 현재 값(없으면 오늘)이 보이는 달로 맞춘다
  useEffect(() => {
    if (!request) return;
    const base = parseDateString(request.value) ?? parseDateString(todayStr) ?? new Date();
    setYear(base.getFullYear());
    setMonth(base.getMonth() + 1);
    setMode('day');
  }, [request, todayStr]);

  /** 앞쪽 빈칸 + 1..말일 */
  const cells = useMemo(() => {
    if (!year) return [];
    const blanks = new Date(year, month - 1, 1).getDay();
    const lastDay = new Date(year, month, 0).getDate();
    const arr: (number | null)[] = Array(blanks).fill(null);
    for (let d = 1; d <= lastDay; d++) arr.push(d);
    return arr;
  }, [year, month]);

  /** 연도 후보 — min/max 가 있으면 그 범위, 없으면 100년 전 ~ 10년 뒤 */
  const years = useMemo(() => {
    const thisYear = new Date().getFullYear();
    const from = parseDateString(request?.min)?.getFullYear() ?? thisYear - 100;
    const to = parseDateString(request?.max)?.getFullYear() ?? thisYear + 10;
    const arr: number[] = [];
    for (let y = to; y >= from; y--) arr.push(y);
    return arr;
  }, [request?.min, request?.max]);

  /*
   * 연·월 패널을 열면 선택된 해가 화면 가운데 오도록 스크롤을 맞춘다.
   * 목록은 최근 연도가 위(내림차순)라 그냥 열면 맨 위(10년 뒤)가 보이는데,
   * 정작 필요한 올해를 찾으려면 한참 내려야 했다.
   */
  useEffect(() => {
    if (mode !== 'ym' || !year) return;
    const index = years.indexOf(year);
    if (index < 0) return;
    const offset = Math.max(0, index * YEAR_ITEM_HEIGHT - YEAR_LIST_HEIGHT / 2 + YEAR_ITEM_HEIGHT / 2);
    // 패널이 그려진 뒤에 스크롤해야 반영된다
    const id = setTimeout(() => yearListRef.current?.scrollTo({ y: offset, animated: false }), 0);
    return () => clearTimeout(id);
  }, [mode, year, years]);

  if (!request) return null;

  // ISO 문자열은 사전순 비교가 곧 날짜 비교다
  const disabled = (value: string) =>
    (!!request.min && value < request.min) || (!!request.max && value > request.max);

  const moveMonth = (delta: number) => {
    let y = year;
    let m = month + delta;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    if (m > 12) {
      m = 1;
      y += 1;
    }
    setYear(y);
    setMonth(m);
  };

  const goToday = () => {
    const t = parseDateString(todayStr);
    if (!t) return;
    if (disabled(todayStr)) {
      // 오늘이 범위 밖이면 달만 옮겨준다 — 고를 수 없는 날을 고른 척하지 않는다
      setYear(t.getFullYear());
      setMonth(t.getMonth() + 1);
      return;
    }
    close(todayStr);
  };

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => close(null)}>
      <Pressable style={styles.backdrop} onPress={() => close(null)}>
        {/* 카드 안쪽 터치가 배경으로 새어나가 닫히지 않도록 막는다 */}
        <Pressable style={styles.card} onPress={() => undefined}>
          <Text style={styles.title}>{request.title}</Text>

          <View style={styles.navRow}>
            <Pressable
              style={styles.navBtn}
              onPress={() => moveMonth(-1)}
              accessibilityRole="button"
              accessibilityLabel="이전 달"
              hitSlop={8}
            >
              <MaterialCommunityIcons name="chevron-left" size={26} color={colors.textSecondary} />
            </Pressable>

            <Pressable
              style={styles.monthLabelBtn}
              onPress={() => setMode((m) => (m === 'day' ? 'ym' : 'day'))}
              accessibilityRole="button"
            >
              {/* 캐럿 아이콘(20)만큼 왼쪽에 빈 공간을 둔다 — 아니면 "년 월" 텍스트가
                  버튼 정중앙보다 11px 왼쪽에서 읽힌다(캐럿이 오른쪽에만 무게를 더해서) */}
              <View style={styles.monthLabelSpacer} />
              <Text style={styles.monthLabel}>
                {year}년 {month}월
              </Text>
              <MaterialCommunityIcons
                name={mode === 'day' ? 'menu-down' : 'menu-up'}
                size={20}
                color={colors.textSecondary}
              />
            </Pressable>

            <Pressable
              style={styles.navBtn}
              onPress={() => moveMonth(1)}
              accessibilityRole="button"
              accessibilityLabel="다음 달"
              hitSlop={8}
            >
              <MaterialCommunityIcons name="chevron-right" size={26} color={colors.textSecondary} />
            </Pressable>
          </View>

          {mode === 'ym' ? (
            <View style={styles.ymPanel}>
              <ScrollView ref={yearListRef} style={styles.yearList} showsVerticalScrollIndicator={false}>
                {years.map((y) => (
                  <Pressable
                    key={y}
                    style={[styles.yearItem, y === year && styles.yearItemActive]}
                    onPress={() => setYear(y)}
                  >
                    <Text style={[styles.yearText, y === year && styles.yearTextActive]}>{y}년</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <View style={styles.monthGrid}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <Pressable
                    key={m}
                    style={[styles.monthCell, m === month && styles.monthCellActive]}
                    onPress={() => {
                      setMonth(m);
                      setMode('day');
                    }}
                  >
                    <Text style={[styles.monthCellText, m === month && styles.monthCellTextActive]}>
                      {m}월
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : (
            <>
              <View style={styles.weekRow}>
                {WEEKDAYS.map((w, i) => (
                  <Text key={w} style={[styles.weekday, i === 0 && styles.sun, i === 6 && styles.sat]}>
                    {w}
                  </Text>
                ))}
              </View>

              <View style={styles.grid}>
                {cells.map((day, i) => {
                  if (day == null) return <View key={`b${i}`} style={styles.cell} />;
                  const value = iso(year, month, day);
                  const off = disabled(value);
                  const selected = value === request.value;
                  const isToday = value === todayStr;
                  const weekday = i % 7;
                  return (
                    <Pressable
                      key={value}
                      style={styles.cell}
                      disabled={off}
                      onPress={() => close(value)}
                      accessibilityRole="button"
                      accessibilityLabel={`${year}년 ${month}월 ${day}일`}
                    >
                      <View
                        style={[
                          styles.dayBox,
                          isToday && !selected && styles.todayBox,
                          selected && styles.selectedBox,
                        ]}
                      >
                        <Text
                          style={[
                            styles.dayText,
                            weekday === 0 && styles.sun,
                            weekday === 6 && styles.sat,
                            selected && styles.selectedText,
                            off && styles.disabledText,
                          ]}
                        >
                          {day}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          <View style={styles.actions}>
            <Pressable style={styles.actionBtn} onPress={goToday} accessibilityRole="button">
              <Text style={styles.todayText}>오늘</Text>
            </Pressable>
            <Pressable style={styles.actionBtn} onPress={() => close(null)} accessibilityRole="button">
              <Text style={styles.cancelText}>취소</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = themedStyles((colors) => ({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  title: {
    fontSize: fontSize.subtitle,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
  },

  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  navBtn: { width: layout.touchTarget, height: layout.touchTarget, alignItems: 'center', justifyContent: 'center' },
  monthLabelBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: spacing.sm },
  // 오른쪽 캐럿(20px)과 같은 폭 — 텍스트를 광학 중앙에 두는 왼쪽 균형추
  monthLabelSpacer: { width: 20 },
  monthLabel: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary },

  weekRow: { flexDirection: 'row', marginBottom: spacing.xs },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSize.caption,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  sun: { color: colors.danger },
  sat: { color: colors.indigo },

  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  // 7칸 고정 — flex 대신 퍼센트를 써야 줄바꿈이 정확히 7개마다 일어난다
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  dayBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayBox: { borderWidth: 1.5, borderColor: colors.primary },
  selectedBox: { backgroundColor: colors.primary },
  dayText: { fontSize: fontSize.body, fontWeight: '600', color: colors.textPrimary },
  // 선택된 날은 배경이 colors.primary — 라이트/다크 모두 흰 글씨가 대비를 만족한다
  selectedText: { color: '#FFFFFF', fontWeight: '800' },
  disabledText: { color: colors.textTertiary, opacity: 0.4 },

  ymPanel: { flexDirection: 'row', gap: spacing.sm, height: YEAR_LIST_HEIGHT },
  yearList: { width: 96 },
  yearItem: { height: YEAR_ITEM_HEIGHT, justifyContent: 'center', alignItems: 'center', borderRadius: radius.sm },
  yearItemActive: { backgroundColor: colors.surfaceAlt },
  yearText: { fontSize: fontSize.body, color: colors.textSecondary },
  yearTextActive: { color: colors.textPrimary, fontWeight: '800' },
  monthGrid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignContent: 'flex-start' },
  monthCell: {
    width: '33.33%',
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthCellActive: {},
  monthCellText: { fontSize: fontSize.body, color: colors.textSecondary, fontWeight: '600' },
  monthCellTextActive: { color: colors.primary, fontWeight: '800' },

  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  actionBtn: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayText: { fontSize: fontSize.body, fontWeight: '800', color: colors.primary },
  cancelText: { fontSize: fontSize.body, fontWeight: '800', color: colors.textSecondary },
}));
