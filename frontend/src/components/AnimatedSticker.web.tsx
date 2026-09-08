/**
 * 움직이는 이모티콘 말풍선 — 웹(정적 썸네일로 대체).
 *
 * <p>웹에서는 Lottie 를 싣지 않는다. 이유는 AnimatedSticker.tsx 주석 참고 —
 * `lottie-react-native` 의 웹 경로가 미설치 선택 peer 를 import 해서 번들이 깨진다.
 *
 * <p>애니메이션 대신 격자에서 쓰는 <b>정적 PNG 썸네일</b>을 그대로 보여준다. 같은
 * 그림의 정지 프레임이라 무엇을 보냈는지는 그대로 전달되고, 웹은 이 앱의 보조
 * 타깃이라(네이티브가 주력) 여기에 애니메이션 런타임을 얹을 이유가 없다.
 */
import React from 'react';
import { Image, StyleProp, ImageStyle } from 'react-native';
import { AnimatedStickerDef } from '../constants/animatedStickers';

interface Props {
  sticker: AnimatedStickerDef;
  style?: StyleProp<ImageStyle>;
}

export function AnimatedSticker({ sticker, style }: Props) {
  return <Image source={sticker.thumb} style={style} resizeMode="contain" />;
}
