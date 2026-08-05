/**
 * 히어로 아래 바로가기 줄.
 *
 * <p>예전에는 2×2 로 놓인 큼직한 사각 버튼 네 개였다. 배경 사진 위에 불투명한
 * 상자 넷이 얹히니 사진이 가려지고, 정작 아래 피드보다 시선을 먼저 끌었다.
 * 아이콘 + 짧은 라벨의 반투명 칩 한 줄로 눌러 담았다.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontSize, spacing } from '../../../constants/theme';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

export interface QuickAction {
  icon: IconName;
  label: string;
  onPress: () => void;
}

export function QuickActions({ actions }: { actions: QuickAction[] }) {
  return (
    <View style={styles.row}>
      {actions.map((a) => (
        <Pressable
          key={a.label}
          style={({ pressed }) => [styles.item, pressed && styles.pressed]}
          onPress={a.onPress}
          accessibilityRole="button"
        >
          <View style={styles.iconBox}>
            <MaterialCommunityIcons name={a.icon} size={21} color={colors.primary} />
          </View>
          <Text style={styles.label} numberOfLines={1}>
            {a.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', marginBottom: spacing.md },
  item: { flex: 1, alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xs },
  pressed: { opacity: 0.6 },
  iconBox: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    // 크림 스크림 위 — 표면 틴트로 눌러 담는다
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: { color: colors.textSecondary, fontSize: 11, fontWeight: '700' },
});
