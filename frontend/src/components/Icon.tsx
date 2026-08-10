import createIconSet from '@expo/vector-icons/build/createIconSet';

import glyphMap from '../../assets/icon-glyphmap.json';

/**
 * 앱 전용 MaterialCommunityIcons — 쓰는 글리프만 담은 세트.
 *
 * <p><b>왜 패키지를 직접 안 쓰나</b>: `@expo/vector-icons/MaterialCommunityIcons` 는
 * 7,448개 전체 이름→코드포인트 표(225KB)를 JS 번들에 싣는다. 앱이 쓰는 건 100개
 * 남짓이라 대부분이 낭비다. 패키지 모듈은 아래 한 줄이 전부이므로
 * ({@code createIconSet(glyphMap, 'material-community', font)}) 같은 구성을
 * <b>줄인 글리프맵</b>으로 다시 만들면 된다.
 *
 * <p>글리프맵과 폰트 모두 {@code scripts/subset-icon-font.cjs} 가 <b>같은 이름
 * 목록</b>에서 생성하므로 서로 어긋나지 않는다. 빌드(build:web)에 묶여 있다.
 *
 * <p><b>안전망</b>: 화면들이 쓰는 {@code IconName} 은
 * {@code React.ComponentProps<typeof MaterialCommunityIcons>['name']} 이라
 * 이 글리프맵의 키 유니온이다. 목록에서 빠진 아이콘을 쓰면 렌더가 조용히
 * 비는 게 아니라 <b>tsc 에러</b>가 난다.
 *
 * <p>폰트 파일은 앱 에셋 사본을 넘긴다 — App.tsx 가 'material-community' 로
 * 로드하는 것과 같은 파일이다.
 */
export const MaterialCommunityIcons = createIconSet(
  glyphMap,
  'material-community',
  require('../../assets/fonts/MaterialCommunityIcons.ttf'),
);
