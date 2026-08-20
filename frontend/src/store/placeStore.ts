/**
 * 럽슐랭(장소) 상태 스토어 — 가이드/위시리스트/지도 세 화면이 공유한다(dietStore 구조 미러링).
 *
 * <p><b>왜 필요한가</b>: '장소' 탭이 럽슐랭으로 리브랜딩되며 목록/지도 통합 화면 하나가
 * 가이드·위시리스트·지도 세 개의 독립 스택 화면으로 쪼개졌다. 각 화면이 자기 `useState`로
 * 전체 장소 목록을 들고 있으면 (1) `navigation.replace()`로 세그먼트를 오갈 때마다 같은
 * 데이터를 매번 다시 받아오고 (2) 위시리스트/지도가 공유하던 검색어·필터가 화면 인스턴스가
 * 바뀌면서 초기화된다. 여기 한 곳에 캐시하고 필터도 같이 두면 둘 다 해결된다.
 *
 * <p>캐시는 "한 번 받으면 재사용"이 기본이고, 장소 추가/수정/삭제/평가/방문기록 등록처럼
 * 목록이 실제로 바뀔 수 있는 지점에서 {@link invalidate}를 호출해 다음 `load()`가 진짜로
 * 다시 받아오게 한다(`PlaceAddScreen`/`PlaceDetailScreen` 참고).
 */
import { create } from 'zustand';
import { placeApi } from '../api/place';
import type { Place, PlaceDietTag, PlaceStatus } from '../types';

interface PlaceState {
  places: Place[];
  loading: boolean;
  loadError: boolean;
  loaded: boolean;

  // 위시리스트/지도 화면이 공유하는 필터 — 세그먼트 전환에도 유지된다
  search: string;
  statusFilter: PlaceStatus | 'ALL';
  dietFilter: PlaceDietTag | 'ALL';
  setSearch: (v: string) => void;
  setStatusFilter: (v: PlaceStatus | 'ALL') => void;
  setDietFilter: (v: PlaceDietTag | 'ALL') => void;

  /** force 가 아니면 이미 받아온 목록을 그대로 재사용한다 */
  load: (force?: boolean) => Promise<void>;
  /** 다음 load() 가 캐시를 쓰지 않고 다시 받아오게 표시만 한다(요청은 안 보낸다) */
  invalidate: () => void;
}

export const usePlaceStore = create<PlaceState>((set, get) => ({
  places: [],
  loading: false,
  loadError: false,
  loaded: false,

  search: '',
  statusFilter: 'ALL',
  dietFilter: 'ALL',
  setSearch: (search) => set({ search }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  setDietFilter: (dietFilter) => set({ dietFilter }),

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
}));
