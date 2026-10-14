/**
 * 채팅 사진 말풍선 — 사진 비율대로 그린다(docs/chat-photo-crop_2026-10-14.md §4).
 *
 * <p>메시지에는 사진 크기가 없다(chat_messages 에 컬럼이 없다). 그래서 처음엔 정사각으로 자리를 잡고, 사진이 로드되면
 * 실제 비율로 바꾼다. 한 번 안 비율은 주소별로 기억해 두어 스크롤로 다시 그릴 때는 처음부터 맞는 크기로 나온다
 * (FlatList 가 행을 재활용할 때마다 정사각→세로로 튀지 않게).
 *
 * <p>받는 주소는 폭만 줄인 사본(cardImageUrl — Cloudinary c_limit, R2 는 변환이 켜져 있을 때)이라 비율이 원본과 같다.
 */
import React, { useState } from 'react';
import { Image, type ImageStyle, type StyleProp } from 'react-native';
import { cardImageUrl } from '../../utils/imageUrl';
import { CHAT_PHOTO_MAX_W, chatPhotoSize } from '../../utils/chatPhotoSize';

/** 주소 → 가로/세로. 앱이 떠 있는 동안만 기억한다(메모리 몇 KB) */
const aspectCache = new Map<string, number>();
const ASPECT_CACHE_MAX = 500;

function remember(uri: string, aspect: number) {
  if (aspectCache.size >= ASPECT_CACHE_MAX) {
    // 가장 먼저 들어온 것부터 비운다(Map 은 넣은 순서를 지킨다)
    const oldest = aspectCache.keys().next().value;
    if (oldest !== undefined) aspectCache.delete(oldest);
  }
  aspectCache.set(uri, aspect);
}

interface Props {
  /** 원본 사진 주소(메시지의 imageUrl) */
  uri: string;
  /** 모서리·배경 같은 겉모습 — 크기는 이 컴포넌트가 정한다 */
  style?: StyleProp<ImageStyle>;
}

export function ChatPhoto({ uri, style }: Props) {
  const [aspect, setAspect] = useState<number | null>(() => aspectCache.get(uri) ?? null);
  const size = chatPhotoSize(aspect);
  return (
    <Image
      source={{ uri: cardImageUrl(uri, CHAT_PHOTO_MAX_W) }}
      style={[style, size]}
      resizeMode="cover"
      onLoad={(e) => {
        const src = e.nativeEvent?.source;
        if (!src || !src.width || !src.height) return;
        const next = src.width / src.height;
        remember(uri, next);
        if (aspect === null || Math.abs(aspect - next) > 0.01) setAspect(next);
      }}
    />
  );
}
