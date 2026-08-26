import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from './Icon';
import type { Meal, MealType } from '../types';
import { relativeDateLabel } from '../utils/date';
import { formatKcal } from '../utils/format';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';

interface Props {
  meal: Meal;
  /** 탭 — 보통 수정 화면으로 보낸다 */
  onPress?: (meal: Meal) => void;
  onLongPress?: (meal: Meal) => void;
  /** 날짜 라벨 표시 (히스토리에서 유용) */
  showDate?: boolean;
  /** 삭제 처리 중 — 카드를 흐리게 하고 탭을 막는다 (QA_CHECKLIST.md 패턴 7) */
  deleting?: boolean;
}

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

export const MEAL_ICON: Record<MealType, IconName> = {
  BREAKFAST: 'weather-sunset-up',
  LUNCH: 'white-balance-sunny',
  DINNER: 'weather-night',
  SNACK: 'cookie-outline',
};

/** 카드에 펼쳐 보여줄 항목 수 — 나머지는 "외 N개" 로 접는다 */
const PREVIEW_COUNT = 3;

/** 식단 기록 카드 — 끼니·사진·음식 항목·칼로리·메모 요약 */
export function MealCard({ meal, onPress, onLongPress, showDate, deleting }: Props) {
  const items = meal.items ?? [];
  return (
    <TouchableOpacity
      activeOpacity={onPress || onLongPress ? 0.7 : 1}
      onPress={onPress && !deleting ? () => onPress(meal) : undefined}
      onLongPress={onLongPress && !deleting ? () => onLongPress(meal) : undefined}
      disabled={deleting}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? `${meal.mealTypeLabel} 기록 수정` : undefined}
      style={[styles.card, deleting && styles.cardDeleting]}
    >
      <View style={styles.header}>
        <View style={styles.typeWrap}>
          <MaterialCommunityIcons name={MEAL_ICON[meal.mealType]} size={18} color={colors.textSecondary} />
          <Text style={styles.type}>{meal.mealTypeLabel}</Text>
          {/* 데이트 식단(같이 먹기) — 상대방에게도 절반 칼로리로 짝이 등록된 기록 */}
          {meal.sharedWithPartner ? (
            <View style={styles.dateBadge}>
              <Text style={styles.dateBadgeText}>🍽️ 데이트</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.headerRight}>
          {meal.calories ? <Text style={styles.cal}>{formatKcal(meal.calories)}</Text> : null}
          {showDate ? <Text style={styles.date}>{relativeDateLabel(meal.mealDate)}</Text> : null}
        </View>
      </View>

      {meal.photoUrl ? (
        <Image source={{ uri: meal.photoUrl }} style={styles.photo} resizeMode="cover" />
      ) : null}

      {/*
        음식 항목 — 반찬 단위로 저장된 기록. 카드가 길어지지 않게 3개까지만 보여주고
        나머지는 개수로 접는다. 항목이 없는 기록(합계만 적었거나 레거시)은 memo 로 보여준다.
      */}
      {items.length > 0 ? (
        <View style={styles.items}>
          {items.slice(0, PREVIEW_COUNT).map((it) => (
            <View key={it.id} style={styles.itemRow}>
              <Text style={styles.itemName} numberOfLines={1}>
                {it.name}
                {it.portion ? <Text style={styles.itemPortion}>{` ${it.portion}`}</Text> : null}
              </Text>
              {it.calories ? <Text style={styles.itemKcal}>{formatKcal(it.calories)}</Text> : null}
            </View>
          ))}
          {items.length > PREVIEW_COUNT ? (
            <Text style={styles.itemMore}>외 {items.length - PREVIEW_COUNT}개</Text>
          ) : null}
        </View>
      ) : null}

      {meal.memo ? (
        <Text style={items.length > 0 ? styles.memoAside : styles.memo}>{meal.memo}</Text>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = themedStyles((colors) => ({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  // 삭제 in-flight 표시 — 흐리게만 하고 레이아웃은 그대로 둔다 (QA_CHECKLIST.md 패턴 7)
  cardDeleting: { opacity: 0.5 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  typeWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  type: { fontSize: fontSize.subtitle, fontWeight: '700', color: colors.textPrimary },
  dateBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryBg,
  },
  dateBadgeText: { fontSize: 10, fontWeight: '800', color: colors.primary },
  cal: { fontSize: fontSize.caption, color: colors.accent, fontWeight: '800' },
  date: { fontSize: fontSize.caption, color: colors.textSecondary },
  photo: {
    width: '100%',
    height: 180,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    marginTop: spacing.sm,
  },
  items: { marginTop: spacing.sm, gap: 2 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  itemName: { flex: 1, fontSize: fontSize.body, color: colors.textPrimary },
  itemPortion: { fontSize: fontSize.caption, color: colors.textSecondary },
  itemKcal: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700' },
  itemMore: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 2 },
  // 항목이 없는 기록(합계만 적었거나 레거시)에서는 memo 가 본문이다
  memo: { fontSize: fontSize.body, color: colors.textPrimary, marginTop: spacing.sm },
  // 항목이 있으면 memo 는 곁들이는 한마디라 한 단계 낮춘다
  memoAside: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: spacing.sm },
}));
