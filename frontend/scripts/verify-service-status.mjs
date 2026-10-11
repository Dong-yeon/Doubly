/**
 * 장애 공지(status.json) 해석 검증 — utils/serviceStatus.ts 나 landing/status.json 을 건드리면 돌린다.
 *
 * 원칙 "의심스러우면 없는 것으로"를 케이스로 고정한다: 없음·깨짐·빈 값·기간 지남·형식 오류는
 * 전부 공지 없음이어야 하고, 특히 강제 업데이트는 판정이 서지 않으면 절대 켜지면 안 된다.
 * 네트워크 단계(404·타임아웃)는 store 가 처리하므로 여기서는 본문 해석만 본다.
 *
 * 실행: npm run verify:service-status
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const src = fileURLToPath(new URL('../src/utils/serviceStatus.ts', import.meta.url));
const landing = fileURLToPath(new URL('../../landing/status.json', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'service-status-'));
writeFileSync(join(tmp, 'serviceStatus.ts'), readFileSync(src, 'utf8'));
const { parseServiceStatus, isNoticeActive, needsUpdate, compareVersions, maintenanceErrorMessage } = await import(
  pathToFileURL(join(tmp, 'serviceStatus.ts'))
);

let failures = 0;
let passes = 0;
function eq(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passes++;
  else {
    failures++;
    console.error(`  ✗ ${name}\n      expected ${e}\n      got      ${a}`);
  }
}

/** 본문 문자열 → store 가 하는 것과 같은 해석(JSON 깨짐은 null). */
const fromBody = (body) => {
  try {
    return parseServiceStatus(JSON.parse(body));
  } catch {
    return null;
  }
};
const NOW = Date.parse('2026-10-01T03:00:00+09:00');
const shown = (status) => !!status && isNoticeActive(status.notice, NOW);
const base = (notice, extra = {}) => ({ schemaVersion: 1, updatedAt: '2026-10-01T01:00:00+09:00', notice, ...extra });
const maint = {
  level: 'maintenance',
  message: 'DB 점검 중이에요',
  startsAt: '2026-10-01T02:00:00+09:00',
  endsAt: '2026-10-01T04:00:00+09:00',
};

// ── 없음·깨짐·빈 값 ─────────────────────────────────────────────
eq('빈 본문', fromBody(''), null);
eq('HTML(404 페이지가 200 으로 온 경우)', fromBody('<!doctype html><title>Not found</title>'), null);
eq('잘린 JSON', fromBody('{"updatedAt": "2026-10-01T01:00:00+09:00", "notice": {'), null);
eq('null', fromBody('null'), null);
eq('배열', fromBody('[]'), null);
eq('빈 객체', fromBody('{}'), null);
eq('평시 파일(notice null + 버전 null)', parseServiceStatus(base(null, { minAppVersion: { android: null, ios: null } })), null);
eq('message 공백뿐', parseServiceStatus(base({ ...maint, message: '   ' })), null);
eq('message 누락', parseServiceStatus(base({ level: 'info' })), null);
eq('level 누락', parseServiceStatus(base({ message: '안내' })), null);
eq('level 오타', parseServiceStatus(base({ ...maint, level: 'maintainance' })), null);
eq('updatedAt 누락이면 공지 폐기', parseServiceStatus({ schemaVersion: 1, notice: maint }), null);
eq('새 스키마는 통째로 무시', parseServiceStatus({ ...base(maint), schemaVersion: 2 }), null);

// ── 날짜 ──────────────────────────────────────────────────────
eq('오프셋 없는 날짜는 폐기', parseServiceStatus(base({ ...maint, endsAt: '2026-10-01T04:00' })), null);
eq('날짜 형식 오류는 폐기', parseServiceStatus(base({ ...maint, startsAt: '내일 새벽' })), null);
eq('끝이 시작보다 앞', parseServiceStatus(base({ ...maint, endsAt: '2026-10-01T01:00:00+09:00' })), null);
eq(
  'Z 표기 허용',
  shown(parseServiceStatus(base({ ...maint, startsAt: '2026-09-30T17:00:00Z', endsAt: '2026-09-30T19:00:00Z' }))),
  true,
);

// ── 기간 ──────────────────────────────────────────────────────
eq('기간 안 → 표시', shown(parseServiceStatus(base(maint))), true);
eq('기간 지남 → 숨김', shown(parseServiceStatus(base({ ...maint, endsAt: '2026-10-01T02:30:00+09:00' }))), false);
eq('시작 전 → 숨김', shown(parseServiceStatus(base({ ...maint, startsAt: '2026-10-01T03:30:00+09:00' }))), false);
eq('endsAt 정각은 끝', isNoticeActive(parseServiceStatus(base(maint)).notice, Date.parse(maint.endsAt)), false);
eq('startsAt 정각은 시작', isNoticeActive(parseServiceStatus(base(maint)).notice, Date.parse(maint.startsAt)), true);
eq('기간 없음 → 계속 표시', shown(parseServiceStatus(base({ level: 'info', message: '안내' }))), true);

// ── 필드 다듬기 ───────────────────────────────────────────────
const p = parseServiceStatus(base({ ...maint, title: '  ', linkUrl: 'http://evil.example' }));
eq('빈 title → 기본 제목(null)', p.notice.title, null);
eq('http 링크는 버림', p.notice.linkUrl, null);
eq(
  'https 링크 허용',
  parseServiceStatus(base({ ...maint, linkUrl: 'https://dubly.co.kr/support' })).notice.linkUrl,
  'https://dubly.co.kr/support',
);
eq('긴 문구는 자름', parseServiceStatus(base({ ...maint, message: '가'.repeat(500) })).notice.message.length, 300);
eq('점검 문구(KST)', maintenanceErrorMessage(p.notice), '서비스 점검 중이에요. 10월 1일 04:00까지 예정이에요.');
eq(
  '점검 문구(끝 없음)',
  maintenanceErrorMessage({ ...p.notice, endsAt: null }),
  '서비스 점검 중이에요. 점검이 끝나면 다시 시도해주세요.',
);

// ── 버전 비교·강제 업데이트 ────────────────────────────────────
eq('1.0.10 > 1.0.9', compareVersions('1.0.10', '1.0.9'), 1);
eq('1.0 == 1.0.0', compareVersions('1.0', '1.0.0'), 0);
eq('형식 오류는 판정 불가', compareVersions('1.0.4-beta', '1.0.4'), null);
const gate = (mv, platform, cur) => needsUpdate(parseServiceStatus({ minAppVersion: mv }), platform, cur);
eq('android 낮음 → 잠금', gate({ android: '1.0.5' }, 'android', '1.0.4'), true);
eq('ios 낮음 → 잠금', gate({ ios: '1.0.5' }, 'ios', '1.0.4'), true);
eq('같음 → 통과', gate({ android: '1.0.4' }, 'android', '1.0.4'), false);
eq('ios 값만 있으면 android 는 통과', gate({ ios: '9.9.9' }, 'android', '1.0.4'), false);
eq('웹(현재 버전 null) → 통과', gate({ android: '9.9.9', ios: '9.9.9' }, 'web', null), false);
eq('min 형식 오류 → 통과', gate({ android: 'v1.0.5' }, 'android', '1.0.4'), false);
eq('현재 버전 형식 오류 → 통과', gate({ android: '1.0.5' }, 'android', '1.0.4 (36)'), false);
eq('숫자 타입 min → 통과', gate({ android: 105 }, 'android', '1.0.4'), false);
eq(
  '공지가 깨져도 최소 버전은 산다',
  needsUpdate(parseServiceStatus({ notice: { level: '??' }, minAppVersion: { android: '2.0.0' } }), 'android', '1.0.4'),
  true,
);
eq('상태 없음 → 통과', needsUpdate(null, 'android', '1.0.4'), false);

// ── 저장소의 실제 파일 ─────────────────────────────────────────
const raw = readFileSync(landing, 'utf8');
try {
  JSON.parse(raw);
  passes++;
} catch (e) {
  failures++;
  console.error(`  ✗ landing/status.json 이 JSON 이 아니다: ${e.message}`);
}
const shipped = fromBody(raw);
eq('landing/status.json 이 1.0.4 를 잠그지 않는다', needsUpdate(shipped, 'android', '1.0.4') || needsUpdate(shipped, 'ios', '1.0.4'), false);

rmSync(tmp, { recursive: true, force: true });
console.log(`service-status: ${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
