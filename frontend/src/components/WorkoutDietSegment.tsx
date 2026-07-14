/** 운동/식단 세그먼트 — 운동 탭 상단에서 두 화면을 토글 (구 식단 탭 통합) */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { WorkoutStackParamList } from '../navigation/types';
import { colors, fontSize, radius, spacing } from '../constants/theme';

type Nav = NativeStackNavigationProp<WorkoutStackParamList>;

const TABS: { key: 'workout' | 'diet'; label: string; target: keyof WorkoutStackParamList }[] = [
  { key: 'workout', label: '운동', target: 'WorkoutMain' },
  { key: 'diet', label: '식단', target: 'DietMain' },
];

/** active 화면에서 반대쪽을 누르면 replace 로 전환 → 세그먼트처럼 동작 */
export function WorkoutDietSegment({ active }: { active: 'workout' | 'diet' }) {
  const navigation = useNavigation<Nav>();
  return (
    <View style={styles.wrap}>
      {TABS.map((t) => {
        const isActive = t.key === active;
        return (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, isActive && styles.tabActive]}
            activeOpacity={0.8}
            disabled={isActive}
            onPress={() => navigation.replace(t.target)}
          >
            <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    padding: 4,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  tabActive: { backgroundColor: colors.surfaceCard },
  tabText: { fontSize: fontSize.body, fontWeight: '700', color: colors.textSecondary },
  tabTextActive: { color: colors.textPrimary },
});
