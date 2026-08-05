import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { Meal, MealType } from '../types';
import { relativeDateLabel } from '../utils/date';
import { formatKcal } from '../utils/format';
import { colors, fontSize, radius, spacing } from '../constants/theme';

interface Props {
  meal: Meal;
  onLongPress?: (meal: Meal) => void;
  /** 날짜 라벨 표시 (히스토리에서 유용) */
  showDate?: boolean;
}

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

export const MEAL_ICON: Record<MealType, IconName> = {
  BREAKFAST: 'weather-sunset-up',
  LUNCH: 'white-balance-sunny',
  DINNER: 'weather-night',
  SNACK: 'cookie-outline',
};

/** 식단 기록 카드 — 끼니·사진·칼로리·메모 요약 */
export function MealCard({ meal, onLongPress, showDate }: Props) {
  return (
    <TouchableOpacity
      activeOpacity={onLongPress ? 0.7 : 1}
      onLongPress={onLongPress ? () => onLongPress(meal) : undefined}
      style={styles.card}
    >
      <View style={styles.header}>
        <View style={styles.typeWrap}>
          <MaterialCommunityIcons name={MEAL_ICON[meal.mealType]} size={18} color={colors.textSecondary} />
          <Text style={styles.type}>{meal.mealTypeLabel}</Text>
        </View>
        <View style={styles.headerRight}>
          {meal.calories ? <Text style={styles.cal}>{formatKcal(meal.calories)}</Text> : null}
          {showDate ? <Text style={styles.date}>{relativeDateLabel(meal.mealDate)}</Text> : null}
        </View>
      </View>

      {meal.photoUrl ? (
        <Image source={{ uri: meal.photoUrl }} style={styles.photo} resizeMode="cover" />
      ) : null}

      {meal.memo ? <Text style={styles.memo}>{meal.memo}</Text> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  typeWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  type: { fontSize: fontSize.subtitle, fontWeight: '700', color: colors.textPrimary },
  cal: { fontSize: fontSize.caption, color: colors.accent, fontWeight: '800' },
  date: { fontSize: fontSize.caption, color: colors.textSecondary },
  photo: {
    width: '100%',
    height: 180,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    marginTop: spacing.sm,
  },
  memo: { fontSize: fontSize.body, color: colors.textPrimary, marginTop: spacing.sm },
});
