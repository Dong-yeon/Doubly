/**
 * 지금 화면을 "PC 창"으로 그릴 것인가 — 하단 탭 대신 왼쪽 세로 레일을 쓸지의 단일 판단.
 *
 * <p>`AppShell`(셸 폭)과 `MainTabNavigator`(탭바 위치·모양)가 같은 답을 봐야 해서 한 곳에
 * 둔다. 둘이 각자 계산하면 경계 근처에서 레일은 떴는데 셸은 안 넓어지는 어긋남이 난다.
 *
 * <p>조건이 `shellMaxWidth + railWidth` 인 이유는 layout.railWidth 주석 참고.
 */
import { Platform, useWindowDimensions } from 'react-native';
import { layout } from '../constants/theme';

export function useDesktopRail(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width > layout.shellMaxWidth + layout.railWidth;
}
