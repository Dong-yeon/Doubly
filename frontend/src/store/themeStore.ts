/**
 * 테마 상태 — 선택(시스템/라이트/다크)과 현재 적용 중인 스킴.
 *
 * <p>팔레트 자체는 {@link ../theme/colors} 의 모듈 변수가 들고 있다(스타일이 읽는 곳).
 * 이 스토어는 <b>화면을 다시 그리게 만드는 역할</b>을 맡는다 — 값만 바꾸면 React 는
 * 아무것도 모르기 때문이다.
 */
import { Appearance } from 'react-native';
import { create } from 'zustand';
import { getChromeTheme, getScheme, setChromeTheme, setScheme, type ChromeThemeId, type Scheme } from '../theme/colors';
import {
  applyToAppearance,
  loadChromeTheme,
  loadThemeMode,
  saveChromeTheme,
  saveThemeMode,
  type ThemeMode,
} from '../theme/themePreference';

interface ThemeState {
  /** 사용자 선택 */
  mode: ThemeMode;
  /** 실제로 적용 중인 스킴 (system 이면 기기 설정을 따라간 결과) */
  scheme: Scheme;
  /** 버튼 색 테마 — 사용자 선택(palette.ts CHROME_THEMES) */
  chrome: ChromeThemeId;
  /** 테마가 바뀔 때마다 증가 — 화면 트리를 다시 그리는 키로 쓴다 */
  version: number;
  /** 저장된 선택을 불러와 적용 (앱 시작 시 1회) */
  load: () => Promise<void>;
  setMode: (mode: ThemeMode) => Promise<void>;
  setChrome: (chrome: ChromeThemeId) => Promise<void>;
}

function resolve(mode: ThemeMode): Scheme {
  if (mode !== 'system') return mode;
  return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: 'system',
  scheme: getScheme(),
  chrome: getChromeTheme(),
  version: 0,

  load: async () => {
    const [mode, chrome] = await Promise.all([loadThemeMode(), loadChromeTheme()]);
    const scheme = resolve(mode);
    applyToAppearance(mode);
    setScheme(scheme);
    setChromeTheme(chrome);
    // 시작 시점 팔레트와 같으면 굳이 다시 그리지 않는다
    set((s) => {
      const changed = scheme !== s.scheme || chrome !== s.chrome;
      return { mode, scheme, chrome, version: changed ? s.version + 1 : s.version };
    });
  },

  setChrome: async (chrome) => {
    setChromeTheme(chrome);
    set((s) => ({ chrome, version: s.version + 1 }));
    await saveChromeTheme(chrome);
  },

  setMode: async (mode) => {
    const scheme = resolve(mode);
    applyToAppearance(mode);
    setScheme(scheme);
    set((s) => ({ mode, scheme, version: s.version + 1 }));
    // 저장은 화면 갱신을 막지 않도록 뒤에 둔다
    await saveThemeMode(mode);
  },
}));

/*
 * 기기 설정이 바뀌면(제어센터에서 다크 토글) 'system' 을 고른 사용자는 따라가야 한다.
 * 앱이 켜져 있는 동안에도 반응하도록 구독해 둔다.
 */
Appearance.addChangeListener(() => {
  const { mode, scheme } = useThemeStore.getState();
  if (mode !== 'system') return;
  const next = resolve('system');
  if (next === scheme) return;
  setScheme(next);
  useThemeStore.setState((s) => ({ scheme: next, version: s.version + 1 }));
});
