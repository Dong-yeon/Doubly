/**
 * 예약 전송 작성 시트 — docs/CHAT_RETENTION_AND_KAKAO_BENCHMARK_2026-09-03.md §6 5순위.
 * ChatRoomScreen 의 "+" 트레이(extrasPanel)에서 연다. 이 화면은 modal 프레젠테이션이
 * 아니라 일반 push 화면이라(ChatStackNavigator.tsx 참고) ChatMoreMenuSheet 와 같은
 * 평범한 RN Modal 로 충분하다 — RootOverlayModal 이 필요한 건 App 루트에 마운트되는
 * 전역 오버레이뿐이다.
 *
 * <p>지금은 TEXT 메시지만 예약할 수 있다 — 스티커/이미지도 백엔드는 받아주지만
 * (chatApi.scheduleMessage 주석 참고), 이 시트에 스티커 선택 UI·이미지 선택 UI까지
 * 넣으면 범위가 커진다. 필요해지면 이 시트에 탭을 추가하는 확장으로 충분하다.
 */
import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from './Icon';
import { pickDate } from '../store/datePickerStore';
import { toDateString } from '../utils/date';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';
import { layout } from '../theme/layout';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** 등록 성공 시 호출 — 부모가 토스트·목록 갱신을 책임진다 */
  onScheduled: (content: string, scheduledAt: Date) => Promise<void>;
}

/** 예약 날짜(YYYY-MM-DD) → '오늘' / '내일' / '9월 10일' */
function dateOnlyLabel(dateStr: string): string {
  const today = toDateString();
  if (dateStr === today) return '오늘';
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (dateStr === toDateString(tomorrow)) return '내일';
  const [, m, d] = dateStr.split('-').map(Number);
  return `${m}월 ${d}일`;
}

/**
 * 기본 예약 시각 — "지금부터 1시간 뒤"를 5분 단위로 반올림.
 * 절대 시각(ms)을 먼저 반올림한 뒤 날짜·분을 뽑아낸다 — 자정 근처(23:58 등)에서
 * "시:분"만 따로 반올림하면 24:00 같은 값이 나올 수 있는데, 절대 시각 기준이면
 * 다음 날로 자연히 넘어가 그런 경계값 처리가 필요 없다.
 */
function defaultSchedule(): { dateStr: string; minuteOfDay: number } {
  const FIVE_MIN_MS = 5 * 60000;
  const rounded = new Date(Math.round((Date.now() + 60 * 60000) / FIVE_MIN_MS) * FIVE_MIN_MS);
  return { dateStr: toDateString(rounded), minuteOfDay: rounded.getHours() * 60 + rounded.getMinutes() };
}

/** 1분 단위 자정 기준 분(minute-of-day)을 시:분 문자열로. */
function timeLabel(minuteOfDay: number): string {
  const hour24 = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const period = hour24 < 12 ? '오전' : '오후';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${period} ${hour12}:${String(minute).padStart(2, '0')}`;
}

export function ScheduleMessageSheet({ visible, onClose, onScheduled }: Props) {
  const [content, setContent] = useState('');
  const [dateStr, setDateStr] = useState(() => defaultSchedule().dateStr);
  const [minuteOfDay, setMinuteOfDay] = useState(() => defaultSchedule().minuteOfDay);
  const [submitting, setSubmitting] = useState(false);
  // "지금보다 과거인가" — 렌더 본문에서 직접 Date.now() 를 부르면(순수성 규칙 위반)
  // 매 렌더 결과가 달라질 수 있고, effect 에서 setState 하면 그 자체가 또 다른 규칙
  // (연쇄 렌더링 방지)에 걸린다. 그래서 날짜·시간을 바꾸는 각 이벤트 핸들러가 그
  // 시점의 Date.now() 로 직접 계산해 값을 들고 있는다(이벤트 핸들러의 impure 호출은
  // 두 규칙 모두 허용한다).
  const [isPast, setIsPast] = useState(() => false);

  // 순수 파생값 — dateStr·minuteOfDay 가 안 바뀌면 같은 Date 참조를 유지한다
  const scheduledAt = useMemo(() => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d, Math.floor(minuteOfDay / 60), minuteOfDay % 60, 0, 0);
  }, [dateStr, minuteOfDay]);

  /** 날짜/시간 변경 핸들러 전용 — 새 값을 반영하며 "과거인지"도 함께 갱신한다. */
  const applySchedule = (nextDateStr: string, nextMinuteOfDay: number) => {
    setDateStr(nextDateStr);
    setMinuteOfDay(nextMinuteOfDay);
    const [y, m, d] = nextDateStr.split('-').map(Number);
    const next = new Date(y, m - 1, d, Math.floor(nextMinuteOfDay / 60), nextMinuteOfDay % 60, 0, 0);
    setIsPast(next.getTime() <= Date.now());
  };

  const reset = () => {
    setContent('');
    const next = defaultSchedule();
    applySchedule(next.dateStr, next.minuteOfDay);
  };

  const close = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const applyPreset = (deltaMinutes: number) => {
    const target = new Date(Date.now() + deltaMinutes * 60000);
    applySchedule(toDateString(target), target.getHours() * 60 + target.getMinutes());
  };

  const applyTomorrowMorning = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    applySchedule(toDateString(tomorrow), 9 * 60);
  };

  const pickCustomDate = async () => {
    const picked = await pickDate({ title: '예약 날짜', value: dateStr, min: toDateString() });
    if (picked) applySchedule(picked, minuteOfDay);
  };

  const adjustHour = (delta: number) => {
    const minute = minuteOfDay % 60;
    let hour = Math.floor(minuteOfDay / 60) + delta;
    if (hour < 0) hour = 23;
    if (hour > 23) hour = 0;
    applySchedule(dateStr, hour * 60 + minute);
  };

  const adjustMinute = (delta: number) => {
    let total = minuteOfDay + delta;
    if (total < 0) total += 24 * 60;
    if (total >= 24 * 60) total -= 24 * 60;
    applySchedule(dateStr, total);
  };

  const submit = async () => {
    if (!content.trim() || submitting || isPast) return;
    setSubmitting(true);
    try {
      await onScheduled(content.trim(), scheduledAt);
      reset();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdropTap} onPress={close} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>예약 전송</Text>

          <TextInput
            style={styles.input}
            placeholder="예약할 메시지를 입력하세요"
            placeholderTextColor={colors.textTertiary}
            value={content}
            onChangeText={setContent}
            multiline
            maxLength={1000}
          />

          <Text style={styles.sectionLabel}>언제 보낼까요?</Text>
          <View style={styles.presetRow}>
            <PresetChip label="1시간 뒤" onPress={() => applyPreset(60)} />
            <PresetChip label="3시간 뒤" onPress={() => applyPreset(180)} />
            <PresetChip label="내일 오전 9시" onPress={applyTomorrowMorning} />
          </View>

          <View style={styles.customRow}>
            <Pressable style={styles.dateBtn} onPress={pickCustomDate} accessibilityRole="button">
              <MaterialCommunityIcons name="calendar-blank-outline" size={18} color={colors.textSecondary} />
              <Text style={styles.dateBtnText}>{dateOnlyLabel(dateStr)}</Text>
            </Pressable>

            <View style={styles.timeStepper}>
              <Stepper unit="시" onDecrement={() => adjustHour(-1)} onIncrement={() => adjustHour(1)} />
              <Text style={styles.timeText}>{timeLabel(minuteOfDay)}</Text>
              <Stepper unit="분" onDecrement={() => adjustMinute(-5)} onIncrement={() => adjustMinute(5)} />
            </View>
          </View>

          {isPast ? <Text style={styles.warning}>예약 시각은 지금보다 뒤여야 해요.</Text> : null}

          <View style={styles.actions}>
            <Pressable style={styles.cancelBtn} onPress={close} accessibilityRole="button">
              <Text style={styles.cancelText}>취소</Text>
            </Pressable>
            <Pressable
              style={[styles.submitBtn, (!content.trim() || isPast || submitting) && styles.submitBtnDisabled]}
              onPress={submit}
              disabled={!content.trim() || isPast || submitting}
              accessibilityRole="button"
            >
              <Text style={styles.submitText}>{submitting ? '예약 중...' : '예약하기'}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function PresetChip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]} onPress={onPress}>
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  );
}

function Stepper({
  unit,
  onDecrement,
  onIncrement,
}: {
  unit: string;
  onDecrement: () => void;
  onIncrement: () => void;
}) {
  return (
    <View style={styles.stepperGroup}>
      <Pressable
        style={styles.stepperBtn}
        onPress={onDecrement}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={`${unit} 줄이기`}
      >
        <MaterialCommunityIcons name="minus" size={16} color={colors.textPrimary} />
      </Pressable>
      <Pressable
        style={styles.stepperBtn}
        onPress={onIncrement}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={`${unit} 늘리기`}
      >
        <MaterialCommunityIcons name="plus" size={16} color={colors.textPrimary} />
      </Pressable>
    </View>
  );
}

const styles = themedStyles((colors) => ({
  backdrop: { flex: 1, backgroundColor: colors.backdrop, justifyContent: 'flex-end' },
  backdropTap: { flex: 1 },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center' },
  title: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
  input: {
    minHeight: 72,
    maxHeight: 140,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    fontSize: fontSize.body,
    color: colors.textPrimary,
    textAlignVertical: 'top',
  },
  sectionLabel: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textSecondary, marginTop: spacing.xs },
  presetRow: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  chipPressed: { opacity: 0.7 },
  chipText: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textPrimary },
  customRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateBtnText: { fontSize: fontSize.body, fontWeight: '600', color: colors.textPrimary },
  timeStepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  timeText: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary, minWidth: 84, textAlign: 'center' },
  stepperGroup: { flexDirection: 'row', gap: 2 },
  stepperBtn: {
    width: layout.touchTarget - 12,
    height: layout.touchTarget - 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
  },
  warning: { fontSize: fontSize.caption, color: colors.danger },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  cancelBtn: {
    flex: 1,
    minHeight: layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  cancelText: { fontSize: fontSize.body, fontWeight: '700', color: colors.textSecondary },
  submitBtn: {
    flex: 2,
    minHeight: layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitText: { fontSize: fontSize.body, fontWeight: '800', color: colors.white },
}));
