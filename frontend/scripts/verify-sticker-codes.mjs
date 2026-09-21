/**
 * 스티커 텍스트 코드·키워드 추천 검증 — utils/stickerCodes.ts 를 건드리면 돌린다.
 *
 * 카탈로그(constants/stickerImages.ts)는 require() 가 있어 Node 가 못 읽으므로, 같은 라벨의
 * 스텁을 넣는다. 라벨이 바뀌면 여기도 바뀌어야 한다 — 그게 이 스크립트가 잡는 것이기도 하다.
 *
 * 실행: npm run verify:sticker-codes
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const src = fileURLToPath(new URL('../src/utils/stickerCodes.ts', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'sticker-codes-'));
writeFileSync(join(tmp, 'stickerCodes.ts'), readFileSync(src, 'utf8'));
const M = await import(pathToFileURL(join(tmp, 'stickerCodes.ts')));

/* 실제 카탈로그와 같은 라벨(라벨만 필요하다). 공용 라벨(시무룩·윙크 등)이 여러 캐릭터에 있는 것도 그대로 */
const CATALOG = [
  { label: '더비', stickers: [
    ['DUBI_LIKE', '좋아'], ['DUBI_HEHE', '히히'], ['DUBI_LAUGH', '하하하'], ['DUBI_EXCITED', '신났어'],
    ['DUBI_DANCE', '룰루랄라'], ['DUBI_GIFT', '선물이야'], ['DUBI_WINK', '윙크'], ['DUBI_SULKY', '시무룩'],
    ['DUBI_GRUMPY', '짜증나'], ['DUBI_ANGRY', '화났어'], ['DUBI_DASH', '흥, 간다'], ['DUBI_GLOOMY', '축 처짐'],
    ['DUBI_DIZZY', '어질~'], ['DUBI_OFFWORK', '퇴근'],
  ] },
  { label: '블리', stickers: [
    ['BLI_LOVE', '좋아좋아'], ['BLI_KISS', '뽀뽀'], ['BLI_BEAM', '방긋'], ['BLI_CONTENT', '흐뭇'],
    ['BLI_FLOWER', '기분 좋아'], ['BLI_MAKEUP', '꽃단장'], ['BLI_RIBBON', '예뻐졌지?'], ['BLI_WINK', '윙크'],
    ['BLI_OH', '어머'], ['BLI_SULKY', '시무룩'], ['BLI_GRUMPY', '짜증나'], ['BLI_CRYING', '엉엉'],
    ['BLI_GLOOMY', '축 처짐'], ['BLI_SLEEPY', '잘자'],
  ] },
  { label: '곰돌이', stickers: [
    ['LOVE_BEAR', '사랑해'], ['BEAR_EXCITED', '신났어'], ['BEAR_LAUGH', '하하하'], ['BEAR_SHY', '부끄러워'],
    ['BEAR_SULKY', '시무룩'], ['BEAR_ANGRY', '화났어'], ['BEAR_SORRY', '미안해'], ['BEAR_CRYING', '엉엉'],
    ['BEAR_TIRED', '지쳤어'], ['BEAR_SLEEPY', '잘자'],
  ] },
].map((c) => ({ label: c.label, stickers: c.stickers.map(([code, label]) => ({ code, label })) }));

const index = M.buildStickerCodeIndex(CATALOG);
const codeOf = (text) => M.parseStickerCode(index, text)?.code ?? null;
const suggest = (text) => M.suggestStickers(index, text).map((e) => e.code);

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

console.log('1. 코드 → 스티커');
eq('기본', codeOf('(더비_좋아)'), 'DUBI_LIKE');
eq('앞뒤 공백', codeOf('  (곰돌이_사랑해) '), 'LOVE_BEAR');
eq('라벨의 공백·문장부호는 없어도 된다', codeOf('(더비_흥간다)'), 'DUBI_DASH');
eq('라벨을 그대로 쳐도 된다', codeOf('(더비_흥, 간다)'), 'DUBI_DASH');
eq('물음표 라벨', codeOf('(블리_예뻐졌지)'), 'BLI_RIBBON');
eq('전각 괄호', codeOf('（블리_뽀뽀）'), 'BLI_KISS');
eq('공용 라벨은 캐릭터로 갈린다', codeOf('(블리_시무룩)'), 'BLI_SULKY');
eq('공용 라벨 — 곰돌이', codeOf('(곰돌이_시무룩)'), 'BEAR_SULKY');
eq('없는 조합', codeOf('(더비_뽀뽀)'), null);
eq('괄호 없으면 코드가 아니다', codeOf('더비_좋아'), null);
eq('문장 속 코드는 바꾸지 않는다', codeOf('오늘 (더비_좋아) 기분'), null);
eq('밑줄 없는 괄호 글', codeOf('(진짜)'), null);
eq('빈 입력', codeOf('   '), null);

console.log('2. 키워드 → 추천');
eq('라벨 정확 일치가 맨 앞', suggest('사랑해')[0], 'LOVE_BEAR');
eq('사랑해 추천 목록', suggest('사랑해'), ['LOVE_BEAR', 'BLI_LOVE', 'BLI_KISS']);
eq('ㅠㅠ', suggest('ㅠㅠ'), ['BLI_CRYING', 'BEAR_CRYING', 'BLI_GLOOMY']);
eq('ㅋㅋㅋ', suggest('ㅋㅋㅋ')[0], 'DUBI_LAUGH');
eq('잘자 — 공용 라벨 둘 다', suggest('잘자'), ['BLI_SLEEPY', 'BEAR_SLEEPY']);
eq('시무룩 셋', suggest('시무룩'), ['DUBI_SULKY', 'BLI_SULKY', 'BEAR_SULKY']);
eq('포함 검색(두 글자)', suggest('짜증'), ['DUBI_GRUMPY', 'BLI_GRUMPY', 'DUBI_DASH']);
eq('한 글자는 추천하지 않는다', suggest('좋'), []);
eq('문장은 추천하지 않는다', suggest('오늘 진짜 너무 사랑해 고마워'), []);
eq('빈 입력', suggest(''), []);
eq('맞는 게 없으면 빈 배열', suggest('회의'), []);
eq('상한 6개', suggest('좋아').length <= 6, true);

console.log('3. 코드 치는 중');
eq('"(더비" 는 더비 전부(상한)', suggest('(더비').length, 6);
eq('"(더비_" 도 같다', suggest('(더비_')[0], 'DUBI_LIKE');
eq('"(블리_뽀" 는 뽀뽀', suggest('(블리_뽀'), ['BLI_KISS']);
eq('"(곰" 은 곰돌이', suggest('(곰')[0], 'LOVE_BEAR');
eq('없는 캐릭터', suggest('(모찌'), []);

console.log('4. 코드 텍스트');
eq('코드 표기', index.entries.find((e) => e.code === 'DUBI_DASH').text, '(더비_흥간다)');
eq('전체 개수 = 카탈로그', index.entries.length, 38);

rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passes} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
