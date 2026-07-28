/**
 * 커플 캘린더 — 기념일 외 일정(생일·데이트 약속 등) 공유.
 * 월 그리드(일정 있는 날 점 표시) + 일정 목록(D-day 배지) + 추가/수정 모달.
 * 매일 아침(KST) 당일 일정은 서버가 커플 양쪽에 푸시한다.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Alert } from '../../utils/alert';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/types';
import { Card } from '../../components/Card';
import { TextField } from '../../components/TextField';
import { DateField } from '../../components/DateField';
import { EmptyState } from '../../components/EmptyState';
import { calendarApi } from '../../api/calendar';
import { toast } from '../../store/toastStore';
import { getErrorMessage } from '../../utils/error';
import type { CalendarEventType, CoupleCalendarEvent } from '../../types';
import { colors, fontSize, radius, spacing } from '../../constants/theme';

type Props = NativeStackScreenProps<HomeStackParamList, 'CoupleCalendar'>;

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const TYPE_META: Record<CalendarEventType, { label: string; color: string }> = {
  ANNIVERSARY: { label: '기념일', color: colors.violet },
  BIRTHDAY: { label: '생일', color: colors.coral },
  DATE: { label: '데이트', color: colors.indigo },
  ETC: { label: '기타', color: colors.textSecondary },
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function ddayLabel(dday: number): string {
  if (dday === 0) return 'D-day';
  if (dday > 0) return `D-${dday}`;
  return `${-dday}일 지남`;
}

interface FormState {
  id: number | null;
  title: string;
  date: string;
  eventType: CalendarEventType;
  repeatYearly: boolean;
  memo: string;
}

const EMPTY_FORM: FormState = {
  id: null,
  title: '',
  date: '',
  eventType: 'DATE',
  repeatYearly: false,
  memo: '',
};

export function CoupleCalendarScreen(_props: Props) {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1); // 1~12
  const [events, setEvents] = useState<CoupleCalendarEvent[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (y: number, m: number) => {
    try {
      setEvents(await calendarApi.month(y, m));
    } catch (e) {
      // 커플 미연결(RELATION_NOT_FOUND)은 빈 상태로 안내
      setEvents([]);
    }
  }, []);

  useFocusEffect(useCallback(() => void load(year, month), [load, year, month]));

  const moveMonth = (delta: number) => {
    let y = year;
    let m = month + delta;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setYear(y);
    setMonth(m);
    setSelectedDate(null);
  };

  /** 날짜(YYYY-MM-DD) → 그 날의 일정들 */
  const byDate = useMemo(() => {
    const map = new Map<string, CoupleCalendarEvent[]>();
    events.forEach((e) => {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    });
    return map;
  }, [events]);

  /** 월 그리드 셀 — 앞쪽 공백 + 1..말일 */
  const cells = useMemo(() => {
    const first = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0).getDate();
    const blanks = first.getDay();
    const arr: (number | null)[] = Array(blanks).fill(null);
    for (let d = 1; d <= lastDay; d++) arr.push(d);
    return arr;
  }, [year, month]);

  const listEvents = selectedDate ? byDate.get(selectedDate) ?? [] : events;

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, date: selectedDate ?? todayStr });
  };

  const openEdit = (event: CoupleCalendarEvent) => {
    setForm({
      id: event.id,
      title: event.title,
      date: event.eventDate.slice(0, 10),
      eventType: event.eventType,
      repeatYearly: event.repeatYearly,
      memo: event.memo ?? '',
    });
  };

  const onSave = async () => {
    if (!form) return;
    if (!form.title.trim()) {
      toast.error('제목을 입력해주세요.');
      return;
    }
    if (!form.date) {
      toast.error('날짜를 선택해주세요.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        eventDate: form.date,
        eventType: form.eventType,
        repeatYearly: form.repeatYearly,
        memo: form.memo.trim() || undefined,
      };
      if (form.id == null) {
        await calendarApi.create(payload);
      } else {
        await calendarApi.update(form.id, payload);
      }
      setForm(null);
      await load(year, month);
    } catch (e) {
      toast.error(getErrorMessage(e, '일정을 저장하지 못했어요.'));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = () => {
    if (!form || form.id == null) return;
    const id = form.id;
    Alert.alert('일정 삭제', '이 일정을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await calendarApi.remove(id);
            setForm(null);
            await load(year, month);
          } catch (e) {
            toast.error(getErrorMessage(e, '일정을 삭제하지 못했어요.'));
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* 월 이동 헤더 */}
        <View style={styles.monthBar}>
          <Pressable style={styles.monthBtn} onPress={() => moveMonth(-1)} hitSlop={8}>
            <Text style={styles.monthBtnText}>‹</Text>
          </Pressable>
          <Text style={styles.monthTitle}>{year}년 {month}월</Text>
          <Pressable style={styles.monthBtn} onPress={() => moveMonth(1)} hitSlop={8}>
            <Text style={styles.monthBtnText}>›</Text>
          </Pressable>
        </View>

        {/* 요일 + 월 그리드 */}
        <Card elevation="md" style={styles.calendarCard}>
          <View style={styles.weekRow}>
            {WEEKDAYS.map((w, i) => (
              <Text
                key={w}
                style={[styles.weekday, i === 0 && { color: colors.coral }]}
              >
                {w}
              </Text>
            ))}
          </View>
          <View style={styles.grid}>
            {cells.map((day, idx) => {
              if (day === null) return <View key={`b${idx}`} style={styles.cell} />;
              const dateStr = `${year}-${pad2(month)}-${pad2(day)}`;
              const dayEvents = byDate.get(dateStr) ?? [];
              const isToday = dateStr === todayStr;
              const isSelected = dateStr === selectedDate;
              return (
                <Pressable
                  key={dateStr}
                  style={[styles.cell, isSelected && styles.cellSelected]}
                  onPress={() => setSelectedDate(isSelected ? null : dateStr)}
                >
                  <View style={[styles.dayWrap, isToday && styles.todayWrap]}>
                    <Text style={[styles.dayText, isToday && styles.todayText]}>{day}</Text>
                  </View>
                  <View style={styles.dotRow}>
                    {dayEvents.slice(0, 3).map((e) => (
                      <View
                        key={e.id}
                        style={[styles.dot, { backgroundColor: TYPE_META[e.eventType].color }]}
                      />
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Card>

        {/* 일정 목록 */}
        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>
            {selectedDate ? `${Number(selectedDate.slice(8, 10))}일 일정` : '이번 달 일정'}
          </Text>
          {selectedDate ? (
            <Pressable onPress={() => setSelectedDate(null)} hitSlop={8}>
              <Text style={styles.listClear}>전체 보기</Text>
            </Pressable>
          ) : null}
        </View>

        {listEvents.length === 0 ? (
          <EmptyState
            icon="calendar-heart"
            title="일정이 없어요"
            description="생일, 데이트 약속, 기념일을 등록하면 당일 아침에 둘 다 알림을 받아요."
          />
        ) : (
          listEvents.map((event) => {
            const meta = TYPE_META[event.eventType];
            return (
              <TouchableOpacity key={`${event.id}-${event.date}`} activeOpacity={0.8} onPress={() => openEdit(event)}>
                <Card elevation="sm" style={styles.eventCard}>
                  <View style={[styles.typeBar, { backgroundColor: meta.color }]} />
                  <View style={styles.eventBody}>
                    <View style={styles.eventTitleRow}>
                      <Text style={styles.eventTitle} numberOfLines={1}>
                        {event.title}
                        {event.repeatYearly ? ' ↻' : ''}
                      </Text>
                      <View
                        style={[
                          styles.ddayBadge,
                          event.dday === 0 && { backgroundColor: colors.coral },
                        ]}
                      >
                        <Text
                          style={[styles.ddayText, event.dday === 0 && { color: colors.white }]}
                        >
                          {ddayLabel(event.dday)}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.eventMeta}>
                      {Number(event.date.slice(5, 7))}월 {Number(event.date.slice(8, 10))}일 ·{' '}
                      {meta.label}
                      {event.memo ? ` · ${event.memo}` : ''}
                    </Text>
                  </View>
                </Card>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* 추가 버튼 */}
      <TouchableOpacity style={styles.addBtn} activeOpacity={0.85} onPress={openCreate}>
        <Text style={styles.addBtnText}>＋ 일정 추가</Text>
      </TouchableOpacity>

      {/* 추가/수정 모달 */}
      <Modal visible={form !== null} transparent animationType="fade" onRequestClose={() => setForm(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setForm(null)}>
          <Pressable>
            <Card elevation="md" style={styles.modalCard}>
              <Text style={styles.modalTitle}>{form?.id == null ? '일정 추가' : '일정 수정'}</Text>

              <TextField
                label="제목"
                value={form?.title ?? ''}
                onChangeText={(t) => setForm((f) => (f ? { ...f, title: t } : f))}
                placeholder="예: 우리 200일, 수인 생일"
                maxLength={100}
              />
              <DateField
                label="날짜"
                value={form?.date ?? ''}
                onChange={(d) => setForm((f) => (f ? { ...f, date: d } : f))}
              />

              <Text style={styles.fieldLabel}>종류</Text>
              <View style={styles.typeRow}>
                {(Object.keys(TYPE_META) as CalendarEventType[]).map((t) => {
                  const active = form?.eventType === t;
                  return (
                    <Pressable
                      key={t}
                      style={[
                        styles.typeChip,
                        active && { borderColor: TYPE_META[t].color, backgroundColor: colors.surfaceAlt },
                      ]}
                      onPress={() => setForm((f) => (f ? { ...f, eventType: t } : f))}
                    >
                      <View style={[styles.dot, { backgroundColor: TYPE_META[t].color }]} />
                      <Text style={[styles.typeChipText, active && { color: colors.textPrimary, fontWeight: '700' }]}>
                        {TYPE_META[t].label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.repeatRow}>
                <View style={styles.flex}>
                  <Text style={styles.fieldLabel}>매년 반복</Text>
                  <Text style={styles.repeatHint}>생일·기념일처럼 해마다 돌아오는 날</Text>
                </View>
                <Switch
                  value={form?.repeatYearly ?? false}
                  onValueChange={(v) => setForm((f) => (f ? { ...f, repeatYearly: v } : f))}
                  trackColor={{ true: colors.coral }}
                />
              </View>

              <TextField
                label="메모 (선택)"
                value={form?.memo ?? ''}
                onChangeText={(t) => setForm((f) => (f ? { ...f, memo: t } : f))}
                placeholder="예: 레스토랑 예약해두기"
                maxLength={500}
              />

              <View style={styles.modalActions}>
                {form?.id != null ? (
                  <TouchableOpacity style={styles.modalDelete} onPress={onDelete}>
                    <Text style={styles.modalDeleteText}>삭제</Text>
                  </TouchableOpacity>
                ) : null}
                <View style={styles.flex} />
                <TouchableOpacity style={styles.modalCancel} onPress={() => setForm(null)}>
                  <Text style={styles.modalCancelText}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalSave} onPress={onSave} disabled={saving}>
                  <Text style={styles.modalSaveText}>{saving ? '저장 중…' : '저장'}</Text>
                </TouchableOpacity>
              </View>
            </Card>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const CELL = `${100 / 7}%` as const;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: 96 },
  flex: { flex: 1 },

  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  monthBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  monthBtnText: { fontSize: 22, color: colors.textPrimary, fontWeight: '700', lineHeight: 26 },
  monthTitle: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.ink },

  calendarCard: { paddingVertical: spacing.md, paddingHorizontal: spacing.sm },
  weekRow: { flexDirection: 'row', marginBottom: spacing.xs },
  weekday: {
    width: CELL,
    textAlign: 'center',
    fontSize: fontSize.caption,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: CELL, alignItems: 'center', paddingVertical: 4, borderRadius: radius.sm },
  cellSelected: { backgroundColor: colors.surfaceAlt },
  dayWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayWrap: { backgroundColor: colors.primary },
  dayText: { fontSize: fontSize.body, color: colors.textPrimary },
  todayText: { color: colors.white, fontWeight: '800' },
  dotRow: { flexDirection: 'row', gap: 3, height: 6, marginTop: 2 },
  dot: { width: 6, height: 6, borderRadius: 3 },

  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  listTitle: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.ink },
  listClear: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700' },

  eventCard: { flexDirection: 'row', alignItems: 'stretch', marginBottom: spacing.sm, padding: 0, overflow: 'hidden' },
  typeBar: { width: 4 },
  eventBody: { flex: 1, padding: spacing.md },
  eventTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  eventTitle: { flex: 1, fontSize: fontSize.body, fontWeight: '700', color: colors.textPrimary },
  ddayBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  ddayText: { fontSize: fontSize.caption, fontWeight: '800', color: colors.textPrimary },
  eventMeta: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 2 },

  addBtn: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: { color: colors.white, fontSize: fontSize.body, fontWeight: '800' },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: { gap: spacing.xs },
  modalTitle: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.ink, marginBottom: spacing.sm },
  fieldLabel: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    fontWeight: '700',
    marginBottom: spacing.xs,
    marginLeft: spacing.xs,
  },
  typeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md, flexWrap: 'wrap' },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  typeChipText: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '600' },
  repeatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    marginTop: spacing.xs,
  },
  repeatHint: { fontSize: fontSize.caption, color: colors.textSecondary, marginLeft: spacing.xs },

  modalActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  modalDelete: { paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  modalDeleteText: { color: colors.danger, fontWeight: '700' },
  modalCancel: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  modalCancelText: { color: colors.textSecondary, fontWeight: '700' },
  modalSave: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
  },
  modalSaveText: { color: colors.white, fontWeight: '800' },
});
