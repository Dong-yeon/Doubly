/**
 * 잠긴 기능 자리에 그리는 카드 — 그 자리에서 바로 안내한다.
 *
 * <p><b>왜 모달이 아닌가</b>: 홈의 추억, MY 탭의 주간 결산은 화면이 <b>자동으로</b>
 * 부르는 조회다. 여기서 시트를 띄우면 앱을 열 때마다 광고가 뜨는 꼴이 된다.
 * 그래서 서버도 402 를 던지지 않고 {@code locked: true} 만 내려주고
 * (`MemoriesService` · `SummaryService`), 화면은 원래 카드 자리에 이걸 끼운다.
 *
 * <p>탭하면 그때 업그레이드 시트가 열린다 — 사용자가 관심을 보인 뒤에만.
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from './Icon';
import { usePlanStore } from '../store/planStore';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';

interface Props {
  /** 잠긴 기능 이름 — "작년 오늘", "지난주 결산" */
  title: string;
  /** 왜 좋은지 한 줄. 기능을 파는 게 아니라 무엇을 놓치는지 알려준다 */
  description: string;
  /** 시트에 띄울 문구 — 생략하면 제목으로 만든다 */
  upgradeMessage?: string;
}

export function LockedCard({ title, description, upgradeMessage }: Props) {
  const showUpgrade = usePlanStore((s) => s.showUpgrade);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={() => showUpgrade(upgradeMessage ?? `${title}은(는) PRO에서 볼 수 있어요.`)}
      accessibilityRole="button"
      accessibilityLabel={`${title} — PRO 기능. 눌러서 자세히 보기`}
    >
      <View style={styles.iconBox}>
        <MaterialCommunityIcons name="lock-outline" size={19} color={colors.textSecondary} />
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>PRO</Text>
          </View>
        </View>
        <Text style={styles.description} numberOfLines={1}>
          {description}
        </Text>
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
    // MemoryPeek·RecentPeek 과 같은 카드 — 자리를 바꿔 껴도 높이·질감이 흔들리지 않는다
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
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  title: { color: colors.textPrimary, fontSize: fontSize.body, fontWeight: '700', flexShrink: 1 },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.sm,
    backgroundColor: colors.togetherBg,
  },
  badgeText: { color: colors.together, fontSize: 10, fontWeight: '800' },
  description: { color: colors.textSecondary, fontSize: fontSize.caption, marginTop: 1 },
}));
