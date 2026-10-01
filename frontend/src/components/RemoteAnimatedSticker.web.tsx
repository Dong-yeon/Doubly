/**
 * 서버 배포 움직이는 이모티콘 말풍선 — 웹(썸네일). 이유는 AnimatedSticker.web.tsx 와 같다.
 */
import React, { useEffect } from 'react';
import { View, type ImageStyle, type StyleProp } from 'react-native';
import { CachedImage } from './CachedImage';
import { useRemoteStickerStore } from '../store/remoteStickerStore';

interface Props {
  code: string;
  style?: StyleProp<ImageStyle>;
  /** 네이티브와 시그니처를 맞추는 자리 — 웹은 부모 말풍선이 길게 누르기를 받는다 */
  onLongPress?: () => void;
}

export function RemoteAnimatedSticker({ code, style }: Props) {
  const sticker = useRemoteStickerStore((s) => s.byCode[code]);
  useEffect(() => {
    if (!sticker) void useRemoteStickerStore.getState().refresh(true);
  }, [sticker]);
  return sticker ? <CachedImage uri={sticker.thumbUrl} style={style} accessibilityLabel={sticker.label} /> : <View style={style} />;
}
