/**
 * 안드로이드 전용 "화면 어디서든 스와이프 뒤로가기".
 *
 * react-navigation native-stack 의 gestureEnabled/fullScreenGestureEnabled 는
 * 공식 문서상 iOS 전용이다(headerOptions.tsx 참고) — 안드로이드에서는 화면을
 * 슬라이드해도 아무 반응이 없었다. 안드로이드엔 이 기능 자체가 없어 직접 만든다.
 * iOS 는 네이티브 제스처가 이미 동작하므로 여기서는 아무것도 하지 않는다
 * (같은 화면에 두 제스처를 겹치면 서로 뺏고 뺏기는 문제가 생긴다).
 *
 * 세로 스크롤(FlatList 등)이 있는 화면과 함께 쓰이므로 activeOffsetX/failOffsetY 로
 * 방향을 먼저 가른다 — 손가락이 수직으로 더 많이 움직이면 스크롤에 양보하고,
 * 오른쪽으로 뚜렷하게(15px 이상) 움직일 때만 이 제스처가 가져간다.
 * 미리보기 슬라이드 애니메이션은 일부러 넣지 않았다: native-stack 이 이전 화면을
 * 이미 언마운트해 뒤에 보여줄 게 없어서, 밀리는 동안 빈 배경만 보이면 오히려 어색하다.
 */
import React from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useNavigation } from '@react-navigation/native';

const DISMISS_DISTANCE = 80;
const DISMISS_VELOCITY = 800;

export function SwipeBackView({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const navigation = useNavigation();

  if (Platform.OS !== 'android') {
    return <View style={style}>{children}</View>;
  }

  const goBackIfPossible = () => {
    if (navigation.canGoBack()) navigation.goBack();
  };

  const pan = Gesture.Pan()
    // 리액트 훅이 아니라 일반 콜백이라 JS 스레드에서 그대로 돌려도 된다 —
    // navigation.goBack() 은 UI(워클릿) 스레드에서 직접 부를 수 없는 JS 전용 API다.
    .runOnJS(true)
    .activeOffsetX(15)
    .failOffsetY([-10, 10])
    .onEnd((e) => {
      if (e.translationX > DISMISS_DISTANCE || e.velocityX > DISMISS_VELOCITY) {
        goBackIfPossible();
      }
    });

  return (
    <GestureDetector gesture={pan}>
      <View style={[{ flex: 1 }, style]}>{children}</View>
    </GestureDetector>
  );
}
