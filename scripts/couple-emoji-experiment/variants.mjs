#!/usr/bin/env node
/**
 * 완성 스티커 1장 → 같은 캐릭터의 감정 변주 세트 (sketch.mjs 의 자매 스크립트).
 *
 * <p><b>sketch.mjs 와 무엇이 다른가</b>: sketch.mjs 는 <b>손그림 스케치가 입력</b>이고
 * 한 장당 한 장을 "다시 그린다"(redraw this sketch). 비개구리 10종이 그렇게 나왔다.
 * 여기는 스케치가 없다 — <b>이미 완성된 스티커 한 장</b>을 참조로 주고 포즈·표정만 바꿔
 * 새로 그린다. 곰돌이(love_bear.png)처럼 스케치는 없는데 결과물만 있는 캐릭터용이다.
 *
 *   GEMINI_API_KEY=... node scripts/couple-emoji-experiment/variants.mjs \
 *     --ref frontend/assets/stickers/love_bear.png
 *
 * <p><b>키는 환경변수 하나면 된다</b> — Railway CLI 는 필요 없다(개발 PC 에 설치돼 있지도
 * 않다). 운영 키는 Railway 백엔드 서비스의 Variables 에 있지만, 그걸 로컬로 꺼내 오는 것보다
 * <b>AI Studio 에서 이 용도의 키를 따로 발급</b>하는 편이 낫다 — 운영 키가 개발 PC 에
 * 남지 않고, 실험 비용도 따로 볼 수 있다. 이미지 생성은 무료 티어가 없으므로 결제가 연결된
 * 프로젝트의 키여야 한다.
 *
 * 옵션
 *   --ref <image>     참조 스티커 (필수) — 이 그림의 캐릭터·화풍·색을 그대로 따라간다
 *   --out <dir>       결과 폴더 (기본 out/variants-<타임스탬프>)
 *   --model <id>      기본 $GEMINI_IMAGE_MODEL 또는 gemini-3.1-flash-image
 *   --only <codes>    감정 코드 일부만 (콤마) — 재시도용. 예: --only BEAR_ANGRY,BEAR_SLEEPY
 *   --solo            참조에 캐릭터가 둘이어도 <b>주인공 한 마리만</b> 그린다
 *
 * <p><b>글자는 넣지 않는다.</b> love_bear.png 에는 "사랑해"가 그림에 박혀 있는데,
 * 이미지 모델은 한글을 거의 항상 깨뜨린다(자모가 뭉개지거나 없는 글자가 나온다).
 * 세트를 글자 없이 통일하고, 문구가 필요하면 앱에서 얹는 편이 안전하다.
 * 그래서 기존 한 장도 이 스크립트로 다시 뽑아 세트에 맞추는 것을 권한다 —
 * {@code LOVE_BEAR} 라는 <b>코드는 그대로 두고 PNG 만 갈아끼우면</b> 과거 말풍선은 안 깨진다.
 *
 * <p><b>결과는 PNG 가 아니라 JPEG 다</b>(모델이 그렇게 돌려준다 — 확장자도 그에 맞춰 붙는다).
 * {@code normalize-stickers.mjs} 는 노드 내장에 JPEG 디코더가 없어 PNG 만 읽으므로, 후처리
 * 전에 한 번 변환해야 한다. 윈도우면 추가 설치 없이 내장 GDI+ 로 된다:
 *
 *   powershell -c "Add-Type -AssemblyName System.Drawing; \
 *     Get-ChildItem out\<폴더>\*.jpg | ForEach-Object { \
 *       $i=[System.Drawing.Image]::FromFile($_.FullName); \
 *       $i.Save(($_.FullName -replace '\.jpg$','.png'), [System.Drawing.Imaging.ImageFormat]::Png); $i.Dispose() }"
 *
 * <p>후처리는 sketch.mjs 와 같다: {@code normalize-stickers.mjs} 로 360 RGBA 투명 배경까지
 * 맞춘 뒤 {@code frontend/assets/stickers/} 에 넣는다. 그 다음 프론트
 * {@code stickerImages.ts} 와 백엔드 {@code StickerImage} 에 <b>같이</b> 추가해야 한다
 * (안 그러면 {@code StickerImageSyncTest} 가 잡는다).
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

/*
 * 비개구리 10종과 <b>같은 감정 수·같은 순서 감각</b>으로 맞춘다. 트레이에서 캐릭터별로
 * 나눴을 때 두 줄이 세로로 짝이 맞아야 "같은 감정, 다른 캐릭터"로 읽힌다 — 감정 목록이
 * 서로 겹치지 않으면 두 캐릭터가 그냥 다른 스티커 더미로 보인다.
 *
 * 비개구리에만 있는 것(씰룩씰룩=뒷모습, 흥 간다=혼자 떠남)은 두 마리 구도로 옮기기
 * 어색해서 커플 앱에서 더 자주 쓰는 감정(부끄러워·미안해)으로 바꿨다.
 *
 * label 은 프론트/백엔드 라벨과 글자까지 같아야 한다(StickerImageSyncTest 가 대조한다).
 */
const EMOTIONS = [
  { code: 'LOVE_BEAR', label: '사랑해', pose: 'hugging each other happily, eyes closed in a warm smile, small hearts floating around' },
  { code: 'BEAR_EXCITED', label: '신났어', pose: 'both jumping with arms raised in celebration, big open smiles, motion lines' },
  // 참조가 "껴안은 구도"라 가만 두면 무엇을 시켜도 그 자세로 그린다. 감정이 얼굴에만
  // 드러나는 장은 트레이 크기에서 LOVE_BEAR 와 구분이 안 돼, 자세를 명시로 떼어놓는다.
  { code: 'BEAR_LAUGH', label: '하하하', pose: 'standing apart from each other (NOT hugging), both laughing hard with heads tilted back and paws holding their bellies, eyes squeezed shut, mouths wide open, motion lines, no hearts' },
  { code: 'BEAR_SHY', label: '부끄러워', pose: 'both blushing deeply, paws covering their cheeks, looking away shyly' },
  { code: 'BEAR_SULKY', label: '시무룩', pose: 'both pouting with puffed cheeks, arms crossed, looking away from each other' },
  { code: 'BEAR_ANGRY', label: '화났어', pose: 'both frowning angrily, eyebrows down, small anger puff marks above their heads' },
  { code: 'BEAR_SORRY', label: '미안해', pose: 'one bowing its head apologetically with paws pressed together, the other watching softly' },
  { code: 'BEAR_CRYING', label: '엉엉', pose: 'both crying with big teardrops, wide watery eyes, mouths open in a wail' },
  { code: 'BEAR_TIRED', label: '지쳤어', pose: 'sitting apart on the ground (NOT hugging), both exhausted and slumped with shoulders drooping, arms hanging limp, weary half-closed eyes, a single sweat drop by the temple, no hearts' },
  { code: 'BEAR_SLEEPY', label: '잘자', pose: 'both asleep under a blanket, eyes closed peacefully, small zzz marks' },
];

/*
 * 참조 한 장으로 화풍을 잡는 프롬프트. sketch.mjs 의 STYLES.clean 과 역할은 같지만
 * "스케치를 살려라"가 아니라 "참조의 캐릭터·화풍을 그대로 두고 감정만 바꿔라"다.
 */
const anchorFor = ({ pose }, solo) => [
  'The image above is a finished chat sticker. Draw a NEW sticker of the SAME character(s) in the SAME art style.',
  solo
    ? 'CAST: draw ONLY the main character (the bear). Do not include the second character.'
    : 'CAST: keep BOTH characters together exactly as in the reference — same species, same colors, same size relationship.',
  'CHARACTER (most important): identical design to the reference — same body shape, same face, same fur color,',
  'same eye and muzzle shape, same proportions. It must read as the same character, not a lookalike.',
  'STYLE: match the reference exactly — same soft colored-pencil texture, same gentle line weight, same pastel palette,',
  'same thick white sticker border, plain pure white (#FFFFFF) background, square composition, characters large and centered.',
  `NEW POSE AND EXPRESSION: ${pose}.`,
  'NO TEXT: absolutely no letters, words, Korean characters, captions or watermark anywhere in the image.',
].join(' ');

function parseArgs(argv) {
  const args = { ref: null, out: null, model: null, only: null, solo: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--ref') args.ref = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--model') args.model = argv[++i];
    else if (a === '--only') args.only = argv[++i].split(',').map((s) => s.trim());
    else if (a === '--solo') args.solo = true;
  }
  return args;
}

const mimeOf = (p) => (extname(p).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg');
const b64 = async (p) => (await readFile(p)).toString('base64');

async function generate({ key, model, parts }) {
  const started = Date.now();
  const res = await fetch(`${BASE_URL}/models/${model}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ['IMAGE'], temperature: 0.4 } }),
  });
  const elapsedMs = Date.now() - started;
  const text = await res.text();
  if (!res.ok) return { ok: false, status: res.status, error: text.slice(0, 400), elapsedMs };
  const json = JSON.parse(text);
  const cand = json.candidates?.[0];
  const part = (cand?.content?.parts ?? []).find((p) => p.inlineData);
  if (!part) return { ok: false, status: res.status, finishReason: cand?.finishReason, error: text.slice(0, 400), elapsedMs };
  return { ok: true, elapsedMs, mime: part.inlineData.mimeType, bytes: Buffer.from(part.inlineData.data, 'base64') };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const key = process.env.GEMINI_IMAGE_API_KEY ?? process.env.GEMINI_API_KEY;
  if (!key) { console.error('GEMINI_IMAGE_API_KEY(또는 GEMINI_API_KEY) 필요'); process.exit(2); }
  if (!args.ref) { console.error('--ref <참조 스티커> 가 필요합니다'); process.exit(2); }

  const targets = args.only ? EMOTIONS.filter((e) => args.only.includes(e.code)) : EMOTIONS;
  if (targets.length === 0) { console.error('--only 에 맞는 감정 코드가 없습니다'); process.exit(2); }

  const model = args.model ?? process.env.GEMINI_IMAGE_MODEL ?? 'gemini-3.1-flash-image';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const out = args.out ?? join('scripts', 'couple-emoji-experiment', 'out', `variants-${stamp}`);
  await mkdir(out, { recursive: true });

  const refPart = { inlineData: { mimeType: mimeOf(args.ref), data: await b64(args.ref) } };

  console.log(`모델 ${model} · 참조 ${basename(args.ref)}${args.solo ? ' · solo' : ''} · ${targets.length}장\n결과 → ${out}\n`);
  const run = { model, ref: basename(args.ref), solo: args.solo, results: [] };
  for (let i = 0; i < targets.length; i++) {
    const e = targets[i];
    const prompt = anchorFor(e, args.solo);
    process.stdout.write(`${`${e.code} (${e.label})`.padEnd(30)} … `);
    const r = await generate({ key, model, parts: [refPart, { text: prompt }] });
    if (r.ok) {
      /*
       * <b>확장자는 응답의 mime 을 따른다.</b> 이 모델은 실제로 JPEG 를 돌려주는데
       * 예전엔 무조건 .png 로 저장해서, 파일 이름만 보고 PNG 인 줄 알고 넘긴
       * normalize-stickers.mjs 가 "PNG 이 아니다"로 죽었다. 이름이 내용을 속이면
       * 다음 단계에서 반드시 한 번 터진다.
       */
      const ext = r.mime === 'image/png' ? 'png' : 'jpg';
      const file = join(out, `${String(i + 1).padStart(2, '0')}-${e.code}.${ext}`);
      await writeFile(file, r.bytes);
      console.log(`OK  ${(r.elapsedMs / 1000).toFixed(1)}s  ${(r.bytes.length / 1024).toFixed(0)}KB`);
      run.results.push({ code: e.code, label: e.label, file: basename(file), ok: true, elapsedMs: r.elapsedMs, prompt });
    } else {
      console.log(`FAIL status=${r.status} finish=${r.finishReason ?? '-'}\n   ${r.error}`);
      run.results.push({ code: e.code, label: e.label, ok: false, status: r.status, error: r.error, prompt });
    }
  }
  await writeFile(join(out, 'run.json'), JSON.stringify(run, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
