/**
 * 사진 자르기의 계산 — 화면(PhotoCropSheet)과 떼어 둔 순수 함수들. scripts/verify-photo-crop.mjs 가 검증한다.
 *
 * <p>좌표는 전부 "화면에 그려진 사진의 왼쪽 위 = (0,0)" 인 화면 px 다. 원본 픽셀로 바꾸는 건 {@link toSourceCrop} 하나뿐이다.
 */

/** 틀의 최소 한 변(화면 px) — 이보다 작으면 손잡이끼리 겹쳐 다시 키울 수가 없다 */
export const MIN_SIDE = 48;
/** 모서리 손잡이를 잡았다고 보는 거리(화면 px). 손가락 끝 크기 */
export const CORNER_HIT = 32;
/** 변을 잡았다고 보는 거리 */
export const EDGE_HIT = 24;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type DragMode = 'move' | 'tl' | 'tr' | 'bl' | 'br' | 't' | 'b' | 'l' | 'r' | null;

export type RatioKey = 'free' | 'square' | 'portrait' | 'original';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 비율 칩 → 가로/세로. 자유는 null */
export function ratioOf(key: RatioKey, sourceW: number, sourceH: number): number | null {
  switch (key) {
    case 'square':
      return 1;
    case 'portrait':
      return 4 / 5;
    case 'original':
      return sourceH > 0 ? sourceW / sourceH : null;
    default:
      return null;
  }
}

/** 지금 틀의 중심을 지키면서 사진 안에 들어가는 가장 큰 r 비율 틀 */
export function fitRatio(from: Rect, r: number, dispW: number, dispH: number): Rect {
  const w = Math.min(dispW, dispH * r);
  const h = w / r;
  const cx = from.x + from.w / 2;
  const cy = from.y + from.h / 2;
  return { x: clamp(cx - w / 2, 0, dispW - w), y: clamp(cy - h / 2, 0, dispH - h), w, h };
}

/** 누른 자리 → 무엇을 끄는가. 모서리가 변·안쪽보다 먼저다(작은 틀에서 모서리가 안쪽에 묻히지 않게) */
export function hitTest(px: number, py: number, r: Rect, ratioLocked: boolean): DragMode {
  const near = (ax: number, ay: number) => Math.abs(px - ax) <= CORNER_HIT && Math.abs(py - ay) <= CORNER_HIT;
  if (near(r.x, r.y)) return 'tl';
  if (near(r.x + r.w, r.y)) return 'tr';
  if (near(r.x, r.y + r.h)) return 'bl';
  if (near(r.x + r.w, r.y + r.h)) return 'br';
  const inX = px >= r.x && px <= r.x + r.w;
  const inY = py >= r.y && py <= r.y + r.h;
  if (!ratioLocked) {
    if (inX && Math.abs(py - r.y) <= EDGE_HIT) return 't';
    if (inX && Math.abs(py - (r.y + r.h)) <= EDGE_HIT) return 'b';
    if (inY && Math.abs(px - r.x) <= EDGE_HIT) return 'l';
    if (inY && Math.abs(px - (r.x + r.w)) <= EDGE_HIT) return 'r';
  }
  if (inX && inY) return 'move';
  return null;
}

/**
 * 끈 만큼 틀을 바꾼다 — 시작 틀(s)에 누적 이동량(dx, dy)을 더하는 방식이라 가장자리에 막혔다가 되돌아와도
 * 손가락과 어긋나지 않는다. 결과는 항상 사진 안이고, 한 변은 MIN_SIDE 이상(사진이 그보다 작으면 사진 크기).
 */
export function dragRect(
  mode: DragMode, s: Rect, dx: number, dy: number, dispW: number, dispH: number, ratio: number | null,
): Rect {
  if (!mode) return s;
  if (mode === 'move') {
    return { ...s, x: clamp(s.x + dx, 0, dispW - s.w), y: clamp(s.y + dy, 0, dispH - s.h) };
  }
  const minW = Math.min(MIN_SIDE, dispW);
  const minH = Math.min(MIN_SIDE, dispH);

  if (ratio != null) {
    // 비율 고정 — 반대쪽 모서리를 축으로 가로만 정하고 세로는 비율로 따라간다. 변 손잡이는 없다(hitTest)
    if (mode === 't' || mode === 'b' || mode === 'l' || mode === 'r') return s;
    const left = mode === 'tl' || mode === 'bl';
    const top = mode === 'tl' || mode === 'tr';
    const ax = left ? s.x + s.w : s.x;
    const ay = top ? s.y + s.h : s.y;
    const spaceX = left ? ax : dispW - ax;
    const spaceY = top ? ay : dispH - ay;
    const maxW = Math.min(spaceX, spaceY * ratio);
    const minWr = Math.min(maxW, Math.max(minW, minH * ratio));
    const w = clamp(s.w + (left ? -dx : dx), minWr, maxW);
    const h = w / ratio;
    return { x: left ? ax - w : ax, y: top ? ay - h : ay, w, h };
  }

  let { x, y, w, h } = s;
  if (mode === 'tl' || mode === 'bl' || mode === 'l') {
    const right = s.x + s.w;
    x = clamp(s.x + dx, 0, right - minW);
    w = right - x;
  }
  if (mode === 'tr' || mode === 'br' || mode === 'r') {
    w = clamp(s.w + dx, minW, dispW - s.x);
  }
  if (mode === 'tl' || mode === 'tr' || mode === 't') {
    const bottom = s.y + s.h;
    y = clamp(s.y + dy, 0, bottom - minH);
    h = bottom - y;
  }
  if (mode === 'bl' || mode === 'br' || mode === 'b') {
    h = clamp(s.h + dy, minH, dispH - s.y);
  }
  return { x, y, w, h };
}

/**
 * 화면 틀 → 원본 픽셀 자르기 영역. k 는 "원본 1px 이 화면 몇 px 인가". 반올림 오차로 사진 밖을 가리키지 않게 가둔다.
 * 사진 전체와 같으면 null — 다시 인코딩할 이유가 없다(화질만 한 번 더 깎인다).
 */
export function toSourceCrop(
  r: Rect, k: number, sourceW: number, sourceH: number,
): { originX: number; originY: number; width: number; height: number } | null {
  const originX = clamp(Math.round(r.x / k), 0, sourceW - 1);
  const originY = clamp(Math.round(r.y / k), 0, sourceH - 1);
  const width = clamp(Math.round(r.w / k), 1, sourceW - originX);
  const height = clamp(Math.round(r.h / k), 1, sourceH - originY);
  if (originX === 0 && originY === 0 && width === sourceW && height === sourceH) return null;
  return { originX, originY, width, height };
}
