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
import { getAccentVariant, getScheme, palette, type Palette } from './colors';
import { chatPalette, getChatPhotoUri, getChatThemeId, type ChatPalette } from './chatTheme';

type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

export function themedStyles<T extends NamedStyles<T>>(factory: (colors: Palette) => T): T {
  // 캐시 키는 액센트 변형 + 스킴 (colors.ts 의 AccentVariant)
  const cache: Record<string, T> = {};

  const resolve = (): T => {
    const scheme = getScheme();
    const key = `${getAccentVariant()}:${scheme}`;
    if (!cache[key]) cache[key] = StyleSheet.create(factory(palette(scheme)));
    return cache[key];
  };

  return new Proxy({} as T, {
    get: (_target, key: string) => resolve()[key as keyof T],
    ownKeys: () => Reflect.ownKeys(resolve() as object),
    getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
  });
}

/**
 * 채팅방 배경 테마를 따라가는 스타일시트 — 위 {@link themedStyles} 와 같은 원리인데
 * 캐시 키가 <b>액센트 + 스킴 + 채팅 테마</b> 세 축이다.
 *
 * <p>채팅 화면의 스타일 전부가 아니라 <b>배경 위에 놓이는 것들만</b> 이걸로 만든다
 * (말풍선·시간·날짜 구분선). 나머지 크롬(입력바·트레이·헤더)은 앱 팔레트를 따르므로
 * 기존 themedStyles 를 그대로 쓴다 — 한 화면이 두 스타일시트를 나눠 갖는 이유다.
 *
 * <p>화면 갱신은 chatThemeStore 구독이 맡는다. 여기서는 값만 최신으로 돌려준다.
 */
export function chatThemedStyles<T extends NamedStyles<T>>(
  factory: (chat: ChatPalette) => T,
): T {
  const cache: Record<string, T> = {};

  const resolve = (): T => {
    const scheme = getScheme();
    /*
     * 키는 <b>팔레트를 바꾸는 축 전부</b>여야 한다. 하나라도 빠지면 그 축을 바꿨을 때
     * 먼저 캐시된 스타일이 그대로 돌아온다 — 조용히, 화면만 안 바뀐다.
     * · 액센트: '기본' 채팅 테마의 말풍선이 앱 액센트를 따른다
     * · 사진 유무: 맨살 글자가 캡슐을 얻고 구분선이 사라진다(chatTheme 의 withPhoto)
     *   uri <b>값</b>은 스타일을 바꾸지 않으므로 키에 넣지 않는다 — 넣으면 사진을 고를
     *   때마다 캐시가 한 벌씩 새로 쌓인다.
     */
    const key = `${getAccentVariant()}:${scheme}:${getChatThemeId()}:${getChatPhotoUri() ? 'photo' : 'plain'}`;
    if (!cache[key]) cache[key] = StyleSheet.create(factory(chatPalette(scheme)));
    return cache[key];
  };

  return new Proxy({} as T, {
    get: (_target, key: string) => resolve()[key as keyof T],
    ownKeys: () => Reflect.ownKeys(resolve() as object),
    getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
  });
}
