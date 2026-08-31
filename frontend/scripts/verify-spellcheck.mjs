/**
 * 맞춤법 규칙 검증 스크립트 — 규칙을 추가/수정하면 반드시 돌린다.
 *
 * 프론트에 테스트 러너가 없어서 이 스크립트가 그 역할을 한다.
 *  - 잡아야 하는 문장(정탐)과
 *  - 절대 건드리면 안 되는 문장(오탐 방지)을 전부 돌려본다.
 *
 * Node 22.6+ 의 타입 제거 기능으로 .ts 를 바로 불러온다(컴파일 불필요).
 * 다만 Node ESM 은 확장자 없는 import 를 못 풀어서, 임시 폴더에 복사하며
 * import 경로에 .ts 를 붙인다(앱 소스는 Metro 관례대로 확장자 없이 둔다).
 * 실행: npm run verify:spellcheck
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const srcDir = fileURLToPath(new URL('../src/utils', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'spellcheck-'));
for (const f of ['koreanSpellCheck.ts', 'koreanSpellRules.ts']) {
  const code = readFileSync(join(srcDir, f), 'utf8').replace(
    "from './koreanSpellRules'",
    "from './koreanSpellRules.ts'",
  );
  writeFileSync(join(tmp, f), code);
}
const { checkKoreanSpelling, applyAllSuggestions } = await import(
  pathToFileURL(join(tmp, 'koreanSpellCheck.ts'))
);

/** [문장, 기대하는 고침(부분 문자열)] — 반드시 잡아야 한다 */
const MUST_FLAG = [
  // 되/돼
  ['그러면 않되', '안 되'],
  ['이제 됬어', '됐'],
  ['그거 하면 안되요', '안 돼요'],
  ['가게 되서', '돼서'],
  ['그렇게 하면 안되', '안 돼'],
  // ㄴ데 를 돼/대 로
  ['그건 아닌돼', '아닌데'],
  ['그거 아닌대?', '아닌데'],
  ['그런돼 말이야', '그런데'],
  ['그런대 있잖아', '그런데'],
  // 뵈/봬
  ['내일 봐요 아니 뵈요', '봬요'],
  ['어제 뵜어요', '뵀'],
  // -려고
  ['운동 할려고 했는데', '하려'],
  ['이것 좀 먹을려면', '으려'],
  // ㄹ 받침 + 된소리 어미
  ['금방 갈께', '게'],
  ['이따 만들께', '게'],
  ['아까 살껄', '걸'],
  ['내일 갈꺼야', '갈 거'],
  ['언제 올껀데', '올 건'],
  // 왠/웬
  ['웬지 좋아', '왠지'],
  ['왠일이야', '웬일'],
  ['왠종일 잤어', '온종일'],
  // 낱말
  ['통채로 먹었어', '통째로'],
  ['김치찌게 끓일까', '김치찌개'],
  ['어느세 여름이야', '어느새'],
  ['눈쌀 찌푸리지 마', '눈살'],
  ['오랜동안 기다렸어', '오랫동안'],
  ['댓가를 치렀지', '대가'],
  // 안/않
  ['숙제 않하고 뭐해', '안 하'],
  ['그럼 않해도 돼', '안 해'],
  // 활용 오류
  ['오늘부터 1일, 우리 사겼다', '사귀었'],
  ['프사 바꼈네?', '바뀌었'],
  ['문 잘 잠궈', '잠가'],
  ['김장 담궜어', '담갔'],
  ['시험 잘 치뤘어', '치렀'],
  ['시험을 치루고 왔어', '치르'],
  ['몸 좀 추스리고 다녀', '추스르'],
  ['한참 헤메고 있었어', '헤매'],
  ['눈에 덮힌 산', '덮인'],
  ['오늘 진짜 힘듬', '힘듦'],
  ['그런 말은 삼가해 주세요', '삼가'],
  ['안녕히 게세요', '계세요'],
  // 왠/웬
  ['왠걸, 벌써 왔네', '웬걸'],
  // -이/-히
  ['솔직이 말해봐', '솔직히'],
  ['가만이 있어', '가만히'],
  ['천천이 와', '천천히'],
  ['샅샅히 뒤졌어', '샅샅이'],
  // 사이시옷
  ['갯수 좀 세봐', '개수'],
  ['뒷통수 조심해', '뒤통수'],
  ['윗층이 시끄러워', '위층'],
  ['존대말 쓰지 마', '존댓말'],
  // 한자어·사자성어
  ['승락해 줘', '승낙'],
  ['머리 폭팔할 거 같아', '폭발'],
  ['성대묘사 진짜 잘하네', '성대모사'],
  // 음식
  ['떡볶기 먹으러 갈래?', '떡볶이'],
  ['짜장면 곱배기 시켜줘', '곱빼기'],
  ['육계장 먹었어', '육개장'],
  // 낱말
  ['구지 그래야 해?', '굳이'],
  ['아 구지 왜', '굳이'],
  ['어느듯 가을이야', '어느덧'],
  ['요세 뭐해?', '요새'],
  ['어쨋든 고마워', '어쨌'],
  ['도데체 왜 그래', '도대체'],
  ['아 너무 챙피해', '창피'],
  ['벗꽃 보러 가자', '벚꽃'],
  ['머리가 부시시하네', '부스스'],
  ['이제 실증났어?', '싫증'],
  ['그 예기 들었어?', '얘기'],
  ['어제 산 거에요', '거예요'],
  ['하마트면 늦을 뻔', '하마터면'],
  ['방에 옷이 널부러져 있어', '널브러'],
  ['남들보다 뒤쳐진 기분이야', '뒤처'],
  ['요컨데 그 말이지', '요컨대'],
  // 서운/서눈 — 애교체 어미가 붙어도 어간 오타는 잡는다
  ['나 진짜 서눈했어', '서운'],
  ['서눈했쪄?', '서운'],
];

/** 맞는 말(또는 판단 불가) — 하나라도 잡으면 오탐이다 */
const MUST_NOT_FLAG = [
  // 되/돼 의 맞는 활용
  '이제 안 돼',
  '가면 돼요',
  '내일 봬요',
  '이거 돼요?',
  '10시만 돼도 좋겠다',
  '오늘 시간돼?', // 붙여 쓴 채팅체 — 띄어쓰기는 지적하지 않는다
  // ㄴ데/ㄴ대 의 맞는 쓰임
  '그런대로 괜찮아',
  '그런돼지 인형 봤어?',
  '아닌대로 해',
  // 높임 조사 께
  '부모님들께 드릴 선물',
  '선생님께 여쭤봐',
  '아들께 전해줘',
  '딸께 줬어',
  // 끄다/꺼내다/갈리다/알리다/찌다
  '불꺼야지 이제',
  '지갑에서 칼꺼내지 마',
  '팀이 갈려서 아쉽다',
  '나한테 알려줘',
  '살찌게 먹지 마',
  // 낱말 속에 규칙 글자가 들어 있는 함정
  '내 친구지 뭐', // 구지
  '요세미티 여행 가고 싶다', // 요세
  '예기치 못한 일이야', // 예기(豫期)
  '베이컨데 맛있겠다', // ~컨데
  '실증적인 자료가 필요해', // 실증(實證)
  '치루 수술 받으셨대', // 치루(병명)
  // 맞는 활용
  '문 잘 잠갔어?',
  '우리 어제부터 사귀었어',
  '천천히 와도 돼',
  '얘기하자',
  '뚝배기 깨졌어',
  '요새 어때?',
  // 명사·애칭으로 읽히는 형태
  '우리 강아지 똑똑이', // 똑똑히 는 안 다룬다
  '공부에 열심이야', // 열심이 는 안 다룬다
  '오뚜기 카레 사 와', // 브랜드
  // 일부러 안 잡는 것들
  '설레임 하나 사 와', // 아이스크림일 수 있다
  '기분이 왠지 좋아',
  '이따가 할걸 그랬나', // 이미 맞는 표기
  // 서운 — 이미 맞게 쓴 경우(애교체 어미가 붙어도)
  '나 진짜 서운했어',
  '서운했쪄?',
];

let failed = 0;

for (const [text, expected] of MUST_FLAG) {
  const suggestions = checkKoreanSpelling(text);
  const hit = suggestions.some((s) => s.right.includes(expected) || expected.includes(s.right));
  if (!hit) {
    failed++;
    console.error(`✗ 놓침: "${text}" → "${expected}" 제안이 없음`, suggestions);
  }
}

for (const text of MUST_NOT_FLAG) {
  const suggestions = checkKoreanSpelling(text);
  if (suggestions.length > 0) {
    failed++;
    console.error(`✗ 오탐: "${text}"`, suggestions);
  }
}

// 모두 적용이 위치를 어긋내지 않는지
{
  const text = '아, 그게 아닌돼. 됬다고 생각했는데 다시 할께';
  const applied = applyAllSuggestions(text, checkKoreanSpelling(text));
  const want = '아, 그게 아닌데. 됐다고 생각했는데 다시 할게';
  if (applied !== want) {
    failed++;
    console.error(`✗ 모두 적용 결과가 다름:\n  결과: ${applied}\n  기대: ${want}`);
  }
}

rmSync(tmp, { recursive: true, force: true });

const total = MUST_FLAG.length + MUST_NOT_FLAG.length + 1;
if (failed) {
  console.error(`\n${total}건 중 ${failed}건 실패`);
  process.exit(1);
}
console.log(`✓ 맞춤법 규칙 검증 ${total}건 모두 통과`);
