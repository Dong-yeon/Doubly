/**
 * 확인 다이얼로그 상태 — `utils/alert` 의 Alert.alert 이 여기에 밀어 넣는다.
 *
 * 토스트·화면잠금과 같은 전역 패턴이라 컴포넌트 밖에서도 부를 수 있다.
 */
import { create } from 'zustand';

export interface DialogButton {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

export interface DialogData {
  id: number;
  title: string;
  message?: string;
  buttons: DialogButton[];
}

interface DialogState {
  dialog: DialogData | null;
  show: (title: string, message?: string, buttons?: DialogButton[]) => void;
  hide: () => void;
}

let counter = 0;

export const useDialogStore = create<DialogState>((set) => ({
  dialog: null,
  show: (title, message, buttons) =>
    set({
      dialog: {
        id: ++counter,
        title,
        message,
        // 버튼을 안 주면 확인 하나짜리 알림
        buttons: buttons && buttons.length > 0 ? buttons : [{ text: '확인' }],
      },
    }),
  hide: () => set({ dialog: null }),
}));
