/**
 * 우리 이모지 효과 레이어의 Lottie 한 번 재생 — 네이티브.
 *
 * <p>웹은 CoupleEmojiLottieEffect.web.tsx(아무것도 그리지 않음)로 갈라진다. 화면이
 * `lottie-react-native` 를 직접 import 하면 웹 번들이 깨지기 때문이다(AnimatedSticker.tsx 주석).
 */
import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import LottieView from 'lottie-react-native';
import { animatedStickerOf } from '../../constants/animatedStickers';

interface Props {
  code: string;
  style?: StyleProp<ViewStyle>;
  /** 끝나면 부모가 레이어를 걷는다 — Noto 마지막 프레임이 그림 위에 남아 있으면 가린다 */
  onFinish: () => void;
}

export function CoupleEmojiLottieEffect({ code, style, onFinish }: Props) {
  const sticker = animatedStickerOf(code);
  if (!sticker) return null;
  return (
    <LottieView
      source={sticker.source}
      style={style}
      autoPlay
      loop={false}
      onAnimationFinish={() => onFinish()}
    />
  );
}
