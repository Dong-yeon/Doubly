/**
 * 화면이 실제로 쓸 수 있는 가로 폭.
 *
 * <p>네이티브에서는 창 폭 그대로다. 웹에서는 `AppShell` 이 콘텐츠를 `layout.shellMaxWidth`
 * 로 묶으므로 <b>창 폭이 아니라 셸 폭</b>이 답이다.
 *
 * <p>왜 필요한가: 격자 셀 크기·페이저 한 장의 폭처럼 "화면 폭"을 직접 계산하는 자리는
 * 그동안 `useWindowDimensions()` 를 썼다. 셸이 생기면서 이 값이 셸보다 커졌고, 1024px
 * 창에서 온보딩 슬라이드가 640px 셸 안에 1024px 로 그려져 내용이 오른쪽으로 밀렸다
 * (2026-09-14 실측). 높이는 셸이 건드리지 않으므로 그대로 `useWindowDimensions` 를 쓴다.
 */
import { Platform, useWindowDimensions } from 'react-native';
import { layout } from '../constants/theme';

export function useContentWidth(): number {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' ? Math.min(width, layout.shellMaxWidth) : width;
}
