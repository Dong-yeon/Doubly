/**
 * 기기에만 저장하는 설정.
 *
 * <p>알림·마케팅 동의처럼 서버가 아는 설정과 달리, 이건 이 기기에서의 취향이라
 * 계정에 붙이지 않는다. 상대와 공유될 이유도 없다.
 */
import { create } from 'zustand';
import { storage } from '../utils/storage';

const KEY_SPELL_CHECK = 'doubly.spellCheckEnabled';

interface SettingsState {
  /** 채팅 입력 중 맞춤법 제안 표시 */
  spellCheckEnabled: boolean;
  /** 저장된 값을 아직 못 읽었으면 false — 읽기 전에 잠깐 기본값이 보이는 걸 막는다 */
  loaded: boolean;
  load: () => Promise<void>;
  setSpellCheckEnabled: (enabled: boolean) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  spellCheckEnabled: true,
  loaded: false,

  load: async () => {
    try {
      const raw = await storage.getItem(KEY_SPELL_CHECK);
      // 저장된 적이 없으면(null) 켜진 상태가 기본이다
      set({ spellCheckEnabled: raw !== 'false', loaded: true });
    } catch {
      // 저장소를 못 읽어도 앱은 떠야 한다 — 기본값으로 진행
      set({ loaded: true });
    }
  },

  setSpellCheckEnabled: async (enabled) => {
    // 화면부터 바꾸고 저장한다 — 토글이 굼떠 보이지 않도록
    set({ spellCheckEnabled: enabled });
    try {
      await storage.setItem(KEY_SPELL_CHECK, String(enabled));
    } catch {
      // 저장 실패는 조용히 넘긴다. 이번 실행 동안은 선택이 유지된다
    }
  },
}));
