/**
 * 채팅 지도 링크 판별 검증 — utils/placeLinkHosts.ts 를 건드리면 돌린다.
 *
 * 칩을 띄워야 하는 링크(정탐)와 띄우면 안 되는 링크(오탐 방지)를 같이 돌린다. 오탐은 곧 모든 대화에
 * 엉뚱한 칩이 붙는다는 뜻이라 정탐만큼 중요하다.
 *
 * 실행: npm run verify:place-link
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const tmp = mkdtempSync(join(tmpdir(), 'place-link-'));
writeFileSync(join(tmp, 'linkify.ts'), read('../src/utils/linkify.ts'));
// 앱 코드는 확장자 없이 import 한다 — Node 가 .ts 를 직접 읽으려면 확장자가 있어야 한다
writeFileSync(
  join(tmp, 'placeLinkHosts.ts'),
  read('../src/utils/placeLinkHosts.ts').replace("from './linkify'", "from './linkify.ts'"),
);
const { findPlaceLink, isPlaceLink, httpsHostOf, PLACE_LINK_HOSTS } = await import(
  pathToFileURL(join(tmp, 'placeLinkHosts.ts'))
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

console.log('1. 칩을 띄우는 링크');
eq('카카오 장소', findPlaceLink('여기 어때 https://place.map.kakao.com/634902312'), 'https://place.map.kakao.com/634902312');
eq('카카오 짧은 링크', findPlaceLink('https://kko.to/AbCdEf'), 'https://kko.to/AbCdEf');
eq('카카오맵 itemId', findPlaceLink('https://map.kakao.com/?itemId=8173414'), 'https://map.kakao.com/?itemId=8173414');
eq('네이버 짧은 링크', findPlaceLink('[네이버 지도]\n못 MOAT\n제주 제주시 구좌읍\nhttps://naver.me/5Xh8abc'), 'https://naver.me/5Xh8abc');
eq('네이버 지도', findPlaceLink('https://map.naver.com/p/entry/place/1857962284?c=15.00'), 'https://map.naver.com/p/entry/place/1857962284?c=15.00');
eq('네이버 플레이스 모바일', findPlaceLink('https://m.place.naver.com/restaurant/1857962284/home'), 'https://m.place.naver.com/restaurant/1857962284/home');
eq('대문자 호스트', isPlaceLink('https://NAVER.ME/abc'), true);
eq(':443 포트', isPlaceLink('https://kko.to:443/abc'), true);
eq('여러 링크 중 첫 지도 링크', findPlaceLink('https://youtu.be/x 그리고 https://naver.me/a https://kko.to/b'), 'https://naver.me/a');
eq('문장 끝 마침표', findPlaceLink('여기 가자 https://naver.me/abc.'), 'https://naver.me/abc');

console.log('2. 칩을 띄우지 않는 링크(오탐 방지)');
eq('링크 없음', findPlaceLink('오늘 뭐 먹지'), null);
eq('빈 값', findPlaceLink(''), null);
eq('null', findPlaceLink(null), null);
eq('다른 사이트', findPlaceLink('https://youtu.be/abc'), null);
eq('인스타(2차 범위)', findPlaceLink('https://www.instagram.com/p/abc'), null);
eq('네이버 블로그', findPlaceLink('https://blog.naver.com/x/1'), null);
eq('네이버 본진', findPlaceLink('https://www.naver.com'), null);
eq('카카오 본진', findPlaceLink('https://www.kakao.com'), null);
eq('http(서버가 https 만 연다)', findPlaceLink('http://naver.me/abc'), null);
eq('www. 자동 보정 링크', findPlaceLink('www.naver.me/abc'), null);
eq('비슷한 가짜 도메인', findPlaceLink('https://naver.me.evil.com/x'), null);
eq('앞에 붙은 가짜 도메인', findPlaceLink('https://evilnaver.me/x'), null);
eq('user@host', isPlaceLink('https://naver.me@evil.com/x'), false);
eq('다른 포트', isPlaceLink('https://kko.to:8443/abc'), false);
eq('하위 도메인 와일드카드 없음', isPlaceLink('https://x.place.map.kakao.com/1'), false);

console.log('3. 호스트 파싱');
eq('경로 없음', httpsHostOf('https://kko.to'), 'kko.to');
eq('끝 점', httpsHostOf('https://kko.to./a'), 'kko.to');
eq('쿼리 바로', httpsHostOf('https://map.kakao.com?itemId=1'), 'map.kakao.com');
eq('목록 6개', PLACE_LINK_HOSTS.length, 6);

rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passes} 통과, ${failures} 실패`);
if (failures > 0) process.exit(1);
