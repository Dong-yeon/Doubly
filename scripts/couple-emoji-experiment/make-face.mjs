#!/usr/bin/env node
/**
 * 실험용 합성 얼굴 사진 생성 — 실제 인물 사진이 없을 때 파이프라인·스타일 일관성만 먼저 보기 위한 대역.
 * "닮음" 판정은 이걸로 할 수 없다(원본이 가짜라 기준이 없다). 실제 사진으로 다시 돌릴 것.
 *
 *   GEMINI_API_KEY=... node scripts/couple-emoji-experiment/make-face.mjs [--out photos/synthetic-1.png] [--model id]
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const PROMPT = [
  'A realistic candid smartphone photo of a Korean woman in her late 20s, shoulder-length dark brown hair',
  'with bangs, round face, small mole under the left eye, wearing thin silver-rimmed glasses and a beige knit sweater.',
  'Natural indoor lighting, cafe background slightly blurred, looking at the camera with a neutral relaxed expression.',
  'Head and shoulders, centered, square photo. Photorealistic, no text.',
].join(' ');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const out = opt('--out', join('scripts', 'couple-emoji-experiment', 'photos', 'synthetic-1.png'));
const model = opt('--model', process.env.GEMINI_IMAGE_MODEL ?? 'gemini-2.5-flash-image');
const key = process.env.GEMINI_API_KEY;
if (!key) { console.error('GEMINI_API_KEY 필요'); process.exit(2); }

const res = await fetch(`${BASE_URL}/models/${model}:generateContent?key=${key}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    contents: [{ parts: [{ text: PROMPT }] }],
    generationConfig: { responseModalities: ['IMAGE'] },
  }),
});
const text = await res.text();
if (!res.ok) { console.error(`실패 ${res.status}: ${text.slice(0, 500)}`); process.exit(1); }
const json = JSON.parse(text);
const part = (json.candidates?.[0]?.content?.parts ?? []).find((p) => p.inlineData);
if (!part) { console.error(`이미지 없음: ${JSON.stringify(json).slice(0, 500)}`); process.exit(1); }
await mkdir(dirname(out), { recursive: true });
await writeFile(out, Buffer.from(part.inlineData.data, 'base64'));
console.log(`저장 → ${out} (${model}, finish=${json.candidates[0].finishReason})`);
