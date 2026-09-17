/**
 * 전체화면 이미지 뷰어 — 좌우 스와이프 · 확대 · <b>아래로 끌어 닫기</b> · 닫기.
 *
 * <p><b>왜 만들었나</b>: 앱에 이미지 뷰어가 아예 없어서, 채팅으로 받은 사진은
 * 200×200 으로 잘린 썸네일이 전부였고(탭해도 무반응), 사진첩은 한 장 볼 때마다
 * 열고 닫기를 반복해야 했다. 커플 앱에서 "상대가 보낸 사진을 제대로 볼 수 없다"는
 * 기능 결손에 가까워 공용 뷰어를 둔다.
 *
 * <p><b>아래로 끌어 닫기</b>(2026-09-16): 닫는 길이 우상단 X 하나뿐이라, 사진을 보다가
 * 나가려면 매번 구석까지 손을 옮겨야 했다. 세로로 끌면 사진이 따라오고 배경이 옅어지며,
 * 충분히 끌거나 빠르게 놓으면 닫힌다. 제스처가 셋(가로 넘김 · 확대 · 세로 닫기)이라
 * 서로 가로채지 않게 두 가지를 둔다 — `failOffsetX` 로 가로가 먼저 움직이면 포기하고,
 * 확대 중에는 아예 끈다(확대해서 아래쪽을 보려다 닫히면 안 된다).
 *
 * <p>워클릿을 쓰지 않는다 — `AvatarCropSheet` 가 같은 이유로 정한 규칙이다(그 파일 주석 참고).
 * `runOnJS(true)` + RN `Animated` 로 맞춘다.
 *
 * <p><b>확대 지원 범위</b>: iOS·웹은 `ScrollView` 의 확대 축소로 핀치 줌이 된다.
 * Android 의 `ScrollView` 는 이 속성을 지원하지 않아 확대가 되지 않는다 —
 * 제스처 라이브러리를 붙이기 전까지의 한계이며, 좌우 이동·전체화면 보기는
 * 모든 플랫폼에서 동작한다.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  Text,
  View,
  useWindowDimensions,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
/*
 * ScrollView 를 react-native 가 아니라 여기서 가져온다 — RNGH 의 래퍼만 ref 에
 * {@code handlerTag} 를 붙여주고, 그게 있어야 아래 {@code blocksExternalGesture} 가
 * 실제로 연결된다(react-native 의 ScrollView ref 로는 조용히 무시된다).
 */
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
  ScrollView,
} from 'react-native-gesture-handler';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { MaterialCommunityIcons } from './Icon';
import { useContentWidth } from '../hooks/useContentWidth';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from '../store/toastStore';
import { Toast } from './Toast';
import { getErrorMessage } from '../utils/error';
import { colors, fontSize, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';

export interface ViewerImage {
  /** 목록 키 — 같은 사진이 두 번 들어가도 구분되게 호출부에서 고유값을 준다 */
  key: string;
  uri: string;
  /** 상단 설명 (작성자·날짜 등) */
  title?: string;
  /** 하단 본문 */
  caption?: string;
  /** 제목 강조색 — 나/상대 구분 등 */
  titleColor?: string;
}

/*
 * 아래 네 값은 2026-09-17 실기기(안드로이드 12, 1080×1920)에서 adb 로 각도·거리·속도를
 * 바꿔가며 재고 <b>그대로 두기로 한 값</b>이다. 다시 만지기 전에 측정값부터 본다.
 *
 * <p>· 거리로 닫히는 선: 화면 높이의 <b>약 23%</b>(2000px 기준 455px). 450px 은 열린 채,
 *   460px 부터 닫혔다 — {@code CLOSE_RATIO} 와 맞는다.
 * <p>· 속도로 닫히는 선: 200px 을 120ms(≈1100dp/s)에 튕기면 닫히고, 160ms(≈830dp/s)면
 *   안 닫힌다 — {@code CLOSE_VELOCITY} 와 맞는다. <b>느린 끌기는 둔하고 튕기기는 예민한</b>
 *   조합이 의도한 것이다. 사람이 실제로 닫을 때 쓰는 손짓은 튕기기 쪽이라 2cm 만 튕겨도
 *   닫히고, 느릿하게 끄는 손짓("아직 보는 중")은 1/4 화면을 끌어야 닫힌다.
 * <p>· 가로 넘김과 안 싸운다: 가로가 더 긴 손짓은 세로로 350px 흘려도 <b>한 번도</b>
 *   닫히지 않았다. 세로가 더 길어지는 지점(가로 200 / 세로 500)부터 닫힌다.
 * <p>· 위로 끌기도 대칭으로 닫힌다(의도된 동작).
 */
/** 세로로 이만큼 움직여야 닫기 제스처가 시작된다 — 탭·짧은 흔들림과 구분한다 */
const DRAG_ACTIVATE = 16;
/** 가로로 이만큼 먼저 움직이면 닫기를 포기한다 — 그 손짓은 사진 넘기기다 */
const DRAG_FAIL_X = 12;
/** 놓았을 때 닫히는 기준 — 화면 높이의 이 비율만큼 끌었거나 */
const CLOSE_RATIO = 0.22;
/** 이 속도(px/s)보다 빠르게 튕겼거나. 짧게 튕겨 닫는 손짓을 살린다 */
const CLOSE_VELOCITY = 900;

interface Props {
  images: ViewerImage[];
  /** 열 때 보여줄 사진 위치. null 이면 닫힌 상태 */
  initialIndex: number | null;
  onClose: () => void;
}

export function ImageViewer({ images, initialIndex, onClose }: Props) {
  // 가로는 셸 폭(웹) — 뷰어 자체가 셸 안에서 열린다. 세로는 셸이 건드리지 않으므로 창 높이 그대로.
  const width = useContentWidth();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(initialIndex ?? 0);
  const listRef = useRef<FlatList<ViewerImage>>(null);
  // 저장·공유 둘 다 다운로드부터 하므로 겹치지 않게 하나만 진행한다
  const [working, setWorking] = useState<'save' | 'share' | null>(null);

  const visible = initialIndex !== null && images.length > 0;

  /*
   * 아래로 끌어 닫기.
   *
   * <p>화면 반영은 {@link Animated.Value}, 계산 근거는 ref 로 따로 든다 — 매 프레임
   * setState 하면 리렌더가 끊긴다(AvatarCropSheet 와 같은 구조).
   */
  // useRef(...).current 대신 useState 초기화 — 값은 똑같이 한 번만 만들어지고,
  // "렌더 중 ref 접근" 규칙에 걸리지 않는다(AvatarCropSheet 의 같은 패턴은 걸려 있다)
  const [dragY] = useState(() => new Animated.Value(0));
  /** 지금 보고 있는 사진이 확대돼 있는가 — 확대 중에는 세로 끌기를 닫기로 읽지 않는다 */
  const [zoomed, setZoomed] = useState(false);

  const resetDrag = useCallback(() => dragY.setValue(0), [dragY]);

  /*
   * 뷰어를 열 때마다 위치를 initialIndex 로 되돌린다.
   *
   * <p>이 컴포넌트는 화면에 계속 붙어 있고 {@link Modal} 의 children 만 여닫힌다 —
   * FlatList 는 매번 새로 마운트돼 initialScrollIndex 로 옳은 사진을 보여주지만,
   * 여기 {@code index} 는 <b>직전에 스와이프해둔 값</b>이 그대로 남는다. 그러면 열자마자
   * 한 프레임 동안 다른 사진의 제목·매수가 보였다가 viewability 콜백으로 교정된다.
   *
   * <p>effect 가 아니라 렌더 중에 맞춘다 — effect 는 커밋 뒤에 돌아 어긋난 프레임이
   * 그대로 그려지고, 그게 고치려는 증상 자체다. 같은 사진을 다시 여는 경우
   * (initialIndex 가 안 바뀌는 경우)까지 잡으려면 값이 아니라 <b>열림 전이</b>를 봐야 한다.
   */
  const [wasOpen, setWasOpen] = useState(visible);
  if (visible !== wasOpen) {
    setWasOpen(visible);
    if (visible) {
      setIndex(initialIndex ?? 0);
      setZoomed(false);
    }
  }

  /*
   * 열 때 드래그 위치를 되돌린다.
   *
   * <p>위 열림 전이(렌더 중)가 아니라 effect 에 두는 이유는 {@code dragOffset} 이 ref 이고
   * 렌더 중 ref 를 만지면 안 되기 때문이다. 한 프레임 늦어도 문제가 없다 — 닫히는 경로는
   * 모두 이미 0 으로 되돌려 놓는다(제스처는 닫기 애니메이션 뒤에, 나머지는 스프링 복귀로).
   * 여기는 그 경로가 하나라도 새면 잡는 안전망이다.
   */
  useEffect(() => {
    if (visible) resetDrag();
  }, [visible, resetDrag]);

  const onViewableChanged = useRef(
    ({ viewableItems }: { viewableItems: { index: number | null }[] }) => {
      const first = viewableItems[0]?.index;
      if (first != null) {
        setIndex(first);
        // 다음 장은 확대되지 않은 상태로 시작한다 — 안 풀면 닫기 제스처가 계속 꺼져 있다
        setZoomed(false);
      }
    },
  ).current;

  /*
   * 확대 여부 추적 — iOS·웹의 ScrollView 확대만 해당한다(안드로이드는 확대 자체가 없다).
   * 매 이벤트마다 setState 하지 않고 <b>바뀔 때만</b> 올린다.
   */
  const onPageScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = (e.nativeEvent.zoomScale ?? 1) > 1.01;
    setZoomed((prev) => (prev === next ? prev : next));
  }, []);

  /*
   * 페이지(확대용 ScrollView)마다 ref 를 하나씩 미리 만들어 둔다 — 아래
   * {@code blocksExternalGesture} 가 "이 스크롤들은 닫기 제스처가 실패한 뒤에 움직여라"를
   * 걸 대상이다. 장수가 그대로면 같은 배열을 유지해 제스처가 매 렌더 새로 만들어지지 않게
   * {@code images.length} 로만 기억한다(호출부가 배열을 매번 새로 만드는 화면도 있다).
   */
  const pageRefs = useMemo(
    () => Array.from({ length: images.length }, () => React.createRef<ScrollView>()),
    [images.length],
  );

  /*
   * 셋이 겹치는 자리다 — 가로 넘김(FlatList) · 확대(ScrollView) · 세로 닫기(여기).
   *
   * <p>{@code activeOffsetY} 는 세로로 충분히 움직여야 시작하게 하고, {@code failOffsetX} 는
   * 가로가 먼저 움직이면 이 제스처를 <b>포기</b>시켜 FlatList 가 그대로 받게 한다.
   * 확대 중에는 {@code enabled(false)} — 확대해서 사진 아래쪽을 보려는 손짓이 닫기로 읽히면
   * 기능이 서로를 잡아먹는다.
   */
  const dismissGesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .enabled(!zoomed)
        .activeOffsetY([-DRAG_ACTIVATE, DRAG_ACTIVATE])
        .failOffsetX([-DRAG_FAIL_X, DRAG_FAIL_X])
        /*
         * iOS 에서 확대용 ScrollView 가 세로 팬을 먼저 가져가던 것을 막는다(renderItem 주석 참고).
         * RNGH 의 GestureRef 타입이 ComponentType 기준이라 ScrollView ref 와 어긋나는데,
         * 런타임은 {@code ref.current.handlerTag} 만 읽으므로 캐스팅으로 넘긴다.
         */
        .blocksExternalGesture(...(pageRefs as unknown as React.RefObject<React.ComponentType>[]))
        /*
         * 시작점 기준 누적값을 그대로 쓴다. AvatarCropSheet 는 증분(onChange)을 골랐는데
         * 그건 이동·확대를 <b>동시에</b> 받아 서로 덮어쓰는 경우였다. 여기는 단독 제스처라
         * 누적값이 맞고, 별도 누적 ref 를 둘 이유도 없어진다.
         */
        .onUpdate((e) => dragY.setValue(e.translationY))
        .onEnd((e) => {
          const far = Math.abs(e.translationY) > height * CLOSE_RATIO;
          const fast = Math.abs(e.velocityY) > CLOSE_VELOCITY;
          if (far || fast) {
            // 끌던 방향으로 마저 밀어낸 뒤 닫는다 — 제자리에서 사라지면 끊겨 보인다
            const to = e.translationY >= 0 ? height : -height;
            Animated.timing(dragY, { toValue: to, duration: 160, useNativeDriver: true }).start(
              () => {
                resetDrag();
                onClose();
              },
            );
            return;
          }
          Animated.spring(dragY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 0,
            speed: 18,
          }).start();
        }),
    [zoomed, height, dragY, resetDrag, onClose, pageRefs],
  );

  /** 끌수록 배경이 옅어진다 — 뒤 화면이 비쳐야 "닫히는 중"으로 읽힌다 */
  const chromeOpacity = dragY.interpolate({
    inputRange: [-height / 2, 0, height / 2],
    outputRange: [0.15, 1, 0.15],
    extrapolate: 'clamp',
  });

  /*
   * 확대용 {@link ScrollView} 가 iOS 에서 <b>세로 끌기를 먼저 먹던</b> 자리다(2026-09-17 제보).
   *
   * <p>안드로이드는 RNGH 가 루트에서 터치를 가로채고 활성화되는 순간 네이티브 자식에게
   * ACTION_CANCEL 을 보내므로 위의 {@code dismissGesture} 가 이긴다. iOS 는 UIKit 의
   * 인식기 경쟁이라 사정이 다르다 — {@code UIScrollView.panGestureRecognizer} 가 먼저
   * 시작해버리면 RNGH 의 Pan 은 활성화되지 못한다. RN 은 세로 ScrollView 에
   * {@code alwaysBounceVertical} 을 기본 <b>참</b>으로 준다(= {@code !horizontal}). 그래서
   * 내용이 화면에 딱 맞아 스크롤할 것이 없어도 고무줄 반동 때문에 세로 팬이 인식되고,
   * 끌어 닫기가 <b>iOS 에서만</b> 통째로 먹히지 않았다.
   *
   * <p>두 겹으로 막는다. 확대 기능은 그대로 둔다 — 핀치를 막는 처방(예:
   * {@code scrollEnabled={zoomed}})은 핀치가 안 먹히면 {@code zoomed} 가 영영 켜지지 않는
   * 외길이라 쓰지 않았다.
   * <p>· 반동을 끈다 — 내용이 화면에 딱 맞고 튕김도 없으면 UIScrollView 의 팬 인식기는
   *   스크롤할 여지가 없다고 보고 스스로 실패한다. 확대 중에는 여지가 생기므로 정상 동작한다.
   * <p>· {@code blocksExternalGesture} 로 못을 박는다 — 각 페이지 ScrollView 에게
   *   "닫기 제스처가 실패한 뒤에 움직여라"고 알린다. 세로로 끌면 16px 에서 닫기가 잡혀
   *   스크롤은 시작조차 못 하고, 가로로 끌면 12px 에서 닫기가 포기해 그대로 넘겨준다.
   */
  const renderItem = useCallback(
    ({ item, index: i }: ListRenderItemInfo<ViewerImage>) => (
      <ScrollView
        style={{ width }}
        contentContainerStyle={[styles.page, { width, height }]}
        maximumZoomScale={3}
        minimumZoomScale={1}
        centerContent
        ref={pageRefs[i]}
        bounces={false}
        alwaysBounceVertical={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        onScroll={onPageScroll}
        scrollEventThrottle={16}
      >
        <Image
          source={{ uri: item.uri }}
          style={{ width, height: height * 0.8 }}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      </ScrollView>
    ),
    [width, height, pageRefs, onPageScroll],
  );

  const current = images[index];

  /*
   * 갤러리 저장·공유 둘 다 로컬 파일이 있어야 한다 — uri 는 Cloudinary 원격 URL이라
   * MediaAsset.create·Sharing.shareAsync 모두 file:// 가 아니면 동작하지
   * 않는다(§7 분석 그대로). 캐시에 받아둔 뒤 두 기능이 그 파일을 같이 쓴다.
   *
   * expo-media-library 56부터 saveToLibraryAsync 등 함수형 API는 deprecated 이면서
   * 런타임에 throw 한다(legacyWarnings). 클래스 API(Asset.create)를 쓴다.
   *
   * expo-media-library 는 파일 최상단에서 import 하지 않는다 — 56 의 `Asset` 클래스는
   * import 되는 순간 네이티브 모듈(`ExpoMediaLibraryNext`)을 찾고, 웹에는 그게 없어
   * 앱 전체가 부팅 직후 죽었다(2026-09-14 확인, 5eaeed9 이후). 저장 버튼을 누를 때
   * 네이티브에서만 require 한다. 웹은 갤러리가 없으니 원본을 새 탭으로 열어 브라우저의
   * "이미지 저장"에 맡긴다.
   */
  const downloadToCache = async (uri: string) => {
    const file = await File.downloadFileAsync(uri, Paths.cache, { idempotent: true });
    return file.uri;
  };

  const onSave = async () => {
    if (!current || working) return;
    if (Platform.OS === 'web') {
      window.open(current.uri, '_blank', 'noopener');
      return;
    }
    setWorking('save');
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const MediaLibrary = require('expo-media-library') as typeof import('expo-media-library');
      // 저장만 하므로 write-only 권한 — iOS는 "추가만 허용", Android 13+는 별도 권한 없이 통과
      const { status } = await MediaLibrary.requestPermissionsAsync(true);
      if (status !== 'granted') {
        toast.error('사진을 저장하려면 갤러리 접근 권한이 필요해요.');
        return;
      }
      const localUri = await downloadToCache(current.uri);
      await MediaLibrary.Asset.create(localUri);
      toast.success('사진을 저장했어요.');
    } catch (e) {
      toast.error(getErrorMessage(e, '사진을 저장하지 못했어요.'));
    } finally {
      setWorking(null);
    }
  };

  const onShare = async () => {
    if (!current || working) return;
    setWorking('share');
    try {
      if (!(await Sharing.isAvailableAsync())) {
        toast.error('이 기기에서는 공유하기를 쓸 수 없어요.');
        return;
      }
      const localUri = await downloadToCache(current.uri);
      await Sharing.shareAsync(localUri);
    } catch (e) {
      toast.error(getErrorMessage(e, '공유하지 못했어요.'));
    } finally {
      setWorking(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* Modal 은 별도 네이티브 창이라 바깥의 GestureHandlerRootView 컨텍스트가 안 이어진다 —
          여기서 다시 감싸야 아래로 끌어 닫기가 동작한다(CallOverlay 와 같은 이유). */}
      <GestureHandlerRootView style={styles.root}>
        {/* 배경은 사진과 따로 둔다 — 끌 때 사진만 따라가고 배경은 옅어져야 한다 */}
        <Animated.View style={[styles.backdrop, { opacity: chromeOpacity }]} />

        <GestureDetector gesture={dismissGesture}>
          <Animated.View style={[styles.root, { transform: [{ translateY: dragY }] }]}>
            <FlatList
              ref={listRef}
              data={images}
              keyExtractor={(item) => item.key}
              renderItem={renderItem}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              initialScrollIndex={initialIndex ?? 0}
              getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
              onViewableItemsChanged={onViewableChanged}
              viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
            />
          </Animated.View>
        </GestureDetector>

        {/* 버튼·설명은 사진을 따라 움직이지 않고 함께 옅어진다 — 끌던 손이 버튼을 스치지 않게 */}
        <Animated.View style={[styles.chrome, { opacity: chromeOpacity }]} pointerEvents="box-none">

        {/* 닫기 — 배경 탭만으로는 어포던스가 없고 스크린리더에도 노출되지 않는다 */}
        <Pressable
          style={[styles.close, { top: insets.top + spacing.sm }]}
          onPress={onClose}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="닫기"
        >
          <MaterialCommunityIcons name="close" size={26} color={colors.white} />
        </Pressable>

        {/* 저장·공유 — §7 분석(사진 다운로드 기능 부재) 대응, 우상단에 닫기와 대칭으로 둔다 */}
        <View style={[styles.actions, { top: insets.top + spacing.sm }]}>
          <Pressable
            style={styles.actionBtn}
            onPress={onShare}
            disabled={working !== null}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="공유하기"
          >
            {working === 'share' ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <MaterialCommunityIcons name="share-variant" size={24} color={colors.white} />
            )}
          </Pressable>
          <Pressable
            style={styles.actionBtn}
            onPress={onSave}
            disabled={working !== null}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="갤러리에 저장"
          >
            {working === 'save' ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <MaterialCommunityIcons name="download" size={24} color={colors.white} />
            )}
          </Pressable>
        </View>

        {images.length > 1 ? (
          <View style={[styles.counter, { top: insets.top + spacing.sm }]}>
            <Text style={styles.counterText}>
              {index + 1} / {images.length}
            </Text>
          </View>
        ) : null}

        {current?.title || current?.caption ? (
          <View style={[styles.caption, { paddingBottom: insets.bottom + spacing.lg }]}>
            {current.title ? (
              <Text style={[styles.title, current.titleColor ? { color: current.titleColor } : null]}>
                {current.title}
              </Text>
            ) : null}
            {current.caption ? (
              <Text style={styles.captionText} numberOfLines={4}>
                {current.caption}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/*
         * 토스트를 모달 <b>안에</b> 한 번 더 그린다.
         *
         * <p>App.tsx 루트의 {@code <Toast />} 는 RN {@link Modal} 이 별도 네이티브
         * 윈도우에 그려지는 탓에 뷰어 뒤에 깔린다 — 갤러리 저장을 눌러도 "저장했어요"가
         * 사진 위에 안 뜨고, 뷰어를 닫은 뒤 <b>다른 화면</b>에서 남은 시간만큼 보였다.
         * "저장됐는지 알 수 없다"는 리포트(2026-09-10)의 원인이 이것이다.
         *
         * <p>두 인스턴스는 같은 스토어 슬롯을 읽으므로 내용·시간이 어긋나지 않는다.
         * 뒤에 깔린 쪽은 어차피 안 보이고, 모달이 닫혀 있으면 RN Modal 이 children 을
         * 렌더하지 않으므로 이 사본은 뷰어가 열려 있는 동안에만 존재한다.
         */}
        </Animated.View>

        <Toast />
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = themedStyles((colors) => ({
  root: { flex: 1 },
  // 배경만 따로 — 아래로 끌면 이 층의 불투명도가 떨어진다
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.94)',
  },
  // 버튼·설명 층. box-none 이라 빈 곳의 터치는 아래(사진)로 지나간다
  chrome: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  page: { alignItems: 'center', justifyContent: 'center' },
  close: {
    position: 'absolute',
    left: spacing.md,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 저장·공유 — 닫기와 대칭으로 우상단, 가로로 나란히
  actions: {
    position: 'absolute',
    right: spacing.md,
    flexDirection: 'row',
  },
  actionBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counter: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    height: 44,
    justifyContent: 'center',
  },
  counterText: { color: colors.white, fontSize: fontSize.body, fontWeight: '700' },
  caption: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
  },
  title: { color: colors.white, fontSize: fontSize.body, fontWeight: '800', marginBottom: 2 },
  captionText: { color: colors.white, fontSize: fontSize.body, lineHeight: 21 },
}));
