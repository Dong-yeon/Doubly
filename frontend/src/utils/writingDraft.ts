/**
 * 글쓰기 초안 — 일상 남기기·하루 기록에서 쓰던 글을 기기에 남겨, 앱이 꺼지거나 웹을 새로고침해도
 * 다시 열면 이어 쓸 수 있게 한다(docs/daily-mood-current-state.md §8-11).
 *
 * <p><b>무엇을 남기나</b>: 글과 고른 기분만. 사진은 남기지 않는다 — 기기 안 uri 는 임시 폴더라
 * 다음 실행에 사라져 있을 수 있고, 깨진 사진을 되살리면 "올렸는데 없다"가 된다.
 *
 * <p><b>언제 지우나</b>: 저장에 성공했을 때, 그리고 화면을 정상적으로 벗어날 때(이탈 확인에서 "닫기"를
 * 골랐다는 뜻이다). 앱 강제 종료·새로고침은 화면이 정리될 틈이 없으니 초안이 남는다 — 그게 목적이다.
 * 로그아웃하면 전부 지운다(authStore.clearTokens) — 하루 기록은 나만 보는 글이라 같은 기기에서 다른
 * 계정이 로그인했을 때 보이면 안 된다. 그래서 초안마다 주인 id 도 함께 적고 읽을 때 한 번 더 본다.
 *
 * <p>저장소는 AsyncStorage(운동 sessionDraft 와 같은 판단 — utils/storage 의 SecureStore 는 토큰용).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'doubly.writingDraft.';
/** 이보다 오래된 초안은 되살리지 않는다 — 일주일 전 쓰다 만 글이 불쑥 뜨면 오히려 당황스럽다 */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface WritingDraft {
  /** 주인 — 다른 계정의 초안은 읽지 않는다 */
  userId: number;
  text: string;
  mood?: string | null;
  /**
   * 쓰기 시작할 때 서버 기록의 버전(updatedAt ?? createdAt), 기록이 없었으면 null.
   * 다시 열었을 때 서버 버전이 이와 다르면(다른 기기에서 고쳤다) 초안을 버린다 — 덮어쓰면 그쪽 글이 사라진다.
   */
  base?: string | null;
  savedAt: number;
}

export const draftKeys = {
  feedCompose: 'feedCompose',
  journal: (date: string) => `journal.${date}`,
};

export async function saveWritingDraft(key: string, draft: Omit<WritingDraft, 'savedAt'>): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify({ ...draft, savedAt: Date.now() }));
  } catch {
    // 저장 실패는 복구를 못 할 뿐 — 쓰는 중인 화면을 방해하지 않는다
  }
}

/** 되살릴 초안 — 내 것이고 일주일 안이고 글이나 기분이 있을 때만. 조건에 안 맞으면 여기서 지운다 */
export async function loadWritingDraft(key: string, userId: number | undefined): Promise<WritingDraft | null> {
  if (userId == null) return null;
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const draft = JSON.parse(raw) as WritingDraft;
    const usable =
      draft.userId === userId &&
      Date.now() - draft.savedAt < MAX_AGE_MS &&
      (draft.text.trim().length > 0 || !!draft.mood);
    if (!usable) {
      await clearWritingDraft(key);
      return null;
    }
    return draft;
  } catch {
    // 형식이 깨진 초안 — 되살리려다 화면이 죽는 것보다 버리는 편이 낫다
    await clearWritingDraft(key);
    return null;
  }
}

export async function clearWritingDraft(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(PREFIX + key);
  } catch {
    // 지우기 실패 — 다음에 읽을 때 나이·주인 검사에서 걸러진다
  }
}

/** 로그아웃·탈퇴 — 이 기기의 글쓰기 초안을 전부 지운다 */
export async function clearAllWritingDrafts(): Promise<void> {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX));
    if (keys.length > 0) await AsyncStorage.multiRemove(keys);
  } catch {
    // 남은 초안은 주인 id 검사로 다른 계정에 보이지 않는다
  }
}
