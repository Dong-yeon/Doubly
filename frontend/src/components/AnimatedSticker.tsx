/**
 * 움직이는 이모티콘 말풍선 — 네이티브(Lottie 재생).
 *
 * <p><b>왜 컴포넌트로 감쌌나</b>: `lottie-react-native` 의 웹 진입점(index.web.js)이
 * `@lottiefiles/dotlottie-react` 를 import 하는데, 그건 <b>선택적 peer</b>라 설치돼
 * 있지 않다. 화면에서 `lottie-react-native` 를 직접 import 하면 그 한 줄 때문에
 * <b>웹 번들 전체가 resolve 실패</b>로 깨진다(`npm run build:web` 포함).
 * 그래서 이 파일(네이티브)과 AnimatedSticker.web.tsx(웹)로 나눠, 웹 번들에는
 * lottie 가 아예 들어가지 않게 한다 — callStore.ts / callStore.web.ts 와 같은 패턴.
 */
import React, { useRef } from 'react';
import { Pressable, StyleProp, ImageStyle } from 'react-native';
import LottieView from 'lottie-react-native';
import { AnimatedStickerDef } from '../constants/animatedStickers';

interface Props {
  sticker: AnimatedStickerDef;
  style?: StyleProp<ImageStyle>;
  /**
   * 말풍선 길게 누르기(답장·삭제 메뉴). 스티커를 Pressable 로 감싸면 부모
   * Pressable 의 onLongPress 까지 터치가 올라가지 않으므로 여기서 이어받는다.
   */
  onLongPress?: () => void;
}

export function AnimatedSticker({ sticker, style, onLongPress }: Props) {
  const ref = useRef<LottieView>(null);

  /*
   * 다시 누르면 처음부터 다시 재생한다. play() 만으로는 안 된다 — 프레임을
   * 지정하지 않은 play() 는 네이티브 양쪽에서 "현재 위치에서 재개"라(Android
   * resumeAnimation, iOS play(completion:)) 끝까지 간 애니메이션은 마지막
   * 프레임에 그대로 멈춰 있다. reset() 으로 진행도를 0 으로 돌린 뒤 재생한다.
   */
  const replay = () => {
    ref.current?.reset();
    ref.current?.play();
  };

  /*
   * 한 번만 재생하고 멈춘다(loop 없음). 대화 로그에 스티커가 여러 개 쌓이면
   * 무한 반복은 시선을 뺏고 배터리를 먹는다 — Noto 애니메이션은 마지막
   * 프레임이 처음과 같은 정지 자세라 멈춰도 어색하지 않다.
   */
  return (
    <Pressable
      onPress={replay}
      onLongPress={onLongPress}
      delayLongPress={300}
      accessibilityRole="button"
      accessibilityLabel={`${sticker.label} 이모티콘, 누르면 다시 움직입니다`}
    >
      <LottieView ref={ref} source={sticker.source} style={style} autoPlay loop={false} />
    </Pressable>
  );
}
