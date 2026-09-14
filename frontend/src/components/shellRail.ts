/**
 * "지금 화면에 세로 레일이 실제로 붙어 있는가" 를 셸에게 알려 주는 통로.
 *
 * <p><b>왜 필요한가</b>: 레일은 탭 내비게이터만 그린다(온보딩·로그인에는 없다). 그런데 셸
 * 폭은 `AppShell` 이 정한다. 둘이 어긋나면 화면이 실제로 쓰는 폭과 `useContentWidth()` 가
 * 주는 값이 달라지고, 그 순간 폭을 직접 계산하는 화면(온보딩 페이저 등)이 어긋난다 —
 * 셸 테두리 2px 로 이미 한 번 겪은 문제다.
 *
 * <p>지키려는 불변식은 하나다: <b>화면이 쓰는 폭 == layout.shellMaxWidth</b>.
 * 레일이 붙으면 셸이 레일 폭만큼 넓어져서(640 + 88) 화면 몫은 그대로 640 이 된다.
 *
 * <p>Context 기본값이 no-op 이라 네이티브(`AppShell.tsx` 는 Provider 를 두지 않는다)와
 * 셸이 꺼진 작은 창에서도 호출부는 그대로 둘 수 있다.
 */
import { createContext, useContext } from 'react';

export const ShellRailContext = createContext<(mounted: boolean) => void>(() => {});

export function useReportShellRail(): (mounted: boolean) => void {
  return useContext(ShellRailContext);
}
