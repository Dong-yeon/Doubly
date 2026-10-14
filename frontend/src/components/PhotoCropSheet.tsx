/**
 * 사진 자르기 — 보내기 전에 스크린샷의 필요 없는 위아래를 잘라내는 자리(docs/chat-photo-crop_2026-10-14.md).
 *
 * <p>{@link AvatarCropSheet} 와 반대 방식이다. 그쪽은 <b>틀(원)이 가만히 있고 사진을 움직인다</b> — 결과가 늘
 * 정사각이라 그게 맞다. 여기는 결과 비율이 자유라 <b>사진이 가만히 있고 틀의 모서리·변을 끈다</b>(사진 앱의
 * 자르기와 같다). 틀 안을 끌면 틀이 통째로 움직인다. 비율 칩(1:1·4:5·원본)을 고르면 모서리만 끌 수 있고
 * 비율이 유지된다. 계산은 utils/photoCrop.ts(검증: scripts/verify-photo-crop.mjs).
 *
 * <p>구조는 AvatarCropSheet 의 규칙을 그대로 따른다 — 제스처는 runOnJS(true)(워클릿 없음), 매 프레임 값은
 * Animated.Value 와 ref 로 들고 setState 로 리렌더하지 않는다. 웹은 마우스 드래그가 같은 Pan 으로 들어온다.
 *
 * <p><b>업로드하지 않는다.</b> 잘라낸 로컬 사진만 넘긴다 — 사진 한도는 업로드 서명 때 깎이므로(UploadController)
 * 여러 번 다시 잘라도 한도가 줄지 않는다. 틀을 건드리지 않고 완료하면 원본을 그대로 돌려준다(재인코딩 없음).
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
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Alert } from '../utils/alert';
import { getErrorMessage } from '../utils/error';
import { haptics } from '../utils/haptics';
import { fontSize, radius, spacing } from '../constants/theme';
import type { PickedImage } from '../utils/imageUpload';
import {
  dragRect,
  fitRatio,
  hitTest,
  ratioOf,
  toSourceCrop,
  type DragMode,
  type RatioKey,
  type Rect,
} from '../utils/photoCrop';

/** 사진 둘레 여백 — 손잡이가 화면 끝에 붙어 잡기 어렵지 않게 */
const CANVAS_PAD = spacing.lg;

const RATIOS: { key: RatioKey; label: string }[] = [
  { key: 'free', label: '자유' },
  { key: 'square', label: '1:1' },
  { key: 'portrait', label: '4:5' },
  { key: 'original', label: '원본' },
];

interface Props {
  /** 자를 사진. null 이면 닫힌 상태 */
  source: PickedImage | null;
  onCancel: () => void;
  /** 잘라낸 로컬 사진(크기 포함). 틀을 건드리지 않았으면 source 그대로 */
  onConfirm: (image: PickedImage) => void;
}

/** 사진이 바뀌면 틀·비율이 처음부터여야 해서 사진마다 새로 마운트한다(효과 안 setState 대신) */
export function PhotoCropSheet({ source, ...rest }: Props) {
  if (!source) return null;
  return <PhotoCropSheetInner key={source.uri} source={source} {...rest} />;
}

function PhotoCropSheetInner({ source, onCancel, onConfirm }: Props & { source: PickedImage }) {
  const insets = useSafeAreaInsets();
  const [canvas, setCanvas] = useState({ width: 0, height: 0 });
  const [working, setWorking] = useState(false);
  const [ratioKey, setRatioKey] = useState<RatioKey>('free');

  /** 화면에 그려진 사진의 자리 — contain 계산(사진 전체가 보이게) */
  const geometry = useMemo(() => {
    if (canvas.width === 0 || canvas.height === 0) return null;
    const availW = canvas.width - CANVAS_PAD * 2;
    const availH = canvas.height - CANVAS_PAD * 2;
    if (availW <= 0 || availH <= 0 || source.width <= 0 || source.height <= 0) return null;
    // 원본 1px 이 화면 몇 px 인가
    const k = Math.min(availW / source.width, availH / source.height);
    const width = source.width * k;
    const height = source.height * k;
    return { k, width, height, left: (canvas.width - width) / 2, top: (canvas.height - height) / 2 };
  }, [source.width, source.height, canvas.width, canvas.height]);

  // useRef(...).current 대신 useState 초기화 — "렌더 중 ref 접근" 규칙(ImageViewer 와 같은 이유)
  const [xAnim] = useState(() => new Animated.Value(0));
  const [yAnim] = useState(() => new Animated.Value(0));
  const [wAnim] = useState(() => new Animated.Value(0));
  const [hAnim] = useState(() => new Animated.Value(0));
  /** 지금 화면의 틀 — 완료를 누른 순간 이걸로 원본 좌표를 계산한다 */
  const live = useRef<Rect>({ x: 0, y: 0, w: 0, h: 0 });
  const drag = useRef<{ mode: DragMode; start: Rect }>({ mode: null, start: { x: 0, y: 0, w: 0, h: 0 } });
  /** 틀을 한 번이라도 바꿨는가 — 안 바꿨으면 원본을 그대로 넘긴다 */
  const touched = useRef(false);

  const apply = useCallback(
    (r: Rect) => {
      live.current = r;
      xAnim.setValue(r.x);
      yAnim.setValue(r.y);
      wAnim.setValue(r.w);
      hAnim.setValue(r.h);
    },
    [xAnim, yAnim, wAnim, hAnim],
  );

  /*
   * 사진 자리가 바뀌면(처음 그릴 때·기기 회전) 틀을 사진 전체로 맞춘다. 비율을 지키며 옮기는 대신 처음으로 되돌린다 —
   * 회전 중에 자르는 일은 드물고, 어긋난 틀로 잘리는 것보다 낫다. (Animated 값만 바꾸고 state 는 건드리지 않는다)
   */
  useEffect(() => {
    if (!geometry) return;
    touched.current = false;
    apply({ x: 0, y: 0, w: geometry.width, h: geometry.height });
  }, [geometry, apply]);

  const ratio = ratioOf(ratioKey, source.width, source.height);

  const onRatio = (key: RatioKey) => {
    if (!geometry) return;
    setRatioKey(key);
    const r = ratioOf(key, source.width, source.height);
    if (r == null) return;
    touched.current = true;
    apply(fitRatio(live.current, r, geometry.width, geometry.height));
  };

  const onReset = () => {
    if (!geometry) return;
    setRatioKey('free');
    touched.current = false;
    apply({ x: 0, y: 0, w: geometry.width, h: geometry.height });
  };

  // 제스처 처리기는 useCallback 으로 따로 둔다 — 빌더 안에 인라인으로 두면 컴파일러 린트가 "렌더 중 ref 접근"으로 본다
  const onPanBegin = useCallback(
    (e: { x: number; y: number }) => {
      if (!geometry) return;
      drag.current = {
        mode: hitTest(e.x - geometry.left, e.y - geometry.top, live.current, ratio != null),
        start: live.current,
      };
    },
    [geometry, ratio],
  );
  const onPanUpdate = useCallback(
    (e: { translationX: number; translationY: number }) => {
      if (!geometry || !drag.current.mode) return;
      touched.current = true;
      apply(dragRect(drag.current.mode, drag.current.start, e.translationX, e.translationY,
        geometry.width, geometry.height, ratio));
    },
    [geometry, ratio, apply],
  );
  const onPanEnd = useCallback(() => {
    drag.current = { mode: null, start: live.current };
  }, []);

  // AvatarCropSheet 와 같은 이유로 runOnJS(true). 크기 조절은 시작 틀 + 누적 이동량(onUpdate)이 맞다 —
  // 증분(onChange)을 더하면 가장자리에 막힌 동안 버려진 이동이 되돌아올 때 손가락과 어긋난다.
  const gesture = useMemo(
    // 처리기는 터치 때 불린다 — 빌더에 넘기는 것을 린트가 렌더 중 호출로 오인한다(ref 는 처리기 안에서만 읽는다)
    // eslint-disable-next-line react-hooks/refs
    () => Gesture.Pan().runOnJS(true).minDistance(0).onBegin(onPanBegin).onUpdate(onPanUpdate).onFinalize(onPanEnd),
    [onPanBegin, onPanUpdate, onPanEnd],
  );

  const onCanvasLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setCanvas((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
  };

  const onDone = async () => {
    if (!geometry || working) return;
    const crop = touched.current ? toSourceCrop(live.current, geometry.k, source.width, source.height) : null;
    if (!crop) {
      onConfirm(source);
      return;
    }
    setWorking(true);
    try {
      const rendered = await ImageManipulator.manipulate(source.uri).crop(crop).renderAsync();
      // 줄이기는 보낼 때 한 번(shrinkUnknownImage) — 여기서 줄이면 두 번 깎인다
      const saved = await rendered.saveAsync({ compress: 0.92, format: SaveFormat.JPEG });
      haptics.light();
      onConfirm({ uri: saved.uri, width: saved.width || crop.width, height: saved.height || crop.height });
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e, '사진을 자르지 못했어요.'));
      setWorking(false);
    }
  };

  // 틀 바깥을 어둡게 — 네 조각(위·아래·왼·오른)을 틀 값에서 바로 계산한다
  const right = Animated.add(xAnim, wAnim);
  const bottom = Animated.add(yAnim, hAnim);

  return (
    <Modal
      visible
      transparent={false}
      animationType="slide"
      // 자르는 중의 뒤로 가기는 무시한다 — 닫힌 뒤에 자르기가 끝나 사진이 바뀌면 안 된다
      onRequestClose={() => {
        if (!working) onCancel();
      }}
    >
      {/* Modal 은 별도 창이라 제스처 루트를 다시 감싼다(AvatarCropSheet 주석) */}
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
          <Text style={styles.headerTitle}>사진 자르기</Text>
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
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    left: geometry.left,
                    top: geometry.top,
                    width: geometry.width,
                    height: geometry.height,
                  }}
                >
                  <Animated.Image
                    source={{ uri: source.uri }}
                    accessibilityIgnoresInvertColors
                    style={{ width: geometry.width, height: geometry.height }}
                  />
                  <Animated.View style={[styles.shade, { left: 0, top: 0, right: 0, height: yAnim }]} />
                  <Animated.View style={[styles.shade, { left: 0, right: 0, top: bottom, bottom: 0 }]} />
                  <Animated.View style={[styles.shade, { left: 0, top: yAnim, width: xAnim, height: hAnim }]} />
                  <Animated.View style={[styles.shade, { left: right, right: 0, top: yAnim, height: hAnim }]} />
                  <Animated.View style={[styles.frame, { left: xAnim, top: yAnim, width: wAnim, height: hAnim }]}>
                    {/* 삼등분 안내선 — 무엇을 남길지 가늠하게 */}
                    <View style={[styles.guide, styles.guideV, { left: '33.33%' }]} />
                    <View style={[styles.guide, styles.guideV, { left: '66.66%' }]} />
                    <View style={[styles.guide, styles.guideH, { top: '33.33%' }]} />
                    <View style={[styles.guide, styles.guideH, { top: '66.66%' }]} />
                    <View style={[styles.corner, styles.cornerTL]} />
                    <View style={[styles.corner, styles.cornerTR]} />
                    <View style={[styles.corner, styles.cornerBL]} />
                    <View style={[styles.corner, styles.cornerBR]} />
                  </Animated.View>
                </View>
              ) : null}
            </View>
          </GestureDetector>
        </View>

        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Text style={styles.hint}>
            {ratio == null
              ? '모서리나 변을 끌어 남길 부분을 정해 주세요'
              : '모서리를 끌어 크기를, 안쪽을 끌어 자리를 정해 주세요'}
          </Text>
          <View style={styles.chipRow}>
            {RATIOS.map((r) => {
              const active = r.key === ratioKey;
              return (
                <Pressable
                  key={r.key}
                  onPress={() => onRatio(r.key)}
                  disabled={working}
                  style={[styles.chip, active && styles.chipActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`비율 ${r.label}`}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{r.label}</Text>
                </Pressable>
              );
            })}
            <Pressable
              onPress={onReset}
              disabled={working}
              style={styles.chip}
              accessibilityRole="button"
              accessibilityLabel="처음으로"
            >
              <Text style={styles.chipText}>처음으로</Text>
            </Pressable>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const HANDLE = 18;
const HANDLE_W = 3;

// AvatarCropSheet 와 같이 라이트/다크와 무관하게 어두운 판으로 고정한다
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
  shade: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.6)' },
  frame: { position: 'absolute', borderWidth: 1, borderColor: '#FFFFFF' },
  guide: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.35)' },
  guideV: { top: 0, bottom: 0, width: StyleSheet.hairlineWidth },
  guideH: { left: 0, right: 0, height: StyleSheet.hairlineWidth },
  corner: { position: 'absolute', width: HANDLE, height: HANDLE, borderColor: '#FFFFFF' },
  cornerTL: { left: -HANDLE_W, top: -HANDLE_W, borderLeftWidth: HANDLE_W, borderTopWidth: HANDLE_W },
  cornerTR: { right: -HANDLE_W, top: -HANDLE_W, borderRightWidth: HANDLE_W, borderTopWidth: HANDLE_W },
  cornerBL: { left: -HANDLE_W, bottom: -HANDLE_W, borderLeftWidth: HANDLE_W, borderBottomWidth: HANDLE_W },
  cornerBR: { right: -HANDLE_W, bottom: -HANDLE_W, borderRightWidth: HANDLE_W, borderBottomWidth: HANDLE_W },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, alignItems: 'center' },
  hint: { color: 'rgba(255,255,255,0.72)', fontSize: fontSize.body, textAlign: 'center' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.md },
  chip: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  chipActive: { backgroundColor: '#FFFFFF' },
  chipText: { color: '#FFFFFF', fontSize: fontSize.body, fontWeight: '700' },
  chipTextActive: { color: '#000000' },
});
