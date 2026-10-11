/**
 * 서버 배포 움직이는 이모티콘 말풍선 — 웹(썸네일). 이유는 AnimatedSticker.web.tsx 와 같다.
 */
import React, { useEffect, useState } from 'react';
import { View, type ImageStyle, type StyleProp } from 'react-native';
import { CachedImage } from './CachedImage';
import { useRemoteStickerStore } from '../store/remoteStickerStore';

interface Props {
  code: string;
  style?: StyleProp<ImageStyle>;
  /** 네이티브와 시그니처를 맞추는 자리 — 웹은 부모 말풍선이 길게 누르기를 받는다 */
  onLongPress?: () => void;
  /** 다시 물어봐도 모르는 코드일 때 — 네이티브 주석 참고 */
  fallback?: React.ReactNode;
}

export function RemoteAnimatedSticker({ code, style, fallback }: Props) {
  const sticker = useRemoteStickerStore((s) => s.byCode[code]);
  const catalogKnown = useRemoteStickerStore((s) => s.version !== null);
  const [rechecked, setRechecked] = useState(false);
  useEffect(() => {
    if (sticker) return;
    let alive = true;
    void useRemoteStickerStore
      .getState()
      .refresh(true)
      .finally(() => alive && setRechecked(true));
    return () => {
      alive = false;
    };
  }, [sticker]);
  if (!sticker && rechecked && catalogKnown && fallback !== undefined) return <>{fallback}</>;
  return sticker ? <CachedImage uri={sticker.thumbUrl} style={style} accessibilityLabel={sticker.label} /> : <View style={style} />;
}
