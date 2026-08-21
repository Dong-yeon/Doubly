/**
 * 프로필 사진 원형 크롭 — "동그라미 안에 들어갈 부분"을 직접 고른다.
 *
 * <p><b>왜 만들었나</b>: 프로필 사진은 고른 원본을 그대로 올리고 있었고
 * ({@code imageUpload.ts} 의 {@code allowsEditing: false}), 표시는 {@link Avatar} 가
 * 원형 + {@code resizeMode: 'cover'} 로 <b>중앙을 자동으로</b> 잘라냈다. 세로로 긴 사진에서
 * 얼굴이 가운데에 없으면 잘려나가는데 사용자가 손쓸 방법이 없었다
 * ({@code docs/UX_UI_AUDIT.md} "아바타: 정사각 크롭 미적용").
 *
 * <p><b>왜 expo-image-picker 의 allowsEditing 이 아닌가</b>: 그 크롭 UI 는 iOS 는 정사각
 * 프레임, 안드로이드는 기기마다 다른 시스템 화면이라 <b>원형이 아니고</b>, 웹에서는 아예
 * 동작하지 않는다. 게다가 {@code pickImage} 는 피드·식단·맛집 등 8개 화면이 함께 쓰는
 * 공용 함수라 거기서 켜면 전 화면이 정사각으로 잘린다.
 *
 * <p><b>저장은 정사각 JPEG 다.</b> 원형으로 보이는 건 {@link Avatar} 의 {@code borderRadius}
 * 가 이미 담당한다 — 굳이 투명 원형 PNG 로 만들면 용량만 커지고, 다크 모드에서 모서리
 * 투명 영역이 배경과 겹쳐 지저분해진다.
 *
 * <p><b>업로드는 확정 후 딱 한 번이다.</b> 사진 한도(PHOTO_UPLOAD)가 서버의 <b>서명 발급
 * 시점</b>에 깎이므로(backend UploadController), 크롭을 다시 잡을 때마다 올리면 한도가
 * 헛되이 소모된다. 그래서 이 시트는 업로드를 하지 않고 잘라낸 로컬 uri 만 넘긴다.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Svg, { Circle, Defs, Mask, Rect } from 'react-native-svg';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from './Icon';
import { Alert } from '../utils/alert';
import { getErrorMessage } from '../utils/error';
import { haptics } from '../utils/haptics';
import { fontSize, radius, spacing } from '../constants/theme';
import type { PickedImage } from '../utils/imageUpload';

/** 결과 한 변(px). 아바타 최대 표시가 80pt 라 512 면 3배 화면에서도 충분하고, 원본을 그대로
 *  올릴 때보다 Cloudinary 저장 용량이 크게 준다(무료 티어 25GB — UploadController 주석). */
const OUTPUT_SIZE = 512;
/** 확대 상한. 넘기면 원본 픽셀보다 크게 늘려 결과가 뭉개진다 */
const MAX_SCALE = 4;
/** 버튼 한 번에 확대/축소되는 비율 — 웹(마우스)엔 핀치가 없어 이 경로가 유일한 확대 수단이다 */
const ZOOM_STEP = 1.3;
/** 크롭 원의 최대 지름 — 큰 화면에서 원이 과하게 커지지 않게 */
const MAX_CIRCLE = 320;

interface Props {
  /** 크롭할 원본. null 이면 닫힌 상태 */
  source: PickedImage | null;
  onCancel: () => void;
  /** 잘라낸 로컬 이미지 uri — 업로드는 호출부 책임 */
  onConfirm: (uri: string) => void;
}

interface Transform {
  scale: number;
  x: number;
  y: number;
}

const IDENTITY: Transform = { scale: 1, x: 0, y: 0 };

export function AvatarCropSheet({ source, onCancel, onConfirm }: Props) {
  const insets = useSafeAreaInsets();
  const [canvas, setCanvas] = useState({ width: 0, height: 0 });
  const [working, setWorking] = useState(false);

  // 제스처가 runOnJS(true) 라 전부 JS 스레드에서 돌아간다. 그래도 setState 로 매 프레임
  // 리렌더하면 끊기므로 화면 반영은 Animated.Value 로, 계산 근거는 ref 로 따로 들고 간다.
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const xAnim = useRef(new Animated.Value(0)).current;
  const yAnim = useRef(new Animated.Value(0)).current;
  /** 지금 화면에 반영돼 있는 값 — 완료를 누른 순간의 크롭 좌표는 이걸로 계산한다 */
  const live = useRef<Transform>(IDENTITY);

  /**
   * 원 지름과, 그 원을 <b>빈틈없이 덮는</b> 최소 표시 크기(scale 1 기준).
   * cover 와 같은 계산이다 — 짧은 변을 원에 맞추면 긴 변은 자연히 넘친다.
   */
  const geometry = useMemo(() => {
    if (!source || canvas.width === 0 || canvas.height === 0) return null;
    const circle = Math.min(MAX_CIRCLE, Math.min(canvas.width, canvas.height) - spacing.lg * 2);
    if (circle <= 0) return null;
    // 원본 픽셀 1개가 화면 몇 px 인가 (scale 1 일 때)
    const base = Math.max(circle / source.width, circle / source.height);
    return { circle, base, width: source.width * base, height: source.height * base };
  }, [source, canvas.width, canvas.height]);

  /** 화면에 반영 + live 갱신. 이동은 원이 항상 사진에 덮이도록 가둔다 */
  const apply = useCallback(
    (next: Transform) => {
      if (!geometry) return;
      const scale = Math.min(MAX_SCALE, Math.max(1, next.scale));
      const maxX = Math.max(0, (geometry.width * scale - geometry.circle) / 2);
      const maxY = Math.max(0, (geometry.height * scale - geometry.circle) / 2);
      const value: Transform = {
        scale,
        x: Math.min(maxX, Math.max(-maxX, next.x)),
        y: Math.min(maxY, Math.max(-maxY, next.y)),
      };
      live.current = value;
      scaleAnim.setValue(value.scale);
      xAnim.setValue(value.x);
      yAnim.setValue(value.y);
    },
    [geometry, scaleAnim, xAnim, yAnim],
  );

  /**
   * 확대는 <b>원 중심</b>을 축으로 한다 — 이동량을 배율만큼 같이 늘리면 중심에 있던
   * 지점이 그대로 중심에 남는다. (상한에 걸려 잘린 배율로 계산해야 어긋나지 않는다)
   */
  const applyZoom = useCallback(
    (rawScale: number) => {
      const from = live.current;
      const scale = Math.min(MAX_SCALE, Math.max(1, rawScale));
      const k = scale / from.scale;
      apply({ scale, x: from.x * k, y: from.y * k });
    },
    [apply],
  );

  // 새 사진을 고르면 이전 사진의 확대/위치가 남아 있으면 안 된다
  useEffect(() => {
    live.current = IDENTITY;
    scaleAnim.setValue(1);
    xAnim.setValue(0);
    yAnim.setValue(0);
    setWorking(false);
  }, [source?.uri, scaleAnim, xAnim, yAnim]);

  // 원 크기가 바뀌면(기기 회전 등) 지금 위치가 새 한계를 넘을 수 있다 — 다시 가둔다.
  // 안 하면 사진이 원을 못 덮는 상태가 되어 화면과 잘라낸 결과가 어긋난다.
  useEffect(() => {
    apply(live.current);
  }, [apply]);

  const gesture = useMemo(() => {
    // 두 가지를 의도적으로 택했다.
    // 1. runOnJS(true) — 워클릿을 쓰지 않는다. 이 앱엔 reanimated 기반 코드가 한 곳도 없어서
    //    (Toast·Splash 모두 RN Animated) 여기서만 워클릿 규칙을 들이면 유지보수 비용이 커진다.
    // 2. onUpdate(누적값)가 아니라 onChange(증분) — 누적값을 쓰면 두 손가락 제스처에서
    //    이동과 확대가 서로의 결과를 덮어써 한쪽이 무시된다. 증분을 현재값에 더하면
    //    자연히 합쳐지고, 가장자리에 닿았다가 반대로 끌 때 곧바로 따라오는 이점도 있다.
    const pan = Gesture.Pan()
      .runOnJS(true)
      .onChange((e) => {
        const from = live.current;
        apply({ scale: from.scale, x: from.x + e.changeX, y: from.y + e.changeY });
      });

    const pinch = Gesture.Pinch()
      .runOnJS(true)
      .onChange((e) => applyZoom(live.current.scale * e.scaleChange));

    return Gesture.Simultaneous(pan, pinch);
  }, [apply, applyZoom]);

  const onZoom = (direction: 1 | -1) => {
    applyZoom(live.current.scale * (direction === 1 ? ZOOM_STEP : 1 / ZOOM_STEP));
  };

  const onCanvasLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setCanvas((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
  };

  const onDone = async () => {
    if (!source || !geometry || working) return;
    setWorking(true);
    try {
      const { scale, x, y } = live.current;
      // 원본 1px 이 화면에서 차지하는 px. 화면 좌표를 여기로 나누면 원본 좌표가 된다.
      const factor = geometry.base * scale;
      const rawSide = geometry.circle / factor;
      // 원본보다 큰 정사각은 있을 수 없다 — 반올림 오차로 1px 넘치는 것도 막는다
      const side = Math.max(1, Math.round(Math.min(rawSide, source.width, source.height)));
      const originX = Math.round((source.width - side) / 2 - x / factor);
      const originY = Math.round((source.height - side) / 2 - y / factor);

      const context = ImageManipulator.manipulate(source.uri).crop({
        originX: Math.min(Math.max(0, originX), source.width - side),
        originY: Math.min(Math.max(0, originY), source.height - side),
        width: side,
        height: side,
      });
      // 원본이 결과보다 작으면 늘리지 않는다 — 없는 화소를 만들어 봐야 뭉개지기만 한다
      if (side > OUTPUT_SIZE) context.resize({ width: OUTPUT_SIZE, height: OUTPUT_SIZE });

      const rendered = await context.renderAsync();
      const result = await rendered.saveAsync({ compress: 0.85, format: SaveFormat.JPEG });
      // 여기선 가볍게만 — 진짜 완료(success) 진동은 업로드가 끝났을 때 호출부가 울린다
      haptics.light();
      onConfirm(result.uri);
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e));
      setWorking(false);
    }
  };

  if (!source) return null;

  return (
    <Modal
      visible
      transparent={false}
      animationType="slide"
      // 자르는 중의 하드웨어 백은 무시한다 — 여기서 닫히면 이미 시작된 크롭이 끝나면서
      // 취소한 사진이 그대로 업로드된다(취소 버튼도 같은 이유로 disabled 다).
      onRequestClose={() => {
        if (!working) onCancel();
      }}
    >
      {/* Modal 은 별도 네이티브 창이라 바깥의 GestureHandlerRootView 컨텍스트가 안 이어진다 —
          CallOverlay 와 같은 이유로 여기서 다시 감싼다. 빠뜨리면 안드로이드에서 제스처가
          아예 먹지 않는다. */}
      <GestureHandlerRootView style={styles.root}>
        <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
          <Pressable
            onPress={onCancel}
            disabled={working}
            hitSlop={8}
            style={styles.headerAction}
            accessibilityRole="button"
            accessibilityLabel="취소"
          >
            <Text style={styles.headerText}>취소</Text>
          </Pressable>
          <Text style={styles.headerTitle}>프로필 사진</Text>
          <Pressable
            onPress={onDone}
            disabled={working || !geometry}
            hitSlop={8}
            style={styles.headerAction}
            accessibilityRole="button"
            accessibilityLabel="완료"
          >
            {working ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={[styles.headerText, styles.headerDone]}>완료</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.canvas} onLayout={onCanvasLayout}>
          <GestureDetector gesture={gesture}>
            <View style={StyleSheet.absoluteFill}>
              {geometry ? (
                <View style={styles.center} pointerEvents="none">
                  <Animated.Image
                    source={{ uri: source.uri }}
                    accessibilityIgnoresInvertColors
                    style={{
                      width: geometry.width,
                      height: geometry.height,
                      transform: [
                        // 순서 주의: 이동을 먼저 두어야 확대 배율에 이동량이 곱해지지 않는다
                        // (그래야 화면 px 단위로 잡은 클램프가 그대로 맞는다).
                        { translateX: xAnim },
                        { translateY: yAnim },
                        { scale: scaleAnim },
                      ],
                    }}
                  />
                </View>
              ) : null}

              {/* 원형 구멍 — 어두운 판에 원만 뚫는다. 네 변을 덧대는 방식은 원 바깥
                  모서리가 뚫린 채로 남아서, 마스크로 한 번에 판다. */}
              {geometry ? (
                <View style={StyleSheet.absoluteFill} pointerEvents="none">
                  <Svg width={canvas.width} height={canvas.height}>
                    <Defs>
                      <Mask id="avatar-crop-hole">
                        <Rect x={0} y={0} width={canvas.width} height={canvas.height} fill="#FFFFFF" />
                        <Circle
                          cx={canvas.width / 2}
                          cy={canvas.height / 2}
                          r={geometry.circle / 2}
                          fill="#000000"
                        />
                      </Mask>
                    </Defs>
                    <Rect
                      x={0}
                      y={0}
                      width={canvas.width}
                      height={canvas.height}
                      fill="rgba(0,0,0,0.66)"
                      mask="url(#avatar-crop-hole)"
                    />
                    <Circle
                      cx={canvas.width / 2}
                      cy={canvas.height / 2}
                      r={geometry.circle / 2}
                      stroke="#FFFFFF"
                      strokeWidth={2}
                      fill="none"
                    />
                  </Svg>
                </View>
              ) : null}
            </View>
          </GestureDetector>
        </View>

        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Text style={styles.hint}>동그라미 안에 넣을 부분을 드래그해서 맞춰주세요</Text>
          {/* 확대/축소 버튼 — 웹은 마우스라 핀치가 없고, 한 손 조작·스크린리더에도 필요하다 */}
          <View style={styles.zoomRow}>
            <Pressable
              onPress={() => onZoom(-1)}
              disabled={working}
              style={styles.zoomBtn}
              accessibilityRole="button"
              accessibilityLabel="축소"
            >
              <MaterialCommunityIcons name="minus" size={22} color="#FFFFFF" />
            </Pressable>
            <Pressable
              onPress={() => onZoom(1)}
              disabled={working}
              style={styles.zoomBtn}
              accessibilityRole="button"
              accessibilityLabel="확대"
            >
              <MaterialCommunityIcons name="plus" size={22} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

// 사진 위에 얹히는 화면이라 라이트/다크 어느 쪽이든 어두운 배경으로 고정한다 —
// 밝은 판 위에서는 잘라낼 사진의 밝기를 가늠하기 어렵다.
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerAction: { minWidth: 56, height: 44, justifyContent: 'center' },
  headerText: { color: '#FFFFFF', fontSize: fontSize.subtitle, fontWeight: '600' },
  headerDone: { fontWeight: '800', textAlign: 'right' },
  headerTitle: { color: '#FFFFFF', fontSize: fontSize.subtitle, fontWeight: '800' },
  canvas: { flex: 1, overflow: 'hidden' },
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, alignItems: 'center' },
  hint: { color: 'rgba(255,255,255,0.72)', fontSize: fontSize.body, textAlign: 'center' },
  zoomRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  zoomBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
});
