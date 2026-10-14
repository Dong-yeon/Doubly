/**
 * 틀린그림찾기 화면 좌표 ↔ 이미지 좌표(0~1). docs/spot-diff-design_2026-10-14.md 5절.
 *
 * <p>두 패널(A·B)이 같은 크기로 놓이고(세로 화면: 위아래 / 가로 화면: 좌우), 둘 다 같은 확대·이동을 받는다.
 * 탭은 두 패널을 감싼 판 전체에서 받으므로, 판 좌표 → 어느 패널인가 → 확대·이동을 풀기 → 이미지 안 위치 순으로 되돌린다.
 * 서버는 A·B 어느 쪽을 눌러도 같은 좌표계(이미지 기준 0~1)로 받는다.
 *
 * <p>순수 함수만 둔다 — scripts/verify-spot-diff.mjs 가 직접 부른다(앱엔 테스트 러너가 없다).
 */

export type Orientation = 'stacked' | 'side';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 판 배치 — 패널 두 개의 자리와, 패널 안에서 이미지가 그려지는 자리(contain, 확대 1 기준) */
export interface BoardLayout {
  orientation: Orientation;
  panels: [Rect, Rect];
  /** 패널 안 이미지 자리(패널 좌표). 패널을 이미지 비율로 잡으면 여백이 0 이다 */
  image: Rect;
  /** 판 전체 크기 */
  width: number;
  height: number;
}

/** 확대·이동 — 패널 가운데를 축으로 확대(scale)하고 옮긴다(tx, ty — 화면 px) */
export interface ViewTransform {
  scale: number;
  tx: number;
  ty: number;
}

export const IDENTITY: ViewTransform = { scale: 1, tx: 0, ty: 0 };
export const MAX_SCALE = 4;

/**
 * 판 배치. 가로 화면(가로가 세로보다 길다)이면 좌우, 아니면 위아래.
 * 패널은 이미지 비율을 지키며 주어진 칸에 가장 크게 — 칸 비율과 이미지 비율이 다르면 패널 크기가 칸보다 작아진다.
 *
 * @param gap 두 패널 사이 간격
 * @param panelAspect 패널 비율을 이미지와 다르게 잡고 싶을 때(기본: 이미지 비율 — 여백 0)
 */
export function boardLayout(
  areaW: number,
  areaH: number,
  imgW: number,
  imgH: number,
  orientation: Orientation,
  gap = 8,
  panelAspect = imgW / imgH,
): BoardLayout {
  const slotW = orientation === 'side' ? (areaW - gap) / 2 : areaW;
  const slotH = orientation === 'side' ? areaH : (areaH - gap) / 2;
  let pw = slotW;
  let ph = pw / panelAspect;
  if (ph > slotH) {
    ph = slotH;
    pw = ph * panelAspect;
  }
  pw = Math.max(0, pw);
  ph = Math.max(0, ph);
  const second: Rect = orientation === 'side'
    ? { x: pw + gap, y: 0, width: pw, height: ph }
    : { x: 0, y: ph + gap, width: pw, height: ph };
  return {
    orientation,
    panels: [{ x: 0, y: 0, width: pw, height: ph }, second],
    image: containRect(pw, ph, imgW, imgH),
    width: orientation === 'side' ? pw * 2 + gap : pw,
    height: orientation === 'side' ? ph : ph * 2 + gap,
  };
}

/** 패널(boxW×boxH) 안에 이미지를 contain 으로 넣었을 때의 자리 */
export function containRect(boxW: number, boxH: number, imgW: number, imgH: number): Rect {
  const k = Math.min(boxW / imgW, boxH / imgH);
  const width = imgW * k;
  const height = imgH * k;
  return { x: (boxW - width) / 2, y: (boxH - height) / 2, width, height };
}

/** 이동 한계 — 확대한 만큼만 옮길 수 있다(사진이 패널 밖으로 빠져 빈칸이 보이지 않게) */
export function clampTransform(t: ViewTransform, panelW: number, panelH: number): ViewTransform {
  const scale = Math.min(MAX_SCALE, Math.max(1, t.scale));
  const maxX = ((scale - 1) * panelW) / 2;
  const maxY = ((scale - 1) * panelH) / 2;
  return {
    scale,
    tx: Math.min(maxX, Math.max(-maxX, t.tx)),
    ty: Math.min(maxY, Math.max(-maxY, t.ty)),
  };
}

/** 패널 화면 좌표(px, 패널 왼쪽 위 기준) → 확대·이동 전 패널 좌표. RN transform [translate, scale] 의 역 */
export function untransform(px: number, py: number, t: ViewTransform, panelW: number, panelH: number) {
  const cx = panelW / 2;
  const cy = panelH / 2;
  return { x: cx + (px - cx - t.tx) / t.scale, y: cy + (py - cy - t.ty) / t.scale };
}

/** 확대·이동 전 패널 좌표 → 화면 좌표 */
export function transformPoint(x: number, y: number, t: ViewTransform, panelW: number, panelH: number) {
  const cx = panelW / 2;
  const cy = panelH / 2;
  return { x: cx + (x - cx) * t.scale + t.tx, y: cy + (y - cy) * t.scale + t.ty };
}

export interface ImagePoint {
  /** 0 = A(위/왼쪽), 1 = B */
  panel: 0 | 1;
  x: number;
  y: number;
}

/**
 * 판 좌표(px) → 이미지 좌표(0~1). 패널 사이 간격·패널 밖·이미지 여백(contain)을 누르면 null.
 * 확대 중이면 화면에 보이는 부분 기준으로 되돌린다 — 확대해서 누른 자리가 원본 어디인지.
 */
export function boardToImage(bx: number, by: number, layout: BoardLayout, t: ViewTransform): ImagePoint | null {
  for (const i of [0, 1] as const) {
    const p = layout.panels[i];
    if (bx < p.x || bx > p.x + p.width || by < p.y || by > p.y + p.height) continue;
    const local = untransform(bx - p.x, by - p.y, t, p.width, p.height);
    const img = layout.image;
    const u = (local.x - img.x) / img.width;
    const v = (local.y - img.y) / img.height;
    if (!(u >= 0 && u <= 1 && v >= 0 && v <= 1)) return null;
    return { panel: i, x: u, y: v };
  }
  return null;
}

/** 이미지 좌표(0~1) → 확대·이동 전 패널 좌표(px). 원·X 를 이미지와 같이 움직이는 층에 그릴 때 */
export function imageToPanel(u: number, v: number, layout: BoardLayout) {
  const img = layout.image;
  return { x: img.x + u * img.width, y: img.y + v * img.height };
}

/** 정규화 반지름(긴 변 기준 — 서버·worker 와 같다) → 확대 1 기준 패널 px */
export function radiusToPanel(r: number, layout: BoardLayout) {
  return r * Math.max(layout.image.width, layout.image.height);
}

/**
 * 응답을 기다리는 탭과 "같은 자리"인가 — 같은 곳을 연타하면 보내지 않는다. 거리는 이미지 px 로 잰다
 * (정규화 좌표로 재면 가로세로 비율만큼 판정이 찌그러진다).
 *
 * @param minPx 같은 자리로 보는 거리(이미지 px)
 */
export function isDuplicateTap(
  pending: readonly { x: number; y: number }[],
  x: number,
  y: number,
  imgW: number,
  imgH: number,
  minPx = Math.min(imgW, imgH) * 0.03,
): boolean {
  return pending.some((p) => Math.hypot((p.x - x) * imgW, (p.y - y) * imgH) < minPx);
}
