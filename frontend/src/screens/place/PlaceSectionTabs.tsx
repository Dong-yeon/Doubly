/**
 * 럽슐랭 탭 하위 화면(가이드/위시리스트/지도) 사이를 바로 오가는 전환 바.
 * {@link TripSectionTabs}와 같은 구조 — 형제 화면 간 이동은 replace 로 교체해야
 * 뒤로가기가 "이전 세그먼트로"가 아니라 언제나 탭 진입 이전 화면으로 향한다.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '../../components/Icon';
import type { PlaceStackParamList } from '../../navigation/types';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';

type Nav = NativeStackNavigationProp<PlaceStackParamList>;
type SectionRoute = 'PlaceGuide' | 'PlaceWishlist' | 'PlaceMap';

const SECTIONS: {
  route: SectionRoute;
  label: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
}[] = [
  { route: 'PlaceGuide', label: '럽슐랭 가이드', icon: 'crown' },
  { route: 'PlaceWishlist', label: '위시리스트', icon: 'heart-outline' },
  { route: 'PlaceMap', label: '지도', icon: 'map-marker-outline' },
];

export function PlaceSectionTabs() {
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
            onPress={() => navigation.replace(s.route)}
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
