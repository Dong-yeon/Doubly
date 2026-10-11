#!/usr/bin/env node
/**
 * 완성 스티커의 <b>몸통만</b> 기준 원본의 모양으로 갈아끼운다 (sketch.mjs·variants.mjs 의 형제).
 *
 * <p><b>왜 필요했나.</b> 2026-09-15 에 비개구리 몸통을 모찌(슬라임) 형태로 바꾸기로 했다.
 * 원래 스케치로 다시 뽑는 길도 있었지만 <b>어느 스케치가 어느 코드가 됐는지 매핑이 남아 있지
 * 않았고</b>(1차 10종은 손으로 골라 넣었다), 스케치에서 다시 뽑으면 표정·소품이 또 흔들린다.
 * 완성본을 입력으로 주면 표정·포즈·소품이 보존되고 바뀌는 건 몸통뿐이다.
 *
 * <p><b>기준 원본(--anchor)을 반드시 넣는다.</b> 모양을 글로만 설명하면 호출할 때마다 실루엣이
 * 새로 만들어져 색만 바꿔도 모양이 흔들린다 — 실제로 그렇게 여러 판을 버렸다. 그림 한 장을
 * 참조로 박아야 24장이 같은 몸을 갖는다.
 *
 *   railway run node scripts/couple-emoji-experiment/restyle.mjs \
 *     --anchor scripts/couple-emoji-experiment/bigae-anchor.png \
 *     --out scripts/couple-emoji-experiment/out/restyle \
 *     frontend/assets/stickers/bigae_love.png ...
 *
 * 옵션
 *   --anchor <image>  기준 원본 (필수)
 *   --out <dir>       결과 폴더 (기본 out/restyle-<타임스탬프>)
 *   --model <id>      기본 $GEMINI_IMAGE_MODEL 또는 gemini-3.1-flash-image
 *   --extra <text>    이 실행의 모든 대상에 덧붙일 문장
 *
 * <p><b>--extra 가 필요한 이유</b>: 기준 원본은 팔이 없고 뭉툭한 손만 있는데, 물건을 <b>들고
 * 있던</b> 장(퇴근의 지하철 손잡이·가방, 흥 간다의 편지, 선물이야의 상자, 꽃단장의 거울,
 * 좋아좋아의 만세)은 팔이 사라지면 물건이 공중에 뜬다. 그 몇 장만 따로 돌리면서 팔을
 * 늘리라고 덧붙인다. 전량에 붙이면 나머지 장까지 팔이 자라난다.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

/*
 * 두 장을 주고 "앞은 몸, 뒤는 표정"이라고 못박는다. 순서를 뒤집으면 모델이 표정 쪽 몸을
 * 따라가므로 이 순서를 지킨다. 부정문(no outline 등)은 자꾸 무시당해서 앞 문장에서
 * "첫 번째 그림을 그대로 베끼라"로 바꿔 말한다 — 참조가 텍스트보다 강하다.
 */
const PROMPT = [
  'You are given two images of the same character.',
  'IMAGE 1 is the TARGET BODY DESIGN. Copy it exactly: the same body silhouette and proportions,',
  'the same flat solid green fill with no gradient, the same treatment with no dark outline around the body,',
  'the same thick white sticker border, and the same small rounded nub hands at the sides with no legs.',
  'IMAGE 2 is an existing sticker of this character. Copy ONLY its face and story from it:',
  'the exact same eyes, mouth, blush, facial expression, and every prop, held object, motion line and effect mark',
  '(hearts, music notes, tears, anger marks, blanket, gift box, mirror, ribbon, bag and so on), in the same placement.',
  'Redraw IMAGE 2 using IMAGE 1 body design. Keep the props drawn in the same flat cartoon style as before.',
  'The face features should stay small and delicate like IMAGE 1.',
  'Square composition, character centered and large, plain pure white (#FFFFFF) background. No text, no letters, no watermark.',
].join(' ');

function parseArgs(argv) {
  const args = { inputs: [], out: null, model: null, anchor: null, extra: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') args.out = argv[++i];
    else if (a === '--model') args.model = argv[++i];
    else if (a === '--anchor') args.anchor = argv[++i];
    else if (a === '--extra') args.extra = argv[++i];
    else if (!a.startsWith('--')) args.inputs.push(a);
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
    body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ['IMAGE'], temperature: 0.3 } }),
  });
  const elapsedMs = Date.now() - started;
  const text = await res.text();
  if (!res.ok) return { ok: false, status: res.status, error: text.slice(0, 400), elapsedMs };
  const json = JSON.parse(text);
  const cand = json.candidates?.[0];
  const part = (cand?.content?.parts ?? []).find((p) => p.inlineData);
  if (!part) return { ok: false, status: res.status, finishReason: cand?.finishReason, error: text.slice(0, 400), elapsedMs };
  return { ok: true, elapsedMs, bytes: Buffer.from(part.inlineData.data, 'base64') };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const key = process.env.GEMINI_IMAGE_API_KEY ?? process.env.GEMINI_API_KEY;
  if (!key) { console.error('GEMINI_IMAGE_API_KEY(또는 GEMINI_API_KEY) 필요'); process.exit(2); }
  if (!args.anchor) { console.error('--anchor 는 필수입니다 (기준 원본 없이 돌리면 장마다 몸이 달라집니다)'); process.exit(2); }
  if (args.inputs.length === 0) { console.error('바꿀 스티커를 하나 이상 넘기세요'); process.exit(2); }

  const model = args.model ?? process.env.GEMINI_IMAGE_MODEL ?? 'gemini-3.1-flash-image';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const out = args.out ?? join('scripts', 'couple-emoji-experiment', 'out', `restyle-${stamp}`);
  await mkdir(out, { recursive: true });

  const anchorPart = { inlineData: { mimeType: mimeOf(args.anchor), data: await b64(args.anchor) } };
  console.log(`모델 ${model} · 기준 ${basename(args.anchor)} · 대상 ${args.inputs.length}장\n결과 → ${out}\n`);

  const prompt = args.extra ? `${PROMPT} ${args.extra}` : PROMPT;
  const run = { model, anchor: basename(args.anchor), prompt, results: [] };
  for (const input of args.inputs) {
    const name = basename(input, extname(input));
    const parts = [
      anchorPart,
      { inlineData: { mimeType: mimeOf(input), data: await b64(input) } },
      { text: prompt },
    ];
    process.stdout.write(`${name.padEnd(20)} … `);
    const r = await generate({ key, model, parts });
    if (r.ok) {
      await writeFile(join(out, `${name}.png`), r.bytes);
      console.log(`OK  ${(r.elapsedMs / 1000).toFixed(1)}s  ${(r.bytes.length / 1024).toFixed(0)}KB`);
      run.results.push({ input: name, ok: true, elapsedMs: r.elapsedMs });
    } else {
      console.log(`FAIL status=${r.status} finish=${r.finishReason ?? '-'}\n   ${r.error}`);
      run.results.push({ input: name, ok: false, status: r.status, error: r.error });
    }
  }
  await writeFile(join(out, 'run.json'), JSON.stringify(run, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
