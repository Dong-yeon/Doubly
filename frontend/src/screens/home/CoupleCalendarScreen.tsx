/**
 * 커플 캘린더 — 기념일 외 일정(생일·데이트 약속 등) 공유.
 * 월 그리드(일정 있는 날 점 표시) + 일정 목록(D-day 배지) + 추가/수정 모달.
 * 매일 아침(KST) 당일 일정은 서버가 커플 양쪽에 푸시한다.
 *
 * <p>여행(PLAN.md Trip)이 럽슐랭(장소) 탭에서 홈 스택으로 이관되면서, 이 화면이 여행의
 * <b>상시 진입점</b>이 됐다 — 그리드에 여행 기간을 띠로 잇고, 그리드 아래 '우리 여행'
 * 섹션에서 상세·전체 목록·만들기로 들어간다. (홈의 D-day 카드는 여행이 있는 기간에만
 * 뜨는 조건부 표면이라, 여행이 하나도 없을 때의 생성 진입로는 여기뿐이다.)
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
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
import { IconButton } from '../../components/IconButton';
import { calendarApi } from '../../api/calendar';
import { tripApi } from '../../api/trip';
import { tripStatusLabel } from '../trip/TripListScreen';
import { toast } from '../../store/toastStore';
import { getErrorMessage } from '../../utils/error';
import type { CalendarEventType, CoupleCalendarEvent, Trip } from '../../types';
import { confirmDiscard } from '../../utils/discardGuard';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';
import { onColor } from '../../theme/onColor';
import { layout } from '../../theme/layout';

type Props = NativeStackScreenProps<HomeStackParamList, 'CoupleCalendar'>;

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 렌더 시점에 현재 팔레트를 읽는다 — 객체로 굳히면 테마 전환을 못 따라온다 */
const typeMeta = (type: CalendarEventType): { label: string; color: string } =>
  ({
    ANNIVERSARY: { label: '기념일', color: colors.violet },
    BIRTHDAY: { label: '생일', color: colors.coral },
    DATE: { label: '데이트', color: colors.indigo },
    ETC: { label: '기타', color: colors.textSecondary },
  })[type];

/** 라벨만 필요한 곳 — 색과 달리 테마와 무관하다 */
const TYPE_LABEL: Record<CalendarEventType, string> = {
  ANNIVERSARY: '기념일',
  BIRTHDAY: '생일',
  DATE: '데이트',
  ETC: '기타',
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** ongoing — 기간 일정이 시작은 지났고 아직 안 끝난 상태. "N일 지남"으로 읽히면 안 된다 */
function ddayLabel(dday: number, ongoing = false): string {
  if (ongoing) return '진행 중';
  if (dday === 0) return 'D-day';
  if (dday > 0) return `D-${dday}`;
  return `${-dday}일 지남`;
}

interface FormState {
  id: number | null;
  title: string;
  date: string;
  /** 기간 일정의 종료일 — '' 이면 하루 일정. 반복 일정과 함께 쓸 수 없다(백엔드 검증과 동일) */
  endDate: string;
  eventType: CalendarEventType;
  repeatYearly: boolean;
  memo: string;
}

const EMPTY_FORM: FormState = {
  id: null,
  title: '',
  date: '',
  endDate: '',
  eventType: 'DATE',
  repeatYearly: false,
  memo: '',
};

export function CoupleCalendarScreen({ navigation }: Props) {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1); // 1~12
  const [events, setEvents] = useState<CoupleCalendarEvent[]>([]);
  // 여행 전체 목록 — 월과 무관하게 한 번 받고, 그리드 띠·'우리 여행' 섹션은 보이는 달로 거른다
  const [trips, setTrips] = useState<Trip[]>([]);
  /*
   * 여행을 <b>한 번이라도 받아봤는지</b>. 첫 응답 전(=아직 모름)과 "정말 없음"을 구분한다 —
   * 없으면 화면에 들어올 때마다 '여행이 없어요 · 만들기' CTA 가 먼저 깜빡이고, 리포커스 때
   * 네트워크가 한 번 흔들리면 있던 여행이 통째로 사라진 채 만들기를 권한다(중복 생성 유도).
   * TripListScreen 이 같은 이유로 "실패해도 목록은 비우지 않는다"를 지킨다.
   */
  const [tripsLoaded, setTripsLoaded] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

  /*
   * 월을 빠르게 넘기면 먼저 보낸 요청이 나중에 응답할 수 있다 — 응답 순서가
   * 보장되지 않아, 늦게 도착한 "옛 달" 응답이 이미 넘어간 화면의 events 를
   * 덮어써 헤더(year/month)와 표시되는 일정이 어긋났다(QA_CHECKLIST.md P2-14).
   * 매 호출마다 토큰을 발급하고, 응답 시점에 "가장 최근 호출인지"를 확인해
   * 아니면 버린다. DietCalendarScreen 의 `active` 플래그와 같은 목적, 다만
   * 여기는 콜백이 (y,m) 인자를 받아 재사용되므로 ref 카운터로 구현한다.
   */
  const latestRequestRef = useRef(0);
  const load = useCallback(async (y: number, m: number) => {
    const requestId = ++latestRequestRef.current;
    try {
      const data = await calendarApi.month(y, m);
      if (latestRequestRef.current !== requestId) return;
      setEvents(data);
    } catch (e) {
      if (latestRequestRef.current !== requestId) return;
      // 커플 미연결(RELATION_NOT_FOUND)은 빈 상태로 안내
      setEvents([]);
    }
  }, []);

  useFocusEffect(useCallback(() => void load(year, month), [load, year, month]));

  // 여행은 월 이동과 무관하게 전체를 받는다.
  // 성공했을 때만 목록을 갈아끼운다 — 실패(일시적 네트워크 오류 등)면 직전 목록을 그대로 둔다.
  // 커플 미연결(RELATION_NOT_FOUND)도 실패로 들어오지만, 그 경우 애초에 받아둔 목록이 없어
  // 빈 상태 그대로다(아래 tripsLoaded 로 '아직 모름'과 구분해 CTA 를 늦춘다).
  useFocusEffect(
    useCallback(() => {
      tripApi
        .list()
        .then((list) => {
          setTrips(list);
          setTripsLoaded(true);
        })
        .catch(() => {});
    }, []),
  );

  const moveMonth = (delta: number) => {
    let y = year;
    let m = month + delta;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setYear(y);
    setMonth(m);
    setSelectedDate(null);
  };

  /** 날짜(YYYY-MM-DD) → 그 날의 일정들 — 기간 일정은 걸치는 모든 날에 점이 찍히게 편다 */
  const byDate = useMemo(() => {
    const map = new Map<string, CoupleCalendarEvent[]>();
    const push = (key: string, e: CoupleCalendarEvent) => {
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    };
    events.forEach((e) => {
      const end = e.endDate && e.endDate > e.date ? e.endDate : e.date;
      // 문자열 비교로 하루씩 전진 — 보이는 달 밖의 키는 그리드가 조회하지 않아 그대로 둬도 된다.
      // guard 는 데이터가 깨져도 무한 루프가 되지 않게 하는 안전핀(400일 넘는 기간은 거기서 끊는다).
      const cur = new Date(`${e.date}T00:00:00`);
      for (let guard = 0; guard < 400; guard++) {
        const key = `${cur.getFullYear()}-${pad2(cur.getMonth() + 1)}-${pad2(cur.getDate())}`;
        if (key > end) break;
        push(key, e);
        cur.setDate(cur.getDate() + 1);
      }
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

  /** 보이는 달과 겹치는 여행들 — 그리드 틴트와 '우리 여행' 섹션이 함께 쓴다 */
  const monthTrips = useMemo(() => {
    const monthStart = `${year}-${pad2(month)}-01`;
    const monthEnd = `${year}-${pad2(month)}-${pad2(new Date(year, month, 0).getDate())}`;
    return trips.filter((t) => t.startDate <= monthEnd && t.endDate >= monthStart);
  }, [trips, year, month]);

  /** 여행 기간에 덮이는 날짜(YYYY-MM-DD) 집합 — 셀마다 여행 배열을 훑지 않게 미리 편다 */
  const tripDays = useMemo(() => {
    const set = new Set<string>();
    const lastDay = new Date(year, month, 0).getDate();
    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${year}-${pad2(month)}-${pad2(d)}`;
      if (monthTrips.some((t) => t.startDate <= dateStr && dateStr <= t.endDate)) set.add(dateStr);
    }
    return set;
  }, [monthTrips, year, month]);

  // 날짜를 고르면 그 날을 덮는 여행만, 아니면 이번 달과 겹치는 여행 전부
  const listTrips = selectedDate
    ? monthTrips.filter((t) => t.startDate <= selectedDate && selectedDate <= t.endDate)
    : monthTrips;

  /*
   * 모달을 연 시점의 폼 스냅샷 — 백드롭으로 닫을 때 "달라진 게 있는지"를 판단한다.
   * 수정 모달은 열자마자 값이 차 있으므로, 단순히 "비어있지 않음"으로는
   * 편집 여부를 알 수 없다.
   */
  const formInitialRef = useRef('');

  const openCreate = () => {
    const initial = { ...EMPTY_FORM, date: selectedDate ?? todayStr };
    formInitialRef.current = JSON.stringify(initial);
    setForm(initial);
  };

  const openEdit = (event: CoupleCalendarEvent) => {
    const initial = {
      id: event.id,
      title: event.title,
      date: event.eventDate.slice(0, 10),
      endDate: event.endDate ? event.endDate.slice(0, 10) : '',
      eventType: event.eventType,
      repeatYearly: event.repeatYearly,
      memo: event.memo ?? '',
    };
    formInitialRef.current = JSON.stringify(initial);
    setForm(initial);
  };

  // 백드롭·Android 백 공용 — 입력이 달라졌으면 확인 후 닫는다 (취소 버튼은 바로 닫힘)
  const closeForm = () =>
    confirmDiscard(form != null && JSON.stringify(form) !== formInitialRef.current, () =>
      setForm(null),
    );

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
    // DateField 의 min 이 이미 막지만, 시작일을 나중에 옮기는 경로까지 이중으로 지킨다
    if (form.endDate && form.endDate < form.date) {
      toast.error('종료일은 시작일보다 빠를 수 없어요.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        eventDate: form.date,
        // 반복 일정은 기간을 갖지 않는다 — UI 가 이미 막지만 페이로드에서도 한 번 더 벗긴다
        endDate: !form.repeatYearly && form.endDate ? form.endDate : undefined,
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
              // 여행 기간은 점(하루 단위 일정)이 아니라 셀 아래 액센트 바로 잇는다 — 연속된 날이
              // 하나의 띠로 보인다. 배경 틴트로 하면 선택 하이라이트(surfaceAlt)와 명도가 겹쳐
              // 어느 날을 골랐는지 안 보이고, 다크에서는 틴트 자체도 배경과 1.08:1 로 묻힌다.
              const inTrip = tripDays.has(dateStr);
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
                        style={[styles.dot, { backgroundColor: typeMeta(e.eventType).color }]}
                      />
                    ))}
                  </View>
                  {/* 여행 기간 띠 — 셀 폭을 꽉 채워 연속된 날끼리 이어져 보인다 */}
                  <View style={[styles.tripBar, inTrip && styles.tripBarOn]} />
                </Pressable>
              );
            })}
          </View>
        </Card>

        {/* 우리 여행 — 여행의 상시 진입점 (파일 상단 주석 참고). 목록·상세는 홈 스택의 Trip* 화면 */}
        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>
            {selectedDate ? `${Number(selectedDate.slice(8, 10))}일 여행` : '우리 여행'}
          </Text>
          {/* 아래 일정 목록의 '전체 보기'(선택 해제)와 뜻이 겹치지 않게 목적지를 밝힌다 */}
          <Pressable onPress={() => navigation.navigate('TripList')} hitSlop={8}>
            <Text style={styles.listClear}>여행 목록 ›</Text>
          </Pressable>
        </View>
        {listTrips.length === 0 && !tripsLoaded ? (
          // 아직 한 번도 못 받아본 상태 — '없음'이 아니라 '모름'이라 CTA 대신 자리만 비워둔다
          null
        ) : listTrips.length === 0 ? (
          <TouchableOpacity
            style={styles.tripCreate}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('TripForm', {})}
          >
            <Text style={styles.tripCreateText}>
              {selectedDate ? '이 날을 낀 여행이 없어요' : '이번 달 여행이 없어요'} · ＋ 여행 만들기
            </Text>
          </TouchableOpacity>
        ) : (
          listTrips.map((trip) => (
            <TouchableOpacity
              key={trip.id}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('TripDetail', { tripId: trip.id, title: trip.title })}
            >
              <Card elevation="sm" style={styles.eventCard}>
                <View style={[styles.typeBar, { backgroundColor: colors.accent }]} />
                <View style={styles.eventBody}>
                  <View style={styles.eventTitleRow}>
                    <Text style={styles.eventTitle} numberOfLines={1}>
                      ✈️ {trip.title}
                    </Text>
                    <View style={styles.ddayBadge}>
                      <Text style={styles.ddayText}>{tripStatusLabel(trip)}</Text>
                    </View>
                  </View>
                  <Text style={styles.eventMeta}>
                    {trip.startDate} ~ {trip.endDate} · 담긴 장소 {trip.placeCount}곳
                  </Text>
                </View>
              </Card>
            </TouchableOpacity>
          ))
        )}

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
            const meta = typeMeta(event.eventType);
            // 시작일 당일은 D-day 로(강조 포함), 그 다음 날부터 종료일까지는 "진행 중"으로 읽는다
            const ongoing = !!event.endDate && event.date < todayStr && todayStr <= event.endDate;
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
                          // 다크의 coral 은 파스텔이라 흰 글자가 1.55:1 이었다 — 배경 휘도로 고른다
                          style={[
                            styles.ddayText,
                            event.dday === 0 && { color: onColor(colors.coral) },
                          ]}
                        >
                          {ddayLabel(event.dday, ongoing)}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.eventMeta}>
                      {Number(event.date.slice(5, 7))}월 {Number(event.date.slice(8, 10))}일
                      {event.endDate
                        ? ` ~ ${Number(event.endDate.slice(5, 7))}월 ${Number(event.endDate.slice(8, 10))}일`
                        : ''}{' '}
                      · {meta.label}
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
      <Modal visible={form !== null} transparent animationType="fade" onRequestClose={closeForm}>
        <Pressable style={styles.modalBackdrop} onPress={closeForm}>
          {/* 키보드가 저장/삭제 버튼을 가리지 않도록 카드째로 밀어올린다 */}
          <KeyboardAvoidingView style={styles.modalAvoid} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            {/* onPress 로 탭을 흡수한다 — 없으면 카드 빈 곳 터치가 배경으로 새어나가 닫힌다 */}
            <Pressable style={styles.modalCardWrap} onPress={() => {}}>
              <Card elevation="md" style={styles.modalCard}>
                {/* 내용이 길어(약 460~500pt) 작은 화면·키보드 위에서는 카드 안에서 스크롤한다 */}
                <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalScroll}>
                  <Text style={styles.modalTitle}>{form?.id == null ? '일정 추가' : '일정 수정'}</Text>

                  <TextField
                    label="제목"
                    value={form?.title ?? ''}
                    onChangeText={(t) => setForm((f) => (f ? { ...f, title: t } : f))}
                    placeholder="예: 우리 200일, 수인 생일"
                    maxLength={100}
                  />
                  <DateField
                    label={form?.endDate ? '시작일' : '날짜'}
                    value={form?.date ?? ''}
                    // 시작일을 종료일 뒤로 옮기면 종료일이 뒤집힌다 — TripForm 처럼 함께 밀어준다
                    onChange={(d) =>
                      setForm((f) =>
                        f ? { ...f, date: d, endDate: f.endDate && f.endDate < d ? d : f.endDate } : f,
                      )
                    }
                  />
                  {/* 기간 일정 — 반복 일정은 기간을 갖지 않아(백엔드 검증과 동일) 반복이 꺼진 동안만 보인다 */}
                  {!form?.repeatYearly ? (
                    <View style={styles.endDateRow}>
                      <View style={styles.flex}>
                        <DateField
                          label="종료일 (선택)"
                          value={form?.endDate ?? ''}
                          onChange={(d) => setForm((f) => (f ? { ...f, endDate: d } : f))}
                          min={form?.date || undefined}
                          placeholder="없음 — 하루 일정"
                        />
                      </View>
                      {form?.endDate ? (
                        <IconButton
                          icon="close"
                          label="종료일 지우기 (하루 일정으로)"
                          onPress={() => setForm((f) => (f ? { ...f, endDate: '' } : f))}
                          style={styles.endDateClear}
                        />
                      ) : null}
                    </View>
                  ) : null}

                  <Text style={styles.fieldLabel}>종류</Text>
                  <View style={styles.typeRow}>
                    {(Object.keys(TYPE_LABEL) as CalendarEventType[]).map((t) => {
                      const active = form?.eventType === t;
                      return (
                        <Pressable
                          key={t}
                          style={[
                            styles.typeChip,
                            active && { borderColor: typeMeta(t).color, backgroundColor: colors.surfaceAlt },
                          ]}
                          onPress={() => setForm((f) => (f ? { ...f, eventType: t } : f))}
                        >
                          <View style={[styles.dot, { backgroundColor: typeMeta(t).color }]} />
                          <Text style={[styles.typeChipText, active && { color: colors.textPrimary, fontWeight: '700' }]}>
                            {typeMeta(t).label}
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
                      // 반복을 켜면 종료일을 지운다 — 종료일 필드가 접히는 게 화면 안의 피드백이다
                      onValueChange={(v) =>
                        setForm((f) => (f ? { ...f, repeatYearly: v, endDate: v ? '' : f.endDate } : f))
                      }
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
                </ScrollView>
              </Card>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </View>
  );
}

const CELL = `${100 / 7}%` as const;

const styles = themedStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: layout.listBottomWithFab },
  flex: { flex: 1 },

  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  monthBtn: {
    width: layout.touchTarget,
    height: layout.touchTarget,
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
  // 여행 기간 띠 — 없는 날도 같은 높이를 차지해 그리드 행 높이가 흔들리지 않는다
  tripBar: { alignSelf: 'stretch', height: 3, marginTop: 3, borderRadius: 2 },
  tripBarOn: { backgroundColor: colors.accent },
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

  // 여행이 없을 때의 생성 진입점 — 카드 대신 점선 상자로 "비어 있음 + 행동"을 한 줄에
  tripCreate: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
    minHeight: layout.touchTarget,
    justifyContent: 'center',
  },
  tripCreateText: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700' },

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
  /*
   * 키보드 회피 래퍼는 배경 전체를 덮되(flex:1) 카드는 세로 중앙에 둔다.
   * 카드 높이를 화면의 80% 로 제한해야 안쪽 ScrollView 가 실제로 스크롤된다 —
   * 제한이 없으면 카드가 내용만큼 늘어나 버튼이 화면 밖으로 밀린다.
   */
  modalAvoid: { flex: 1, justifyContent: 'center' },
  modalCardWrap: { maxHeight: '80%' },
  modalScroll: { paddingBottom: spacing.xs },
  modalCard: { gap: spacing.xs },
  modalTitle: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.ink, marginBottom: spacing.sm },
  fieldLabel: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  // 종료일 + 지우기 버튼 한 줄 — 버튼(44)을 DateField 상자(54, 아래 여백 md)의 세로 중앙에 맞춘다
  endDateRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs },
  endDateClear: { marginBottom: spacing.md + 5 },

  typeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md, flexWrap: 'wrap' },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    minHeight: layout.touchTarget,
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
  repeatHint: { fontSize: fontSize.caption, color: colors.textSecondary },

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
}));
