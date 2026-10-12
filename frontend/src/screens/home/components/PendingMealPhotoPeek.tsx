/**
 * 홈 한 줄 슬롯 — 올리지 못한 식단 사진이 보관함에 남아 있다는 알림(utils/pendingMealPhotos).
 *
 * <p>{@link EventPeek}·TripPeek 과 같은 카드 — 홈은 스크롤 없는 고정 화면이라 한 줄 슬롯을 함께 쓰고,
 * 이 줄이 맨 앞 순위다(HomeScreen 슬롯 주석). 놓치면 사진째 사라지는 유일한 항목이기 때문이다.
 * 아이콘은 이미 서브셋에 있는 camera-outline(QuickMealSheet 과 같다) — 새 글리프는 폰트 재생성(=빌드)이 필요하다.
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '../../../components/Icon';
import { colors, fontSize, radius, spacing } from '../../../constants/theme';
import { themedStyles } from '../../../theme/themedStyles';

interface Props {
  count: number;
  onPress: () => void;
}

export function PendingMealPhotoPeek({ count, onPress }: Props) {
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`올리지 못한 식단 사진 ${count}장. 눌러서 다시 올리기`}
    >
      <View style={styles.iconBox}>
        <MaterialCommunityIcons name="camera-outline" size={19} color={colors.primary} />
      </View>
      <View style={styles.body}>
        <Text style={styles.meta} numberOfLines={1}>
          올리지 못한 식단 사진 {count}장
        </Text>
        <Text style={styles.summary} numberOfLines={1}>
          눌러서 다시 올리기
        </Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} />
    </Pressable>
  );
}

// EventPeek 과 같은 카드 — 슬롯을 어느 쪽이 차지해도 높이·질감이 흔들리지 않는다
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
