/**
 * 히어로 아래 바로가기 줄.
 *
 * <p>예전에는 2×2 로 놓인 큼직한 사각 버튼 네 개였다. 배경 사진 위에 불투명한
 * 상자 넷이 얹히니 사진이 가려지고, 정작 아래 피드보다 시선을 먼저 끌었다.
 * 아이콘 + 짧은 라벨의 반투명 칩 한 줄로 눌러 담았다.
 *
 * <p><b>칸을 늘리는 자리가 아니다.</b> 기능이 늘 때마다 여기 칩을 더하다 7칸까지 갔고
 * (320px 에서 칸당 45px) 다음이 오면 8칸이었다. 지금은 <b>둘</b>이고(일상·캘린더 —
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
import { colors, spacing } from '../../../constants/theme';
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
  /*
   * 좌측 정렬(2026-09-15) — 칸을 `flex: 1` 로 늘려 줄 전체에 고르게 펴던 것을 접었다.
   * "우리" 탭이 생겨 우리 기록·사진첩이 빠지면서 이 줄이 둘로 줄었는데, 둘을 폭 전체에
   * 펴면 칸 사이가 한참 벌어져 <b>"여기 빈자리가 있다"</b>로 읽히고 그 자리가 다시 칩을
   * 부른다(이 파일 상단의 "칸을 늘리는 자리가 아니다"와 같은 방향). 왼쪽에 모아 두면
   * 줄의 길이가 기능 수를 그대로 드러낸다.
   */
  row: { flexDirection: 'row', gap: spacing.lg, marginBottom: spacing.md },
  item: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xs },
  pressed: { opacity: 0.6 },
  /*
   * 한때 7칸까지 늘어 320px 에서 칸당 45px·라벨 11px 까지 내려갔다. 세로로 못 늘리는
   * 화면이라 새 기능이 전부 이 줄에 가로로 쌓인 결과였다. 칸 수를 못 박았으므로
   * 44px 를 되돌려도 좁은 화면에서 여유가 있다.
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
