/**
 * 링크 분리 검증 — utils/linkify.ts 를 건드리면 돌린다.
 *
 * 프론트에 테스트 러너가 없어서(CLAUDE.md 6절) 이 스크립트가 그 역할을 한다.
 * 잡아야 하는 링크(정탐)와 링크로 보면 안 되는 문장(오탐 방지)을 같이 돌린다.
 *
 * 실행: npm run verify:linkify
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const src = fileURLToPath(new URL('../src/utils/linkify.ts', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'linkify-'));
writeFileSync(join(tmp, 'linkify.ts'), readFileSync(src, 'utf8'));
const { splitLinks, hasLink } = await import(pathToFileURL(join(tmp, 'linkify.ts')));

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
const links = (text) => splitLinks(text).filter((s) => s.url).map((s) => s.url);

console.log('1. 잡아야 하는 링크');
eq('https 단독', links('https://naver.com'), ['https://naver.com']);
eq('문장 속', links('이거 봐 https://youtu.be/abc123 완전 웃김'), ['https://youtu.be/abc123']);
eq('끝 마침표는 문장의 것', links('여기 https://a.com/x.'), ['https://a.com/x']);
eq('끝 물음표·느낌표', links('https://a.com/x? 갈래!'), ['https://a.com/x']);
eq('괄호로 감싼 링크', links('(https://a.com/x)'), ['https://a.com/x']);
eq('경로 안의 괄호는 남긴다', links('https://ko.wikipedia.org/wiki/서울_(도시)'), ['https://ko.wikipedia.org/wiki/서울_(도시)']);
eq('www. 는 https 를 붙인다', links('www.naver.com 봐'), ['https://www.naver.com']);
eq('쿼리·앵커', links('https://a.com/p?q=1&r=2#top'), ['https://a.com/p?q=1&r=2#top']);
eq('한글 경로(국내 링크에 흔하다)', links('https://namu.wiki/w/뿌요뿌요 재밌음'), ['https://namu.wiki/w/뿌요뿌요']);
eq('링크 두 개', links('https://a.com 그리고 https://b.com/'), ['https://a.com', 'https://b.com/']);
eq('줄바꿈으로 끊긴다', links('https://a.com\n다음 줄'), ['https://a.com']);
eq('대문자 스킴', links('HTTPS://A.COM/x'), ['HTTPS://A.COM/x']);
eq('꺾쇠·따옴표로 감싼 링크', links('<https://a.com> "https://b.com"'), ['https://a.com', 'https://b.com']);

console.log('2. 링크로 보면 안 되는 것');
eq('링크 없는 문장은 조각 하나', splitLinks('오늘 저녁 뭐 먹지'), [{ text: '오늘 저녁 뭐 먹지' }]);
eq('빈 문자열', splitLinks(''), [{ text: '' }]);
eq('www 만', links('www. 이라고 쓰면'), []);
eq('스킴만', links('https:// 만 쓰면'), []);
eq('단어 안의 http', links('abchttp://x.com'), []);
eq('점 없는 www', links('wwwabc'), []);
eq('이메일은 링크 아님(지금은)', links('mail me a@b.com'), []);

console.log('3. 조각 순서·텍스트 보존');
eq(
  '텍스트/링크/텍스트',
  splitLinks('봐 https://a.com 이거'),
  [{ text: '봐 ' }, { text: 'https://a.com', url: 'https://a.com' }, { text: ' 이거' }],
);
eq('원문 복원', splitLinks('a https://x.y/z. b (www.q.com) c').map((s) => s.text).join(''), 'a https://x.y/z. b (www.q.com) c');
eq('hasLink 참', hasLink('https://a.com'), true);
eq('hasLink 거짓', hasLink('그냥 글'), false);

rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passes} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
