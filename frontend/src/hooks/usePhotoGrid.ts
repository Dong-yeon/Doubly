/**
 * 사진 격자의 열 수·칸 크기를 <b>지금 화면 폭</b>으로 계산한다.
 *
 * <p>판단식은 `utils/photoGrid.ts` 에 순수 함수로 있다(그쪽 주석에 왜 이렇게 나누는지
 * 적어 두었다). 이 훅은 폭을 넣어 주는 일만 한다 — 웹은 창 폭이 아니라 셸 폭이고
 * (`useContentWidth`), 회전·창 크기 변경에 매 렌더 반응해야 한다.
 */
import { useMemo } from 'react';
import { useContentWidth } from './useContentWidth';
import { photoGrid, type PhotoGrid, type PhotoGridOptions } from '../utils/photoGrid';

export function usePhotoGrid(options: PhotoGridOptions): PhotoGrid {
  const width = useContentWidth();
  const { gap, padding, phoneColumns, maxColumns } = options;
  return useMemo(
    () => photoGrid(width, { gap, padding, phoneColumns, maxColumns }),
    [width, gap, padding, phoneColumns, maxColumns],
  );
}
