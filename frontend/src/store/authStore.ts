/**
 * 인증 상태 스토어 (Zustand) — 설계서 6.1
 * 토큰은 SecureStore, 사용자 정보는 메모리 보관.
 */
import { create } from 'zustand';
import { STORAGE_KEYS } from '../constants/config';
import { authApi, RegisterPayload } from '../api/auth';
import { setAuthFailureHandler } from '../api/client';
import { storage } from '../utils/storage';
import { registerPushTokenIfGranted } from '../utils/push';
import { useChatStore } from './chatStore';
import { usePlanStore } from './planStore';
import { useCallStore } from './callStore';
import type { AuthTokens, Gender, User } from '../types';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
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
  // 세션 종료 시 채팅 소켓·통화 클라이언트 정리
  useChatStore.getState().teardown();
  void useCallStore.getState().teardown();
}

async function persistTokens(tokens: AuthTokens) {
  await storage.setItem(STORAGE_KEYS.accessToken, tokens.accessToken);
  await storage.setItem(STORAGE_KEYS.refreshToken, tokens.refreshToken);
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  // 앱 시작 시 저장된 토큰 확인 후 프로필 복원
  bootstrap: async () => {
    const token = await storage.getItem(STORAGE_KEYS.accessToken);
    if (!token) {
      set({ isAuthenticated: false, isLoading: false });
      return;
    }
    try {
      // 토큰 만료 시 client 인터셉터가 refresh 를 시도. 실패하면 catch 로 이동.
      const user = await authApi.me();
      set({ user, isAuthenticated: true, isLoading: false });
      // 인증 복원 후 푸시 토큰 등록 (실패해도 무시)
      registerPushTokenIfGranted();
      // 플랜·잔여 한도 로드 — 실패해도 앱은 그대로 동작한다(서버가 최종 판정을 한다)
      void usePlanStore.getState().load();
      // 통화 클라이언트 연결 — 연결돼 있어야 상대의 발신을 받을 수 있다(선택 기능, 실패 무시)
      void useCallStore.getState().init();
    } catch {
      await clearTokens();
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  setSession: async (tokens) => {
    await persistTokens(tokens);
    set({ user: tokens.user, isAuthenticated: true });
    // 로그인/회원가입 직후 푸시 토큰 등록 (실패해도 무시)
    registerPushTokenIfGranted();
    // 로그인 직후에도 플랜을 읽는다 — 계정이 바뀌면 한도도 바뀐다
    void usePlanStore.getState().load();
    // 통화 클라이언트 연결(선택 기능, 실패 무시)
    void useCallStore.getState().init();
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
    // 서버에서 리프레시 토큰 폐기(베스트 에포트) 후 로컬 토큰 삭제
    try {
      const refreshToken = await storage.getItem(STORAGE_KEYS.refreshToken);
      if (refreshToken) await authApi.logout(refreshToken);
    } catch {
      // 네트워크 오류 등은 무시 — 로컬 세션 정리는 항상 수행
    }
    await clearTokens();
    set({ user: null, isAuthenticated: false });
  },

  withdraw: async () => {
    try {
      await authApi.withdraw();
    } finally {
      await clearTokens();
      set({ user: null, isAuthenticated: false });
    }
  },
}));

// refresh 실패 시(client 인터셉터) 세션을 비인증으로 전환. 토큰은 이미 정리됨.
setAuthFailureHandler(() => {
  useChatStore.getState().teardown();
  void useCallStore.getState().teardown();
  useAuthStore.setState({ user: null, isAuthenticated: false });
});
