/**
 * 전역 오버레이 전용 프레젠테이션 — App.tsx 루트에 한 번만 마운트되는 컴포넌트들
 * (ConfirmDialog·DatePickerSheet·BusyOverlay·CallOverlay·Sheet) 이 공용으로 쓴다.
 *
 * <p><b>왜 필요한가</b>(2026-09-03, TestFlight 실기기 리포트 — 식단 기록 "사진
 * 추가하기"를 눌러도 반응이 없다가 화면 전체가 먹통이 됨): 이 컴포넌트들은 App.tsx
 * 루트(내비게이터 밖)에서 RN {@link Modal} 로 구현돼 있었는데, 현재 화면이
 * react-navigation 네이티브 스택의 모달 화면(`presentation: 'modal'`, 예:
 * DietRecordScreen·BarcodeScanScreen)이면 iOS 에서 이 Modal 이 <b>안 뜬다</b> —
 * 이미 모달로 떠 있는 화면 위에 또 다른 프레젠테이션을 root 뷰컨트롤러에서
 * 띄우려다, iOS 는 한 뷰컨트롤러가 동시에 두 프레젠테이션을 처리하지 못해
 * 조용히 실패한다("화면이 안 어두워지고 반응 없다가 몇 초 뒤 전체가 먹통",
 * "모달이 아닌 다른 화면에서는 항상 잘 떴다"는 리포트와 정확히 들어맞는다).
 *
 * <p>react-native-screens 의 {@link FullWindowOverlay} 는 뷰컨트롤러 계층을
 * 아예 안 타고 UIWindow 에 직접 붙어서 이 문제를 피한다 — 정확히 이 상황을 위한
 * 공식 해법이다. Android 는 이 문제가 없어(같은 코드로 항상 잘 떴다) 기존 Modal
 * 을 그대로 쓴다 — FullWindowOverlay 자체가 iOS 전용이기도 하다.
 */
import React from 'react';
import { Modal, Platform, type ModalProps } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';

interface Props extends ModalProps {
  children: React.ReactNode;
}

export function RootOverlayModal({ children, ...modalProps }: Props) {
  if (Platform.OS === 'ios') {
    // FullWindowOverlay 는 RN Modal 과 달리 visible prop 이 없다 — 마운트되면
    // 곧바로 보인다. 호출부 대부분은 안 보일 때 컴포넌트 자체를 null 로 반환하지만
    // (ConfirmDialog·DatePickerSheet·CallOverlay), BusyOverlay·Sheet 는 항상
    // 마운트해두고 visible 로만 켜고 끈다 — 그 경우를 위해 여기서도 존중해야 한다.
    if (modalProps.visible === false) return null;
    return <FullWindowOverlay>{children}</FullWindowOverlay>;
  }
  return <Modal {...modalProps}>{children}</Modal>;
}
