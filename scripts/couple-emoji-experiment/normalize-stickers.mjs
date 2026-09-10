#!/usr/bin/env node
/**
 * 스티커화 결과(1024 RGB, 흰 배경) → 번들 에셋 규격(360 RGBA, 투명 배경).
 *
 * <p>{@code normalize_stickers.py} 의 Node 포팅이다. 로직은 같고 <b>의존성만 없앴다</b> —
 * 파이썬 판은 numpy·Pillow·scipy 가 필요한데 개발 PC 에 Python 자체가 없다(PATH 의
 * python.exe 는 Microsoft Store 스텁이라 실행하면 스토어만 열린다). 이 파일은 노드
 * 내장 zlib 만 쓴다.
 *
 *   node scripts/couple-emoji-experiment/normalize-stickers.mjs <입력> <출력> [<입력> <출력> ...]
 *
 * <p><b>배경을 그냥 투명하게 못 만드는 이유</b>(파이썬 판 주석 그대로): 생성물의 배경
 * (252,250,251 근방)과 캐릭터를 감싼 흰 스티커 테두리가 둘 다 흰색이고 서로 붙어 있어서,
 * 가장자리에서 flood fill 하면 테두리까지 같이 지워진다. 그래서 <b>테두리를 지운 뒤 다시
 * 그린다</b>:
 *
 *   1. 가장자리에서 도달 가능한 흰색 = 배경 + 원래 테두리 → 지운다
 *   2. 남은 캐릭터를 R px 팽창시켜 테두리를 새로 칠한다 (모든 장이 같은 두께가 된다)
 *
 * 캐릭터 내부의 흰색(눈 흰자, 이불)은 가장자리에서 도달할 수 없으므로 지워지지 않는다.
 *
 * <p><b>파이썬 판과 의도적으로 다른 점 두 가지</b>:
 * <ul>
 *   <li>축소할 때 <b>알파를 곱해서(premultiply) 보간</b>한다. PIL 의 RGBA resize 는
 *       곱하지 않아 투명 픽셀의 RGB(보통 0)가 경계로 새어 어두운 테를 남긴다. 여기서는
 *       곱했다가 되돌린다 — 같은 입력에서 가장자리 한두 픽셀이 더 깨끗하게 나온다.</li>
 *   <li>입력은 <b>PNG(8bit, non-interlaced)만</b> 받는다. PIL 은 JPEG 도 열지만 노드
 *       내장에는 JPEG 디코더가 없다. 생성 스크립트가 PNG 로 저장하므로 실무상 문제없고,
 *       아니면 명확한 에러로 알려준다.</li>
 * </ul>
 */
import zlib from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

/** 배경으로 볼 밝기 — 생성물 배경은 250~253, 흰 테두리는 255. 둘 다 걸리게 잡는다. */
const WHITE_THRESHOLD = 235;
/** 새로 그릴 흰 테두리 두께(1024 기준). 360 으로 줄면 약 6px. */
const BORDER_RADIUS = 18;
/** 캐릭터로 인정할 최소 덩어리 크기 — 압축 노이즈·먼지 제거 */
const MIN_BLOB_AREA = 400;
/** 최종 규격 — frontend/assets/stickers/*.png 과 동일 */
export const OUTPUT_SIZE = 360;
/** 정사각 캔버스에서 캐릭터가 차지하는 비율(나머지는 여백) */
export const CONTENT_RATIO = 0.92;

/* ────────────────────────── PNG (8bit, non-interlaced) ────────────────────────── */

const paeth = (a, b, c) => {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** PNG → {width, height, data} (data 는 항상 RGBA) */
export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('PNG 이 아니다 (JPEG 이면 PNG 로 저장해서 다시 넘길 것)');
  let off = 8;
  const idat = [];
  let w = 0, h = 0, colorType = 0, bitDepth = 0, palette = null, trns = null;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = body.readUInt32BE(0); h = body.readUInt32BE(4);
      bitDepth = body[8]; colorType = body[9];
      if (bitDepth !== 8) throw new Error(`bit depth ${bitDepth} 은 지원하지 않는다 (8 만)`);
      if (body[12] !== 0) throw new Error('interlaced PNG 는 지원하지 않는다');
    } else if (type === 'PLTE') palette = Buffer.from(body);
    else if (type === 'tRNS') trns = Buffer.from(body);
    else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`color type ${colorType} 은 지원하지 않는다`);
  if (colorType === 3 && !palette) throw new Error('팔레트 PNG 인데 PLTE 가 없다');

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * channels;
  const out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      if (filter === 1) line[i] = (line[i] + a) & 255;
      else if (filter === 2) line[i] = (line[i] + b) & 255;
      else if (filter === 3) line[i] = (line[i] + ((a + b) >> 1)) & 255;
      else if (filter === 4) line[i] = (line[i] + paeth(a, b, c)) & 255;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const s = x * channels;
      if (colorType === 0) { out[o] = out[o + 1] = out[o + 2] = line[s]; out[o + 3] = 255; }
      else if (colorType === 2) { out[o] = line[s]; out[o + 1] = line[s + 1]; out[o + 2] = line[s + 2]; out[o + 3] = 255; }
      else if (colorType === 3) {
        const idx = line[s];
        out[o] = palette[idx * 3]; out[o + 1] = palette[idx * 3 + 1]; out[o + 2] = palette[idx * 3 + 2];
        out[o + 3] = trns && idx < trns.length ? trns[idx] : 255;
      } else if (colorType === 4) { out[o] = out[o + 1] = out[o + 2] = line[s]; out[o + 3] = line[s + 1]; }
      else { out[o] = line[s]; out[o + 1] = line[s + 1]; out[o + 2] = line[s + 2]; out[o + 3] = line[s + 3]; }
    }
    prev = line;
  }
  return { width: w, height: h, data: out };
}

/** {width, height, data(RGBA)} → PNG Buffer */
export function encodePng({ width, height, data }) {
  const stride = width * 4;

  /** 한 줄을 filter 종류 f 로 인코딩해 dst 에 쓴다. */
  const filterLine = (cur, prev, f, dst) => {
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? cur[i - 4] : 0;
      const b = prev[i];
      const c = i >= 4 ? prev[i - 4] : 0;
      dst[i] = (f === 0 ? cur[i]
        : f === 1 ? cur[i] - a
        : f === 2 ? cur[i] - b
        : f === 3 ? cur[i] - ((a + b) >> 1)
        : cur[i] - paeth(a, b, c)) & 255;
    }
  };

  /**
   * 후보를 몇 개 만들어 <b>실제로 압축해 보고 가장 작은 것</b>을 쓴다.
   *
   * <p>줄마다 "절댓값 합이 최소인 필터"를 고르는 표준 휴리스틱만 쓰면 그림에 따라
   * 오히려 커진다 — 평면적인 그림(합성 테스트)에서 21KB 가 27KB 가 됐다. 반대로
   * 색연필 질감(love_bear)에서는 필터가 크게 이긴다(183KB → 154KB). 둘 다 잡으려면
   * 고르는 수밖에 없고, deflate 두세 번은 어차피 순식간이다. 여기서 나온 파일이 앱
   * 번들에 그대로 들어가므로 한 장당 수십 KB 는 그냥 버리는 용량이다.
   */
  const build = (pick) => {
    const raw = Buffer.alloc(height * (stride + 1));
    const scratch = [0, 1, 2, 3, 4].map(() => Buffer.alloc(stride));
    let prev = Buffer.alloc(stride);
    for (let y = 0; y < height; y++) {
      const cur = data.subarray(y * stride, (y + 1) * stride);
      let f;
      if (pick === 'adaptive') {
        let best = 0, bestSum = Infinity;
        for (let k = 0; k < 5; k++) {
          filterLine(cur, prev, k, scratch[k]);
          let sum = 0;
          for (let i = 0; i < stride; i++) { const v = scratch[k][i]; sum += v < 128 ? v : 256 - v; }
          if (sum < bestSum) { bestSum = sum; best = k; }
        }
        f = best;
        scratch[best].copy(raw, y * (stride + 1) + 1);
      } else {
        f = pick;
        filterLine(cur, prev, f, scratch[0]);
        scratch[0].copy(raw, y * (stride + 1) + 1);
      }
      raw[y * (stride + 1)] = f;
      prev = cur;
    }
    return raw;
  };

  let idat = null;
  for (const pick of [0, 4, 'adaptive']) {
    const deflated = zlib.deflateSync(build(pick), { level: 9 });
    if (!idat || deflated.length < idat.length) idat = deflated;
  }
  const chunk = (type, body) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(type, 4, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(Buffer.concat([Buffer.from(type, 'ascii'), body])) >>> 0, 0);
    return Buffer.concat([head, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ────────────────────────────── 이미지 연산 ────────────────────────────── */

/**
 * 4-이웃 연결요소 라벨링 — scipy.ndimage.label 과 같은 역할.
 * 반환 labels 는 0 이 배경, 1..count 가 각 덩어리.
 */
function label(mask, w, h) {
  const labels = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  const sizes = [0];
  let count = 0;
  for (let seed = 0; seed < w * h; seed++) {
    if (!mask[seed] || labels[seed]) continue;
    count++;
    let size = 0, sp = 0;
    stack[sp++] = seed;
    labels[seed] = count;
    while (sp > 0) {
      const p = stack[--sp];
      size++;
      const x = p % w, y = (p / w) | 0;
      if (x > 0 && mask[p - 1] && !labels[p - 1]) { labels[p - 1] = count; stack[sp++] = p - 1; }
      if (x < w - 1 && mask[p + 1] && !labels[p + 1]) { labels[p + 1] = count; stack[sp++] = p + 1; }
      if (y > 0 && mask[p - w] && !labels[p - w]) { labels[p - w] = count; stack[sp++] = p - w; }
      if (y < h - 1 && mask[p + w] && !labels[p + w]) { labels[p + w] = count; stack[sp++] = p + w; }
    }
    sizes.push(size);
  }
  return { labels, count, sizes };
}

/** Felzenszwalb–Huttenlocher 1D 제곱거리변환 — O(n) */
function edt1d(f, n, out) {
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  let k = 0;
  v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    out[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/**
 * 원판(disk) 구조요소 팽창 — scipy 의 binary_dilation(structure=_disk(r)) 과 같은 결과.
 *
 * <p>naive 하게 픽셀마다 원판을 훑으면 1024² × 반지름 18 원판(약 1,000픽셀)이라 10억 번이다.
 * 정확한 유클리드 거리변환을 구한 뒤 {@code dist <= r} 로 자르면 같은 결과를 O(픽셀 수)에 얻는다.
 */
function dilateDisk(mask, w, h, radius) {
  const INF = 1e12;
  const tmp = new Float64Array(w * h);
  const col = new Float64Array(h);
  const colOut = new Float64Array(h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) col[y] = mask[y * w + x] ? 0 : INF;
    edt1d(col, h, colOut);
    for (let y = 0; y < h; y++) tmp[y * w + x] = colOut[y];
  }
  const row = new Float64Array(w);
  const rowOut = new Float64Array(w);
  const out = new Uint8Array(w * h);
  const r2 = radius * radius;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) row[x] = tmp[y * w + x];
    edt1d(row, w, rowOut);
    for (let x = 0; x < w; x++) out[y * w + x] = rowOut[x] <= r2 ? 1 : 0;
  }
  return out;
}

const lanczos = (x, a = 3) => {
  if (x === 0) return 1;
  const ax = Math.abs(x);
  if (ax >= a) return 0;
  const px = Math.PI * x;
  return (a * Math.sin(px) * Math.sin(px / a)) / (px * px);
};

/** 한 축의 가중치 표 — 목적 픽셀마다 [시작 인덱스, 가중치들] */
function weightsFor(srcLen, dstLen, a = 3) {
  const scale = dstLen / srcLen;
  const support = scale < 1 ? a / scale : a; // 축소할 때는 커널을 늘려야 앨리어싱이 안 난다
  const table = [];
  for (let i = 0; i < dstLen; i++) {
    const center = (i + 0.5) / scale;
    const start = Math.max(0, Math.floor(center - support));
    const end = Math.min(srcLen - 1, Math.ceil(center + support));
    const ws = [];
    let sum = 0;
    for (let j = start; j <= end; j++) {
      const wgt = lanczos(((j + 0.5) - center) * Math.min(1, scale), a);
      ws.push(wgt);
      sum += wgt;
    }
    if (sum !== 0) for (let k = 0; k < ws.length; k++) ws[k] /= sum;
    table.push({ start, ws });
  }
  return table;
}

/**
 * Lanczos3 축소. <b>알파를 곱한 채로</b> 보간한 뒤 되돌린다 — 투명 픽셀의 RGB 가
 * 경계로 새어 어두운 테를 만드는 것을 막는다(파일 상단 주석 참고).
 */
export function resize(img, dstW, dstH) {
  const { width: sw, height: sh, data } = img;
  const pm = new Float64Array(sw * sh * 4);
  for (let i = 0; i < sw * sh; i++) {
    const a = data[i * 4 + 3] / 255;
    pm[i * 4] = data[i * 4] * a;
    pm[i * 4 + 1] = data[i * 4 + 1] * a;
    pm[i * 4 + 2] = data[i * 4 + 2] * a;
    pm[i * 4 + 3] = data[i * 4 + 3];
  }
  // 가로 먼저
  const xw = weightsFor(sw, dstW);
  const mid = new Float64Array(dstW * sh * 4);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < dstW; x++) {
      const { start, ws } = xw[x];
      let r = 0, g = 0, b = 0, a = 0;
      for (let k = 0; k < ws.length; k++) {
        const o = (y * sw + start + k) * 4, wgt = ws[k];
        r += pm[o] * wgt; g += pm[o + 1] * wgt; b += pm[o + 2] * wgt; a += pm[o + 3] * wgt;
      }
      const o = (y * dstW + x) * 4;
      mid[o] = r; mid[o + 1] = g; mid[o + 2] = b; mid[o + 3] = a;
    }
  }
  // 세로
  const yw = weightsFor(sh, dstH);
  const out = Buffer.alloc(dstW * dstH * 4);
  for (let y = 0; y < dstH; y++) {
    const { start, ws } = yw[y];
    for (let x = 0; x < dstW; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let k = 0; k < ws.length; k++) {
        const o = ((start + k) * dstW + x) * 4, wgt = ws[k];
        r += mid[o] * wgt; g += mid[o + 1] * wgt; b += mid[o + 2] * wgt; a += mid[o + 3] * wgt;
      }
      const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
      const o = (y * dstW + x) * 4;
      const alpha = clamp(a);
      out[o + 3] = alpha;
      if (alpha === 0) { out[o] = out[o + 1] = out[o + 2] = 0; continue; }
      const inv = 255 / alpha; // premultiply 되돌리기
      out[o] = clamp(r * inv); out[o + 1] = clamp(g * inv); out[o + 2] = clamp(b * inv);
    }
  }
  return { width: dstW, height: dstH, data: out };
}

/* ────────────────────────────── 정규화 본체 ────────────────────────────── */

export function normalizeImage(img) {
  const { width: w, height: h, data } = img;
  const px = w * h;

  // 1. 가장자리에서 도달 가능한 흰색 = 배경 + 원래 흰 테두리
  const nearWhite = new Uint8Array(px);
  for (let i = 0; i < px; i++) {
    nearWhite[i] = data[i * 4] >= WHITE_THRESHOLD && data[i * 4 + 1] >= WHITE_THRESHOLD && data[i * 4 + 2] >= WHITE_THRESHOLD ? 1 : 0;
  }
  const white = label(nearWhite, w, h);
  const edgeIds = new Set();
  for (let x = 0; x < w; x++) { edgeIds.add(white.labels[x]); edgeIds.add(white.labels[(h - 1) * w + x]); }
  for (let y = 0; y < h; y++) { edgeIds.add(white.labels[y * w]); edgeIds.add(white.labels[y * w + w - 1]); }
  edgeIds.delete(0);

  const character = new Uint8Array(px);
  for (let i = 0; i < px; i++) character[i] = edgeIds.has(white.labels[i]) ? 0 : 1;

  // 노이즈 제거 — 큰 덩어리만 캐릭터로 인정
  const blobs = label(character, w, h);
  if (blobs.count) {
    const keep = new Set();
    for (let id = 1; id <= blobs.count; id++) if (blobs.sizes[id] >= MIN_BLOB_AREA) keep.add(id);
    if (keep.size) for (let i = 0; i < px; i++) character[i] = keep.has(blobs.labels[i]) ? 1 : 0;
  }
  if (!character.some(Boolean)) throw new Error('캐릭터를 찾지 못했다 (임계값 확인)');

  // 2. 흰 테두리를 새로 그린다
  const grown = dilateDisk(character, w, h, BORDER_RADIUS);
  const out = Buffer.alloc(px * 4);
  for (let i = 0; i < px; i++) {
    if (character[i]) {
      out[i * 4] = data[i * 4]; out[i * 4 + 1] = data[i * 4 + 1]; out[i * 4 + 2] = data[i * 4 + 2]; out[i * 4 + 3] = 255;
    } else if (grown[i]) {
      out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = out[i * 4 + 3] = 255;
    }
  }

  // 3. 내용에 맞춰 자르고, 정사각 여백을 준 뒤 규격으로 줄인다
  let top = h, bottom = -1, left = w, right = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!grown[y * w + x]) continue;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
  const cw = right - left + 1, chh = bottom - top + 1;
  const cropped = { width: cw, height: chh, data: Buffer.alloc(cw * chh * 4) };
  for (let y = 0; y < chh; y++) {
    out.copy(cropped.data, y * cw * 4, ((top + y) * w + left) * 4, ((top + y) * w + left + cw) * 4);
  }

  const content = Math.round(OUTPUT_SIZE * CONTENT_RATIO);
  const scale = content / Math.max(cw, chh);
  const resized = resize(cropped, Math.max(1, Math.round(cw * scale)), Math.max(1, Math.round(chh * scale)));

  const canvas = Buffer.alloc(OUTPUT_SIZE * OUTPUT_SIZE * 4);
  const ox = (OUTPUT_SIZE - resized.width) >> 1;
  const oy = (OUTPUT_SIZE - resized.height) >> 1;
  for (let y = 0; y < resized.height; y++) {
    resized.data.copy(canvas, ((oy + y) * OUTPUT_SIZE + ox) * 4, y * resized.width * 4, (y + 1) * resized.width * 4);
  }
  return { image: { width: OUTPUT_SIZE, height: OUTPUT_SIZE, data: canvas }, cropped: [cw, chh] };
}

export function normalize(src, dst) {
  const { image, cropped } = normalizeImage(decodePng(readFileSync(src)));
  mkdirSync(dirname(dst), { recursive: true });
  writeFileSync(dst, encodePng(image));
  const kb = Math.floor(statSync(dst).size / 1024);
  console.log(`${basename(src)} -> ${basename(dst)}  ${cropped[0]}x${cropped[1]} -> ${OUTPUT_SIZE}x${OUTPUT_SIZE}  ${kb}KB`);
}

// 직접 실행할 때만 CLI 로 동작한다 — decodePng·normalizeImage 를 다른 스크립트가
// import 해서 쓸 수 있어야 한다(예: 에셋 한 장을 손보는 일회성 작업).
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.length % 2) {
    console.error('사용법: normalize-stickers.mjs <입력> <출력> [<입력> <출력> ...]');
    process.exit(2);
  }
  for (let i = 0; i < argv.length; i += 2) normalize(argv[i], argv[i + 1]);
}
