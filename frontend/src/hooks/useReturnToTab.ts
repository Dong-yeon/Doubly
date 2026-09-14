/**
 * 다른 탭에서 열린 기록 화면이 닫힐 때 그 탭으로 돌려보낸다.
 *
 * <p><b>왜 필요한가</b>: 홈의 칩·바로가기는 `navigate('Diet', { screen: 'DietRecord' })`
 * 처럼 <b>탭을 건너뛰어</b> 기록 화면을 연다. 각 탭 스택의 첫 화면(DietMain 등)이 그 밑에
 * 깔리므로, 닫기(X)가 부르는 `goBack()` 은 홈이 아니라 <b>그 탭의 메인</b>으로 간다.
 * 홈에서 들어온 사람에게는 "취소"가 아니라 "한 칸 뒤로"로 읽힌다(2026-09-14 리포트).
 *
 * <p>중앙 FAB 를 없애면서 홈 칩이 "탭 안 옮기고 바로 기록"을 물려받았는데, 돌아오는 길은
 * 물려받지 못한 것이다. 이 훅이 그 길이다.
 *
 * <p><b>왜 언마운트인가</b>: 닫는 길이 넷이다 — X · 하드웨어 백 · 모달 스와이프 ·
 * 저장 후 자동 닫기. 화면이 스택에서 빠지는 순간은 그 넷 모두에 공통이다. X 핸들러에만
 * 붙이면 나머지 셋이 빠지고, 이탈 가드(useDirtyGuard)의 확인창을 한 벌 더 쓰게 된다.
 * 가드에서 "계속 쓰기"를 고른 경우에는 애초에 언마운트되지 않으므로 여기도 안 돈다.
 *
 * <p>`jumpTo` 를 쓰는 이유는 <b>탭만 바꾸고 그 탭이 보던 자리는 그대로 두기</b> 위해서다.
 * `navigate` 는 안쪽 화면 지정을 요구한다.
 *
 * <p>같은 탭 안에서 연 경우에는 `returnTo` 가 없고, 그때는 아무 일도 하지 않는다 —
 * 운동 탭에서 연 기록은 운동 탭 메인으로 돌아가는 것이 맞다.
 */
import { useEffect, useRef } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { MainTabParamList } from '../navigation/types';

export function useReturnToTab(returnTo: keyof MainTabParamList | undefined): void {
  const navigation = useNavigation();

  /*
   * 값을 ref 에 담아 두고 <b>언마운트에서만</b> 읽는다. 값을 그대로 effect 의 deps 에 넣으면
   * 파라미터가 바뀔 때 React 가 이전 effect 의 cleanup 을 먼저 돌리는데, 그게 곧 탭 이동이라
   * <b>화면에 그대로 있는데 탭이 바뀐다.</b>
   *
   * <p>실제로 그런 경로가 있다 — 식단 기록에서 바코드를 찍으면 {@code BarcodeScanScreen} 이
   * {@code navigate('DietRecord', { barcodeResult })} 로 같은 인스턴스에 돌아오면서 파라미터를
   * 갈아끼운다. 그때 {@code returnTo} 가 빠지면 스캔 직후 홈 탭으로 튄다.
   *
   * <p>한 번 받은 값을 지우지 않는 것(빈 값이 와도 덮어쓰지 않는 것)도 같은 이유다.
   */
  const returnToRef = useRef(returnTo);
  useEffect(() => {
    if (returnTo) returnToRef.current = returnTo;
  }, [returnTo]);

  useEffect(
    () => () => {
      const tab = returnToRef.current;
      if (tab) navigation.getParent<BottomTabNavigationProp<MainTabParamList>>()?.jumpTo(tab);
    },
    [navigation],
  );
}
