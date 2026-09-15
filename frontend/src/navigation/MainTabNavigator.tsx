/** 메인 하단 탭 — 홈 / 채팅 / 럽바디 / 럽슐랭 (docs/ALBUM_TAB_IA_2026-09-14.md)
 *  중앙 FAB 는 없다 — FAB 의 4개 액션이 전부 각 화면 자체 버튼과 중복이라(운동 기록/식단
 *  기록/맛집 핀/일상 남기기), 홈 CoupleHero 의 오늘 칩(HomeScreen.onPressToday)이
 *  "안 했으면 기록 화면으로 바로" 분기하도록 바꿔 같은 진입 속도를 새 버튼 없이 재현했다.
 *
 *  운동·식단 탭의 이력: "건강" 한 탭(세그먼트 토글) → 2026-08 두 탭으로 분리
 *  (WorkoutDietSegment 삭제) → 2026-09-14 운동의 조회 빈도가 낮다는 분석으로 다시 한 탭
 *  "럽바디"로 합침. 이번엔 토글이 아니라 <b>식단 메인 + 운동 체크인 카드</b>다.
 *  비운 자리에는 "우리" 탭(Album)이 들어왔다 — 일상·식단·운동·맛집 4소스 사진과
 *  타임라인·여행·작년 오늘을 모은 탭이다. */
import React, { useEffect } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { getFocusedRouteNameFromRoute, StackActions } from '@react-navigation/native';
import { MaterialCommunityIcons } from '../components/Icon';
import type { MainTabParamList } from './types';
import { colors, layout, radius, shadow, spacing } from '../constants/theme';
import { HomeStackNavigator } from './HomeStackNavigator';
import { AlbumStackNavigator } from './AlbumStackNavigator';
import { ChatStackNavigator } from './ChatStackNavigator';
import { HealthStackNavigator } from './HealthStackNavigator';
import { PlaceStackNavigator } from './PlaceStackNavigator';
import { themedStyles } from '../theme/themedStyles';
import { useChatStore } from '../store/chatStore';
import { useActiveWorkoutStore } from '../store/activeWorkoutStore';
import { ActiveWorkoutBar } from '../components/workout/ActiveWorkoutBar';
import { useDesktopRail } from '../hooks/useDesktopRail';
import { useReportShellRail } from '../components/shellRail';
import { isHovered } from '../utils/pointer';

const Tab = createBottomTabNavigator<MainTabParamList>();

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const TAB_META: Record<keyof MainTabParamList, { label: string; icon: IconName }> = {
  Home: { label: '홈', icon: 'heart-multiple-outline' },
  // 일상·식단·운동·맛집 사진 + 타임라인·여행·작년 오늘. "앨범"은 사진 그리드만
  // 기대하게 해서 내용을 좁힌다 — 홈이 "오늘의 우리", 이 탭이 "지금까지의 우리"다.
  // 라벨이 추상적인 만큼 아이콘이 뜻을 붙잡아야 해서 사진 계열을 유지한다.
  Album: { label: '우리', icon: 'image-multiple-outline' },
  Chat: { label: '채팅', icon: 'chat-outline' },
  // 식단 + 운동. "건강"은 정확하지만 트래커 어휘라 럽슐랭 옆에서 톤이 어긋났다 —
  // 같은 접두어로 묶어 둘을 하나의 계열로 읽히게 했다(ALBUM_TAB_IA_2026-09-14.md 5-1).
  Health: { label: '럽바디', icon: 'heart-pulse' },
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

/**
 * 진행 중 운동 바를 숨길 화면 — 이미 그 운동 안에 있으면 "이어서 하기"는 의미가 없다.
 */
const HIDE_ACTIVE_WORKOUT_BAR_ON = new Set(['WorkoutSession']);

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
  // PC 창에서는 하단 탭 대신 왼쪽 세로 레일 — 폭 판단은 useDesktopRail 한 곳에서만 한다
  const rail = useDesktopRail();

  const renderTab = (routeName: keyof MainTabParamList, index: number) => {
    const meta = TAB_META[routeName];
    const focused = state.index === index;
    const showBadge = routeName === 'Chat' && unreadCount > 0;
    /*
     * Pressable 인 이유는 <b>hovered</b> 하나다 — 마우스에는 "누를 수 있는 것"이라는
     * 신호가 커서 모양 말고는 없어서, 레일 아이콘 위에 마우스를 올려도 아무 반응이 없으면
     * 장식처럼 읽힌다. TouchableOpacity 는 hovered 를 주지 않는다.
     * pressed 투명도는 기존 activeOpacity(0.7) 를 그대로 옮긴 것이다.
     */
    return (
      <Pressable
        key={routeName}
        style={(state) => [
          rail ? styles.railItem : styles.tabItem,
          isHovered(state) && !focused ? styles.tabItemHovered : null,
          state.pressed ? styles.tabItemPressed : null,
        ]}
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
      </Pressable>
    );
  };

  const routeNames = state.routes.map((r) => r.name as keyof MainTabParamList);

  // 훅 호출이 끝난 뒤에 판단한다 — 조기 return 이 앞에 오면 훅 순서가 깨진다
  const nestedRoute = getFocusedRouteNameFromRoute(state.routes[state.index]);
  /*
   * 채팅방에서 탭바를 감추는 건 "키보드가 올라올 때 탭바까지 밀려 올라온다"는 폰 사정이다
   * (HIDE_TAB_BAR_ON 주석). 레일은 옆에 세로로 서 있어 키보드와 겹칠 일이 없고, PC 메신저는
   * 대화 중에도 좌측 내비를 그대로 둔다 — 레일일 때는 감추지 않는다.
   */
  if (!rail && nestedRoute && HIDE_TAB_BAR_ON.has(nestedRoute)) return null;

  /*
   * insets.bottom 은 제스처 내비게이션 바가 "그려지는" 높이일 뿐이다 — 실제로 시스템이
   * 화면 아래쪽에서 "홈으로 나가기/최근 앱 보기" 스와이프를 붙잡는 영역은 이보다 더
   * 넓을 수 있다(OEM 스킨마다 다름, 특히 삼성 One UI). 탭바를 insets.bottom 높이까지만
   * 띄우면 시각적으로는 내비게이션 바 위에 떠 있어도, 그 스와이프 인식 영역과는 겹쳐서
   * 탭을 눌렀는데 시스템 제스처(홈/최근 앱)로 먹히는 경우가 있었다(2026-08-31 리포트).
   * 여유분을 더 얹어 탭 터치 영역 자체를 그 구역 위로 확실히 밀어올린다 — 비트윈 등
   * 커플 앱들의 여유 있는 하단 탭바 스타일도 참고해 spacing.md 로 넉넉하게 잡았다.
   *
   * 이건 안드로이드 전용 문제다 — iOS 는 홈 인디케이터 제스처 영역이 insets.bottom
   * 값 그대로 정확해서(OEM 마다 다른 안드로이드와 달리 애플이 직접 규정) 여유분이
   * 필요 없다. 그대로 다 적용했더니 iOS 실기기에서 탭바 아래 여백이 과하게 떠
   * 보였다(2026-09-01 리포트) — 안드로이드만 버퍼를 더한다.
   */
  const bottomPadding =
    Platform.OS === 'android' ? Math.max(insets.bottom, spacing.md) + spacing.md : insets.bottom;

  /*
   * 진행 중 운동 바는 탭바 <b>바로 위</b>에 붙인다. 탭바와 한 덩어리로 그려야 어느 탭에
   * 있든 같은 자리에 나오고, 화면마다 자리를 잡아줄 필요도 없다.
   */
  const showActiveWorkoutBar = !nestedRoute || !HIDE_ACTIVE_WORKOUT_BAR_ON.has(nestedRoute);

  if (rail) {
    return (
      <View style={styles.rail}>
        <View style={styles.railTabs}>{routeNames.map((name, i) => renderTab(name, i))}</View>
        {/* 88px 안에 가로 바가 들어갈 수 없어 축약형으로 — 하는 일("있다는 사실 + 돌아가는 길")은 같다 */}
        {showActiveWorkoutBar ? <ActiveWorkoutBar navigation={navigation} compact /> : null}
      </View>
    );
  }

  return (
    <View>
      {showActiveWorkoutBar ? <ActiveWorkoutBar navigation={navigation} /> : null}
      <View style={[styles.bar, { paddingBottom: bottomPadding }]}>
        {routeNames.map((name, i) => renderTab(name, i))}
      </View>
    </View>
  );
}

export function MainTabNavigator() {
  const rail = useDesktopRail();

  /*
   * 레일이 붙었다는 사실을 셸에 알린다 — 셸이 그만큼 넓어져야 화면 몫이 640 으로 유지된다
   * (components/shellRail.ts). 탭 밖으로 나가면(로그아웃 등) 언마운트 시 되돌린다.
   */
  const reportRail = useReportShellRail();
  useEffect(() => {
    reportRail(rail);
    return () => reportRail(false);
  }, [rail, reportRail]);

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

  /*
   * 진행 중 운동 복원 — 앱을 껐다 켜도 어제 끝내지 못한 운동이 있으면 바로 보여야 한다.
   * 스토어는 표시용 사본이라 기기에 저장된 초안을 원본으로 삼아 한 번 맞춘다
   * (초안이 날짜가 지났거나 비었으면 loadSessionDraft 가 스스로 정리한다).
   */
  useEffect(() => {
    void useActiveWorkoutStore.getState().sync();
  }, []);

  return (
    <Tab.Navigator
      // tabBarPosition 이 'left' 면 내비게이터가 [탭바 | 화면] 가로 배치로 바꿔준다
      screenOptions={{ headerShown: false, tabBarPosition: rail ? 'left' : 'bottom' }}
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      {/* 홈 · 우리 · 채팅 · 럽바디 · 럽슐랭 (ALBUM_TAB_IA_2026-09-14.md 5-1 "탭 순서") */}
      <Tab.Screen name="Home" component={HomeStackNavigator} />
      <Tab.Screen name="Album" component={AlbumStackNavigator} />
      <Tab.Screen name="Chat" component={ChatStackNavigator} />
      <Tab.Screen name="Health" component={HealthStackNavigator} />
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
    /*
     * 세로 여백은 <b>두 겹</b>이었다 — 여기 paddingTop(16)과 tabItem 의 minHeight(56)가
     * 각각 여유를 주는데, 칸 안의 실제 내용은 아이콘 24 + gap 2 + 라벨 14 = 40 뿐이라
     * minHeight 만으로도 위아래 8씩이 이미 있었다. 안드로이드에서 제스처 버퍼까지
     * 더하면 탭바 한 덩어리가 112dp 로, iOS 기본 탭바(49+34=83)보다 30 넘게 높았다
     * ("탭쪽이 너무 넓다", 2026-09-14).
     *
     * 8 로 줄여도 2026-08-31 에 고친 "아이콘이 위쪽 경계에 붙어 보인다"는 안 돌아온다 —
     * 그때는 minHeight 가 없어 8 이 전부였지만, 지금은 minHeight 가 위아래를 한 번 더
     * 벌린다. 아래 제스처 충돌 버퍼(bottomPadding)는 그대로 둔다 — 그건 시각이 아니라
     * 터치가 시스템 제스처에 먹히던 문제라 줄이면 그 버그가 돌아온다.
     */
    paddingTop: spacing.sm,
    ...shadow.md,
  },
  // minHeight 50 — 내용 40 + 위아래 5씩. 터치 타깃 권장 44 는 여전히 넘는다
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 50 },
  // 마우스를 올렸을 때 — 선택된 탭은 이미 색으로 구분되므로 비선택에만 준다
  tabItemHovered: { backgroundColor: colors.surfaceAlt },
  tabItemPressed: { opacity: 0.7 },

  /*
   * PC 창의 왼쪽 세로 레일. 하단 바를 90도 돌린 것이라 아이콘·라벨·배지는 그대로 쓰고
   * 방향과 경계선만 바꾼다 — 같은 renderTab 이 두 모양을 다 그린다.
   */
  rail: {
    width: layout.railWidth,
    height: '100%',
    backgroundColor: colors.surfaceCard,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
  },
  // 탭은 위에서부터 쌓고, 남는 아래 공간은 진행 중 운동 축약 바가 쓴다
  railTabs: { flex: 1, paddingTop: spacing.md },
  railItem: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minHeight: 64,
    paddingVertical: spacing.sm,
  },
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
