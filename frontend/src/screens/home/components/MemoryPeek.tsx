/**
 * 홈의 "작년 오늘" 한 줄 (PLAN.md Memories).
 *
 * <p><b>새 카드를 얹지 않는다.</b> 홈은 스크롤 없는 고정 화면이고, 커밋 4199fa3 이
 * "기록이 쌓일수록 배경 사진이 파묻힌다"는 이유로 목록을 걷어낸 화면이다.
 * 그래서 추억이 있는 날에만 {@link RecentPeek} <b>자리를 대신 차지</b>한다 —
 * 같은 고정 높이, 같은 카드 스타일이라 레이아웃이 그대로다.
 *
 * <p>스크림이 크림 기반이라 색은 테마를 그대로 따른다.
 */
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '../../../components/Icon';
import type { Memories } from '../../../types';
import { colors, fontSize, radius, spacing } from '../../../constants/theme';

interface Props {
  /** 추억 응답 — groups 가 비어 있으면 이 컴포넌트를 아예 그리지 않는다 */
  memories: Memories;
  onPress: () => void;
}

export function MemoryPeek({ memories, onPress }: Props) {
  // 가장 오래된 해가 가장 회상 가치가 크다 (푸시 문구와 같은 규칙)
  const oldest = memories.groups[memories.groups.length - 1];
  const thumb = memories.groups.flatMap((g) => g.items).find((i) => i.imageUrl)?.imageUrl;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${oldest.label} 추억 ${memories.totalCount}개 보기`}
    >
      {thumb ? (
        <Image source={{ uri: thumb }} style={styles.thumb} />
      ) : (
        <View style={styles.iconBox}>
          <MaterialCommunityIcons name="flower-outline" size={19} color={colors.together} />
        </View>
      )}

      <View style={styles.body}>
        <Text style={styles.meta} numberOfLines={1}>
          {oldest.label}
        </Text>
        <Text style={styles.summary} numberOfLines={1}>
          둘이 함께한 기록이 {memories.totalCount}개 있어요
        </Text>
      </View>

      <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    // RecentPeek 과 같은 카드 — 자리를 바꿔 껴도 높이·질감이 흔들리지 않는다
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
    backgroundColor: colors.togetherBg,
  },
  body: { flex: 1 },
  meta: { color: colors.textSecondary, fontSize: 11, fontWeight: '700' },
  summary: { color: colors.textPrimary, fontSize: fontSize.body, fontWeight: '600', marginTop: 1 },
});
