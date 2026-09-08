#!/usr/bin/env node
/**
 * 우리 이모지 — 0단계 프롬프트 실험 스크립트 (docs/COUPLE_EMOJI_AI_DESIGN_2026-09-08.md §11).
 *
 * 코드 없이 "닮는가 · 세트가 일관된가"만 본다. 백엔드와 무관한 독립 스크립트이며 앱에 번들되지 않는다.
 *
 *   GEMINI_API_KEY=... node scripts/couple-emoji-experiment/generate.mjs <photo> [옵션]
 *
 * 옵션
 *   --out <dir>            결과 폴더 (기본 scripts/couple-emoji-experiment/out/<타임스탬프>)
 *   --emotions ANGRY,SAD   감정 일부만 (기본 6종 전부). 원가 절약용 — 문서 §8
 *   --model <id>           이미지 모델 (기본 $GEMINI_IMAGE_MODEL 또는 gemini-2.5-flash-image)
 *   --style <key>          프롬프트 앵커 변형 (아래 STYLES 중 하나, 기본 'vector')
 *   --list-models          이미지 출력을 지원하는 모델 목록만 찍고 종료
 *
 * 결과: <out>/<emotion>.png 와 <out>/run.json (모델·프롬프트·finishReason·소요시간 — 문서 §12 에 옮겨 적는다)
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

/** 감정 6종 — 문서 §3 과 같은 순서. 값은 감정별 변주 문구(공통 앵커 뒤에 붙는다). */
const EMOTIONS = {
  ANGRY: 'furious: red flushed cheeks, puffed face, steam clouds rising from the head, furrowed brows, tightly closed mouth',
  HAPPY: 'happy and content: warm closed-eye smile, rosy cheeks, small sparkles around the face',
  EXCITED: 'super excited: both arms raised high, wide open mouth cheering, confetti and stars flying around',
  SAD: 'sad: drooping eyebrows, big teary eyes, a single tear rolling down, small rain cloud above the head',
  SLEEPY: 'sleepy: eyes closed, yawning, head tilted, "zzz" letters floating above',
  LOVE: 'in love: heart-shaped eyes, blushing, hands making a finger heart, small hearts floating around',
};

/**
 * 공통 앵커 — 세트 6장이 "같은 캐릭터"로 보이게 하는 부분. 문서 §5-2.
 * 여러 변형을 두는 이유는 어느 문구가 닮음·일관성에 효과가 있는지 비교하기 위해서다.
 */
const STYLES = {
  vector: [
    'Turn the person in this photo into a cute 2D flat vector sticker character.',
    'Keep the person recognizable: preserve their face shape, hairstyle and hair color, skin tone,',
    'eye shape, glasses, moles or other distinctive features exactly as in the photo.',
    'Chibi proportions (big head, small body), thick white sticker outline, clean bold lines,',
    'soft pastel shading, plain solid white background. Square composition, character centered.',
    'No text, no letters, no watermark, no speech bubbles.',
  ].join(' '),
  kakao: [
    'Draw the person in this photo as a Korean messenger-style emoticon character (like popular chat stickers).',
    'The character must clearly look like this specific person: same face shape, hairstyle and hair color,',
    'skin tone, eye shape, glasses, and any distinctive features.',
    'Simple rounded cartoon style, minimal facial lines, big expressive face, small body,',
    'thick white sticker border, plain white background, centered, square.',
    'No text, no letters, no watermark.',
  ].join(' '),
  threeD: [
    'Render the person in this photo as a cute 3D-rendered emoji character (soft clay / Pixar-like look).',
    'Keep them recognizable: same face shape, hairstyle and hair color, skin tone, eye shape, glasses,',
    'and distinctive features. Big head, small body, soft studio lighting, plain white background,',
    'centered, square. No text, no watermark.',
  ].join(' '),
};

function parseArgs(argv) {
  const args = { photo: null, out: null, emotions: Object.keys(EMOTIONS), model: null, style: 'vector', listModels: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') args.out = argv[++i];
    else if (a === '--emotions') args.emotions = argv[++i].split(',').map((s) => s.trim().toUpperCase());
    else if (a === '--model') args.model = argv[++i];
    else if (a === '--style') args.style = argv[++i];
    else if (a === '--list-models') args.listModels = true;
    else if (!a.startsWith('--')) args.photo = a;
  }
  return args;
}

function requireKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.error('GEMINI_API_KEY 환경변수가 필요합니다 (Railway 변수와 같은 키).');
    process.exit(2);
  }
  return key;
}

async function listModels(key) {
  const res = await fetch(`${BASE_URL}/models?pageSize=200&key=${key}`);
  if (!res.ok) throw new Error(`models 조회 실패 ${res.status}: ${await res.text()}`);
  const { models = [] } = await res.json();
  const imageCapable = models.filter((m) => /image/i.test(m.name) || /image/i.test(m.displayName ?? ''));
  console.log('이미지 관련 모델:');
  for (const m of imageCapable) {
    console.log(`  ${m.name.replace('models/', '')}  —  ${m.displayName}  [${(m.supportedGenerationMethods ?? []).join(',')}]`);
  }
  console.log(`\n전체 ${models.length}개 중 ${imageCapable.length}개.`);
}

function mimeOf(path) {
  const ext = extname(path).toLowerCase();
  return ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
}

async function generateOne({ key, model, photoB64, mime, prompt }) {
  const body = {
    contents: [{ parts: [{ inlineData: { mimeType: mime, data: photoB64 } }, { text: prompt }] }],
    generationConfig: { responseModalities: ['IMAGE'], temperature: 0.4 },
  };
  const started = Date.now();
  const res = await fetch(`${BASE_URL}/models/${model}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const elapsedMs = Date.now() - started;
  const text = await res.text();
  if (!res.ok) return { ok: false, status: res.status, error: text.slice(0, 500), elapsedMs };
  const json = JSON.parse(text);
  const cand = json.candidates?.[0];
  const finishReason = cand?.finishReason ?? null;
  const part = (cand?.content?.parts ?? []).find((p) => p.inlineData);
  if (!part) {
    return { ok: false, status: res.status, finishReason, error: JSON.stringify(json).slice(0, 500), elapsedMs };
  }
  return {
    ok: true, finishReason, elapsedMs,
    mime: part.inlineData.mimeType, bytes: Buffer.from(part.inlineData.data, 'base64'),
    usage: json.usageMetadata ?? null,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const key = requireKey();
  if (args.listModels) return listModels(key);

  if (!args.photo) {
    console.error('사용법: node generate.mjs <photo.jpg> [--emotions ANGRY,SAD] [--style vector|kakao|threeD] [--model id]');
    process.exit(2);
  }
  const anchor = STYLES[args.style];
  if (!anchor) {
    console.error(`--style 은 ${Object.keys(STYLES).join('|')} 중 하나`);
    process.exit(2);
  }
  const model = args.model ?? process.env.GEMINI_IMAGE_MODEL ?? 'gemini-2.5-flash-image';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const out = args.out ?? join('scripts', 'couple-emoji-experiment', 'out', `${stamp}-${args.style}`);
  await mkdir(out, { recursive: true });

  const photoB64 = (await readFile(args.photo)).toString('base64');
  const mime = mimeOf(args.photo);
  console.log(`모델 ${model} · 스타일 ${args.style} · 사진 ${basename(args.photo)} · 감정 ${args.emotions.join(',')}`);
  console.log(`결과 → ${out}\n`);

  const run = { model, style: args.style, anchor, photo: basename(args.photo), startedAt: new Date().toISOString(), results: {} };
  for (const emotion of args.emotions) {
    const variation = EMOTIONS[emotion];
    if (!variation) { console.warn(`모르는 감정 ${emotion} — 건너뜀`); continue; }
    const prompt = `${anchor}\nExpression: ${variation}.`;
    process.stdout.write(`${emotion.padEnd(8)} … `);
    const r = await generateOne({ key, model, photoB64, mime, prompt });
    if (r.ok) {
      const file = join(out, `${emotion.toLowerCase()}.png`);
      await writeFile(file, r.bytes);
      console.log(`OK  ${(r.elapsedMs / 1000).toFixed(1)}s  ${(r.bytes.length / 1024).toFixed(0)}KB  ${r.finishReason ?? ''}`);
      run.results[emotion] = { ok: true, file: basename(file), elapsedMs: r.elapsedMs, finishReason: r.finishReason, usage: r.usage, prompt };
    } else {
      console.log(`FAIL status=${r.status} finish=${r.finishReason ?? '-'} ${(r.elapsedMs / 1000).toFixed(1)}s\n   ${r.error}`);
      run.results[emotion] = { ok: false, status: r.status, finishReason: r.finishReason, error: r.error, elapsedMs: r.elapsedMs, prompt };
    }
  }
  await writeFile(join(out, 'run.json'), JSON.stringify(run, null, 2));
  console.log(`\nrun.json 저장. 결과 판정은 docs/COUPLE_EMOJI_AI_DESIGN_2026-09-08.md §12 에 적는다.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
