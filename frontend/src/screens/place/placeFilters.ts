/** 가이드/둘러보기/지도 화면이 공유하는 필터 옵션 — 세 화면 모두 같은 상태(usePlaceStore)를 걸러 쓴다 */
import { PLACE_CATEGORIES } from '../../constants/placeCategories';

// 솔로 픽("내 픽 / 상대 픽") 인정 기준 — 아직 탈락 판정(tier 0)이지만 한쪽만 강력 추천한
// 곳. 2점 이하는 재방문 의사가 없다는 뜻이라 "픽"으로 보기 어려워 제외한다.
// PlaceScreen(가이드·위시리스트 카드)·PlaceDetailScreen(정보 카드)이 공유한다.
export const SOLO_PICK_MIN_RATING = 4;

/**
 * 솔로 픽인가 — 한 명만 평가했고 그 점수가 {@link SOLO_PICK_MIN_RATING} 이상인가.
 *
 * <p>장소·콘텐츠가 같은 규칙이고 목록 카드·상세 카드·정렬까지 다섯 군데에서 같은 식을
 * 복사해 쓰고 있었다. 조건을 바꿀 일이 생기면 한 곳만 고치면 되게 모은다. tier 는 보지
 * 않는다 — 인증된 곳(tier&gt;0)은 애초에 둘 다 평가했으므로 이 식이 참이 될 수 없다.
 */
export function isSoloPick(item: { myRating?: number | null; partnerRating?: number | null }): boolean {
  return (
    (item.myRating != null && item.myRating >= SOLO_PICK_MIN_RATING && item.partnerRating == null) ||
    (item.partnerRating != null && item.partnerRating >= SOLO_PICK_MIN_RATING && item.myRating == null)
  );
}

// 장소가 늘면서(맛집 외 카페·전시·여행지·숙소까지) 가이드/위시리스트 목록이 한 카테고리로
// 묻히지 않게 — 장소 추가 화면과 같은 카테고리 목록을 그대로 필터로 재사용한다.
export const CATEGORY_FILTERS: { value: string; label: string }[] = [
  { value: 'ALL', label: '전체' },
  ...PLACE_CATEGORIES.map((c) => ({ value: c, label: c })),
];

/** 장소 필터 — 지도 핀과 하단 시트 목록이 <b>같은 결과</b>를 쓴다(한쪽만 거르면 핀과 목록이 어긋난다) */
export interface PlaceFilterState {
  /** 이름·주소에 들어 있는 글자 */
  search: string;
  /** 'ALL' 또는 카테고리 이름 */
  category: string;
  /** 아직 안 가본 곳 — 방문 0건으로 파생한다. 상태 컬럼은 다시 넣지 않는다(V70 결정) */
  unvisitedOnly: boolean;
  /** 럽슐랭 인증(등급 1~3) */
  certifiedOnly: boolean;
}

export const EMPTY_PLACE_FILTER: PlaceFilterState = {
  search: '',
  category: 'ALL',
  unvisitedOnly: false,
  certifiedOnly: false,
};

export function isPlaceFilterActive(f: PlaceFilterState): boolean {
  return !!f.search.trim() || f.category !== 'ALL' || f.unvisitedOnly || f.certifiedOnly;
}

/**
 * 거르고 "인증 등급 → 솔로 픽 → 최근 방문 → 등록" 순으로 세운다(정렬 이유는 PlaceScreen 상단 주석).
 * 최근 방문을 등록순보다 앞에 두는 건 등록순(id desc)이 "어제 다녀온 곳은 아래, 석 달 전 넣고 안 간 곳은 위"를
 * 만들기 때문이다. lastVisitedAt 은 YYYY-MM-DD 라 문자열 비교로 충분하다.
 */
export function filterAndSortPlaces<
  T extends {
    id: number;
    name: string;
    address?: string | null;
    category?: string | null;
    visitCount: number;
    lovelichelinTier: number;
    lastVisitedAt?: string | null;
    myRating?: number | null;
    partnerRating?: number | null;
  },
>(places: T[], f: PlaceFilterState): T[] {
  const q = f.search.trim().toLowerCase();
  return places
    .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.address ?? '').toLowerCase().includes(q))
    .filter((p) => f.category === 'ALL' || p.category === f.category)
    .filter((p) => !f.unvisitedOnly || p.visitCount === 0)
    .filter((p) => !f.certifiedOnly || p.lovelichelinTier > 0)
    .sort((a, b) => {
      if (b.lovelichelinTier !== a.lovelichelinTier) return b.lovelichelinTier - a.lovelichelinTier;
      const pick = Number(isSoloPick(b)) - Number(isSoloPick(a));
      if (pick !== 0) return pick;
      const visited = (b.lastVisitedAt ?? '').localeCompare(a.lastVisitedAt ?? '');
      if (visited !== 0) return visited;
      return b.id - a.id;
    });
}
