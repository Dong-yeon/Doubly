/**
 * 캐치마인드 드로잉 캔버스 — docs/CATCH_MIND_2026-09-14.md.
 *
 * <p><b>Skia 가 아니라 react-native-svg 로 그린다.</b> Skia 는 이 앱에 들어와 있지 않고,
 * 넣으면 웹 번들에 CanvasKit WASM 수 MB 가 따라붙어 게임 화면을 .web.tsx 스텁으로 빼야 한다.
 * 캐치마인드의 획은 폴리라인이라 SVG Path 로 충분하고, 그러면 웹에서도 같은 코드가 돈다.
 *
 * <p>좌표는 <b>0~1000 정규화</b>해서 내보낸다. 그린 사람의 화면 크기와 맞히는 사람의 화면
 * 크기가 달라도 같은 그림이 되어야 하기 때문이다 — 저장값이 px 이면 태블릿에서 그린 그림이
 * 폰에서 잘린다.
 */
import React, { useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { LayoutChangeEvent, PanResponder, Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { MaterialCommunityIcons } from './Icon';
import { haptics } from '../utils/haptics';
import { fontSize, radius, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';

/** 서버 Strokes.COORD_MAX 와 같아야 한다 */
const COORD_MAX = 1000;
/**
 * 색 팔레트 — 인덱스로 저장하므로 <b>순서를 바꾸면 지난 그림의 색이 바뀐다</b>. 뒤에만 더할 것.
 * 판 색·돌 색과 같은 이유로 테마 토큰을 쓰지 않는다(다크에서도 같은 그림이어야 한다).
 */
export const INK_COLORS = ['#1E1E1E', '#E5484D', '#F5A524', '#30A46C', '#3E63DD', '#8E4EC6'];
/** 굵기 — 인덱스로 저장. 정규화 좌표계(0~1000) 기준 값이다 */
const INK_WIDTHS = [6, 14, 28];
/**
 * 획 수 상한 — 서버의 길이 제한(60KB)에 닿기 전에 앱이 먼저 막는다.
 * 여기서 막지 않으면 한참 그린 뒤 전송 단계에서 거절당한다.
 */
const MAX_STROKES = 120;
/** 이만큼 안 움직이면 점을 버린다 — 손떨림까지 저장하면 용량만 커지고 그림은 그대로다 */
const MIN_STEP = 6;

interface Stroke {
  color: number;
  width: number;
  /** [x, y, x, y, ...] — 0~1000 정규화 */
  points: number[];
}

export interface DrawingCanvasHandle {
  /** 서버 형식 문자열 — 빈 그림이면 null */
  serialize: () => string | null;
}

/** 획 목록 → 서버 형식 "색,굵기,x1,y1,...;..." */
function serializeStrokes(strokes: Stroke[]): string | null {
  if (strokes.length === 0) return null;
  return strokes
    .map((s) => [s.color, s.width, ...s.points].join(','))
    .join(';');
}

/** 서버 형식 → 획 목록. 깨진 값은 건너뛴다(그림 하나 때문에 화면이 죽지 않게) */
export function parseStrokes(encoded: string | null | undefined): Stroke[] {
  if (!encoded) return [];
  const out: Stroke[] = [];
  for (const chunk of encoded.split(';')) {
    const values = chunk.split(',').map(Number);
    if (values.length < 4 || values.some((v) => !Number.isFinite(v))) continue;
    const [color, width, ...points] = values;
    if (points.length % 2 !== 0) continue;
    out.push({ color, width, points });
  }
  return out;
}

/** 획 하나 → SVG path. 점 하나짜리 획(탭)은 아주 짧은 선으로 그려 점이 보이게 한다 */
export function strokeToPath(stroke: Stroke, scale: number): string {
  const { points } = stroke;
  if (points.length < 2) return '';
  const x = (i: number) => (points[i] * scale).toFixed(1);
  const y = (i: number) => (points[i + 1] * scale).toFixed(1);
  if (points.length === 2) return `M${x(0)},${y(0)} l0.1,0`;
  let d = `M${x(0)},${y(0)}`;
  for (let i = 2; i < points.length; i += 2) d += ` L${x(i)},${y(i)}`;
  return d;
}

/** 읽기 전용 그림 — 맞히는 화면·기록에서 쓴다 */
export function DrawingView({ strokes, size }: { strokes: string | null | undefined; size: number }) {
  const parsed = useMemo(() => parseStrokes(strokes), [strokes]);
  const scale = size / COORD_MAX;
  return (
    <View style={[styles.surface, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        {parsed.map((s, i) => (
          <Path
            key={i}
            d={strokeToPath(s, scale)}
            stroke={INK_COLORS[s.color] ?? INK_COLORS[0]}
            strokeWidth={(INK_WIDTHS[s.width] ?? INK_WIDTHS[0]) * scale}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ))}
      </Svg>
    </View>
  );
}

interface DrawingCanvasProps {
  onChange?: (empty: boolean) => void;
  /**
   * 획을 긋는 동안 {@code true} — <b>부모가 세로 스크롤을 잠그는 데 쓴다</b>.
   *
   * <p>아래 PanResponder 의 {@code onShouldBlockNativeResponder} 는 안드로이드 전용이고,
   * iOS 의 {@code UIScrollView.panGestureRecognizer} 는 JS 리스폰더 시스템과 경쟁하지 않는다
   * — 그래서 iOS 에서는 그리는 동안 화면이 같이 내려갔다. RNGH 로 막는 길도 없다:
   * RNGH 의 {@code FlatList} 는 ref 를 내부 {@code RNFlatList} 에 넘기고 제스처 래퍼는
   * {@code renderScrollComponent} 안에만 있어서({@code GestureComponents.js}),
   * {@code blocksExternalGesture(ref)} 가 {@code handlerTag} 를 못 찾고 조용히 무시된다.
   * 남은 방법은 부모가 {@code scrollEnabled} 를 끄는 것뿐이다.
   */
  onDrawingChange?: (drawing: boolean) => void;
}

export const DrawingCanvas = React.forwardRef<DrawingCanvasHandle, DrawingCanvasProps>(
  function DrawingCanvas({ onChange, onDrawingChange }, ref) {
    const [size, setSize] = useState(0);
    const [color, setColor] = useState(0);
    const [width, setWidth] = useState(1);

    /*
     * 확정된 획과 "그리는 중인 획"을 <b>한 state 에 같이</b> 둔다. 나눠 두면 손을 떼는 순간
     * (draft → strokes 이동) 두 번의 setState 사이에 획이 사라졌다 나타나고, PanResponder
     * 핸들러가 최신 값을 보려면 ref 를 렌더 중에 읽어야 한다. 하나로 묶으면 전부 함수형
     * 갱신으로 끝나서 클로저가 낡을 일이 없다.
     */
    const [board, setBoard] = useState<{ strokes: Stroke[]; draft: Stroke | null }>({
      strokes: [],
      draft: null,
    });
    const { strokes, draft } = board;

    useImperativeHandle(
      ref,
      () => ({ serialize: () => serializeStrokes(draft ? [...strokes, draft] : strokes) }),
      [strokes, draft],
    );

    // 부모에게 "비었는지"를 알린다 — 갱신 함수 안에서 부르면 StrictMode 이중 호출에 걸린다
    useEffect(() => onChange?.(strokes.length === 0), [strokes.length, onChange]);

    const toCoord = useCallback(
      (value: number) => {
        if (size <= 0) return 0;
        return Math.max(0, Math.min(COORD_MAX, Math.round((value / size) * COORD_MAX)));
      },
      [size],
    );

    /*
     * 색·굵기·크기가 바뀌면 PanResponder 를 다시 만든다. 긋는 도중에 바뀌는 값이 아니고
     * (도구는 획과 획 사이에 고른다), 이미 시작된 제스처는 RN 이 붙잡아 둔 예전 핸들러로
     * 끝나므로 획이 끊기지 않는다.
     */
    const panResponder = useMemo(
      () =>
        PanResponder.create({
          onStartShouldSetPanResponder: () => true,
          onMoveShouldSetPanResponder: () => true,
          // 스크롤뷰가 세로 제스처를 가로채면 위아래로 긋는 획이 끊긴다
          onPanResponderTerminationRequest: () => false,
          onShouldBlockNativeResponder: () => true,

          onPanResponderGrant: (e) => {
            /*
             * 손이 닿는 순간(움직이기 전) 부모 스크롤을 잠근다 — iOS 스크롤은 몇 px 움직인
             * 뒤에야 시작하므로 그 사이에 prop 이 내려간다. 늦더라도 시작된 스크롤이 즉시
             * 멈추므로 최악이 "몇 px 흔들림"이다.
             */
            onDrawingChange?.(true);
            const point = [toCoord(e.nativeEvent.locationX), toCoord(e.nativeEvent.locationY)];
            setBoard((b) =>
              b.strokes.length >= MAX_STROKES ? b : { ...b, draft: { color, width, points: point } },
            );
          },
          onPanResponderMove: (e) => {
            const x = toCoord(e.nativeEvent.locationX);
            const y = toCoord(e.nativeEvent.locationY);
            setBoard((b) => {
              if (!b.draft) return b;
              const points = b.draft.points;
              const dx = Math.abs(x - points[points.length - 2]);
              const dy = Math.abs(y - points[points.length - 1]);
              // 손떨림까지 저장하면 용량만 커지고 그림은 그대로다
              if (dx + dy < MIN_STEP) return b;
              return { ...b, draft: { ...b.draft, points: [...points, x, y] } };
            });
          },
          onPanResponderRelease: () => {
            onDrawingChange?.(false);
            setBoard((b) => (b.draft ? { strokes: [...b.strokes, b.draft], draft: null } : b));
          },
          /*
           * terminationRequest 를 거절해도 네이티브가 강제로 빼앗는 경로가 남아 있다.
           * 여기서 풀지 않으면 스크롤이 영구히 잠긴 화면이 된다 — 획 하나보다 큰 사고다.
           */
          onPanResponderTerminate: () => {
            onDrawingChange?.(false);
            setBoard((b) => (b.draft ? { strokes: [...b.strokes, b.draft], draft: null } : b));
          },
        }),
      [toCoord, color, width, onDrawingChange],
    );

    const undo = () => {
      setBoard((b) => ({ strokes: b.strokes.slice(0, -1), draft: null }));
      haptics.light();
    };

    const clear = () => {
      setBoard({ strokes: [], draft: null });
      haptics.light();
    };

    const onLayout = (e: LayoutChangeEvent) => setSize(e.nativeEvent.layout.width);
    const scale = size / COORD_MAX;
    const visible = draft ? [...strokes, draft] : strokes;
    const full = strokes.length >= MAX_STROKES;

    return (
      <View>
        <View style={styles.surface} onLayout={onLayout} {...panResponder.panHandlers}>
          {size > 0 ? (
            <Svg width={size} height={size} pointerEvents="none">
              {visible.map((s, i) => (
                <Path
                  key={i}
                  d={strokeToPath(s, scale)}
                  stroke={INK_COLORS[s.color] ?? INK_COLORS[0]}
                  strokeWidth={(INK_WIDTHS[s.width] ?? INK_WIDTHS[0]) * scale}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              ))}
            </Svg>
          ) : null}
          {visible.length === 0 ? (
            <Text style={styles.placeholder}>여기에 그려보세요</Text>
          ) : null}
        </View>

        <View style={styles.toolbar}>
          <View style={styles.colorRow}>
            {INK_COLORS.map((c, i) => (
              <Pressable
                key={c}
                onPress={() => setColor(i)}
                accessibilityRole="button"
                accessibilityLabel={`${i + 1}번 색`}
                accessibilityState={{ selected: color === i }}
                style={[styles.swatch, { backgroundColor: c }, color === i && styles.swatchOn]}
              />
            ))}
          </View>
          <View style={styles.colorRow}>
            {INK_WIDTHS.map((w, i) => (
              <Pressable
                key={w}
                onPress={() => setWidth(i)}
                accessibilityRole="button"
                accessibilityLabel={`굵기 ${i + 1}`}
                accessibilityState={{ selected: width === i }}
                style={[styles.widthKey, width === i && styles.widthKeyOn]}
              >
                <View style={[styles.widthDot, { width: 4 + i * 5, height: 4 + i * 5, borderRadius: 8 }]} />
              </Pressable>
            ))}
            <Pressable
              onPress={undo}
              disabled={strokes.length === 0}
              accessibilityRole="button"
              accessibilityLabel="한 획 되돌리기"
              style={[styles.widthKey, strokes.length === 0 && styles.keyOff]}
            >
              <MaterialCommunityIcons name="undo" size={20} />
            </Pressable>
            <Pressable
              onPress={clear}
              disabled={strokes.length === 0}
              accessibilityRole="button"
              accessibilityLabel="전부 지우기"
              style={[styles.widthKey, strokes.length === 0 && styles.keyOff]}
            >
              <MaterialCommunityIcons name="eraser" size={20} />
            </Pressable>
          </View>
        </View>
        {full ? <Text style={styles.full}>획이 가득 찼어요. 지우고 다시 그리거나 이대로 보내세요.</Text> : null}
      </View>
    );
  },
);

const styles = themedStyles((colors) => ({
  /* 종이색은 테마 토큰을 쓰지 않는다 — 다크에서도 같은 그림이어야 선이 읽힌다 */
  surface: {
    aspectRatio: 1,
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholder: { position: 'absolute', color: '#B9B9B9', fontSize: fontSize.body, fontWeight: '700' },
  toolbar: { marginTop: spacing.sm, gap: spacing.xs },
  colorRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xs },
  swatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: 'transparent' },
  swatchOn: { borderColor: colors.primary, transform: [{ scale: 1.15 }] },
  widthKey: {
    width: 44,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  widthKeyOn: { borderColor: colors.primary, backgroundColor: colors.primaryBg },
  widthDot: { backgroundColor: colors.textPrimary },
  keyOff: { opacity: 0.35 },
  full: { fontSize: fontSize.caption, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xs },
}));
