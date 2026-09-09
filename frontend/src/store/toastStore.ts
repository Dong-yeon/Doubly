/** 토스트(짧은 알림) 상태 — 어디서든 toast.show('메시지') 로 호출 */
import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info';

/**
 * 되묻기 버튼 — 있으면 토스트가 눌리는 물건이 되고 표시 시간도 길어진다(Toast.tsx).
 * 안 누르고 지나가도 잃는 게 없는, <b>덤으로 얹는 선택</b>에만 쓴다.
 */
export interface ToastAction {
  label: string;
  onPress: () => void;
}

interface ToastData {
  id: number;
  message: string;
  type: ToastType;
  action?: ToastAction;
}

interface ToastState {
  toast: ToastData | null;
  show: (message: string, type?: ToastType, action?: ToastAction) => void;
  hide: () => void;
}

let counter = 0;

export const useToastStore = create<ToastState>((set) => ({
  toast: null,
  show: (message, type = 'success', action) => set({ toast: { id: ++counter, message, type, action } }),
  hide: () => set({ toast: null }),
}));

/** 컴포넌트 밖에서도 쓰기 위한 헬퍼 */
export const toast = {
  success: (m: string, action?: ToastAction) => useToastStore.getState().show(m, 'success', action),
  error: (m: string) => useToastStore.getState().show(m, 'error'),
  info: (m: string) => useToastStore.getState().show(m, 'info'),
};
