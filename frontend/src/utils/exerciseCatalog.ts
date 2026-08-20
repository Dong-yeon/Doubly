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
