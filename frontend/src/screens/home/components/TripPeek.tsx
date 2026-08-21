/**
 * 홈의 여행 한 줄 (PLAN.md Trip) — D-day(예정) 또는 "여행 중" 배지로 여행 상세에 바로 진입한다.
 *
 * <p><b>새 카드를 얹지 않는다.</b> {@link MemoryPeek}와 같은 규칙 — 홈은 스크롤 없는
 * 고정 화면이라 조건부 한 줄 슬롯을 함께 쓴다(동시 노출 우선순위는 HomeScreen 참고).
 * 같은 고정 높이, 같은 카드 스타일이라 어느 쪽이 차지해도 레이아웃이 그대로다.
 *
 * <p>여행이 럽슐랭(장소) 탭에서 홈 스택으로 이관되면서 생긴 첫 번째 진입 표면이다 —
 * 다가오는/진행 중 여행이 있는 기간엔 앱 첫 화면 최상단에서 바로 들어간다.
 */
import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '../../../components/Icon';
import { tripStatusLabel } from '../../trip/TripListScreen';
import { toDateString } from '../../../utils/date';
import type { Trip } from '../../../types';
import { colors, fontSize, radius, spacing } from '../../../constants/theme';
import { themedStyles } from '../../../theme/themedStyles';

/** 오늘이 여행 기간 안인가 — 홈 슬롯 우선순위(여행 중 > 작년 오늘 > D-day)의 판단 기준 */
export function isTripOngoing(trip: Trip): boolean {
  const today = toDateString();
  return trip.startDate <= today && today <= trip.endDate;
}

/**
 * 홈에 보여줄 여행 하나 고르기 — 진행 중이면 그 여행(겹치면 먼저 시작한 것),
 * 없으면 가장 가까운 예정 여행. 다녀온 여행은 홈에 띄우지 않는다(캘린더·여행 목록에서 회고).
 */
export function pickHomeTrip(trips: Trip[]): Trip | null {
  const today = toDateString();
  const ongoing = trips
    .filter((t) => t.startDate <= today && today <= t.endDate)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  if (ongoing.length > 0) return ongoing[0];
  const upcoming = trips
    .filter((t) => today < t.startDate)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  return upcoming[0] ?? null;
}

interface Props {
  trip: Trip;
  onPress: () => void;
}

export function TripPeek({ trip, onPress }: Props) {
  const label = tripStatusLabel(trip); // D-n | 여행 중

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label} ${trip.title} 여행 보기`}
    >
      {trip.coverImageUrl ? (
        <Image source={{ uri: trip.coverImageUrl }} style={styles.thumb} />
      ) : (
        <View style={styles.iconBox}>
          <MaterialCommunityIcons name="airplane" size={19} color={colors.accent} />
        </View>
      )}

      <View style={styles.body}>
        <Text style={styles.meta} numberOfLines={1}>
          {label} · {trip.startDate} ~ {trip.endDate}
        </Text>
        <Text style={styles.summary} numberOfLines={1}>
          {trip.title}
        </Text>
      </View>

      <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} />
    </Pressable>
  );
}

// themedStyles — StyleSheet.create 는 모듈 로드 시 색이 굳어 실행 중 테마 전환이 반영되지 않았다
const styles = themedStyles((colors) => ({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    // MemoryPeek 과 같은 카드 — 한 줄 슬롯을 어느 쪽이 차지해도 높이·질감이 흔들리지 않는다
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  pressed: { opacity: 0.65 },
  thumb: { width: 38, height: 38, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  body: { flex: 1 },
  meta: { color: colors.textSecondary, fontSize: 11, fontWeight: '700' },
  summary: { color: colors.textPrimary, fontSize: fontSize.body, fontWeight: '600', marginTop: 1 },
}));
