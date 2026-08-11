/**
 * 폼 화면 키보드 처리 공용 래퍼 — `KeyboardAvoidingView` + `ScrollView` 조합을 한 곳에 모은다.
 *
 * <p><b>왜 모았나</b>: 같은 조합이 화면마다 손으로 복제돼 있었고, 그러다 보니
 * `keyboardShouldPersistTaps` 는 있는데 `keyboardDismissMode` 는 없는 식으로 화면마다
 * 조금씩 달라졌다. 키보드 규칙은 앱 전체가 같아야 예측 가능하므로 여기서만 정한다.
 *
 * <p><b>플랫폼 분기</b>
 * <ul>
 *   <li>iOS: `padding` + 헤더 높이만큼 오프셋. 오프셋을 상수로 박으면(예: 90) 노치 없는
 *       기기에서 과보정돼 입력창과 키보드 사이에 빈 띠가 생긴다 — 실제 높이를 읽는다.</li>
 *   <li>Android: `height`. 원래는 `behavior` 를 아예 주지 않고 `app.json` 의
 *       `softwareKeyboardLayoutMode: "resize"`(= adjustResize) 가 창을 줄여주는 데
 *       맡겼었는데, Android 15+ 의 edge-to-edge 강제 적용 이후로는 adjustResize 가
 *       더 이상 창을 줄여주지 않아 키보드가 입력창을 그대로 덮어버렸다
 *       (실기기 adb logcat 으로 재현·확인). `height` 로 직접 보정한다.</li>
 * </ul>
 *
 * <p>`keyboardDismissMode` 로 <b>목록을 스크롤하면 키보드가 내려간다</b> — 폼이 길 때
 * 키보드를 닫으려고 빈 곳을 찾아 탭하지 않아도 된다.
 */
import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useHeaderHeight } from '@react-navigation/elements';

interface Props {
  children: React.ReactNode;
  /** ScrollView 의 contentContainerStyle — 화면별 패딩 */
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** 바깥 KeyboardAvoidingView 스타일 (기본 flex: 1) */
  style?: StyleProp<ViewStyle>;
  /** 나머지 ScrollView 속성 (ref, refreshControl 등) */
  scrollProps?: Omit<ScrollViewProps, 'contentContainerStyle' | 'children'>;
}

/** 헤더가 없는 화면에서도 안전하다 — useHeaderHeight 는 헤더가 없으면 0 을 준다. */
export function FormKeyboardView({ children, contentContainerStyle, style, scrollProps }: Props) {
  const headerHeight = useHeaderHeight();

  return (
    <KeyboardAvoidingView
      style={[styles.flex, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
    >
      <ScrollView
        contentContainerStyle={contentContainerStyle}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        {...scrollProps}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
