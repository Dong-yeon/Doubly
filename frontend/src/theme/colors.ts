/**
 * Dubly 컬러 토큰 — 런타임 진입점.
 *
 * <p>값은 {@link ./palette} 에 있다(색의 뜻·대비 실측도 거기). 이 파일은 <b>지금 어느 스킴인가</b>만 다룬다.
 * (constants/theme.ts 가 이 파일을 re-export)
 *
 * <p><b>액센트 변형(green·mint·peach)은 2026-10-05 에 폐지했다</b>(docs/color-redesign-viewer-based_2026-10-05.md 결정 D2).
 * 변형은 소유자 색의 hue 취향이었는데, 소유자 색이 앱 아이콘에 묶이고 크롬이 무채색이 되면서 고를 것이 남지 않았다.
 * 기기에 저장된 'mint'/'peach'(doubly.theme.accent)는 더 읽지 않는다 — 옮길 데이터는 없다.
 *
 * ── 다크모드 ─────────────────────────────────────────────────────
 * 시작 시 저장된 테마(시스템/라이트/다크)와 Appearance 로 스킴을 고르고, 실행 중 전환은 아래
 * colors 프록시·themedStyles 가 <b>읽는 시점</b>에 현재 스킴을 참조해 즉시 반영한다(store/themeStore.ts).
 */
import { Appearance } from 'react-native';
import { readThemeModeSync } from './themePreference';
import { palettes, type Palette, type Scheme } from './palette';

export { palettes };
export type { Palette, Scheme };

/*
 * 현재 스킴 — <b>모듈 수준 가변값</b>이다.
 *
 * 팔레트를 상수로 고정하면(예전 방식) 90개 화면의 StyleSheet 가 시작 시점의 색을
 * 복사해 가버려, 테마를 바꿔도 앱을 다시 열기 전에는 반영되지 않았다.
 * 값을 바꿀 수 있게 두고, 아래 colors 프록시와 themedStyles 가 <b>읽는 시점</b>에
 * 현재 스킴을 참조하게 해서 즉시 전환을 가능하게 한다.
 */
let currentScheme: Scheme = (() => {
  const preferred = readThemeModeSync();
  const resolvedMode = preferred === 'system' ? Appearance.getColorScheme() : preferred;
  return resolvedMode === 'dark' ? 'dark' : 'light';
})();

export function getScheme(): Scheme {
  return currentScheme;
}

/** 스킴 교체 — 화면 갱신은 themeStore 가 맡는다 (여기서는 값만 바꾼다) */
export function setScheme(scheme: Scheme): void {
  currentScheme = scheme;
}

/** 지금 적용 중인 팔레트. themedStyles 가 스타일을 만들 때 쓴다 */
export function palette(scheme: Scheme = currentScheme): Palette {
  return palettes[scheme];
}

/** 현재 테마가 다크인지 — 지도(웹뷰) 등 팔레트 밖 분기에 사용 */
export function isDarkMode(): boolean {
  return currentScheme === 'dark';
}

/*
 * colors — 속성을 <b>읽을 때</b> 현재 팔레트에서 값을 꺼내는 프록시.
 *
 * 덕분에 JSX 안의 `color={colors.primary}` 같은 인라인 사용은 렌더될 때마다
 * 최신 색을 얻는다. 반면 모듈 최상위의 StyleSheet.create 는 한 번만 평가되므로
 * 그쪽은 themedStyles 로 감싸야 한다.
 */
export const colors: Palette = new Proxy({} as Palette, {
  get: (_target, key: string) => palette()[key as keyof Palette],
  // 스프레드(...colors)나 Object.keys 가 동작하도록 열거도 지원한다
  ownKeys: () => Reflect.ownKeys(palettes.light),
  getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
});
