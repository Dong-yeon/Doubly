/**
 * 채팅방 배경 테마 — <b>채팅 화면에서만</b> 쓰는 별도 팔레트.
 *
 * <p><b>왜 앱 팔레트({@link ./colors})와 분리했나</b>: 앱 전체 색은 나/상대/함께를
 * 구분하는 <b>의미</b>를 지고 있어서(me=Gold, partner=Green …) 취향으로 갈아끼울 수
 * 없다. 반면 채팅방 배경은 카톡처럼 순전히 취향 문제다. 둘을 한 팔레트에 섞으면
 * "핑크 배경을 골랐더니 기록 화면의 소유자 색이 같이 바뀐다"가 되므로 아예 나눈다.
 *
 * <p><b>왜 배경 하나가 아니라 한 묶음인가</b>: 배경만 바꾸면 그 위에 <b>말풍선 없이</b>
 * 얹혀 있는 것들이 전부 깨진다 — 시간(10px)·"보내는 중"·"수정됨"·날짜 구분선, 그리고
 * 상대 말풍선(기존 surfaceAlt #F1F2F0 은 거의 흰색이라 연한 틴트 배경에 묻힌다).
 * 그래서 테마 하나가 {배경, 내 말풍선, 상대 말풍선, 글자, 구분선}을 통째로 갖는다.
 *
 * <p><b>두 계열이 있다</b>: 연한 배경 + 색 있는 내 말풍선(기본·로즈·스카이·라벤더·피치·민트)과,
 * <b>진한 배경 + 연한 말풍선</b>(차콜·포레스트·인디고·플럼). 뒤쪽은 말풍선 글자가 흰색이
 * 아니라 어두운 색이라 대비 계산의 방향이 반대다 — 검증 규칙은 색 쌍만 보므로 그대로 통과한다.
 *
 * ── 대비 검증 (scripts/verify-chat-theme-contrast.mjs 로 재현) ─────────────
 * 10종 × 라이트/다크 모두 아래 기준을 통과한다.
 *   내 말풍선 위 흰 글자 ≥ 4.5 · 상대 말풍선 글자 ≥ 4.5 · 배경 위 meta ≥ 4.5
 *   상대 말풍선 vs 배경 ≥ 1.10 · 구분선 vs 배경 ≥ 1.18
 *
 * <p>앱 기본 팔레트를 그대로 옮긴 'default' 는 두 군데가 기준 미달이라
 * <b>채팅에서만</b> 값을 고쳤다(앱 전체 primary/textTertiary 는 안 건드린다).
 * <ul>
 *   <li>meta: textTertiary(#767C76)가 배경 #FAFAF9 위에서 4.09 → #6A706A 로 4.86</li>
 *   <li>다크 내 말풍선: primary(#3E8E6B) 위 흰 글자가 3.97 → #2F7A55 로 5.20.
 *       colors.ts 의 primary 는 "버튼 배경"과 "링크 글자"를 겸해 밝기를 낮출 수 없지만
 *       (그 파일 primary 주석 참고), 말풍선은 버튼 역할만 하므로 여기서는 낮출 수 있다.</li>
 * </ul>
 * 'default' 의 "상대 말풍선 vs 배경" 1.08 만 기준(1.10) 아래인데, 이건 <b>현재 출시된
 * 값 그대로</b>다 — 나머지 5종은 전부 그보다 낫다. 기본값을 바꾸면 기존 사용자 화면이
 * 예고 없이 달라지므로 남겨 둔다.
 */
import type { Scheme } from './colors';

export type ChatThemeId =
  | 'default'
  | 'rose'
  | 'sky'
  | 'lavender'
  | 'peach'
  | 'mint'
  /*
   * 아래 넷은 <b>진한 배경 + 연한 말풍선</b> 계열이다(2026-09-18). 위 여섯은 전부 연한
   * 배경에 색 있는 내 말풍선인데, "배경을 진하게 하고 말풍선을 연하게" 쓰고 싶다는
   * 요청이 들어왔다. 기존 여섯의 값을 바꾸면 이미 고른 사람 화면이 예고 없이 변하므로
   * (파일 상단 주석의 같은 이유) 갈아끼우지 않고 새로 넣는다.
   *
   * <p>id 는 <b>소문자 한 단어</b>여야 한다 — 대비 검증 스크립트가
   * {@code id:\s*'([a-z]+)'} 로 읽는다(scripts/verify-chat-theme-contrast.mjs).
   */
  | 'charcoal'
  | 'forest'
  | 'indigo'
  | 'plum';

export interface ChatPalette {
  /** 대화 목록 바탕 */
  background: string;
  /** 내 말풍선 — 위에 bubbleMineText 를 얹는다 */
  bubbleMine: string;
  bubbleMineText: string;
  /** 상대 말풍선 — 사진·우리 이모지의 로딩 배경으로도 쓴다 */
  bubbleTheirs: string;
  bubbleTheirsText: string;
  /** 배경 위에 직접 놓이는 작은 글자 — 시간·"보내는 중"·"수정됨"·날짜 라벨 */
  meta: string;
  /** 날짜 구분선의 가로 줄 */
  dividerLine: string;
  /** 검색에서 골라 온 메시지를 잠깐 강조하는 행 배경 */
  highlight: string;
}

export interface ChatTheme {
  id: ChatThemeId;
  label: string;
  light: ChatPalette;
  dark: ChatPalette;
}

export const CHAT_THEMES: ChatTheme[] = [
  {
    id: 'default',
    label: '기본',
    light: {
      background: '#FAFAF9',
      bubbleMine: '#2A7731',
      bubbleMineText: '#FFFFFF',
      bubbleTheirs: '#F1F2F0',
      bubbleTheirsText: '#1A1D1A',
      meta: '#6A706A',
      dividerLine: '#E1E3E0',
      highlight: '#E9F2EA',
    },
    dark: {
      background: '#1E201C',
      bubbleMine: '#2F7A55',
      bubbleMineText: '#FFFFFF',
      bubbleTheirs: '#31332D',
      bubbleTheirsText: '#ECEEEA',
      meta: '#868C84',
      dividerLine: '#3A3D36',
      highlight: '#12211A',
    },
  },
  {
    id: 'rose',
    label: '로즈',
    light: {
      background: '#FDEEF1',
      bubbleMine: '#C2185B',
      bubbleMineText: '#FFFFFF',
      bubbleTheirs: '#FFFFFF',
      bubbleTheirsText: '#1A1D1A',
      meta: '#7A5C62',
      dividerLine: '#F0D0D8',
      highlight: '#F8DDE4',
    },
    dark: {
      background: '#221A1D',
      bubbleMine: '#A8365F',
      bubbleMineText: '#FFFFFF',
      bubbleTheirs: '#332A2D',
      bubbleTheirsText: '#ECEEEA',
      meta: '#A08E93',
      dividerLine: '#3F3338',
      highlight: '#3A2830',
    },
  },
  {
    id: 'sky',
    label: '스카이',
    light: {
      background: '#ECF3FB',
      bubbleMine: '#1565C0',
      bubbleMineText: '#FFFFFF',
      bubbleTheirs: '#FFFFFF',
      bubbleTheirsText: '#1A1D1A',
      meta: '#556B80',
      dividerLine: '#C9DCEF',
      highlight: '#DCEAF8',
    },
    dark: {
      background: '#171B21',
      bubbleMine: '#2A6DB5',
      bubbleMineText: '#FFFFFF',
      bubbleTheirs: '#262C33',
      bubbleTheirsText: '#ECEEEA',
      meta: '#8B98A5',
      dividerLine: '#333A42',
      highlight: '#22303F',
    },
  },
  {
    id: 'lavender',
    label: '라벤더',
    light: {
      background: '#F2EFFB',
      bubbleMine: '#5E35B1',
      bubbleMineText: '#FFFFFF',
      bubbleTheirs: '#FFFFFF',
      bubbleTheirsText: '#1A1D1A',
      meta: '#67607F',
      dividerLine: '#DAD1F0',
      highlight: '#E6DEF7',
    },
    dark: {
      background: '#1C1A23',
      bubbleMine: '#6B4BB8',
      bubbleMineText: '#FFFFFF',
      bubbleTheirs: '#302C3D',
      bubbleTheirsText: '#ECEEEA',
      meta: '#958DA8',
      dividerLine: '#383345',
      highlight: '#2C2540',
    },
  },
  {
    id: 'peach',
    label: '피치',
    light: {
      background: '#FDF2E9',
      bubbleMine: '#B25500',
      bubbleMineText: '#FFFFFF',
      bubbleTheirs: '#FFFFFF',
      bubbleTheirsText: '#1A1D1A',
      meta: '#7C6550',
      dividerLine: '#EFD9BE',
      highlight: '#F8E3CC',
    },
    dark: {
      background: '#221D18',
      bubbleMine: '#A35C1A',
      bubbleMineText: '#FFFFFF',
      bubbleTheirs: '#332C25',
      bubbleTheirsText: '#ECEEEA',
      meta: '#A0918A',
      dividerLine: '#3F372E',
      highlight: '#3A2E20',
    },
  },
  {
    id: 'mint',
    label: '민트',
    light: {
      background: '#EAF5F0',
      bubbleMine: '#00695C',
      bubbleMineText: '#FFFFFF',
      bubbleTheirs: '#FFFFFF',
      bubbleTheirsText: '#1A1D1A',
      meta: '#556B63',
      dividerLine: '#C4DED2',
      highlight: '#D6EBE1',
    },
    dark: {
      background: '#171F1C',
      bubbleMine: '#2E7D6B',
      bubbleMineText: '#FFFFFF',
      bubbleTheirs: '#252E2A',
      bubbleTheirsText: '#ECEEEA',
      meta: '#8A9B94',
      dividerLine: '#333E39',
      highlight: '#1E322B',
    },
  },

/*
 * ── 진한 배경 계열 ────────────────────────────────────────────────────────
 * 관계가 위 여섯과 <b>뒤집혀</b> 있다. 배경이 가장 어둡고 말풍선 둘이 모두 밝으며,
 * 말풍선 글자는 흰색이 아니라 <b>어두운 색</b>이다.
 *
 * <p>둘 다 밝은 말풍선이라 나/상대가 안 갈릴까 싶지만, 좌우 정렬이 이미 갈라 주고
 * 있고 내 말풍선에만 색을 준다(상대는 무채에 가깝게) — 카톡의 진한 테마와 같은 방식이다.
 *
 * <p>라이트/다크 차이는 크지 않다. 테마 자체가 어두운 쪽이라 배경만 한 단계 더
 * 내리고 말풍선 채도를 조금 낮춘다. 여기서 라이트를 밝게 만들면 "진한 배경"이라는
 * 고른 이유가 시스템 설정에 따라 사라진다.
 */
  {
    id: 'charcoal',
    label: '차콜',
    light: {
      background: '#23262B',
      bubbleMine: '#FFE9A8',
      bubbleMineText: '#1F1B0E',
      bubbleTheirs: '#F2F4F7',
      bubbleTheirsText: '#1A1D22',
      meta: '#A9AEB6',
      dividerLine: '#3A3F47',
      highlight: '#343A42',
    },
    dark: {
      background: '#17191D',
      bubbleMine: '#F2DC9E',
      bubbleMineText: '#1F1B0E',
      bubbleTheirs: '#E6E9ED',
      bubbleTheirsText: '#1A1D22',
      meta: '#9BA0A8',
      dividerLine: '#2C2F35',
      highlight: '#282C32',
    },
  },
  {
    id: 'forest',
    label: '포레스트',
    light: {
      background: '#1C2A20',
      bubbleMine: '#CDEBD6',
      bubbleMineText: '#10251A',
      bubbleTheirs: '#F1F4F0',
      bubbleTheirsText: '#1A1D1A',
      meta: '#9FB3A4',
      dividerLine: '#2E4235',
      highlight: '#2A3C31',
    },
    dark: {
      background: '#131E17',
      bubbleMine: '#BFE0C9',
      bubbleMineText: '#10251A',
      bubbleTheirs: '#E4E9E3',
      bubbleTheirsText: '#1A1D1A',
      meta: '#94A898',
      dividerLine: '#23332A',
      highlight: '#1F2E25',
    },
  },
  {
    id: 'indigo',
    label: '인디고',
    light: {
      background: '#1B2440',
      bubbleMine: '#D8E2FF',
      bubbleMineText: '#131A2E',
      bubbleTheirs: '#F2F4FA',
      bubbleTheirsText: '#1A1D2A',
      meta: '#A3AECB',
      dividerLine: '#2E3A5C',
      highlight: '#293354',
    },
    dark: {
      background: '#131A2E',
      bubbleMine: '#C9D6F7',
      bubbleMineText: '#131A2E',
      bubbleTheirs: '#E5E9F2',
      bubbleTheirsText: '#1A1D2A',
      meta: '#97A2BE',
      dividerLine: '#232C47',
      highlight: '#1E2740',
    },
  },
  {
    id: 'plum',
    label: '플럼',
    light: {
      background: '#2A1E2E',
      bubbleMine: '#F5DCEC',
      bubbleMineText: '#2A1226',
      bubbleTheirs: '#F5F2F6',
      bubbleTheirsText: '#201A22',
      meta: '#B7A4BB',
      dividerLine: '#3E2E44',
      highlight: '#3A2A40',
    },
    dark: {
      background: '#1D1420',
      bubbleMine: '#E9CFE0',
      bubbleMineText: '#2A1226',
      bubbleTheirs: '#E9E4EB',
      bubbleTheirsText: '#201A22',
      meta: '#A992AD',
      dividerLine: '#332438',
      highlight: '#2C1F31',
    },
  },
];

export const DEFAULT_CHAT_THEME_ID: ChatThemeId = 'default';

const byId = new Map(CHAT_THEMES.map((t) => [t.id, t]));

export function isChatThemeId(value: unknown): value is ChatThemeId {
  return typeof value === 'string' && byId.has(value as ChatThemeId);
}

/*
 * 현재 선택 — colors.ts 의 currentScheme 과 같은 이유로 <b>모듈 수준 가변값</b>이다.
 * 아래 chatThemedStyles 가 <b>읽는 시점</b>에 이 값을 참조해야 즉시 전환이 된다.
 * 화면을 다시 그리는 건 chatThemeStore 가 맡는다.
 */
let currentId: ChatThemeId = DEFAULT_CHAT_THEME_ID;

export function getChatThemeId(): ChatThemeId {
  return currentId;
}

export function setChatThemeId(id: ChatThemeId): void {
  currentId = id;
}

export function chatPalette(scheme: Scheme, id: ChatThemeId = currentId): ChatPalette {
  const theme = byId.get(id) ?? byId.get(DEFAULT_CHAT_THEME_ID)!;
  return theme[scheme];
}
