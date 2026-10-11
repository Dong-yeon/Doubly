/**
 * 우리 이모지 효과 레이어의 Lottie — 웹은 그리지 않는다(모션만).
 *
 * <p>웹 번들에는 lottie 를 싣지 않는다(AnimatedSticker.web.tsx 와 같은 이유). 정적 썸네일을
 * 그림 위에 얹으면 움직이지 않는 스티커가 얼굴을 가리므로 대신 아무것도 그리지 않는다.
 */
import { StyleProp, ViewStyle } from 'react-native';

interface Props {
  code: string;
  style?: StyleProp<ViewStyle>;
  onFinish: () => void;
}

export function CoupleEmojiLottieEffect(_props: Props) {
  return null;
}
