/**
 * 루트 네비게이터 — 인증 상태에 따라 온보딩 / 메인 분기
 */
import React, { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, AppState, Text, View } from 'react-native';
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  getPathFromState,
  useNavigationContainerRef,
  type NavigationState,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from './types';
import { linking } from './linking';
import { OnboardingNavigator } from './OnboardingNavigator';
import { MainTabNavigator } from './MainTabNavigator';
import { PushPermissionPrimer } from '../components/PushPermissionPrimer';
import { Button } from '../components/Button';
import { dismissNotificationsForPath, registerPushTokenOnResume, setCurrentPath } from '../utils/push';
import { usePlanStore } from '../store/planStore';
import { ConsentGateScreen } from '../screens/onboarding/ConsentGateScreen';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import { useChatThemeStore } from '../store/chatThemeStore';
import { useRemoteStickerStore } from '../store/remoteStickerStore';
import { colors } from '../constants/theme';
import { isDarkMode } from '../theme';

const Stack = createNativeStackNavigator<RootStackParamList>();

/** 앱 복귀 때 플랜을 다시 읽는 최소 간격 — 앱을 오가는 동안 매번 부를 이유는 없다 */
const PLAN_RECHECK_MS = 60_000;

/**
 * 네비게이터 자체의 배경색 — 우리 팔레트를 따르게 한다.
 *
 * <p>테마를 안 넘기면 react-navigation 기본값 <b>rgb(242,242,242)</b> 이 쓰인다.
 * 화면이 덮고 있어 평소엔 안 보이지만, <b>탭바 위 24px</b>(FAB 이 튀어나오도록
 * 투명하게 둔 구간)에서 그대로 비쳐 <b>회색 띠</b>가 생겼다. 다크 모드에서는
 * 어두운 앱에 밝은 회색이 그어져 더 도드라진다.
 *
 * <p>{@code key={themeVersion}} 으로 트리를 다시 마운트하므로 이 함수는
 * 전환 때마다 현재 팔레트로 다시 계산된다.
 */
function navTheme() {
  const base = isDarkMode() ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      background: colors.background,
      card: colors.surface,
      text: colors.textPrimary,
      border: colors.border,
      primary: colors.primary,
    },
  };
}

export function RootNavigator() {
  const { isAuthenticated, isLoading, bootFailed, user, bootstrap, logout } = useAuthStore();
  // 약관 개정(또는 동의 이력 없는 기존 가입자) — 재동의 전까지 메인 진입을 막는다
  const needsConsent = isAuthenticated && !!user?.requiresConsent;

  /*
   * 테마 전환 즉시 반영 — themeVersion 이 바뀌면 아래 트리를 통째로 다시 마운트한다.
   *
   * 스타일은 접근 시점에 현재 팔레트를 읽지만(themedStyles), React 는 값이 바뀐 걸
   * 알 방법이 없어 다시 그리지 않는다. 화면마다 구독을 심는 대신 루트에서 한 번
   * 갈아끼우는 편이 90개 화면에 손대지 않아도 되고 누락도 생기지 않는다.
   *
   * 재마운트는 네비게이션 상태를 잃으므로, 직전 상태를 저장해 initialState 로 되돌린다 —
   * 설정 화면에서 테마를 바꾼 사용자가 홈으로 튕기지 않게.
   */
  const themeVersion = useThemeStore((s) => s.version);
  const navStateRef = useRef<NavigationState | undefined>(undefined);

  /*
   * 이번 세션(앱 실행)에서 한 번이라도 인증된 적이 있는지 — 로그아웃으로
   * OnboardingNavigator 가 다시 마운트될 때 Splash 를 건너뛰기 위한 표시다.
   * 최초 부팅에서 로그인 상태로 복원되는 경우도 "인증된 적 있음"이지만,
   * 그때는 애초에 Splash 를 탈 일이 없으니 문제가 없다 — 이후 로그아웃할
   * 때만 이 값이 쓰인다.
   */
  const everAuthenticatedRef = useRef(false);
  useEffect(() => {
    if (isAuthenticated) everAuthenticatedRef.current = true;
  }, [isAuthenticated]);

  useEffect(() => {
    bootstrap();
    void useThemeStore.getState().load();
    // 채팅 배경은 ChatRoomScreen 만 쓰지만, 그 화면이 열리기 전(스플래시 단계)에
    // 미리 읽어 둬야 처음 들어갔을 때 기본색이 한 번 스쳤다 바뀌지 않는다
    void useChatThemeStore.getState().load();
  }, [bootstrap]);

  // 서버 배포 이모티콘 카탈로그 — 저장본을 먼저 펼쳐 방 목록·말풍선이 코드 글자 없이 그려지게 한다.
  // 서버 질의는 인증이 필요하므로 로그인된 뒤에 한다(store/remoteStickerStore)
  useEffect(() => {
    if (isAuthenticated) void useRemoteStickerStore.getState().init();
  }, [isAuthenticated]);

  /*
   * 상단바에 떠 있는 알림 치우기 — <b>앱 전체에서 여기 한 곳</b>이다.
   *
   * <p>예전엔 ChatRoomScreen 만 자기 방 알림을 지웠고, 피드·질문·기념일·무드·게임
   * 알림에는 지우는 경로가 아예 없었다. 탭해서 들어간 한 건만 OS 가 치워 주고 나머지는
   * 읽어도 영영 남았다("알림 읽어도 안 사라짐", 2026-09-14).
   *
   * <p>서버가 보내는 링크(PushLinks)와 화면 경로(linking.ts config)가 같은 문자열이라,
   * 지금 경로를 그대로 견주면 종류를 나열하지 않아도 전부 걸린다. 경로가 <b>바뀔 때만</b>
   * 물어보는 이유는 onStateChange 가 같은 화면에서도 자주 불리기 때문이다 —
   * 네이티브 호출을 매 프레임 하지 않는다.
   */
  const containerRef = useNavigationContainerRef<RootStackParamList>();
  const dismissedPathRef = useRef<string | null>(null);
  const pathOf = useCallback((state: NavigationState | undefined): string | null => {
    if (!state) return null;
    try {
      return getPathFromState(state, linking.config);
    } catch {
      // 경로 맵에 없는 화면 — 지울 알림도 없다
      return null;
    }
  }, []);

  /*
   * 포그라운드 복귀는 경로가 <b>안 바뀐다</b> — 백그라운드에 있는 동안 쌓인 알림은
   * 위 경로 변화 훅으로는 안 걸린다. 돌아올 때 지금 화면 기준으로 한 번 더 훑는다.
   * (ChatRoomScreen 에 있던 AppState 정리가 하던 일을, 화면 종류를 가리지 않고 한다.)
   */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      const path = pathOf(navStateRef.current);
      if (path == null) return;
      dismissedPathRef.current = path;
      void dismissNotificationsForPath(path);
    });
    return () => sub.remove();
  }, [pathOf]);

  /*
   * 앱으로 돌아왔을 때:
   *  - 시스템 설정에서 알림을 켜고 왔으면 그 자리에서 토큰을 등록한다 — 재시작을 기다리면 그사이 알림이 사라진다.
   *  - 플랜을 다시 읽는다(1분에 한 번까지) — 상대가 결제했거나 내 구독이 끝난 걸 재시작 없이 반영한다.
   */
  const planCheckedAtRef = useRef(0);
  useEffect(() => {
    if (!isAuthenticated) return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      void registerPushTokenOnResume();
      if (Date.now() - planCheckedAtRef.current > PLAN_RECHECK_MS) {
        planCheckedAtRef.current = Date.now();
        void usePlanStore.getState().load();
      }
    });
    return () => sub.remove();
  }, [isAuthenticated]);

  // 연결 실패로 세션 복원을 못 했다면, 앱으로 돌아올 때(네트워크가 돌아왔을 가능성이 크다) 다시 묻는다
  useEffect(() => {
    if (!bootFailed) return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void bootstrap();
    });
    return () => sub.remove();
  }, [bootFailed, bootstrap]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  /*
   * 로그인 정보는 있는데 서버에 닿지 못했다 — 로그아웃시키지 않고 기다린다.
   * 예전엔 여기서 토큰을 지워, 앱을 켜는 순간 잠깐 끊기기만 해도 로그인 화면으로 튕겼다.
   */
  if (bootFailed) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 32,
          gap: 12,
          backgroundColor: colors.background,
        }}
      >
        <Text style={{ fontSize: 17, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' }}>
          서버에 연결하지 못했어요
        </Text>
        <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginBottom: 12 }}>
          인터넷 연결을 확인하고 다시 시도해 주세요.{'\n'}로그인은 그대로 유지돼요.
        </Text>
        <Button title="다시 시도" onPress={() => void bootstrap()} />
        <Button title="다른 계정으로 로그인" variant="ghost" onPress={() => void logout()} />
      </View>
    );
  }

  return (
    <>
      {/* linking — 웹 히스토리(pushState) 연동. 없으면 PWA 에서 스와이프백이 앱 이탈이 된다 */}
      <NavigationContainer
        key={themeVersion}
        ref={containerRef}
        theme={navTheme()}
        /*
         * onStateChange 는 <b>첫 상태에는 안 불린다</b>. 알림을 탭해 앱이 콜드 스타트로
         * 그 화면에 바로 뜨는 경우가 정확히 그 경로라, 같은 화면으로 온 나머지 알림이
         * 트레이에 남는다. 준비된 시점에 한 번 훑는다.
         */
        onReady={() => {
          const path = pathOf(containerRef.getRootState());
          if (path == null) return;
          setCurrentPath(path);
          dismissedPathRef.current = path;
          void dismissNotificationsForPath(path);
        }}
        linking={linking}
        initialState={navStateRef.current}
        onStateChange={(state) => {
          navStateRef.current = state;
          const path = pathOf(state);
          if (path == null) return;
          // 이 화면으로 <b>앞으로</b> 올 알림은 아예 트레이에 안 올린다(push.ts 핸들러)
          setCurrentPath(path);
          // 이미 떠 있던 것은 지운다 — 같은 경로로 다시 불려도 네이티브를 또 찌르지 않는다
          if (path === dismissedPathRef.current) return;
          dismissedPathRef.current = path;
          void dismissNotificationsForPath(path);
        }}
      >
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {!isAuthenticated ? (
            <Stack.Screen name="Onboarding">
              {() => <OnboardingNavigator skipSplash={everAuthenticatedRef.current} />}
            </Stack.Screen>
          ) : needsConsent ? (
            <Stack.Screen name="ConsentGate" component={ConsentGateScreen} />
          ) : (
            <Stack.Screen name="Main" component={MainTabNavigator} />
          )}
        </Stack.Navigator>
      </NavigationContainer>
      {/* 인증된 사용자에게만 — 최초 1회 푸시 권한 사전 설명 (Modal 이라 네비게이터와 독립).
          재동의 게이트가 떠 있는 동안에는 권한 요청을 미룬다 */}
      {isAuthenticated && !needsConsent && <PushPermissionPrimer />}
    </>
  );
}
