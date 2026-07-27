/**
 * 크로스 플랫폼 Alert — `react-native` 의 Alert 대신 이걸 쓴다.
 *
 * <b>react-native-web 의 `Alert.alert` 은 빈 함수다</b>(`static alert() {}`).
 * 그래서 웹에서는 확인창이 뜨지 않고 <b>버튼 콜백도 실행되지 않았다</b> —
 * "저장 후 화면 닫기", "삭제 확인" 같은 흐름이 조용히 멈춰 버렸다.
 *
 * 네이티브는 기존 Alert 를 그대로 쓰고, 웹은 window.confirm/alert 로 대체한다.
 */
import { Alert as RNAlert, Platform } from 'react-native';

export interface AlertButton {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

function webAlert(title: string, message?: string, buttons?: AlertButton[]): void {
  const body = [title, message].filter(Boolean).join('\n\n');

  // 버튼이 없거나 하나면 단순 알림 — 확인 후 콜백 실행
  if (!buttons || buttons.length === 0) {
    window.alert(body);
    return;
  }
  if (buttons.length === 1) {
    window.alert(body);
    buttons[0].onPress?.();
    return;
  }

  /*
   * 2개 이상이면 window.confirm 으로 예/아니오를 받는다.
   * 확인 = cancel 이 아닌 첫 버튼(주 액션), 취소 = cancel 스타일 버튼.
   * 선택지가 3개인 경우(예: 카메라/갤러리/취소)는 웹에서 표현할 수 없으므로,
   * 그런 화면은 호출부에서 Platform.OS === 'web' 분기를 따로 둔다.
   */
  const confirmBtn = buttons.find((b) => b.style !== 'cancel') ?? buttons[buttons.length - 1];
  const cancelBtn = buttons.find((b) => b.style === 'cancel');

  if (window.confirm(body)) {
    confirmBtn.onPress?.();
  } else {
    cancelBtn?.onPress?.();
  }
}

export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[]): void {
    if (Platform.OS === 'web') {
      webAlert(title, message, buttons);
      return;
    }
    RNAlert.alert(title, message, buttons);
  },
};
