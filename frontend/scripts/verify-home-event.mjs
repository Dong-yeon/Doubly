/**
 * 홈 다가오는 일정 판정 검증 — utils/homeEvent.ts 를 건드리면 돌린다.
 *
 * 홈 슬롯은 날짜 경계가 기능의 정의 자체다. KST 자정(UTC 로는 아직 전날), 월말·연말, 윤년,
 * 기간 일정의 진행 중, 7일 경계를 함께 본다.
 *
 * 실행: node --experimental-strip-types scripts/verify-home-event.mjs
 *
 * package.json 에 아직 등록하지 않았다 — npm scripts 는 EAS fingerprint 입력이라 등록하는 순간 main 에서 올리는
 * 모든 업데이트가 지금 앱에 안 간다. 다음 네이티브 빌드 때 함께 등록한다(docs/EAS_BUILD.md "다음 빌드에 묶을 것").
 */
const { eventStatusOf, isEventToday, pickHomeEvent } = await import('../src/utils/homeEvent.ts');

const ev = (id, date, endDate = null) => ({
  id, title: `e${id}`, date, eventDate: date, endDate, eventType: 'DATE',
  repeatYearly: false, visibility: 'SHARED', dday: 999, createdBy: 1,
});
const at = (iso) => new Date(iso);

let failed = 0;
const check = (name, cond) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  if (!cond) failed++;
};

// KST 10/3 00:30 = UTC 10/2 15:30
const kstMidnight = at('2026-10-02T15:30:00Z');
check('KST 자정 직후 10/3 일정은 오늘', isEventToday(ev(1, '2026-10-03'), kstMidnight));
check('UTC 로는 아직 10/2 라도 10/2 일정은 지난 것', !eventStatusOf(ev(2, '2026-10-02'), kstMidnight).live);
check('기간 일정 진행 중은 오늘로', isEventToday(ev(3, '2026-10-01', '2026-10-05'), kstMidnight));
check('7일 뒤는 홈에 뜬다', pickHomeEvent([ev(4, '2026-10-10')], kstMidnight)?.id === 4);
check('8일 뒤는 안 뜬다', pickHomeEvent([ev(5, '2026-10-11')], kstMidnight) === null);
check('진행 중이 다가오는 것보다 먼저',
  pickHomeEvent([ev(6, '2026-10-04'), ev(7, '2026-09-30', '2026-10-04')], kstMidnight)?.id === 7);
check('어제 끝난 기간 일정은 안 뜬다', pickHomeEvent([ev(8, '2026-09-28', '2026-10-02')], kstMidnight) === null);
check('서버 dday 가 낡아도 렌더 시점에 다시 센다', eventStatusOf(ev(9, '2026-10-03'), kstMidnight).dday === 0);
check('월말→월초: 10/31 기준 11/1 은 D-1', eventStatusOf(ev(10, '2026-11-01'), at('2026-10-31T03:00:00Z')).dday === 1);
check('연말→연초: 12/31 기준 1/7 은 D-7', eventStatusOf(ev(11, '2027-01-07'), at('2026-12-31T03:00:00Z')).dday === 7);
check('윤년: 2028-02-28 기준 03-01 은 D-2', eventStatusOf(ev(12, '2028-03-01'), at('2028-02-28T03:00:00Z')).dday === 2);
check('빈 목록이면 없음', pickHomeEvent([], kstMidnight) === null);

if (failed > 0) {
  console.error(`\n${failed}건 실패`);
  process.exit(1);
}
console.log('\n전부 통과');
