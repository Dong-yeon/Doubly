#!/usr/bin/env node
/**
 * 손그림 스케치 → 기본 이모티콘 실험 (우리 이모지와 별개 — 사람 얼굴이 아니라 캐릭터 디자인이 입력).
 *
 * 사용자가 그린 "비개구리" 캐릭터(하트형 머리·짧은 다리·감정별 표정) 스케치를 그대로 살려
 * 깔끔한 스티커로 다시 그린다. 실측 목적: ① 스케치의 디자인이 얼마나 유지되는가(하트형 머리·눈 모양·다리)
 * ② 여러 장을 한 세트로 만들었을 때 그림체가 일치하는가 ③ 참조를 한 장(대표) 더 넣으면 일관성이 오르는가.
 *
 *   railway run node scripts/couple-emoji-experiment/sketch.mjs <sketch1> [<sketch2> ...] [옵션]
 *
 * 옵션
 *   --out <dir>       결과 폴더 (기본 out/sketch-<타임스탬프>)
 *   --model <id>      기본 $GEMINI_IMAGE_MODEL 또는 gemini-3.1-flash-image
 *   --ref <image>     모든 호출에 같이 넣는 대표 참조(이미 만든 스티커 등) — 세트 일관성 실험용
 *   --label <text>    스케치가 여러 장일 때 각 장의 감정 라벨(콤마) — 프롬프트에 힌트로만 쓴다
 *   --style <key>     clean(기본) | lineart
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

const STYLES = {
  clean: [
    'Redraw this hand-drawn pen sketch as a finished, polished chat sticker (emoticon).',
    'CHARACTER DESIGN (most important): keep the character exactly as sketched — the same head shape (a rounded heart-like blob),',
    'the same eyes, mouth and expression, the same tiny stick legs/arms and any props or motion lines. Do not add a body, hair,',
    'clothes or features that are not in the sketch. This is a specific original character, not a generic frog.',
    'STYLE: clean flat vector cartoon, thick dark outline, soft solid colors (pale green body, blush cheeks), thick white sticker',
    'border, plain pure white (#FFFFFF) background, square composition, character centered and large.',
    'Remove the paper, ruled lines, handwriting and any other doodles. No text, no letters, no watermark.',
  ].join(' '),
  lineart: [
    'Redraw this hand-drawn pen sketch as a clean digital sticker in a doodle style: keep the character design exactly',
    '(rounded heart-like head, eyes, mouth, expression, tiny stick legs/arms, props, motion lines). Do not add anything',
    'not in the sketch. Smooth black ink outlines, light pastel fill (pale green), thick white sticker border,',
    'plain pure white background, square, centered. Remove paper, ruled lines, handwriting and other doodles. No text.',
  ].join(' '),
};

function parseArgs(argv) {
  const args = { sketches: [], out: null, model: null, ref: null, labels: [], style: 'clean' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') args.out = argv[++i];
    else if (a === '--model') args.model = argv[++i];
    else if (a === '--ref') args.ref = argv[++i];
    else if (a === '--label') args.labels = argv[++i].split(',').map((s) => s.trim());
    else if (a === '--style') args.style = argv[++i];
    else if (!a.startsWith('--')) args.sketches.push(a);
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
  if (args.sketches.length === 0) { console.error('스케치 이미지를 하나 이상 넘기세요'); process.exit(2); }
  const anchor = STYLES[args.style];
  if (!anchor) { console.error(`--style 은 ${Object.keys(STYLES).join('|')}`); process.exit(2); }
  const model = args.model ?? process.env.GEMINI_IMAGE_MODEL ?? 'gemini-3.1-flash-image';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const out = args.out ?? join('scripts', 'couple-emoji-experiment', 'out', `sketch-${stamp}`);
  await mkdir(out, { recursive: true });

  const refPart = args.ref
    ? [{ inlineData: { mimeType: mimeOf(args.ref), data: await b64(args.ref) } },
       { text: 'The image above is the finished reference style of the same character. Match its colors, line weight and proportions exactly.' }]
    : [];

  console.log(`모델 ${model} · 스타일 ${args.style} · 스케치 ${args.sketches.length}장${args.ref ? ' · 참조 1장' : ''}\n결과 → ${out}\n`);
  const run = { model, style: args.style, anchor, ref: args.ref ? basename(args.ref) : null, results: [] };
  for (let i = 0; i < args.sketches.length; i++) {
    const sketch = args.sketches[i];
    const label = args.labels[i];
    const prompt = label ? `${anchor}\nThe sketch shows the character feeling: ${label}.` : anchor;
    const parts = [...refPart, { inlineData: { mimeType: mimeOf(sketch), data: await b64(sketch) } }, { text: prompt }];
    process.stdout.write(`${basename(sketch).padEnd(36)} … `);
    const r = await generate({ key, model, parts });
    if (r.ok) {
      const file = join(out, `${String(i + 1).padStart(2, '0')}-${basename(sketch, extname(sketch))}.png`);
      await writeFile(file, r.bytes);
      console.log(`OK  ${(r.elapsedMs / 1000).toFixed(1)}s  ${(r.bytes.length / 1024).toFixed(0)}KB`);
      run.results.push({ sketch: basename(sketch), file: basename(file), ok: true, elapsedMs: r.elapsedMs, prompt });
    } else {
      console.log(`FAIL status=${r.status} finish=${r.finishReason ?? '-'}\n   ${r.error}`);
      run.results.push({ sketch: basename(sketch), ok: false, status: r.status, error: r.error, prompt });
    }
  }
  await writeFile(join(out, 'run.json'), JSON.stringify(run, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
