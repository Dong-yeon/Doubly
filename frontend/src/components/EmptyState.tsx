import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontSize, spacing } from '../constants/theme';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

interface Props {
  /** 빈 화면 아이콘 (MaterialCommunityIcons) */
  icon?: IconName;
  title: string;
  description?: string;
}

/** 빈 상태 안내 — 연한 단색 아이콘으로 절제된 룩 */
export function EmptyState({ icon = 'inbox-outline', title, description }: Props) {
  const name: IconName = icon;
  return (
    <View style={styles.wrap}>
      <View style={styles.iconCircle}>
        {/* textSecondary — textMuted 는 iconCircle(surfaceAlt) 위 2.45:1 로 그래픽 기준(3:1) 미달 */}
        <MaterialCommunityIcons name={name} size={40} color={colors.textSecondary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.desc}>{description}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  iconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: { fontSize: fontSize.subtitle, fontWeight: '700', color: colors.textPrimary },
  desc: {
    fontSize: fontSize.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'center',
    lineHeight: 20,
  },
});
