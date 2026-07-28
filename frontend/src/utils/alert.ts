/**
 * 크로스 플랫폼 Alert — `react-native` 의 Alert 대신 이걸 쓴다.
 *
 * 두 가지 문제를 한 곳에서 해결한다.
 * 1. <b>react-native-web 의 `Alert.alert` 은 빈 함수다</b>(`static alert() {}`).
 *    웹에서는 확인창이 뜨지 않고 버튼 콜백도 실행되지 않아 "저장 후 화면 닫기",
 *    "삭제 확인" 같은 흐름이 조용히 멈췄다.
 * 2. 대안으로 `window.confirm` 을 쓰면 브라우저 기본 시스템 창이라 앱과 이질적이고,
 *    선택지가 2개로 제한된다(카메라/갤러리/취소 같은 3지선다 불가).
 *
 * 그래서 플랫폼과 무관하게 앱 디자인 다이얼로그({@link ConfirmDialog})로 통일한다.
 */
import { useDialogStore, type DialogButton } from '../store/dialogStore';

export type AlertButton = DialogButton;

export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[]): void {
    useDialogStore.getState().show(title, message, buttons);
  },
};
