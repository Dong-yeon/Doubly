/**
 * 목록 속 사진 한 장을 잘라 바꾸는 흐름 — 채팅 보내기 미리보기와 일상 남기기가 같이 쓴다
 * (docs/chat-photo-crop_2026-10-14.md §4).
 *
 * <p>목록은 uri 문자열만 들고 있어 크기를 모른다 — 열 때 재서 {@link PhotoCropSheet} 에 넘긴다. 잘린 결과가 원본과
 * 같으면(틀을 안 건드림) 아무것도 바꾸지 않는다. {@code sheet} 는 호출부가 렌더 트리에 넣는다 — 이미 Modal 안이면
 * 그 Modal 안에 넣어야 iOS 에서 위에 뜬다.
 */
import React, { useCallback, useState } from 'react';
import { PhotoCropSheet } from '../components/PhotoCropSheet';
import { measureImage, type PickedImage } from '../utils/imageUpload';
import { toast } from '../store/toastStore';

export function usePhotoCrop(onCropped: (index: number, image: PickedImage, previousUri: string) => void) {
  const [target, setTarget] = useState<{ index: number; image: PickedImage } | null>(null);

  const open = useCallback(async (index: number, uri: string) => {
    try {
      setTarget({ index, image: await measureImage(uri) });
    } catch {
      toast.error('사진을 열지 못했어요.');
    }
  }, []);

  const sheet = (
    <PhotoCropSheet
      source={target?.image ?? null}
      onCancel={() => setTarget(null)}
      onConfirm={(image) => {
        const t = target;
        setTarget(null);
        if (t && image.uri !== t.image.uri) onCropped(t.index, image, t.image.uri);
      }}
    />
  );

  return { open, sheet };
}
