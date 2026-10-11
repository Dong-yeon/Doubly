/**
 * 앱 셸 — 네이티브에서는 아무것도 하지 않는다.
 *
 * <p>큰 화면에서 폰 UI 가 그대로 늘어나는 문제는 PC(웹) 전용이라, 실제 구현은
 * `AppShell.web.tsx` 에만 있다. 파일을 나눠 두면 네이티브 번들에는 `useWindowDimensions`
 * 구독조차 실리지 않는다.
 *
 * <p>docs/PC_APP_ANALYSIS_2026-09-14.md 4절 1단계.
 */
import React from 'react';

export function AppShell({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
