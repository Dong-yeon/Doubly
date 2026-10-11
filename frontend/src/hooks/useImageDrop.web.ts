/**
 * 이미지 붙여넣기(Ctrl+V) · 드래그앤드롭 — 웹 구현.
 *
 * <p>회사 PC 에서 가장 흔한 사진 공유는 "스크린샷 찍어서 Ctrl+V" 다(분석 문서 4절 2단계).
 * 갤러리 피커를 거치게 만들면 그 동작이 통째로 막힌다.
 *
 * <p>두 경로 모두 `File` → `URL.createObjectURL` 로 끝난다. 그 uri 는 피커가 주는 uri 와
 * 똑같이 `<Image>` 로 그려지고 `uploadImage()` 의 `fetch(uri).blob()` 도 그대로 먹는다 —
 * 호출부는 사진이 어디서 왔는지 몰라도 된다.
 *
 * <p>리스너는 `window` 에 건다. 이 훅을 채팅방 화면만 마운트하므로 범위가 곧 화면이고,
 * 입력창에 포커스가 없어도 붙여넣기가 먹는 편이 PC 메신저 습관에 맞다.
 *
 * @returns 지금 파일을 끌고 들어와 있는가 — 호출부가 "여기 놓으세요" 안내를 그리라는 신호.
 */
import { useEffect, useState } from 'react';

function firstImageFile(list: FileList | null | undefined, items?: DataTransferItemList): File | null {
  if (list) {
    for (const file of Array.from(list)) {
      if (file.type.startsWith('image/')) return file;
    }
  }
  // 클립보드는 files 가 비고 items 에만 들어오는 브라우저가 있다
  if (items) {
    for (const item of Array.from(items)) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) return file;
      }
    }
  }
  return null;
}

/** 드래그 중인 것이 "파일"인가 — 텍스트를 끌 때도 dragenter 는 뜬다 */
function hasFiles(e: DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes('Files');
}

export function useImageDrop(onImage: (uri: string) => void, enabled = true): boolean {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!enabled) return undefined;

    const handlePaste = (e: ClipboardEvent) => {
      const file = firstImageFile(e.clipboardData?.files, e.clipboardData?.items);
      if (!file) return; // 텍스트 붙여넣기는 입력창이 알아서 처리하게 둔다
      e.preventDefault();
      onImage(URL.createObjectURL(file));
    };

    /*
     * dragenter/leave 는 자식 요소를 지날 때마다 쌍으로 발생해 그대로 쓰면 오버레이가
     * 깜빡인다. 깊이를 세어 0 이 될 때만 끈다.
     */
    let depth = 0;
    const handleDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth += 1;
      setDragging(true);
    };
    const handleDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    // 이걸 막지 않으면 브라우저가 기본 동작(파일을 새 탭으로 열기)으로 가져가 drop 이 안 온다
    const handleDragOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const handleDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const file = firstImageFile(e.dataTransfer?.files, e.dataTransfer?.items);
      if (file) onImage(URL.createObjectURL(file));
    };

    window.addEventListener('paste', handlePaste);
    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('paste', handlePaste);
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [onImage, enabled]);

  return dragging;
}
