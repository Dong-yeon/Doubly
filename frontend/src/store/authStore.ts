/**
 * 인증 상태 스토어 (Zustand) — 설계서 6.1
 * 토큰은 SecureStore, 사용자 정보는 메모리 보관.
 */
import { create } from 'zustand';
import { STORAGE_KEYS } from '../constants/config';
import { authApi, RegisterPayload } from '../api/auth';
import { isSessionRejected, setAuthFailureHandler } from '../api/client';
import { storage } from '../utils/storage';
import { Alert } from '../utils/alert';
import { formatMonthDay } from '../utils/date';
import { pushTokenForLogout, registerPushTokenIfGranted } from '../utils/push';
import { useChatStore } from './chatStore';
import { usePlanStore } from './planStore';
import { usePlaceStore } from './placeStore';
import { useContentStore } from './contentStore';
import { useCoupleEmojiStore } from './coupleEmojiStore';
import { useRelationStore } from './relationStore';
import { clearAllWritingDrafts } from '../utils/writingDraft';
import type { AuthTokens, Gender, User } from '../types';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /**
   * 저장된 세션은 있는데 서버에 닿지 못해 복원을 못 한 상태. 로그아웃이 아니다 —
   * 토큰은 그대로 두고 RootNavigator 가 "다시 시도" 화면을 보여 준다.
   */
  bootFailed: boolean;
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  /** 구글 로그인 — 검증된 ID 토큰으로 로그인/가입 */
  loginWithGoogle: (idToken: string) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  withdraw: () => Promise<void>;
  updateProfile: (payload: {
    name?: string;
    profileImageUrl?: string;
    birthDate?: string;
    gender?: Gender;
    heightCm?: number;
  }) => Promise<void>;
  /** 서버 기준으로 내 정보 재조회 (역할 변경 등 반영) */
  refreshMe: () => Promise<void>;
  /** 갱신된 사용자로 교체 — 설정 변경 API 가 최신 User 를 돌려주므로 재조회가 불필요하다 */
  setUser: (user: User) => void;
  setSession: (tokens: AuthTokens) => Promise<void>;
}

async function clearTokens() {
  await storage.removeItem(STORAGE_KEYS.accessToken);
  await storage.removeItem(STORAGE_KEYS.refreshToken);
  // 세션 종료 시 채팅 소켓 정리
  useChatStore.getState().teardown();
  // 쓰다 만 글(하루 기록은 나만 보는 글이다)이 다음 계정에 보이지 않게 지운다
  await clearAllWritingDrafts();
  /*
   * "한 번 받으면 재사용" 캐시 스토어(럽슐랭 장소·콘텐츠·우리 이모지)를 비운다 — 안 비우면
   * 로그아웃 후 다른 계정으로 로그인해도 loaded 플래그가 그대로 살아있어 load() 가 재조회를
   * 건너뛰고 이전 계정의 목록이 화면에 그대로 남는다(계정 간 데이터 유출). 우리 이모지는
   * 남의 얼굴이 그려진 이미지라 특히 남으면 안 된다.
   */
  usePlaceStore.getState().reset();
  useContentStore.getState().reset();
  useCoupleEmojiStore.getState().reset();
  useRelationStore.getState().reset();
}

async function persistTokens(tokens: AuthTokens) {
  await storage.setItem(STORAGE_KEYS.accessToken, tokens.accessToken);
  await storage.setItem(STORAGE_KEYS.refreshToken, tokens.refreshToken);
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  bootFailed: false,
  isAuthenticated: false,

  // 앱 시작 시 저장된 토큰 확인 후 프로필 복원
  bootstrap: async () => {
    /*
     * 저장소 읽기는 try 밖에서 던지면 isLoading 이 true 로 남아 스피너가 영원히 돈다
     * (Android 키스토어 복호화 실패·백업 복원 등). 읽을 수 없는 토큰은 없는 것으로 보고 로그인 화면으로 보낸다
     * (docs/first-experience-audit.md #1).
     */
    let token: string | null = null;
    try {
      token = await storage.getItem(STORAGE_KEYS.accessToken);
    } catch {
      await clearTokens().catch(() => undefined);
    }
    if (!token) {
      set({ isAuthenticated: false, isLoading: false, bootFailed: false });
      return;
    }
    set({ isLoading: true, bootFailed: false });
    try {
      // 토큰 만료 시 client 인터셉터가 refresh 를 시도. 실패하면 catch 로 이동.
      const user = await meWithRetry();
      set({ user, isAuthenticated: true, isLoading: false });
      // 인증 복원 후 푸시 토큰 등록 (실패해도 무시)
      registerPushTokenIfGranted();
      // 플랜·잔여 한도 로드 — 실패해도 앱은 그대로 동작한다(서버가 최종 판정을 한다)
      void usePlanStore.getState().load();
      /*
       * 안 읽은 배지(부재중 통화 카드 포함) 로드 — 커플 계정은 ChatScreen 이 방을
       * 열자마자 ChatRoom 으로 replace 하므로(App.tsx 참고) ChatScreen 이 화면에
       * 그려질 일이 없다. loadRooms 가 그 화면에서만 호출되던 예전 구조에선 배지
       * 데이터 자체가 커플 사용자에게 영영 로드되지 않았다 — 여기서 부팅 시 채운다.
       */
      void useChatStore.getState().loadRooms();
    } catch (e) {
      // 서버가 세션을 거절했을 때만 로그아웃. 연결 문제면 토큰을 지키고 다시 시도하게 한다.
      if (isSessionRejected(e)) {
        await clearTokens();
        set({ user: null, isAuthenticated: false, isLoading: false });
      } else {
        set({ isLoading: false, bootFailed: true });
      }
    }
  },

  setSession: async (tokens) => {
    await persistTokens(tokens);
    set({ user: tokens.user, isAuthenticated: true });
    if (tokens.withdrawalCanceled) {
      Alert.alert('다시 오셨네요', '탈퇴 요청을 취소했어요. 기록은 그대로 남아 있어요.');
    }
    // 로그인/회원가입 직후 푸시 토큰 등록 (실패해도 무시)
    registerPushTokenIfGranted();
    // 로그인 직후에도 플랜을 읽는다 — 계정이 바뀌면 한도도 바뀐다
    void usePlanStore.getState().load();
    // 안 읽은 배지 로드 — bootstrap() 과 같은 이유(위 주석 참고)
    void useChatStore.getState().loadRooms();
  },

  login: async (email, password) => {
    const tokens = await authApi.login(email, password);
    await get().setSession(tokens);
  },

  loginWithGoogle: async (idToken) => {
    const tokens = await authApi.googleLogin(idToken);
    await get().setSession(tokens);
  },

  register: async (payload) => {
    const tokens = await authApi.register(payload);
    await get().setSession(tokens);
  },

  setUser: (user) => set({ user }),

  updateProfile: async (payload) => {
    const user = await authApi.updateMe(payload);
    set({ user });
  },

  refreshMe: async () => {
    const user = await authApi.me();
    set({ user });
  },

  logout: async () => {
    // 서버에서 리프레시 토큰과 이 기기의 푸시 토큰 폐기(베스트 에포트) 후 로컬 토큰 삭제
    try {
      const refreshToken = await storage.getItem(STORAGE_KEYS.refreshToken);
      if (refreshToken) await authApi.logout(refreshToken, await pushTokenForLogout());
    } catch {
      // 네트워크 오류 등은 무시 — 로컬 세션 정리는 항상 수행
    }
    await clearTokens();
    set({ user: null, isAuthenticated: false, bootFailed: false });
  },

  /**
   * 탈퇴 요청 — 서버는 삭제 예정일만 남기고 세션을 전부 끊는다. 요청이 실패하면
   * 로그인 상태를 유지한다(예전처럼 finally 로 로그아웃시키면 탈퇴가 된 줄 알게 된다).
   */
  withdraw: async () => {
    const { scheduledDate } = await authApi.withdraw();
    await clearTokens();
    set({ user: null, isAuthenticated: false });
    Alert.alert(
      '탈퇴가 접수됐어요',
      `${formatMonthDay(scheduledDate)}에 계정과 기록이 삭제돼요.\n그 전에 다시 로그인하면 탈퇴가 취소돼요.`,
    );
  },
}));

/**
 * 앱 시작 시 프로필 조회 — 연결 문제면 잠깐 기다렸다 다시 묻는다(1s → 2s → 4s).
 * 앱을 켜는 순간 와이파이↔LTE 전환 등으로 첫 요청만 끊기는 일이 흔하다.
 * 세션 거절(401/403)은 기다려도 바뀌지 않으니 바로 올린다.
 */
async function meWithRetry(): Promise<User> {
  const delays = [1000, 2000, 4000];
  for (let attempt = 0; ; attempt++) {
    try {
      return await authApi.me();
    } catch (e) {
      if (isSessionRejected(e) || attempt >= delays.length) throw e;
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }
}

// refresh 실패 시(client 인터셉터) 세션을 비인증으로 전환. 토큰은 이미 정리됨.
setAuthFailureHandler(() => {
  useChatStore.getState().teardown();
  useAuthStore.setState({ user: null, isAuthenticated: false });
});
