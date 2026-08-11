/**
 * 안드로이드에서 FlatList 를 직접 감싸는 화면의 키보드 회피용.
 *
 * <p><b>왜 필요한가</b>: `KeyboardAvoidingView` 의 `behavior="height"` 는
 * ScrollView 기반 폼(예: {@link FormKeyboardView})에서는 잘 동작하지만,
 * FlatList 를 직접 자식으로 두는 화면(채팅방·질문·장소 상세 등)에서는
 * Android 15+ edge-to-edge 아래에서 컨테이너 높이가 아예 갱신되지 않아
 * 키보드가 입력창을 그대로 덮는 문제가 실기기에서 확인됐다
 * (adb logcat/screencap 으로 재현 — FormKeyboardView 화면은 정상, FlatList
 * 화면만 실패).
 *
 * <p>그래서 RN 의 자동 높이 보정에 기대는 대신, 키보드 표시/숨김 이벤트를
 * 직접 구독해 실측 키보드 높이를 받아 그 값만큼 `paddingBottom` 을 준다 —
 * 애니메이션이 아닌 상태값이라 컨테이너 리사이즈 로직에 의존하지 않는다.
 *
 * <p>iOS 는 대상이 아니다(0 을 반환) — iOS 는 `KeyboardAvoidingView` 의
 * `behavior="padding"` 이 그대로 잘 동작한다.
 */
import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

export function useAndroidKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const onShow = Keyboard.addListener('keyboardDidShow', (e) =>
      setHeight(e.endCoordinates?.height ?? 0),
    );
    const onHide = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  return height;
}
