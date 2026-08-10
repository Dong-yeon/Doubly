/**
 * 테마를 따라가는 스타일시트 — RN 의 `StyleSheet.create` 를 대체한다.
 *
 * <p><b>왜 필요한가</b>: 스타일을 모듈 최상위에서 만들면 그 파일이 처음 로드될 때
 * 딱 한 번 평가된다. 그 순간의 색을 복사해 가므로, 이후 팔레트를 바꿔도 이미 만들어진
 * 스타일은 그대로다 — 90개 화면이 전부 그랬고, 그래서 테마를 바꾸려면 앱을 다시
 * 열어야 했다.
 *
 * <p><b>어떻게 푸는가</b>: 스타일을 즉시 만들지 않고 <b>만드는 방법(함수)</b>만 갖고
 * 있다가, `styles.foo` 로 <b>접근하는 시점</b>에 현재 스킴의 스타일을 돌려준다.
 * 스킴별 결과는 한 번만 만들어 캐시하므로 렌더마다 다시 계산하지 않는다.
 *
 * <p>호출부(`styles.foo`)는 손댈 필요가 없다. 선언만 아래처럼 바꾼다.
 *
 * <pre>
 *   const styles = themedStyles((colors) =&gt; ({
 *     safe: { flex: 1, backgroundColor: colors.background },
 *   }));
 * </pre>
 */
import { StyleSheet, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';
import { getScheme, palettes, type Palette, type Scheme } from './colors';

type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

export function themedStyles<T extends NamedStyles<T>>(factory: (colors: Palette) => T): T {
  const cache = {} as Record<Scheme, T>;

  const resolve = (): T => {
    const scheme = getScheme();
    if (!cache[scheme]) cache[scheme] = StyleSheet.create(factory(palettes[scheme]));
    return cache[scheme];
  };

  return new Proxy({} as T, {
    get: (_target, key: string) => resolve()[key as keyof T],
    ownKeys: () => Reflect.ownKeys(resolve() as object),
    getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
  });
}
