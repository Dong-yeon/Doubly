/**
 * 하단 시트 / 모달 카드 공용 껍데기 — 백드롭 + 카드 + 탭 전파 차단.
 *
 * <p><b>왜 모았나</b>: 같은 구조가 11곳에 복제돼 있었고, 그러면서
 * <ul>
 *   <li>카드 안쪽 `onPress` 를 빠뜨린 곳은 시트 빈 곳을 눌러도 배경으로 전파돼 닫혔고</li>
 *   <li>배경 토큰이 `surface` / `surfaceCard` 로, 백드롭 패딩이 `lg` / `xl` 로 갈렸다</li>
 * </ul>
 * 여기서만 정하면 새 시트를 만들 때 같은 실수를 반복할 수 없다.
 *
 * <p>닫기 경로는 세 가지를 모두 연결한다 — 배경 탭 · Android 하드웨어 백 · (호출부의) 취소 버튼.
 * 입력 폼을 담는 시트라면 `onRequestClose` 에 {@link confirmDiscard} 를 물려
 * 작성 중인 내용이 조용히 사라지지 않게 한다.
 */
import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { RootOverlayModal } from './RootOverlayModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';
import { useDesktopRail } from '../hooks/useDesktopRail';

interface Props {
  visible: boolean;
  /** 배경 탭 · Android 백 공통 닫기 핸들러 */
  onClose: () => void;
  children: React.ReactNode;
  /** 'center' = 화면 중앙 카드(기본), 'bottom' = 하단 시트 */
  position?: 'center' | 'bottom';
  /** 카드 추가 스타일 (maxHeight 등) */
  cardStyle?: StyleProp<ViewStyle>;
  animationType?: 'fade' | 'slide';
}

export function Sheet({
  visible,
  onClose,
  children,
  position = 'center',
  cardStyle,
  animationType,
}: Props) {
  const insets = useSafeAreaInsets();
  /*
   * PC 창에서는 하단 시트를 <b>가운데 다이얼로그</b>로 바꾼다.
   *
   * <p>모달은 웹에서 position:fixed 로 뷰포트 전체를 덮는다 — 앱 셸(640) 안이 아니다.
   * 가운데 다이얼로그는 그래도 맞지만(데스크톱 앱이 창 전체를 어둡게 덮는 건 흔하다),
   * 하단 시트는 셸에서 한참 떨어진 1024px 짜리 바가 화면 바닥에 붙는 꼴이 된다.
   * 폭도 함께 묶어 준다 — 안 그러면 카드가 뷰포트만큼 늘어난다.
   *
   * <p>작은 창(폰·기본 사용 형태인 420~480px 세로 창)에서는 그대로 하단 시트다.
   */
  const desktop = useDesktopRail();
  const bottom = position === 'bottom' && !desktop;
  const asDesktopDialog = position === 'bottom' && desktop;

  return (
    <RootOverlayModal
      visible={visible}
      transparent
      animationType={animationType ?? (bottom ? 'slide' : 'fade')}
      onRequestClose={onClose}
    >
      <Pressable
        style={[styles.backdrop, bottom ? styles.backdropBottom : styles.backdropCenter]}
        onPress={onClose}
      >
        {/*
          onPress 로 탭을 흡수한다 — 없으면 카드 빈 곳 터치가 배경으로 새어나가 닫힌다.
          Pressable 을 한 겹 더 두는 이유가 이것뿐이라 지우면 안 된다.
        */}
        <Pressable
          style={[
            styles.card,
            bottom ? { paddingBottom: insets.bottom + spacing.md } : null,
            asDesktopDialog ? styles.desktopDialog : null,
            cardStyle,
          ]}
          onPress={() => {}}
        >
          {bottom ? <View style={styles.grabber} /> : null}
          {children}
        </Pressable>
      </Pressable>
    </RootOverlayModal>
  );
}

const styles = themedStyles((colors) => ({
  backdrop: { flex: 1, backgroundColor: colors.backdrop },
  backdropCenter: { justifyContent: 'center', padding: spacing.lg },
  backdropBottom: { justifyContent: 'flex-end' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
  },
  /*
   * 하단 시트를 PC 에서 다이얼로그로 바꿀 때의 폭·높이 상한.
   * 480 은 이 앱의 기본 사용 형태(420~480px 세로 창)와 같은 폭이라, 같은 시트가 창 크기에
   * 따라 전혀 다른 비율로 보이지 않는다.
   */
  desktopDialog: { width: '100%', maxWidth: 480, alignSelf: 'center', maxHeight: '85%' },
  /* 하단 시트의 드래그 손잡이 — 시각 어포던스 (드래그 자체는 아직 미지원) */
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
}));
