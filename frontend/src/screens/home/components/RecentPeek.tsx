/**
 * 홈 하단의 최근 기록 한 줄.
 *
 * <p>홈에서 타임라인을 걷어내면 "무슨 일이 있었는지"를 알 방법이 사라진다.
 * 그렇다고 목록을 되돌리면 배경 사진이 다시 파묻힌다. 그래서 <b>가장 최근 한 건만</b>
 * 고정 높이로 보여주고, 나머지는 우리 기록 화면으로 넘긴다.
 *
 * <p>스크림이 크림 기반이라 색은 테마를 그대로 따른다.
 */
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { FeedItem, FeedItemType } from '../../../types';
import { colors, fontSize, radius, spacing } from '../../../constants/theme';
import { themedStyles } from '../../../theme/themedStyles';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const TYPE_ICON: Record<FeedItemType, IconName> = {
  POST: 'image-outline',
  WORKOUT: 'dumbbell',
  MEAL: 'silverware-fork-knife',
  PLACE_VISIT: 'map-marker',
};

interface Props {
  /** 가장 최근 기록. 없으면 "첫 기록 남기기" 안내가 뜬다 */
  latest: FeedItem | null;
  timeLabel: string;
  onPress: () => void;
}

export function RecentPeek({ latest, timeLabel, onPress }: Props) {
  const summary = latest ? (latest.content || latest.title || '기록을 남겼어요') : null;
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="우리 기록 전체 보기"
    >
      {latest?.imageUrl ? (
        <Image source={{ uri: latest.imageUrl }} style={styles.thumb} />
      ) : (
        <View style={styles.iconBox}>
          <MaterialCommunityIcons
            name={latest ? TYPE_ICON[latest.type] : 'timeline-text-outline'}
            size={19}
            color={colors.primary}
          />
        </View>
      )}

      <View style={styles.body}>
        {latest ? (
          <>
            <Text style={styles.meta} numberOfLines={1}>
              {latest.mine ? '나' : latest.userName} · {timeLabel}
            </Text>
            <Text style={styles.summary} numberOfLines={1}>
              {summary}
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.meta}>우리 기록</Text>
            <Text style={styles.summary} numberOfLines={1}>
              아직 기록이 없어요 — 첫 기록을 남겨보세요
            </Text>
          </>
        )}
      </View>

      <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = themedStyles((colors) => ({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    // 크림 스크림 위 — 표면색 카드로 배경에서 분리한다
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
    backgroundColor: colors.primaryBg,
  },
  body: { flex: 1 },
  meta: { color: colors.textSecondary, fontSize: 11, fontWeight: '700' },
  summary: { color: colors.textPrimary, fontSize: fontSize.body, fontWeight: '600', marginTop: 1 },
}));
