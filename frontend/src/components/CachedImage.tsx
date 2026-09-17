/**
 * 원격 이미지 — <b>디스크 캐시</b>가 붙은 그림 한 장.
 *
 * <p><b>왜 필요한가</b>: 이모티콘을 번들에 넣는 구조는 장이 늘 때마다 앱을 새로 배포해야
 * 한다. 카톡·비트윈처럼 서버 카탈로그 + CDN 으로 옮기려면 그 전에 "받아둔 그림을 다음에
 * 다시 안 받는" 층이 있어야 한다. RN 의 {@code Image} 는 그 층이 없다 — iOS 는
 * {@code NSURLCache}(응답 헤더에 좌우되고 용량 압박에 먼저 버려진다), 안드로이드는 Fresco
 * 의 기본 디스크 캐시라 <b>이모티콘처럼 영구히 들고 있어야 하는 그림에는 보장이 없다</b>.
 * 말풍선을 스크롤해 되돌아올 때마다 같은 이모티콘을 다시 받는 일이 생긴다.
 *
 * <p>{@code expo-image} 의 {@code cachePolicy="memory-disk"} 는 메모리와 디스크에 함께
 * 남긴다 — 앱을 껐다 켜도, 비행기 모드에서도 이미 받은 이모티콘은 그려진다.
 *
 * <p><b>지금 쓰는 곳</b>: 우리 이모지(런타임 생성 → Cloudinary URL) 세 자리뿐이다.
 * 아바타·채팅 사진은 그대로 RN {@code Image} 를 쓴다 — 그쪽은 한 번 보고 지나가는 그림이라
 * 영구 캐시의 이득이 작고, 바꾸면 변경 범위만 넓어진다. 이모티콘 카탈로그를 서버로 옮길 때
 * 이 컴포넌트를 그대로 쓰면 된다.
 *
 * <p><b>왜 래퍼를 두는가</b>: {@code cachePolicy} 를 호출부마다 적으면 한 곳이라도 빠지는
 * 순간 그 그림만 캐시를 타지 않는다. 기본값을 여기 한 곳에 둔다. {@code resizeMode} 대신
 * {@code contentFit} 을 쓰는 이름 차이도 여기서 흡수한다.
 */
import React from 'react';
import type { StyleProp, ImageStyle } from 'react-native';
import { Image, type ImageContentFit } from 'expo-image';

interface Props {
  uri: string;
  style?: StyleProp<ImageStyle>;
  /** RN 의 resizeMode 와 같은 역할 — 이름만 다르다 */
  contentFit?: ImageContentFit;
  accessibilityLabel?: string;
  /** 켜면 나타날 때 서서히 — 기본은 0(즉시). 이모티콘은 깜빡임이 더 눈에 띈다 */
  transitionMs?: number;
}

export function CachedImage({
  uri,
  style,
  contentFit = 'contain',
  accessibilityLabel,
  transitionMs = 0,
}: Props) {
  return (
    <Image
      source={{ uri }}
      style={style}
      contentFit={contentFit}
      cachePolicy="memory-disk"
      transition={transitionMs}
      accessible={!!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
    />
  );
}
