/**
 * 채팅방 배경 테마 선택 — <b>기기별·개인별</b> 설정이다.
 *
 * <p><b>왜 서버에 안 올리나</b>: 카톡과 같은 취향 설정이고, 커플 공용으로 만들면
 * 한쪽이 바꿨을 때 상대 화면이 예고 없이 바뀐다. 관계 단위로 저장하려면 테이블 ·
 * 마이그레이션 · 실시간 이벤트 · RelationRecordPurger 삭제 순서까지 딸려오는데,
 * 얻는 게 "둘이 같은 배경을 본다" 하나뿐이라 값을 못 한다. 로컬에만 둔다.
 *
 * <p>팔레트 자체는 {@link ../theme/chatTheme} 의 모듈 변수가 들고 있다(스타일이 읽는 곳).
 * 이 스토어는 <b>화면을 다시 그리게 만드는 역할</b>을 맡는다 — themeStore 와 같은 구조다.
 * 다만 채팅 테마는 ChatRoomScreen 한 곳에만 영향을 주므로, themeStore 처럼 루트 트리를
 * 통째로 재마운트하지 않고 그 화면이 직접 구독한다.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import {
  DEFAULT_CHAT_THEME_ID,
  getChatPhotoUri,
  getChatThemeId,
  isChatThemeId,
  setChatPhotoUri,
  setChatThemeId,
  type ChatThemeId,
} from '../theme/chatTheme';
import { deleteChatBackgroundPhoto } from '../utils/chatBackgroundPhoto';

const STORAGE_KEY = 'doubly.chat.background';

/**
 * 사진 배경의 파일 경로 — 테마 id 와 <b>따로</b> 둔다. 사진은 테마를 대체하지 않고
 * 배경만 덮으므로(chatTheme 의 withPhoto 주석) "인디고 + 사진"을 그대로 저장해야 한다.
 * 사진을 지우면 고르고 있던 테마로 자연히 돌아간다.
 */
const PHOTO_KEY = 'doubly.chat.background.photo';

/**
 * 웹은 동기 저장소가 있어 첫 렌더 전에 값을 넣을 수 있다.
 * 네이티브는 AsyncStorage 뿐이라 {@link useChatThemeStore.load} 가 끝날 때까지
 * 잠깐 기본값이다 — RootNavigator 가 스플래시 단계에서 부르므로 채팅 화면이
 * 그려질 즈음엔 이미 반영돼 있다.
 */
if (Platform.OS === 'web') {
  try {
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (isChatThemeId(stored)) setChatThemeId(stored);
  } catch {
    // 프라이빗 모드 등에서 접근이 막힐 수 있다 — 기본값으로 둔다
  }
}

interface ChatThemeState {
  id: ChatThemeId;
  /** 사진 배경의 로컬 파일 uri — 없으면 null */
  photoUri: string | null;
  /** 저장된 선택을 불러와 적용 (앱 시작 시 1회) */
  load: () => Promise<void>;
  setTheme: (id: ChatThemeId) => Promise<void>;
  /** 이미 처리·복사가 끝난 파일 uri 를 적용한다 (고르기는 utils/chatBackgroundPhoto) */
  setPhoto: (uri: string) => Promise<void>;
  clearPhoto: () => Promise<void>;
}

export const useChatThemeStore = create<ChatThemeState>((set, get) => ({
  id: getChatThemeId(),
  photoUri: getChatPhotoUri(),

  load: async () => {
    const [stored, photo] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
      AsyncStorage.getItem(PHOTO_KEY),
    ]);
    const id = isChatThemeId(stored) ? stored : DEFAULT_CHAT_THEME_ID;
    setChatThemeId(id);
    /*
     * 경로만 복원하고 파일이 실제로 있는지는 확인하지 않는다 — 사라졌다면 <Image> 가
     * 조용히 실패하고 그 아래 테마 배경색이 보인다(chatTheme 이 background 를 안 건드리는
     * 이유). 시작 경로에 파일 I/O 를 한 번 더 넣을 값을 못 한다.
     */
    setChatPhotoUri(photo);
    set({ id, photoUri: photo });
  },

  setTheme: async (id) => {
    setChatThemeId(id);
    set({ id });
    // 저장은 화면 갱신을 막지 않도록 뒤에 둔다
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, id);
      }
    } catch {
      // 무시 — AsyncStorage 쪽이 웹에서도 백업으로 동작한다
    }
    await AsyncStorage.setItem(STORAGE_KEY, id);
  },

  setPhoto: async (uri) => {
    // 앞의 사진은 더 쓸 데가 없다 — 남겨 두면 고를 때마다 문서 폴더에 쌓인다
    const previous = get().photoUri;
    setChatPhotoUri(uri);
    set({ photoUri: uri });
    if (previous && previous !== uri) deleteChatBackgroundPhoto(previous);
    await AsyncStorage.setItem(PHOTO_KEY, uri);
  },

  clearPhoto: async () => {
    const previous = get().photoUri;
    setChatPhotoUri(null);
    set({ photoUri: null });
    if (previous) deleteChatBackgroundPhoto(previous);
    await AsyncStorage.removeItem(PHOTO_KEY);
  },
}));
