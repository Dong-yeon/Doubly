/**
 * 홈의 다가오는 일정 한 줄 — 커플 캘린더의 가장 가까운 일정을 D-day 와 함께 보여주고 캘린더로 간다.
 *
 * <p><b>새 카드를 얹지 않는다.</b> {@link TripPeek}·{@link MemoryPeek} 와 같은 규칙 — 홈은 스크롤 없는
 * 고정 화면이라 조건부 한 줄 슬롯을 함께 쓴다(우선순위는 HomeScreen 슬롯 주석). 같은 높이·같은 카드라
 * 어느 쪽이 차지해도 레이아웃이 그대로다.
 *
 * <p><b>7일 안의 일정만</b> 띄운다. 서버의 D-7 사전 알림과 같은 범위다 — 그보다 먼 일정까지 올리면
 * "D-45 생일"이 매일 슬롯을 차지해 "대부분의 날은 비어 있다"는 홈의 전제가 깨진다.
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '../../../components/Icon';
import { eventStatusOf } from '../../../utils/homeEvent';
import { useAuthStore } from '../../../store/authStore';
import { useRelationStore } from '../../../store/relationStore';
import type { CalendarEventType, CoupleCalendarEvent } from '../../../types';
import { colors, fontSize, radius, spacing } from '../../../constants/theme';
import { themedStyles } from '../../../theme/themedStyles';

export { isEventToday, pickHomeEvent } from '../../../utils/homeEvent';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

/** 서브셋 글리프맵에 이미 있는 이름만 쓴다 — 새 글리프는 폰트 서브셋 재생성이 필요하다(Icon.tsx) */
const TYPE_ICON: Record<CalendarEventType, { name: IconName; label: string }> = {
  ANNIVERSARY: { name: 'heart', label: '기념일' },
  BIRTHDAY: { name: 'gift-outline', label: '생일' },
  DATE: { name: 'calendar-heart', label: '데이트' },
  ETC: { name: 'calendar-month-outline', label: '일정' },
};

/** 캘린더 화면(CoupleCalendarScreen typeMeta)과 같은 종류색 — 렌더 시점에 팔레트를 읽는다 */
const typeColor = (type: CalendarEventType): string =>
  ({
    ANNIVERSARY: colors.eventAnniversary,
    BIRTHDAY: colors.eventBirthday,
    DATE: colors.eventDate,
    ETC: colors.textSecondary,
  })[type];

interface Props {
  event: CoupleCalendarEvent;
  onPress: () => void;
}

export function EventPeek({ event, onPress }: Props) {
  const myId = useAuthStore((s) => s.user?.id);
  const partnerName = useRelationStore((s) => s.couple?.partner?.name);
  const { dday, ongoing } = eventStatusOf(event);
  const badge = ongoing ? '진행 중' : dday === 0 ? '오늘' : dday === 1 ? '내일' : `D-${dday}`;
  const type = TYPE_ICON[event.eventType];
  // 캘린더 카드와 같은 규칙 — 우리 일정은 아무것도 붙이지 않고, 각자의 일정만 누구 것인지 밝힌다
  const owner =
    event.visibility === 'SHARED' ? null : event.createdBy === myId ? '내 일정' : `${partnerName ?? '상대'} 일정`;
  const when = `${Number(event.date.slice(5, 7))}월 ${Number(event.date.slice(8, 10))}일`;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${badge} ${event.title} 캘린더에서 보기`}
    >
      <View style={styles.iconBox}>
        <MaterialCommunityIcons name={type.name} size={19} color={typeColor(event.eventType)} />
      </View>

      <View style={styles.body}>
        <Text style={styles.meta} numberOfLines={1}>
          {badge} · {when} · {owner ?? type.label}
        </Text>
        <Text style={styles.summary} numberOfLines={1}>
          {event.title}
        </Text>
      </View>

      <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} />
    </Pressable>
  );
}

// TripPeek 과 같은 카드 — 한 줄 슬롯을 어느 쪽이 차지해도 높이·질감이 흔들리지 않는다
const styles = themedStyles((colors) => ({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  pressed: { opacity: 0.65 },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  body: { flex: 1 },
  meta: { color: colors.textSecondary, fontSize: fontSize.micro, fontWeight: '700' },
  summary: { color: colors.textPrimary, fontSize: fontSize.body, fontWeight: '600', marginTop: 1 },
}));
