/**
 * 이미지 붙여넣기(Ctrl+V) · 드래그앤드롭 — 네이티브에서는 아무것도 하지 않는다.
 *
 * <p>둘 다 브라우저 이벤트라 실제 구현은 `useImageDrop.web.ts` 에만 있다.
 * docs/PC_APP_ANALYSIS_2026-09-14.md 4절 2단계.
 */
export function useImageDrop(_onImage: (uri: string) => void, _enabled = true): boolean {
  return false;
}
