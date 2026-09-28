/**
 * 히어로 아래 바로가기 줄.
 *
 * <p>예전에는 2×2 로 놓인 큼직한 사각 버튼 네 개였다. 배경 사진 위에 불투명한
 * 상자 넷이 얹히니 사진이 가려지고, 정작 아래 피드보다 시선을 먼저 끌었다.
 * 아이콘 + 짧은 라벨의 칩 한 줄로 눌러 담았다.
 *
 * <p><b>칸을 늘리는 자리가 아니다.</b> 기능이 늘 때마다 여기 칩을 더하다 7칸까지 갔고
 * (320px 에서 칸당 45px) 다음이 오면 8칸이었다. 지금은 <b>셋</b>이고(일상·캘린더·스티커 상점 —
 * 우리 기록·사진첩은 2026-09-15 에 "우리" 탭으로 갔다) 칸을 늘리지 않는 자리다 —
 * 새 기능은 각자의 탭이나 딥링크·푸시로 닿게 하고 이 줄은 건드리지 않는다.
 *
 * <p>"더보기" 시트를 두는 안도 만들어 봤다가 버렸다(2026-09-12): 목록을 하나 만들면
 * 그것이 다시 서랍이 되어, 새 기능이 칩 대신 그 목록에 쌓일 뿐 "홈이 런처를 겸한다"는
 * 구조가 그대로 남는다. 무엇을 남기고 무엇을 내렸는지는 HomeScreen 의 호출부 주석에 있다.
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '../../../components/Icon';
import { colors, fontSize, radius, spacing } from '../../../constants/theme';
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
          <MaterialCommunityIcons name={a.icon} size={20} color={colors.textPrimary} />
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
  /*
   * 한 줄에 같은 폭 셋(2026-09-28). 그 전(9/23~)에는 아이콘+작은 라벨 텍스트 버튼을 왼쪽에 모았는데,
   * 히어로가 가운데로 돌아오면서 가운데에 모으니 원래 작던 버튼이 <b>더 작아 보였다</b>(동연님 지적).
   * 칸이 셋으로 정해져 있으니 폭을 나눠 가져도 "빈자리가 있다"로 읽히지 않는다 — 9/15 에 왼쪽으로
   * 모은 이유(둘을 폭 전체에 펴면 사이가 벌어진다)는 칸 사이가 아니라 칸 자체가 넓어지는 이 방식에는 해당하지 않는다.
   * 줄은 패널 폭을 그대로 쓴다 — alignSelf:center 로 가운데 묶으면 줄이 내용 폭으로 줄어 칸이 제각각 넓어진다.
   */
  row: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xs },
  // 칸 하나 — 옅은 판 위에 아이콘 + 라벨. 높이 52 (터치 타깃 44 보다 넉넉히)
  item: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 52,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
  },
  pressed: { opacity: 0.6 },
  label: { color: colors.textPrimary, fontSize: fontSize.body, fontWeight: '700', flexShrink: 1 },
}));
