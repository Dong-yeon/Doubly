/** 메인 하단 탭 — 홈 / 운동 / 채팅 / 식단 / 장소 (PLAN.md "하단 탭 재구성" 참고)
 *  운동·식단은 원래 "건강" 한 탭에 세그먼트로 묶여 있었으나, 각자 독립 조회 빈도가 높아
 *  탭으로 분리했다(WorkoutDietSegment 는 삭제됨). 중앙 FAB 도 함께 없앴다 — FAB 의 4개
 *  액션이 전부 각 화면 자체 버튼과 중복이라(운동 기록/식단 기록/맛집 핀/일상 남기기),
 *  홈 CoupleHero 의 오늘 칩(HomeScreen.onPressToday)이 "안 했으면 기록 화면으로 바로"
 *  분기하도록 바꿔 같은 진입 속도를 새 버튼 없이 재현했다. */
import React, { useEffect } from 'react';
import { AppState, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { getFocusedRouteNameFromRoute, StackActions } from '@react-navigation/native';
import { MaterialCommunityIcons } from '../components/Icon';
import type { MainTabParamList } from './types';
import { colors, radius, shadow, spacing } from '../constants/theme';
import { HomeStackNavigator } from './HomeStackNavigator';
import { WorkoutStackNavigator } from './WorkoutStackNavigator';
import { ChatStackNavigator } from './ChatStackNavigator';
import { DietStackNavigator } from './DietStackNavigator';
import { PlaceStackNavigator } from './PlaceStackNavigator';
import { themedStyles } from '../theme/themedStyles';
import { useChatStore } from '../store/chatStore';

const Tab = createBottomTabNavigator<MainTabParamList>();

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const TAB_META: Record<keyof MainTabParamList, { label: string; icon: IconName }> = {
  Home: { label: '홈', icon: 'heart-multiple-outline' },
  Workout: { label: '운동', icon: 'dumbbell' },
  Chat: { label: '채팅', icon: 'chat-outline' },
  Diet: { label: '식단', icon: 'silverware-fork-knife' },
  // 맛집 지도 + 여행(Trip) 을 함께 담는다. "장소"(단순 저장)에서 "럽슐랭"(둘이 함께
  // 검증한 미식 가이드북)으로 리브랜딩 — PLAN.md Lovelichelin 참고.
  Place: { label: '럽슐랭', icon: 'crown' },
};

/**
 * 탭바를 숨길 중첩 화면들.
 *
 * <p>채팅방은 입력창이 화면 바닥에 붙는다. 탭바가 남아 있으면 키보드가 올라올 때
 * 탭바까지 같이 밀려 올라와 입력창 아래에 떠 있는 꼴이 됐다. 대화 중에는 탭 이동도
 * 필요 없으므로(카톡·라인도 대화방에선 하단 내비가 없다) 아예 감춘다.
 */
const HIDE_TAB_BAR_ON = new Set(['ChatRoom']);

/*
 * 채팅 탭 안 읽은 배지 — 부재중 통화 카드도 일반 메시지처럼 unreadCount 에 잡힌다
 * (PLAN.md "통화·영상통화" 참고). 커플 계정은 ChatScreen(원래 배지가 있던 자리)이
 * 열리자마자 ChatRoom 으로 replace 돼 그 화면을 볼 일이 없어서, 유일하게 항상
 * 보이는 이 탭 아이콘으로 옮겨 달았다 — 안 그러면 배지 데이터가 있어도 아무도
 * 못 본다.
 */
function useChatUnreadCount() {
  return useChatStore((s) => s.rooms.reduce((sum, r) => sum + r.unreadCount, 0));
}

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const unreadCount = useChatUnreadCount();

  const renderTab = (routeName: keyof MainTabParamList, index: number) => {
    const meta = TAB_META[routeName];
    const focused = state.index === index;
    const showBadge = routeName === 'Chat' && unreadCount > 0;
    return (
      <TouchableOpacity
        key={routeName}
        style={styles.tabItem}
        activeOpacity={0.7}
        accessibilityState={{ selected: focused }}
        onPress={() => {
          const route = state.routes[index];
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (event.defaultPrevented) return;
          if (!focused) navigation.navigate(routeName);
          /*
           * 탭을 누르면 <b>그 탭의 첫 화면</b>으로 돌아간다.
           *
           * 예전에는 focused 일 때 아무 것도 하지 않아, 중첩 스택에 남은 깊은 화면에서
           * 빠져나올 방법이 없었다 — 예: 홈의 오늘 칩으로 DietRecord 에 들어간 뒤
           * 그 탭이 계속 식단 기록으로 열렸다.
           *
           * 대가로 탭을 옮겼다 돌아올 때 보던 위치를 잃는다. 이 앱의 탭은 대부분
           * 얕아 예측 가능성을 택했다.
           */
          const nestedKey = route.state?.key;
          if (nestedKey) {
            navigation.dispatch({ ...StackActions.popToTop(), target: nestedKey });
          }
        }}
      >
        <View>
          {/* 비활성도 textSecondary — textMuted(#9A98A4)는 흰 탭바 위 2.84:1 로 WCAG 미달 */}
          <MaterialCommunityIcons
            name={meta.icon}
            size={24}
            color={focused ? colors.primary : colors.textSecondary}
          />
          {showBadge ? (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
            </View>
          ) : null}
        </View>
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

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
      {routeNames.map((name, i) => renderTab(name, i))}
    </View>
  );
}

export function MainTabNavigator() {
  /*
   * 앱이 백그라운드/종료 상태였다가 포그라운드로 돌아올 때마다 안 읽은 개수를
   * 다시 읽는다 — 부재중 통화·채팅 알림을 보고 앱을 여는 경우가 정확히 이 경로다.
   * 소켓 구독은 채팅방 화면이 열려 있을 때만 살아있으므로(store/chatStore.ts
   * openRoom), 방 밖에서 온 변화는 이렇게 앱 복귀 시점에 맞춰 잡는다.
   */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void useChatStore.getState().loadRooms();
    });
    return () => sub.remove();
  }, []);

  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      <Tab.Screen name="Home" component={HomeStackNavigator} />
      <Tab.Screen name="Workout" component={WorkoutStackNavigator} />
      <Tab.Screen name="Chat" component={ChatStackNavigator} />
      <Tab.Screen name="Diet" component={DietStackNavigator} />
      <Tab.Screen name="Place" component={PlaceStackNavigator} />
    </Tab.Navigator>
  );
}

const styles = themedStyles((colors) => ({
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
  tabBadge: {
    position: 'absolute',
    top: -4,
    right: -10,
    minWidth: 16,
    height: 16,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    // 아이콘 색과 겹쳐도 배지 경계가 또렷하게 — ChatScreen 방 목록 배지와 톤을 맞췄다
    borderWidth: 1.5,
    borderColor: colors.surfaceCard,
  },
  tabBadgeText: { color: colors.white, fontSize: 9, fontWeight: '800', lineHeight: 11 },
}));
