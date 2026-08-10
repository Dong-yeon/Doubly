/**
 * 입력 모달 닫기 공용 정책 — 입력값이 있으면 확인 후 닫는다.
 *
 * <p>모달 백드롭 탭은 "키보드를 닫으려는 탭"과 자리가 겹쳐 실수로 눌리기 쉽다.
 * 즉시 닫으면 작성 중이던 폼이 통째로 사라지므로, 입력이 있을 때만 한 번 묻는다.
 * 백드롭 onPress 와 Modal onRequestClose(Android 백) 양쪽에 같은 핸들러를 쓴다.
 * 모달 안의 명시적 "취소" 버튼은 의도가 분명하므로 바로 닫아도 된다.
 */
import { Alert } from './alert';

export function confirmDiscard(dirty: boolean, close: () => void): void {
  if (!dirty) {
    close();
    return;
  }
  Alert.alert('작성 중인 내용이 있어요', '닫으면 입력한 내용이 사라져요.', [
    { text: '계속 쓰기', style: 'cancel' },
    { text: '닫기', style: 'destructive', onPress: close },
  ]);
}
