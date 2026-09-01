/** 종목 카탈로그 필터링 공통 로직 — 운동 기록 추가·루틴 만들기·세션 종목 교체가
 *  모두 "부위로 좁힌 뒤 기구로 한 번 더 좁힌다"는 같은 흐름을 쓰므로 한 곳에 모은다. */
import { EQUIPMENT_ORDER } from '../constants/workout';

/** 이미 부위로 좁힌 후보들 중 실제로 존재하는 기구 값만, 표시 우선순위대로 뽑는다.
 *  없는 기구를 골랐다가 매번 빈 목록을 보는 걸 막는다. */
export function equipmentOptionsIn(items: { equipment?: string | null }[]): string[] {
  const present = new Set(items.map((c) => c.equipment ?? '맨몸'));
  const ordered = EQUIPMENT_ORDER.filter((e) => present.has(e));
  const rest = [...present].filter((e) => !EQUIPMENT_ORDER.includes(e));
  return [...ordered, ...rest];
}

/**
 * 검색어 정규화 — 공백을 지우고 소문자로.
 *
 * <p>사람은 "벤치 프레스"라고 띄어 쓰고 카탈로그엔 "벤치프레스"로 들어 있다.
 * 띄어쓰기 하나로 결과가 0건이 되면 검색창이 있으나 마나다.
 */
const norm = (v: string) => v.replace(/\s+/g, '').toLowerCase();

/**
 * 이름·별칭으로 종목을 찾는다 — <b>부위·기구 선택은 무시한다</b>.
 *
 * <p>검색은 "어디에 있는지 모를 때" 쓰는 것이라, 부위를 고른 상태로 좁혀 두면
 * 정작 다른 부위에 있는 종목을 못 찾는다(예: 풀오버가 등에 있는지 가슴에 있는지 모른다).
 */
export function searchCatalog<T extends { name: string; aliases?: string | null }>(
  items: T[],
  query: string,
): T[] {
  const q = norm(query);
  if (!q) return [];
  return items.filter(
    (c) => norm(c.name).includes(q) || (c.aliases ? norm(c.aliases).includes(q) : false),
  );
}
