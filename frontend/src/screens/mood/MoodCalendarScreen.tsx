/**
 * 우리 무드 달력 — 두 사람의 지난 무드를 날짜별로 나란히 본다. 홈 무드 시트의 "지난 기분 보기"에서 들어온다.
 *
 * <p>칸마다 <b>왼쪽이 나, 오른쪽이 상대</b>의 그날 마지막 무드다. 칸을 누르면 아래에 그날 흐름
 * (몇 시에 무엇으로 바꿨는지·한마디)이 펼쳐진다. 무드는 "지금 상태"라 하루를 마무리한 기분이 그날을
 * 가장 잘 말해 준다 — 대표를 빈도로 고르지 않는 이유는 서버 MoodCalendarResponse 주석.
 *
 * <p>하루 기록 달력(JournalScreen)과 합치지 않은 이유: 그쪽은 <b>나만 보는</b> 기록이라 상대 무드를
 * 함께 그리면 "상대도 보나?"라는 의심이 비공개 원칙을 흐린다. 이쪽은 원래 둘이 보는 신호다.
 *
 * <p>무료는 최근 30일만 보인다(Feature.MOOD_CALENDAR_FULL). 잠긴 날은 서버가 아예 싣지 않고,
 * 화면은 그 경계를 안내 줄로 보여 준다 — 자동 조회라 업그레이드 시트를 먼저 띄우지 않는다.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/types';
import { MonthGrid } from '../../components/MonthGrid';
import { MaterialCommunityIcons } from '../../components/Icon';
import { moodApi } from '../../api/mood';
import { journalToday } from '../../api/journal';
import { journalDateTitle } from '../journal/JournalDayScreen';
import { useRelationStore } from '../../store/relationStore';
import { usePlanStore } from '../../store/planStore';
import type { MoodCalendar, MoodDay, MoodMark } from '../../types';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<HomeStackParamList, 'MoodCalendar'>;

const UPGRADE_MESSAGE = '지난 기분 전체는 PRO에서 볼 수 있어요. 무료는 최근 30일까지 보여요.';

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function dateOf(year: number, month: number, day: number): string {
  return `${monthKey(year, month)}-${String(day).padStart(2, '0')}`;
}

/** 칸 안의 작은 무드 — 우리 이모지면 그림, 아니면 유니코드 */
function MoodGlyph({ mark, size }: { mark: { emoji: string; imageUrl?: string | null }; size: number }) {
  if (mark.imageUrl) {
    return <Image source={{ uri: mark.imageUrl }} style={{ width: size + 2, height: size + 2 }} resizeMode="contain" />;
  }
  return <Text style={{ fontSize: size, lineHeight: size + 4 }}>{mark.emoji}</Text>;
}

export function MoodCalendarScreen(_: Props) {
  const today = journalToday(); // KST — 서버의 날짜 경계와 같다
  const [todayY, todayM, todayD] = today.split('-').map(Number);
  const partnerName = useRelationStore((s) => s.couple?.partner?.name) ?? '상대';
  const [year, setYear] = useState(todayY);
  const [month, setMonth] = useState(todayM);
  const [calendar, setCalendar] = useState<MoodCalendar | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<string | null>(today);
  const [day, setDay] = useState<MoodDay | null>(null);
  const [dayLoading, setDayLoading] = useState(false);

  const fetchMonth = useCallback(() => {
    let active = true;
    setLoadError(false);
    moodApi
      .calendar(monthKey(year, month))
      .then((res) => {
        if (active) setCalendar(res);
      })
      .catch(() => {
        if (active) setLoadError(true);
      });
    return () => {
      active = false;
    };
  }, [year, month]);
  // 홈에서 무드를 바꾸고 돌아오면 바로 보이도록 포커스마다 다시 읽는다
  useFocusEffect(fetchMonth);

  // 고른 날의 흐름 — 달을 넘겨도 고른 날은 유지한다(그 달에 없으면 아래 목록만 비켜 둔다)
  useFocusEffect(
    useCallback(() => {
      if (!selected) return undefined;
      let active = true;
      setDayLoading(true);
      moodApi
        .day(selected)
        .then((res) => {
          if (active) setDay(res);
        })
        .catch(() => {
          if (active) setDay(null);
        })
        .finally(() => {
          if (active) setDayLoading(false);
        });
      return () => {
        active = false;
      };
    }, [selected]),
  );

  const byDay = useMemo(() => {
    const map = new Map<number, { mine: MoodMark | null; partner: MoodMark | null }>();
    if (!calendar || calendar.month !== monthKey(year, month)) return map;
    for (const d of calendar.days) map.set(Number(d.date.slice(8, 10)), d);
    return map;
  }, [calendar, year, month]);

  const lockedBefore = calendar?.lockedBefore ?? null;
  const isLocked = (date: string) => lockedBefore !== null && date < lockedBefore;
  const monthStart = dateOf(year, month, 1);
  // 이 달에 잠긴 날이 하루라도 있는가 — 안내 줄을 띄울지
  const monthHasLocked = lockedBefore !== null && monthStart < lockedBefore;

  const isThisMonth = year === todayY && month === todayM;
  const isFutureMonth = year > todayY || (year === todayY && month > todayM);

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

  const onPressDay = (d: number) => {
    const date = dateOf(year, month, d);
    if (isLocked(date)) {
      usePlanStore.getState().showUpgrade(UPGRADE_MESSAGE);
      return;
    }
    setSelected(date);
  };

  const selectedInMonth = selected?.startsWith(monthKey(year, month)) ?? false;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.monthBar}>
          <TouchableOpacity onPress={() => changeMonth(-1)} hitSlop={12} accessibilityRole="button" accessibilityLabel="이전 달">
            <MaterialCommunityIcons name="chevron-left" size={28} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setYear(todayY);
              setMonth(todayM);
              setSelected(today);
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="이번 달로 이동"
          >
            <Text style={styles.monthTitle}>
              {year}년 {month}월
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => changeMonth(1)}
            hitSlop={12}
            disabled={isThisMonth || isFutureMonth}
            accessibilityRole="button"
            accessibilityLabel="다음 달"
            accessibilityState={{ disabled: isThisMonth || isFutureMonth }}
          >
            <MaterialCommunityIcons
              name="chevron-right"
              size={28}
              color={isThisMonth || isFutureMonth ? colors.textTertiary : colors.primary}
            />
          </TouchableOpacity>
        </View>

        {/* 칸의 왼쪽·오른쪽이 누구인지 — 색이 아니라 글자로 말한다(색만으로 구분하지 않는다) */}
        <View style={styles.legend}>
          <Text style={[styles.legendText, { color: colors.me }]}>왼쪽 나</Text>
          <Text style={styles.legendDot}>·</Text>
          <Text style={[styles.legendText, { color: colors.partner }]} numberOfLines={1}>
            오른쪽 {partnerName}
          </Text>
          <Text style={styles.legendHint}>그날 마지막 기분</Text>
        </View>

        {loadError ? (
          <TouchableOpacity
            onPress={() => {
              fetchMonth();
            }}
            style={styles.banner}
            accessibilityRole="button"
            accessibilityLabel="무드 다시 불러오기"
          >
            <Text style={styles.bannerText}>이번 달 무드를 불러오지 못했어요 — 눌러서 다시 시도</Text>
          </TouchableOpacity>
        ) : null}

        {monthHasLocked ? (
          <Pressable
            onPress={() => usePlanStore.getState().showUpgrade(UPGRADE_MESSAGE)}
            style={({ pressed }) => [styles.lockBanner, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="지난 기분 전체 보기 — PRO 안내"
          >
            <MaterialCommunityIcons name="lock-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.lockText}>무료는 최근 30일까지 보여요. 지난 기분 전체는 PRO에서</Text>
            <MaterialCommunityIcons name="chevron-right" size={18} color={colors.textTertiary} />
          </Pressable>
        ) : null}

        <View style={styles.card}>
          <MonthGrid
            year={year}
            month={month}
            selectedDay={selectedInMonth && selected ? Number(selected.slice(8, 10)) : null}
            todayDay={isThisMonth ? todayD : null}
            disableAfterDay={isThisMonth ? todayD : isFutureMonth ? 0 : null}
            onPressDay={onPressDay}
            dayLabel={(d) => {
              const date = dateOf(year, month, d);
              if (isLocked(date)) return `${month}월 ${d}일, 잠김`;
              const m = byDay.get(d);
              if (!m) return `${month}월 ${d}일, 무드 없음`;
              const mine = m.mine ? `나 ${m.mine.emoji}` : '나 없음';
              const partner = m.partner ? `${partnerName} ${m.partner.emoji}` : `${partnerName} 없음`;
              return `${month}월 ${d}일, ${mine}, ${partner}`;
            }}
            renderMark={(d) => {
              if (isLocked(dateOf(year, month, d))) {
                return <MaterialCommunityIcons name="lock-outline" size={11} color={colors.textTertiary} />;
              }
              const m = byDay.get(d);
              if (!m) return null;
              return (
                <View style={styles.markPair}>
                  <View style={styles.markSlot}>{m.mine ? <MoodGlyph mark={m.mine} size={12} /> : null}</View>
                  <View style={styles.markSlot}>{m.partner ? <MoodGlyph mark={m.partner} size={12} /> : null}</View>
                </View>
              );
            }}
          />
        </View>

        {selected && selectedInMonth ? (
          <View style={styles.dayBox}>
            <Text style={styles.dayTitle}>{journalDateTitle(selected)}</Text>
            {dayLoading && day?.date !== selected ? null : day && day.date === selected && day.entries.length > 0 ? (
              day.entries.map((e, i) => (
                <View key={`${e.time}-${i}`} style={styles.entry}>
                  <Text style={styles.entryTime}>{e.time}</Text>
                  <Text style={[styles.entryWho, { color: e.mine ? colors.me : colors.partner }]} numberOfLines={1}>
                    {e.mine ? '나' : partnerName}
                  </Text>
                  <MoodGlyph mark={e} size={20} />
                  {e.message ? (
                    <Text style={styles.entryMessage} numberOfLines={2}>
                      {e.message}
                    </Text>
                  ) : (
                    <View style={styles.flex} />
                  )}
                </View>
              ))
            ) : (
              <Text style={styles.empty}>이날은 남긴 기분이 없어요.</Text>
            )}
          </View>
        ) : null}

        {calendar && calendar.month === monthKey(year, month) && calendar.days.length === 0 && !monthHasLocked ? (
          <Text style={styles.empty}>이 달에는 아직 남긴 기분이 없어요. 홈에서 지금 기분을 골라 보세요.</Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingBottom: spacing.xl },
  flex: { flex: 1 },
  monthBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  monthTitle: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  legend: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  legendText: { fontSize: fontSize.caption, fontWeight: '700', flexShrink: 1 },
  legendDot: { fontSize: fontSize.caption, color: colors.textTertiary },
  legendHint: { marginLeft: 'auto', fontSize: fontSize.caption, color: colors.textTertiary },
  banner: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.sm },
  bannerText: { color: colors.textSecondary, fontSize: fontSize.caption, textAlign: 'center' },
  lockBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 44,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  lockText: { flex: 1, color: colors.textSecondary, fontSize: fontSize.caption },
  pressed: { opacity: 0.7 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.sm },
  markPair: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  markSlot: { width: 16, alignItems: 'center' },
  dayBox: { marginTop: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.xs },
  dayTitle: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.xxs },
  entry: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 36 },
  entryTime: { width: 44, fontSize: fontSize.caption, color: colors.textTertiary, fontVariant: ['tabular-nums'] },
  entryWho: { width: 56, fontSize: fontSize.caption, fontWeight: '700' },
  entryMessage: { flex: 1, fontSize: fontSize.body, color: colors.textPrimary },
  empty: { color: colors.textSecondary, fontSize: fontSize.body, textAlign: 'center', marginTop: spacing.md },
}));
