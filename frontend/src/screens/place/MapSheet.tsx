/**
 * 지도 위 하단 시트 — 3단 높이(미리보기 / 절반 / 전체). 럽슐랭 장소 모드의 목록을 담는다.
 *
 * <p><b>왜 라이브러리가 아닌가</b>(2026-10-05): 바텀시트 라이브러리를 더하면 의존성이 늘고, 네이티브 모듈을 끼면
 * 빌드가 필요해진다(EAS Update 로 못 나간다). 이미 있는 react-native-gesture-handler + reanimated 로 충분하다 —
 * 시트에 필요한 건 "세 높이 중 하나로 끌어 놓기"뿐이다. 결정 기록: docs/LOVELICHELIN_MAP_FIRST_2026-10-05.md.
 *
 * <p><b>끄는 곳은 손잡이·머리뿐이다.</b> 목록 본문까지 끌기를 받으면 목록 스크롤과 시트 끌기가 같은 손가락을
 * 다툰다(맨 위에서 아래로 끌면 시트, 아니면 스크롤 — 플랫폼마다 판정이 갈린다). 본문은 늘 스크롤만 한다.
 * 손잡이는 눌러도 바뀐다 — 미리보기 ↔ 중간을 오가고, 전체에서는 중간으로 내려온다(끌기 어려운 사람·웹 마우스용).
 * 예전엔 미리보기→중간→전체→미리보기로 <b>위로만</b> 돌아서, 검색 뒤 중간에 선 시트를 내리려고 누르면 오히려
 * 전체로 올라갔다("검색한 다음에 패널을 내리는 방법이 없다", 2026-10-06). 스크린 리더는 increment/decrement 로 세 단을 다 간다.
 *
 * <p>시트는 지도 <b>위에 겹친 형제 View</b> 라 시트 위의 터치는 지도(WebView/iframe)로 새지 않는다 —
 * 지도 팬·줌과 시트 끌기가 손가락을 나눠 갖지 않는다.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';
import { useReduceMotion } from '../../hooks/useOneShotMotion';

export type SheetSnap = 'peek' | 'half' | 'full';

const ORDER: SheetSnap[] = ['peek', 'half', 'full'];
const SNAP_LABEL: Record<SheetSnap, string> = { peek: '작게', half: '중간', full: '전체' };

/**
 * 가운데 단의 시트 위 끝 — 지도 영역 높이의 60%. 지도 60 : 목록 40(2026-10-06 사용자 요청 — 50:50 이면 지도가 좁다).
 */
export const SHEET_HALF_RATIO = 0.6;

interface Props {
  /** 시트가 놓인 영역(지도 영역) 높이 — 0 이면 아직 재지 못한 것 */
  containerHeight: number;
  /** 전체 높이일 때 시트 위 끝 — 지도 위 검색창·칩 아래 */
  fullTop: number;
  /** 미리보기 높이(손잡이 포함) — 카드 한 장이 들어가는 높이 */
  peekHeight: number;
  snap: SheetSnap;
  onSnapChange: (snap: SheetSnap) => void;
  /** 손잡이 아래 고정 머리(제목·버튼) — 이 영역도 끌기를 받는다 */
  header: React.ReactNode;
  children: React.ReactNode;
}

/** 각 단의 시트 위 끝(y) — 영역 맨 위가 0 */
export function sheetTops(containerHeight: number, fullTop: number, peekHeight: number): Record<SheetSnap, number> {
  const peek = Math.max(fullTop, containerHeight - peekHeight);
  const half = Math.min(peek, Math.max(fullTop, Math.round(containerHeight * SHEET_HALF_RATIO)));
  return { peek, half, full: fullTop };
}

export function MapSheet({ containerHeight, fullTop, peekHeight, snap, onSnapChange, header, children }: Props) {
  const reduceMotion = useReduceMotion();
  const tops = useMemo(() => sheetTops(containerHeight, fullTop, peekHeight), [containerHeight, fullTop, peekHeight]);
  const top = useSharedValue(tops[snap]);
  const start = useSharedValue(0);

  // 단이 바뀌거나 영역 크기가 바뀌면(회전·키보드·창 크기) 그 단의 자리로 간다.
  // 처음 크기를 잰 순간은 애니메이션 없이 바로 놓는다 — 아니면 열 때마다 시트가 위에서 미끄러져 내려온다
  const placed = useRef(false);
  useEffect(() => {
    if (containerHeight <= 0) return;
    const instant = reduceMotion || !placed.current;
    placed.current = true;
    top.set(instant ? tops[snap] : withTiming(tops[snap], { duration: 220 }));
  }, [snap, tops, reduceMotion, top, containerHeight]);

  const pan = useMemo(() => {
    const { peek, half, full } = tops;
    return Gesture.Pan()
      .activeOffsetY([-6, 6])
      .onStart(() => {
        start.set(top.get());
      })
      .onUpdate((e) => {
        const next = start.get() + e.translationY;
        top.set(Math.min(peek, Math.max(full, next)));
      })
      .onEnd((e) => {
        // 빠르게 튕기면 그 방향의 다음 단, 아니면 가장 가까운 단
        const y = top.get();
        let target: SheetSnap;
        if (e.velocityY < -800) target = y > half ? 'half' : 'full';
        else if (e.velocityY > 800) target = y < half ? 'half' : 'peek';
        else {
          const dPeek = Math.abs(y - peek);
          const dHalf = Math.abs(y - half);
          const dFull = Math.abs(y - full);
          target = dFull <= dHalf && dFull <= dPeek ? 'full' : dHalf <= dPeek ? 'half' : 'peek';
        }
        const dest = target === 'peek' ? peek : target === 'half' ? half : full;
        top.set(withTiming(dest, { duration: 200 }));
        scheduleOnRN(onSnapChange, target);
      });
  }, [tops, onSnapChange, start, top]);

  const animated = useAnimatedStyle(() => ({ top: top.get() }));

  const step = (dir: 1 | -1) => {
    const i = ORDER.indexOf(snap);
    const next = ORDER[Math.min(ORDER.length - 1, Math.max(0, i + dir))];
    onSnapChange(next);
  };
  // 손잡이 탭 — 미리보기면 중간으로 올리고, 아니면 한 단 내린다(위 파일 주석)
  const cycle = () => onSnapChange(snap === 'peek' ? 'half' : snap === 'full' ? 'half' : 'peek');

  if (containerHeight <= 0) return null;

  return (
    <Animated.View style={[styles.sheet, animated]}>
      <GestureDetector gesture={pan}>
        <View>
          <Pressable
            onPress={cycle}
            style={styles.handleHit}
            accessibilityRole="adjustable"
            accessibilityLabel={`장소 목록 크기 — ${SNAP_LABEL[snap]}`}
            accessibilityHint={snap === 'peek' ? '누르면 목록을 올려요. 위아래로 끌어도 돼요' : '누르면 목록을 내려요. 위아래로 끌어도 돼요'}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
          >
            <View style={styles.handle} />
          </Pressable>
          {header}
        </View>
      </GestureDetector>
      <View style={styles.body}>{children}</View>
    </Animated.View>
  );
}

const styles = themedStyles((colors) => ({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
    // 지도 위에 떠 있다는 그림자 — 다크에서는 그림자가 안 보여 테두리가 경계를 맡는다
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -2 },
    elevation: 12,
    overflow: 'hidden',
  },
  handleHit: { alignItems: 'center', justifyContent: 'center', height: 28 },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.borderStrong },
  body: { flex: 1, paddingTop: spacing.xs },
}));
