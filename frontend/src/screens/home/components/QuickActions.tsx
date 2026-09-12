/**
 * 히어로 아래 바로가기 줄.
 *
 * <p>예전에는 2×2 로 놓인 큼직한 사각 버튼 네 개였다. 배경 사진 위에 불투명한
 * 상자 넷이 얹히니 사진이 가려지고, 정작 아래 피드보다 시선을 먼저 끌었다.
 * 아이콘 + 짧은 라벨의 반투명 칩 한 줄로 눌러 담았다.
 *
 * <p><b>칸을 늘리는 자리가 아니다.</b> 기능이 늘 때마다 여기 칩을 더하다 7칸까지 갔고
 * (320px 에서 칸당 45px) 다음이 오면 8칸이었다. 넘치는 것은 {@code HomeMoreSheet} 로
 * 보낸다 — 칩은 셋으로 고정이고 마지막 칸은 늘 "더보기"다.
 * 무엇을 남기고 무엇을 내렸는지는 HomeScreen 의 QuickActions 호출부 주석에 있다.
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '../../../components/Icon';
import { colors, fontSize, spacing } from '../../../constants/theme';
import { themedStyles } from '../../../theme/themedStyles';

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
            <MaterialCommunityIcons name={a.icon} size={20} color={colors.primary} />
          </View>
          <Text style={styles.label} numberOfLines={1}>
            {a.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// themedStyles — StyleSheet.create 는 모듈 로드 시 색이 굳어 실행 중 테마 전환이 반영되지 않았다
const styles = themedStyles((colors) => ({
  row: { flexDirection: 'row', marginBottom: spacing.md },
  item: { flex: 1, alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xs },
  pressed: { opacity: 0.6 },
  /*
   * 4칸(3 + 더보기, 2026-09-12) — 한때 7칸까지 늘어 320px 에서 칸당 45px·라벨 11px 까지
   * 내려갔다. 세로로 못 늘리는 화면이라 새 기능이 전부 이 줄에 가로로 쌓인 결과였다.
   * 지금은 넘치는 것이 HomeMoreSheet 로 가므로 칸 수가 기능 수에 따라 늘지 않는다.
   */
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    // 크림 스크림 위 — 표면 틴트로 눌러 담는다
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: { color: colors.textSecondary, fontSize: 11, fontWeight: '700' },
}));
