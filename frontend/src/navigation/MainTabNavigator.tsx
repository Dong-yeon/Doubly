/** 메인 하단 탭 — 홈 / 건강(운동+식단) / [＋FAB] / 채팅 / 플레이스 */
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { getFocusedRouteNameFromRoute, StackActions } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { MainTabParamList } from './types';
import { colors, fontSize, radius, shadow, spacing } from '../constants/theme';
import { HomeStackNavigator } from './HomeStackNavigator';
import { WorkoutStackNavigator } from './WorkoutStackNavigator';
import { ChatStackNavigator } from './ChatStackNavigator';
import { PlaceStackNavigator } from './PlaceStackNavigator';
import { haptics } from '../utils/haptics';
import { useRelationStore } from '../store/relationStore';
import { toast } from '../store/toastStore';

const Tab = createBottomTabNavigator<MainTabParamList>();

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const TAB_META: Record<keyof MainTabParamList, { label: string; icon: IconName }> = {
  Home: { label: '홈', icon: 'heart-multiple-outline' },
  Workout: { label: '건강', icon: 'heart-pulse' },
  Chat: { label: '채팅', icon: 'chat-outline' },
  Place: { label: '플레이스', icon: 'map-marker-outline' },
};

/**
 * FAB 액션시트 항목 — 탭(스택)+중첩 화면으로 이동.
 * requiresCouple: 맛집·일상은 서버가 activeCouple 을 요구한다(couple_id NOT NULL).
 * 커플 미연결 상태에서 이 화면에 들어가면 다 작성한 뒤 에러가 나므로,
 * 진입 자체를 막고 커플 연결로 안내한다.
 */
const FAB_ACTIONS: {
  icon: IconName;
  label: string;
  go: (nav: BottomTabBarProps['navigation']) => void;
  requiresCouple?: boolean;
}[] = [
  { icon: 'dumbbell', label: '운동 기록', go: (n) => n.navigate('Workout', { screen: 'WorkoutRecord' }) },
  { icon: 'camera-outline', label: '음식 촬영', go: (n) => n.navigate('Workout', { screen: 'DietRecord' }) },
  { icon: 'map-marker-plus-outline', label: '맛집 핀', go: (n) => n.navigate('Place', { screen: 'PlaceAdd' }), requiresCouple: true },
  { icon: 'image-plus', label: '일상 남기기', go: (n) => n.navigate('Home', { screen: 'FeedCompose' }), requiresCouple: true },
];

/**
 * 탭바를 숨길 중첩 화면들.
 *
 * <p>채팅방은 입력창이 화면 바닥에 붙는다. 탭바가 남아 있으면 키보드가 올라올 때
 * 탭바까지 같이 밀려 올라와 입력창 아래에 떠 있는 꼴이 됐다. 대화 중에는 탭 이동도
 * 필요 없으므로(카톡·라인도 대화방에선 하단 내비가 없다) 아예 감춘다.
 */
const HIDE_TAB_BAR_ON = new Set(['ChatRoom']);

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const [sheetOpen, setSheetOpen] = useState(false);
  const couple = useRelationStore((s) => s.couple);

  const renderTab = (routeName: keyof MainTabParamList, index: number) => {
    const meta = TAB_META[routeName];
    const focused = state.index === index;
    return (
      <TouchableOpacity
        key={routeName}
        style={styles.tabItem}
        activeOpacity={0.7}
        onPress={() => {
          const route = state.routes[index];
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (event.defaultPrevented) return;
          if (!focused) navigation.navigate(routeName);
          /*
           * 탭을 누르면 <b>그 탭의 첫 화면</b>으로 돌아간다.
           *
           * 예전에는 focused 일 때 아무 것도 하지 않아, 중첩 스택에 남은 깊은 화면에서
           * 빠져나올 방법이 없었다. FAB "음식 촬영"이 건강 탭 스택에 DietRecord 를
           * 밀어넣으면 그 뒤로 건강 탭이 계속 식단 기록으로 열렸다.
           *
           * 대가로 탭을 옮겼다 돌아올 때 보던 위치를 잃는다. 이 앱의 탭은 대부분
           * 얕고, FAB 가 기록 화면을 탭 스택에 남기는 구조라 예측 가능성을 택했다.
           */
          const nestedKey = route.state?.key;
          if (nestedKey) {
            navigation.dispatch({ ...StackActions.popToTop(), target: nestedKey });
          }
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

  // 훅 호출이 끝난 뒤에 판단한다 — 조기 return 이 앞에 오면 훅 순서가 깨진다
  const nestedRoute = getFocusedRouteNameFromRoute(state.routes[state.index]);
  if (nestedRoute && HIDE_TAB_BAR_ON.has(nestedRoute)) return null;

  const onAction = (action: (typeof FAB_ACTIONS)[number]) => {
    setSheetOpen(false);
    haptics.light();
    // 커플이 필요한 액션인데 미연결이면 — 작성 후 에러 대신 연결로 안내
    if (action.requiresCouple && !couple) {
      toast.info('커플을 연결하면 함께 남길 수 있어요.');
      navigation.navigate('Home', { screen: 'CoupleConnect' });
      return;
    }
    action.go(navigation);
  };

  return (
    <>
      {/*
        홈 인디케이터가 있는 기기는 insets.bottom(≈34) 으로 충분하지만, 웹·구형 안드로이드는
        insets.bottom 이 0 이라 라벨이 화면 바닥에 붙어 보였다. 최소 여백을 보장한다.
      */}
      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
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
              <TouchableOpacity key={a.label} style={styles.action} activeOpacity={0.7} onPress={() => onAction(a)}>
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
