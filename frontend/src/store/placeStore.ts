/**
 * 럽슐랭(장소) 목록 캐시 — dietStore 구조 미러링.
 *
 * <p><b>왜 필요한가</b>: 가이드/위시리스트/지도가 이제 {@link PlaceScreen} 한 화면 안의
 * Chip 세그먼트라 검색어·필터는 그 컴포넌트의 로컬 state 로 충분하지만, 장소 목록 자체는
 * `PlaceAddScreen`/`PlaceDetailScreen`(별도 화면)에서도 갱신되므로 화면을 넘나들며 공유할
 * 곳이 필요하다. 캐시는 "한 번 받으면 재사용"이 기본이고, 장소 추가/수정/삭제/평가/방문
 * 기록 등록처럼 목록이 실제로 바뀔 수 있는 지점에서 {@link invalidate}를 호출해 다음
 * `load()`가 진짜로 다시 받아오게 한다.
 */
import { create } from 'zustand';
import { placeApi } from '../api/place';
import type { Place } from '../types';

interface PlaceState {
  places: Place[];
  loading: boolean;
  loadError: boolean;
  loaded: boolean;

  /** force 가 아니면 이미 받아온 목록을 그대로 재사용한다 */
  load: (force?: boolean) => Promise<void>;
  /** 다음 load() 가 캐시를 쓰지 않고 다시 받아오게 표시만 한다(요청은 안 보낸다) */
  invalidate: () => void;
  /**
   * 로그아웃 시 호출 — 목록까지 비운다. invalidate() 는 loaded 만 내려 다음 load() 전까지
   * 화면에 이전 계정의 places 가 그대로 남아있지만(계정 전환 시 새 사용자에게 잠깐이라도
   * 보이면 안 되는 개인정보다), reset() 은 목록 자체를 지워 그 틈을 없앤다.
   */
  reset: () => void;
}

const initialState = { places: [] as Place[], loading: false, loadError: false, loaded: false };

export const usePlaceStore = create<PlaceState>((set, get) => ({
  ...initialState,

  load: async (force = false) => {
    if (get().loaded && !force) return;
    set({ loading: true, loadError: false });
    try {
      const places = await placeApi.list();
      set({ places, loaded: true });
    } catch (e) {
      set({ loadError: true });
      throw e;
    } finally {
      set({ loading: false });
    }
  },

  invalidate: () => set({ loaded: false }),

  reset: () => set(initialState),
}));
