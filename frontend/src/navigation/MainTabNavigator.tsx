/** 메인 하단 탭 — 홈 / 건강(운동+식단) / [＋FAB] / 채팅 / 플레이스 */
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { MainTabParamList } from './types';
import { colors, fontSize, radius, shadow, spacing } from '../constants/theme';
import { HomeStackNavigator } from './HomeStackNavigator';
import { WorkoutStackNavigator } from './WorkoutStackNavigator';
import { ChatStackNavigator } from './ChatStackNavigator';
import { PlaceStackNavigator } from './PlaceStackNavigator';
import { haptics } from '../utils/haptics';

const Tab = createBottomTabNavigator<MainTabParamList>();

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const TAB_META: Record<keyof MainTabParamList, { label: string; icon: IconName }> = {
  Home: { label: '홈', icon: 'heart-multiple-outline' },
  Workout: { label: '건강', icon: 'heart-pulse' },
  Chat: { label: '채팅', icon: 'chat-outline' },
  Place: { label: '플레이스', icon: 'map-marker-outline' },
};

// FAB 액션시트 항목 — 탭(스택)+중첩 화면으로 이동
const FAB_ACTIONS: { icon: IconName; label: string; go: (nav: BottomTabBarProps['navigation']) => void }[] = [
  { icon: 'dumbbell', label: '운동 기록', go: (n) => n.navigate('Workout', { screen: 'WorkoutRecord' }) },
  { icon: 'camera-outline', label: '음식 촬영', go: (n) => n.navigate('Workout', { screen: 'DietRecord' }) },
  { icon: 'map-marker-plus-outline', label: '맛집 핀', go: (n) => n.navigate('Place', { screen: 'PlaceAdd' }) },
  { icon: 'image-plus', label: '일상 남기기', go: (n) => n.navigate('Home', { screen: 'FeedCompose' }) },
];

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const [sheetOpen, setSheetOpen] = useState(false);

  const renderTab = (routeName: keyof MainTabParamList, index: number) => {
    const meta = TAB_META[routeName];
    const focused = state.index === index;
    return (
      <TouchableOpacity
        key={routeName}
        style={styles.tabItem}
        activeOpacity={0.7}
        onPress={() => {
          const event = navigation.emit({ type: 'tabPress', target: state.routes[index].key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(routeName);
        }}
      >
        {/* 비활성도 textSecondary — textMuted(#9A98A4)는 흰 탭바 위 2.84:1 로 WCAG 미달 */}
        <MaterialCommunityIcons
          name={meta.icon}
          size={24}
          color={focused ? colors.primary : colors.textSecondary}
        />
        <Text style={[styles.tabLabel, { color: focused ? colors.primary : colors.textSecondary }]}>
          {meta.label}
        </Text>
      </TouchableOpacity>
    );
  };

  const routeNames = state.routes.map((r) => r.name as keyof MainTabParamList);

  const onAction = (go: (nav: BottomTabBarProps['navigation']) => void) => {
    setSheetOpen(false);
    haptics.light();
    go(navigation);
  };

  return (
    <>
      <View style={[styles.bar, { paddingBottom: insets.bottom || spacing.sm }]}>
        {renderTab(routeNames[0], 0)}
        {renderTab(routeNames[1], 1)}

        {/* 중앙 FAB */}
        <View style={styles.fabSlot}>
          <TouchableOpacity
            style={styles.fab}
            activeOpacity={0.85}
            onPress={() => {
              haptics.light();
              setSheetOpen(true);
            }}
          >
            <MaterialCommunityIcons name="plus" size={30} color={colors.white} />
          </TouchableOpacity>
        </View>

        {renderTab(routeNames[2], 2)}
        {renderTab(routeNames[3], 3)}
      </View>

      {/* 액션시트 */}
      <Modal visible={sheetOpen} transparent animationType="fade" onRequestClose={() => setSheetOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setSheetOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
            <View style={styles.grabber} />
            {FAB_ACTIONS.map((a) => (
              <TouchableOpacity key={a.label} style={styles.action} activeOpacity={0.7} onPress={() => onAction(a.go)}>
                <View style={styles.actionIcon}>
                  <MaterialCommunityIcons name={a.icon} size={22} color={colors.primary} />
                </View>
                <Text style={styles.actionLabel}>{a.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.cancel} activeOpacity={0.7} onPress={() => setSheetOpen(false)}>
              <Text style={styles.cancelText}>취소</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export function MainTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      <Tab.Screen name="Home" component={HomeStackNavigator} />
      <Tab.Screen name="Workout" component={WorkoutStackNavigator} />
      <Tab.Screen name="Chat" component={ChatStackNavigator} />
      <Tab.Screen name="Place" component={PlaceStackNavigator} />
    </Tab.Navigator>
  );
}

const FAB_SIZE = 58;

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceCard,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    ...shadow.md,
  },
  // minHeight 48 — 아이콘+라벨만으론 40px 이라 터치 타깃 권장(44px)에 못 미친다
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 48 },
  tabLabel: { fontSize: 11, fontWeight: '700', lineHeight: 14 },
  fabSlot: { width: 72, alignItems: 'center', justifyContent: 'center' },
  fab: {
    position: 'absolute',
    top: -32, // tabItem minHeight 48 로 슬롯 중심이 4px 내려간 만큼 보정 (탭바 상단과 플러시 유지)
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: colors.surfaceCard,
    ...shadow.md,
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surfaceCard,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginBottom: spacing.md,
  },
  action: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { fontSize: fontSize.subtitle, fontWeight: '700', color: colors.textPrimary },
  cancel: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.xs },
  cancelText: { fontSize: fontSize.subtitle, fontWeight: '700', color: colors.textSecondary },
});
