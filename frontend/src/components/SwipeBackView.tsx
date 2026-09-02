/**
 * "화면 어디서든 스와이프 뒤로가기" — 지금은 ChatRoomScreen 전용.
 *
 * <p>원래는 안드로이드 전용이었다: react-navigation native-stack 의
 * gestureEnabled/fullScreenGestureEnabled 는 공식 문서상 iOS 전용이라
 * (headerOptions.tsx 참고) 안드로이드에는 이 기능 자체가 없어 직접 만들었다.
 *
 * <p><b>iOS 도 여기 들어온 이유(2026-09-02)</b>: 채팅방은 메시지 목록이 리스트
 * 패딩만 두고 화면 거의 전체를 각 메시지 Pressable(onLongPress, 리액션용)로
 * 덮고 있어, iOS 네이티브 fullScreenGestureEnabled 와 계속 충돌해 스와이프백
 * 자체가 씹혔다(2026-09-01 실기기 리포트) — 그래서 ChatStackNavigator 가 이
 * 화면만 fullScreenGestureEnabled 를 끈다. 문제는 이 화면이 커스텀 headerLeft
 * (뒤로가기 아이콘 버튼)도 쓴다는 것 — headerOptions.tsx 주석대로 커스텀
 * headerLeft 는 UIKit 의 고전적인 interactivePopGestureRecognizer(가장자리
 * 전용 스와이프)를 꺼뜨리는 패턴이라, fullScreenGestureEnabled 를 끄면 남는다고
 * 기대했던 "가장자리에서만" 스와이프백조차 실제로는 동작하지 않았다 — iOS엔
 * 이 화면에서 쓸 수 있는 네이티브 스와이프백이 결국 하나도 없었던 것.
 * 그래서 ChatStackNavigator 는 이제 이 화면의 gestureEnabled 도 함께 끄고,
 * 안드로이드에서 이미 검증된 이 커스텀 제스처를 두 플랫폼 모두에 쓴다 — 아래
 * activeOffsetX/failOffsetY 가 메시지 Pressable 의 탭·롱프레스와는 방향으로
 * 갈라서 구분하므로 같은 화면에서도 충돌 없이 공존한다.
 *
 * 세로 스크롤(FlatList 등)이 있는 화면과 함께 쓰이므로 activeOffsetX/failOffsetY 로
 * 방향을 먼저 가른다 — 손가락이 수직으로 더 많이 움직이면 스크롤에 양보하고,
 * 오른쪽으로 뚜렷하게(15px 이상) 움직일 때만 이 제스처가 가져간다.
 * 미리보기 슬라이드 애니메이션은 일부러 넣지 않았다: native-stack 이 이전 화면을
 * 이미 언마운트해 뒤에 보여줄 게 없어서, 밀리는 동안 빈 배경만 보이면 오히려 어색하다.
 */
import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
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
