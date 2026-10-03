/**
 * 나의 하루 — 나만의 하루 기록의 월 달력 + 목록. MY 의 "나의 하루"에서 들어온다.
 *
 * <p>MY 안에 두는 이유: "우리" 탭이나 커플 캘린더에 두면, 거기 그리기만 해도 "상대도 보나?"라는
 * 의심이 비공개 원칙을 화면에서 흐린다(docs/PERSONAL_JOURNAL_ANALYSIS_2026-10-02.md §4-2).
 * 칸에는 그날 기분, 사진이 있으면 작은 점. 칸이나 행을 누르면 그날 페이지가 열린다.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Image, Pressable, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/types';
import { MonthGrid } from '../../components/MonthGrid';
import { Chip } from '../../components/Chip';
import { SettingsGroup, SettingsInset, SettingsRow } from '../../components/SettingsList';
import { useAuthStore } from '../../store/authStore';
import { toast } from '../../store/toastStore';
import { getErrorMessage } from '../../utils/error';
import { MaterialCommunityIcons } from '../../components/Icon';
import { journalApi, journalToday, type JournalEntry } from '../../api/journal';
import { journalDateTitle } from './JournalDayScreen';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<HomeStackParamList, 'Journal'>;

/** 리마인드 시각 칩 — 하루를 돌아보는 밤 시간대만. 서버는 어떤 분이든 받는다(식사 알림 화면과 같은 방식) */
const REMINDER_TIMES = ['21:00', '21:30', '22:00', '22:30', '23:00'];
const DEFAULT_REMINDER = '22:00';

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function dateOf(year: number, month: number, day: number): string {
  return `${monthKey(year, month)}-${String(day).padStart(2, '0')}`;
}

export function JournalScreen({ navigation }: Props) {
  const today = journalToday();
  const [todayY, todayM, todayD] = today.split('-').map(Number);
  const [year, setYear] = useState(todayY);
  const [month, setMonth] = useState(todayM);
  const [entries, setEntries] = useState<JournalEntry[]>([]);

  /*
   * 매일 알림(V125, 옵트인) — 고른 시각에 그날 기록이 없을 때만 온다. 문구는 고정이고 기록 내용은 실리지 않는다
   * (서버 JournalReminderNotifier). 리마인드 카테고리나 푸시 전체를 꺼 두면 오지 않으니 그때는 그렇게 알린다.
   */
  const user = useAuthStore((s) => s.user);
  const pushOff = user?.notificationsEnabled === false || user?.notifyReminder === false;
  const [reminder, setReminder] = useState<string | null>(null);
  const [reminderBusy, setReminderBusy] = useState(false);
  useEffect(() => {
    journalApi
      .reminder()
      .then((r) => setReminder(r ? r.reminderTime.slice(0, 5) : null))
      .catch(() => {});
  }, []);
  const changeReminder = async (next: string | null) => {
    setReminderBusy(true);
    try {
      if (next) {
        await journalApi.setReminder(next);
      } else {
        await journalApi.removeReminder();
      }
      setReminder(next);
    } catch (e) {
      toast.error(getErrorMessage(e, '알림을 바꾸지 못했어요.'));
    } finally {
      setReminderBusy(false);
    }
  };
  const [loadError, setLoadError] = useState(false);

  const fetchMonth = useCallback(() => {
    let active = true;
    setLoadError(false);
    journalApi
      .month(monthKey(year, month))
      .then((list) => {
        if (active) setEntries(list);
      })
      .catch(() => {
        if (active) setLoadError(true);
      });
    return () => {
      active = false;
    };
  }, [year, month]);
  // 그날 페이지에서 쓰고 돌아오면 바로 보이도록 포커스마다 다시 읽는다
  useFocusEffect(fetchMonth);

  const byDay = useMemo(() => {
    const map = new Map<number, JournalEntry>();
    for (const e of entries) map.set(Number(e.date.slice(8, 10)), e);
    return map;
  }, [entries]);

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

  const openDay = (date: string) => navigation.navigate('JournalDay', { date, source: 'JOURNAL_LIST' });
  // 목록은 최신 날짜가 위 — 일기를 다시 읽는 순서다
  const list = useMemo(() => [...entries].sort((a, b) => b.date.localeCompare(a.date)), [entries]);

  const header = (
    <View>
      <View style={styles.privateRow}>
        <MaterialCommunityIcons name="lock-outline" size={16} color={colors.textSecondary} />
        <Text style={styles.privateText}>나만 보는 기록이에요. 연결이 끊겨도 남아요.</Text>
      </View>

      <SettingsGroup
        style={styles.reminderGroup}
        footer={
          pushOff
            ? '리마인드 알림이 꺼져 있어요. 설정 > 알림에서 켜면 와요.'
            : '그날 기록이 없을 때만 알려요. 알림에는 기록 내용이 실리지 않아요.'
        }
      >
        <View>
          <SettingsRow
            title="매일 알림"
            value={reminder ?? undefined}
            muted={pushOff}
            switchValue={!!reminder}
            onSwitch={(on) => void changeReminder(on ? DEFAULT_REMINDER : null)}
            disabled={reminderBusy}
          />
          {reminder ? (
            <SettingsInset style={styles.reminderTimes}>
              {REMINDER_TIMES.map((t) => (
                <Chip key={t} label={t} selected={reminder === t} onPress={() => void changeReminder(t)} />
              ))}
            </SettingsInset>
          ) : null}
        </View>
      </SettingsGroup>

      <View style={styles.monthBar}>
        <TouchableOpacity onPress={() => changeMonth(-1)} hitSlop={12} accessibilityRole="button" accessibilityLabel="이전 달">
          <MaterialCommunityIcons name="chevron-left" size={28} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            setYear(todayY);
            setMonth(todayM);
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

      {loadError ? (
        <TouchableOpacity
          onPress={() => {
            fetchMonth();
          }}
          style={styles.errorBanner}
          accessibilityRole="button"
          accessibilityLabel="기록 다시 불러오기"
        >
          <Text style={styles.errorText}>이번 달 기록을 불러오지 못했어요 — 눌러서 다시 시도</Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.card}>
        <MonthGrid
          year={year}
          month={month}
          todayDay={isThisMonth ? todayD : null}
          disableAfterDay={isThisMonth ? todayD : isFutureMonth ? 0 : null}
          onPressDay={(day) => openDay(dateOf(year, month, day))}
          dayLabel={(day) => {
            const e = byDay.get(day);
            return e ? `${month}월 ${day}일, 기록 있음${e.moodEmoji ? ` ${e.moodEmoji}` : ''}` : `${month}월 ${day}일, 쓰기`;
          }}
          renderMark={(day) => {
            const e = byDay.get(day);
            if (!e) return null;
            if (e.moodEmoji) return <Text style={styles.markEmoji}>{e.moodEmoji}</Text>;
            return <View style={styles.markDot} />;
          }}
        />
      </View>

      {isThisMonth && !byDay.has(todayD) ? (
        <Pressable
          onPress={() => openDay(today)}
          style={({ pressed }) => [styles.writeToday, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="오늘 하루 남기기"
        >
          <MaterialCommunityIcons name="pencil-outline" size={18} color={colors.primary} />
          <Text style={styles.writeTodayText}>오늘 하루 남기기</Text>
        </Pressable>
      ) : null}

      <Text style={styles.listTitle}>{list.length > 0 ? `${month}월에 남긴 날 ${list.length}일` : ''}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={list}
        keyExtractor={(e) => e.date}
        ListHeaderComponent={header}
        contentContainerStyle={styles.container}
        ListEmptyComponent={
          loadError ? null : <Text style={styles.empty}>이 달에는 아직 남긴 기록이 없어요.</Text>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => openDay(item.date)}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`${journalDateTitle(item.date)} 기록 열기`}
          >
            <Text style={styles.rowMood}>{item.moodEmoji ?? '·'}</Text>
            <View style={styles.rowText}>
              <Text style={styles.rowDate}>{journalDateTitle(item.date)}</Text>
              {item.body ? (
                <Text style={styles.rowBody} numberOfLines={2}>
                  {item.body}
                </Text>
              ) : null}
            </View>
            {item.photoUrl ? <Image source={{ uri: item.photoUrl }} style={styles.rowThumb} /> : null}
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingBottom: spacing.xl },
  privateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  privateText: { flex: 1, color: colors.textSecondary, fontSize: fontSize.caption },
  reminderGroup: { marginBottom: spacing.md },
  reminderTimes: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  monthBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  monthTitle: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  errorBanner: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.sm },
  errorText: { color: colors.textSecondary, fontSize: fontSize.caption, textAlign: 'center' },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.sm },
  markEmoji: { fontSize: 16, lineHeight: 20 },
  markDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary },
  writeToday: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 48,
    marginTop: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
  },
  writeTodayText: { color: colors.primary, fontSize: fontSize.body, fontWeight: '700' },
  pressed: { opacity: 0.7 },
  listTitle: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textSecondary, marginTop: spacing.lg, marginBottom: spacing.xs },
  empty: { color: colors.textSecondary, fontSize: fontSize.body, textAlign: 'center', marginTop: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    marginBottom: spacing.xs,
  },
  rowMood: { fontSize: 24, width: 32, textAlign: 'center' },
  rowText: { flex: 1, minWidth: 0 },
  rowDate: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textSecondary },
  rowBody: { fontSize: fontSize.body, color: colors.textPrimary, marginTop: 2 },
  rowThumb: { width: 48, height: 48, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
}));
