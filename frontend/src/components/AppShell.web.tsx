/**
 * 앱 셸 — PC(웹)에서 콘텐츠를 창처럼 묶는다.
 *
 * <p>실측(1440×900)에서 온보딩 "다음" 버튼이 화면 전폭, 로그인 폼이 1400px 로 늘어났다.
 * 화면 77개를 하나씩 고치는 대신 여기 한 곳에서 최대 폭을 주면 전부 상속한다
 * (docs/PC_APP_ANALYSIS_2026-09-14.md 4절 1단계).
 *
 * <p><b>토스트·다이얼로그까지 이 안에 넣는다.</b> `App.tsx` 에서 네비게이터의 형제로
 * 떠 있는 오버레이들은 화면 전체를 덮는데, 1920px 바탕에 걸친 토스트는 셸과 무관한
 * 위치에 뜬다. 셸 안에 두면 "창 안에서 일어난 일"로 읽힌다.
 *
 * <p>작은 창(≤ shellMaxWidth)에서는 래퍼를 아예 만들지 않는다 — 기본 사용 형태인
 * 420~480px 세로 창에서는 폰 레이아웃이 그대로 맞기 때문이다.
 */
import React, { useEffect, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { colors, layout, shadow } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';
import { ShellRailContext } from './shellRail';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const wide = width > layout.shellMaxWidth;
  /*
   * 레일이 <b>실제로 붙어 있을 때만</b> 셸을 레일 폭만큼 넓힌다 — 그래야 화면 몫이 레일
   * 유무와 무관하게 늘 640 이다(shellRail.ts 의 불변식). 창이 넓다는 것만으로 넓히면
   * 레일이 없는 온보딩·로그인이 728px 로 그려져 useContentWidth() 와 어긋난다.
   */
  const [railMounted, setRailMounted] = useState(false);
  const maxWidth = layout.shellMaxWidth + (railMounted ? layout.railWidth : 0);

  /*
   * 셸 바깥 색을 <html>/<body> 에도 칠한다. 스크롤 바운스 구간과 셸 위아래로 남는
   * 영역은 RN 트리 밖이라, 여기서 칠하지 않으면 흰색으로 비친다.
   */
  useEffect(() => {
    const bg = wide ? colors.shellBackdrop : colors.background;
    const prev = document.body.style.backgroundColor;
    document.body.style.backgroundColor = bg;
    document.documentElement.style.backgroundColor = bg;
    return () => {
      document.body.style.backgroundColor = prev;
    };
  }, [wide]);

  if (!wide) {
    return <ShellRailContext.Provider value={setRailMounted}>{children}</ShellRailContext.Provider>;
  }

  return (
    <ShellRailContext.Provider value={setRailMounted}>
      <View style={styles.backdrop}>
        <View style={[styles.shell, { maxWidth }]}>{children}</View>
      </View>
    </ShellRailContext.Provider>
  );
}

const styles = themedStyles((colors) => ({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.shellBackdrop,
  },
  shell: {
    flex: 1,
    width: '100%',
    backgroundColor: colors.background,
    /*
     * 경계는 <b>그림자와 바탕색 차이</b>로만 만든다 — 좌우 테두리를 그으면 콘텐츠 박스가
     * 그만큼 좁아져(실측 640 → 638) `useContentWidth()` 가 주는 값과 어긋난다. 온보딩
     * 페이저처럼 폭을 직접 계산하는 화면이 장마다 2px 씩 밀렸다. "셸의 콘텐츠 폭 ==
     * layout.shellMaxWidth" 를 깨지 않는 편이 화면 쪽에서 예외를 만들 일이 없다.
     */
    ...shadow.md,
  },
}));
