/**
 * 여행 하위 화면(경비·준비물·앨범·회고) 사이를 바로 오가는 전환 바.
 *
 * <p><b>왜 필요한가</b>: 네 화면이 각각 별도로 push 되고 서로 이어지는 길이 없어서,
 * 경비를 보다 준비물로 가려면 <i>뒤로 → 여행 상세 스크롤 → 준비물 탭</i>을 매번
 * 반복해야 했다. 여행 준비 중에는 이 네 곳을 오가는 것이 주된 행동이라 왕복 비용이 크다.
 *
 * <p><b>replace 를 쓰는 이유</b>: navigate 로 쌓으면 경비→준비물→앨범을 거친 뒤
 * 뒤로가기를 세 번 눌러야 여행 상세로 돌아온다. 형제 간 이동은 <b>교체</b>가 맞고,
 * 그래야 뒤로가기가 언제나 "여행 상세로"라는 한 가지 뜻을 유지한다.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { PlaceStackParamList } from '../../navigation/types';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';

type Nav = NativeStackNavigationProp<PlaceStackParamList>;
type SectionRoute = 'TripExpense' | 'TripChecklist' | 'TripAlbum' | 'TripRecap';

const SECTIONS: {
  route: SectionRoute;
  label: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
}[] = [
  { route: 'TripExpense', label: '경비', icon: 'wallet-outline' },
  { route: 'TripChecklist', label: '준비물', icon: 'bag-personal-outline' },
  { route: 'TripAlbum', label: '앨범', icon: 'image-multiple-outline' },
  { route: 'TripRecap', label: '회고', icon: 'text-box-outline' },
];

interface Props {
  tripId: number;
  title: string;
}

export function TripSectionTabs({ tripId, title }: Props) {
  const navigation = useNavigation<Nav>();
  const route = useRoute();
  const current = route.name as SectionRoute;

  return (
    <View style={styles.row}>
      {SECTIONS.map((s) => {
        const active = s.route === current;
        return (
          <TouchableOpacity
            key={s.route}
            style={[styles.tab, active && styles.tabActive]}
            activeOpacity={0.8}
            disabled={active}
            onPress={() => navigation.replace(s.route, { tripId, title })}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={s.label}
          >
            <MaterialCommunityIcons
              name={s.icon}
              size={16}
              color={active ? colors.primary : colors.textSecondary}
            />
            <Text style={[styles.label, active && styles.labelActive]}>{s.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = themedStyles((colors) => ({
  row: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  tab: {
    flex: 1,
    minHeight: 44, // 자주 오가는 버튼이라 타깃을 확보한다
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tabActive: { backgroundColor: colors.primaryBg, borderColor: colors.primary },
  label: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700' },
  labelActive: { color: colors.primary, fontWeight: '800' },
}));
