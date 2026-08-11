/**
 * 테마 선택(시스템/라이트/다크) 저장소 — <b>동기 읽기</b>가 가능해야 한다.
 *
 * <p><b>왜 별도 저장소인가</b>: 팔레트({@link ../theme/colors})는 모듈이 로드될 때
 * 한 번 결정되고, 88개 화면의 `StyleSheet.create` 가 그 시점의 값을 복사해 간다.
 * 즉 팔레트를 고르는 시점은 <b>앱의 어떤 화면보다도 먼저</b>여야 하는데,
 * AsyncStorage 는 비동기라 그 시점에 값을 줄 수 없다.
 *
 * <p>그래서 저장을 두 갈래로 둔다.
 * <ul>
 *   <li><b>웹</b>: `localStorage` 가 동기라 시작 시점에 바로 읽을 수 있다 → 완전 동작</li>
 *   <li><b>네이티브</b>: 동기 저장소가 없다. 대신 선택을 네이티브 Appearance 에
 *       덮어씌우면(`setColorScheme`) 그 설정이 JS 번들 재적재 후에도 남아 있어,
 *       재시작 시 팔레트가 선택대로 잡힌다.</li>
 * </ul>
 *
 * <p>영구 보관(앱 완전 종료 후 복원)은 AsyncStorage 가 맡는다 —
 * 시작 직후 {@link restoreThemePreference} 가 네이티브 Appearance 에 다시 씌운다.
 */
import { Appearance, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'doubly.theme.mode';

/** 웹에서만 존재하는 동기 저장소 — 네이티브에서는 null */
function webStorage(): Storage | null {
  if (Platform.OS !== 'web') return null;
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null; // 프라이빗 모드 등에서 접근이 막힐 수 있다
  }
}

/**
 * 팔레트를 고를 때 쓰는 동기 조회. 웹이 아니거나 저장값이 없으면 'system'.
 * colors.ts 가 이 함수를 부르므로 <b>여기서 무거운 일을 하면 안 된다</b>.
 */
export function readThemeModeSync(): ThemeMode {
  const stored = webStorage()?.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

/** 저장된 선택 — 설정 화면이 현재 상태를 표시할 때 쓴다 */
export async function loadThemeMode(): Promise<ThemeMode> {
  if (Platform.OS === 'web') return readThemeModeSync();
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

export async function saveThemeMode(mode: ThemeMode): Promise<void> {
  webStorage()?.setItem(STORAGE_KEY, mode);
  await AsyncStorage.setItem(STORAGE_KEY, mode);
}

/**
 * 네이티브 Appearance 에 선택을 덮어쓴다.
 * 이 설정은 네이티브 쪽에 남으므로 JS 번들이 다시 적재돼도 유지된다.
 * 'system' 이면 덮어쓰기를 해제해 기기 설정을 따르게 한다.
 */
export function applyToAppearance(mode: ThemeMode): void {
  if (Platform.OS === 'web') return;
  // 'unspecified' 가 "덮어쓰기 해제"(기기 설정 따르기) — 이 RN 버전은 null 을 받지 않고
  // (ColorSchemeName 타입에도 null 이 없다) 네이티브 AppearanceModule.setColorScheme 이
  // null 로 호출되면 NPE 로 즉시 크래시한다(스플래시 화면에서 앱이 죽는 원인이었음).
  Appearance.setColorScheme(mode === 'system' ? 'unspecified' : mode);
}

/** 앱 시작 직후 저장된 선택을 네이티브 Appearance 에 복원한다 */
export async function restoreThemePreference(): Promise<ThemeMode> {
  const mode = await loadThemeMode();
  applyToAppearance(mode);
  return mode;
}
