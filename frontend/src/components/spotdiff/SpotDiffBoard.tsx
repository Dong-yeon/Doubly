/**
 * 틀린그림찾기 판 — A·B 두 패널을 같은 크기로 놓고(세로 화면 위아래 / 가로 화면 좌우) 확대·이동을 함께 건다.
 * docs/spot-diff-design_2026-10-14.md 5절.
 *
 * <p>제스처는 판 전체에 하나다 — 어느 패널에서 끌어도 두 사진이 같이 움직이고, 탭 좌표는
 * {@link boardToImage} 가 "어느 패널 + 이미지 기준 0~1"로 되돌린다. 서버는 A·B 를 가리지 않는다.
 *
 * <p>AvatarCropSheet 와 같은 방식이다: 제스처는 runOnJS(true)(이 앱은 reanimated 워클릿을 쓰지 않는다),
 * 화면 반영은 RN Animated.Value, 계산 근거는 ref. 원·X 는 사진과 같은 변환 층에 그려 확대해도 제자리에 붙는다.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { CachedImage } from '../CachedImage';
import { MaterialCommunityIcons } from '../Icon';
import {
  IDENTITY,
  boardLayout,
  boardToImage,
  clampTransform,
  imageToPanel,
  radiusToPanel,
  type BoardLayout,
  type Orientation,
  type ViewTransform,
} from '../../games/spotDiff/coords';
import type { SpotCircle } from '../../types';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';

const ZOOM_STEP = 1.5;

export type CircleTone = 'found' | 'hint' | 'missed';

export interface BoardCircle extends SpotCircle {
  key: string;
  tone: CircleTone;
}

export interface BoardMark {
  key: string;
  x: number;
  y: number;
}

interface Props {
  imageA: string;
  imageB: string;
  imgW: number;
  imgH: number;
  /** 판이 쓸 수 있는 칸 */
  areaW: number;
  areaH: number;
  orientation: Orientation;
  circles: BoardCircle[];
  /** 오답 X — 잠깐 보였다 사라진다(부모가 목록에서 뺀다) */
  marks: BoardMark[];
  /** 없으면 탭을 받지 않는다(결과 보기) */
  onTap?: (x: number, y: number) => void;
}

export function SpotDiffBoard({ imageA, imageB, imgW, imgH, areaW, areaH, orientation, circles, marks, onTap }: Props) {
  const layout = useMemo(
    () => boardLayout(areaW, areaH, imgW, imgH, orientation, spacing.sm),
    [areaW, areaH, imgW, imgH, orientation],
  );
  const panelW = layout.panels[0].width;
  const panelH = layout.panels[0].height;

  const [scaleAnim] = useState(() => new Animated.Value(1));
  const [xAnim] = useState(() => new Animated.Value(0));
  const [yAnim] = useState(() => new Animated.Value(0));
  const live = useRef<ViewTransform>(IDENTITY);
  // 제스처는 한 번 만들고 최신 값은 ref 로 읽는다(제스처를 다시 만들면 진행 중인 끌기가 끊긴다)
  const onTapRef = useRef(onTap);
  const layoutRef = useRef(layout);
  useEffect(() => {
    onTapRef.current = onTap;
    layoutRef.current = layout;
  }, [onTap, layout]);

  const apply = useCallback(
    (next: ViewTransform) => {
      const v = clampTransform(next, panelW, panelH);
      live.current = v;
      scaleAnim.setValue(v.scale);
      xAnim.setValue(v.tx);
      yAnim.setValue(v.ty);
    },
    [panelW, panelH, scaleAnim, xAnim, yAnim],
  );

  // 패널 크기가 바뀌면(회전·창 크기) 지금 위치를 새 한계에 다시 가둔다
  useEffect(() => {
    apply(live.current);
  }, [apply]);

  // 다른 퍼즐로 바뀌면 처음 크기로
  useEffect(() => {
    apply(IDENTITY);
  }, [imageA, apply]);

  const zoom = useCallback(
    (raw: number) => {
      const from = live.current;
      const next = clampTransform({ ...from, scale: raw }, panelW, panelH);
      const k = next.scale / from.scale;
      apply({ scale: next.scale, tx: from.tx * k, ty: from.ty * k });
    },
    [apply, panelW, panelH],
  );

  // 웹·접근성용 — 두 손가락 확대가 없는 환경에서도 확대·이동할 수 있게
  const zoomIn = useCallback(() => zoom(live.current.scale * ZOOM_STEP), [zoom]);
  const zoomOut = useCallback(() => zoom(live.current.scale / ZOOM_STEP), [zoom]);
  const reset = useCallback(() => apply(IDENTITY), [apply]);

  // 아래 콜백들은 렌더 중이 아니라 제스처 이벤트 때 ref 를 읽는다 — react-hooks/refs 는 Gesture 빌더 안의 함수를
  // 이벤트 핸들러로 알아보지 못해 오탐한다(AvatarCropSheet 도 같다)
  const gesture = useMemo(() => {
    // 끄는 것과 누르는 것을 가른다 — 조금이라도 끌면 탭이 아니다(확대해서 둘러보다 오답이 나지 않게)
    const pan = Gesture.Pan()
      .runOnJS(true)
      .minDistance(6)
      // eslint-disable-next-line react-hooks/refs
      .onChange((e) => {
        const from = live.current;
        apply({ scale: from.scale, tx: from.tx + e.changeX, ty: from.ty + e.changeY });
      });
    const pinch = Gesture.Pinch()
      .runOnJS(true)
      // eslint-disable-next-line react-hooks/refs
      .onChange((e) => zoom(live.current.scale * e.scaleChange));
    const tap = Gesture.Tap()
      .runOnJS(true)
      .maxDistance(6)
      // eslint-disable-next-line react-hooks/refs
      .onEnd((e, success) => {
        if (!success || !onTapRef.current) return;
        const p = boardToImage(e.x, e.y, layoutRef.current, live.current);
        if (p) onTapRef.current(p.x, p.y);
      });
    return Gesture.Race(Gesture.Simultaneous(pan, pinch), tap);
  }, [apply, zoom]);

  const transform = [{ translateX: xAnim }, { translateY: yAnim }, { scale: scaleAnim }];

  const renderPanel = (uri: string, i: 0 | 1, label: string) => {
    const p = layout.panels[i];
    return (
      <View
        key={i}
        style={[styles.panel, { left: p.x, top: p.y, width: p.width, height: p.height }]}
        accessibilityLabel={label}
      >
        <Animated.View style={{ width: p.width, height: p.height, transform }}>
          <View style={{ position: 'absolute', left: layout.image.x, top: layout.image.y }}>
            <CachedImage
              uri={uri}
              style={{ width: layout.image.width, height: layout.image.height }}
              contentFit="fill"
            />
          </View>
          {circles.map((c) => (
            <Ring key={`${i}-${c.key}`} circle={c} layout={layout} />
          ))}
          {marks.map((m) => (
            <Cross key={`${i}-${m.key}`} mark={m} layout={layout} />
          ))}
        </Animated.View>
      </View>
    );
  };

  return (
    <View style={{ alignItems: 'center' }}>
      <GestureDetector gesture={gesture}>
        <View style={{ width: layout.width, height: layout.height }} collapsable={false}>
          {renderPanel(imageA, 0, '원본 사진')}
          {renderPanel(imageB, 1, '바뀐 사진')}
        </View>
      </GestureDetector>
      <View style={styles.zoomRow}>
        <ZoomButton icon="minus" label="축소" onPress={zoomOut} />
        <ZoomButton icon="refresh" label="원래 크기" onPress={reset} />
        <ZoomButton icon="plus" label="확대" onPress={zoomIn} />
      </View>
    </View>
  );
}

function Ring({ circle, layout }: { circle: BoardCircle; layout: BoardLayout }) {
  const c = imageToPanel(circle.cx, circle.cy, layout);
  const r = Math.max(10, radiusToPanel(circle.r, layout));
  const tone = circle.tone === 'found' ? styles.ringFound : circle.tone === 'hint' ? styles.ringHint : styles.ringMissed;
  return (
    <View
      pointerEvents="none"
      style={[styles.ring, tone, { left: c.x - r, top: c.y - r, width: r * 2, height: r * 2, borderRadius: r }]}
    />
  );
}

function Cross({ mark, layout }: { mark: BoardMark; layout: BoardLayout }) {
  const c = imageToPanel(mark.x, mark.y, layout);
  const s = 22;
  return (
    <View pointerEvents="none" style={[styles.cross, { left: c.x - s / 2, top: c.y - s / 2, width: s, height: s }]}>
      <Text style={styles.crossText}>✕</Text>
    </View>
  );
}

function ZoomButton({ icon, label, onPress }: { icon: 'minus' | 'plus' | 'refresh'; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [styles.zoomBtn, pressed && { opacity: 0.6 }]}
    >
      <MaterialCommunityIcons name={icon} size={20} color={colors.textPrimary} />
    </Pressable>
  );
}

const styles = themedStyles((colors) => ({
  panel: {
    position: 'absolute',
    overflow: 'hidden',
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  ring: { position: 'absolute', borderWidth: 3 },
  // 사진 위라 앱 팔레트가 아닌 고정색 — 어떤 사진 위에서도 보이게 흰 테두리를 겹친다
  ringFound: { borderColor: '#22C55E', shadowColor: '#FFFFFF', shadowOpacity: 1, shadowRadius: 2, shadowOffset: { width: 0, height: 0 } },
  ringHint: { borderColor: '#FFFFFF', backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 2 },
  ringMissed: { borderColor: '#F43F5E', shadowColor: '#FFFFFF', shadowOpacity: 1, shadowRadius: 2, shadowOffset: { width: 0, height: 0 } },
  cross: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  crossText: {
    color: '#F43F5E',
    fontSize: 22,
    fontWeight: '900',
    textShadowColor: '#FFFFFF',
    textShadowRadius: 3,
    lineHeight: 22,
  },
  zoomRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  zoomBtn: {
    width: 40,
    height: 32,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomText: { fontSize: fontSize.caption },
}));
