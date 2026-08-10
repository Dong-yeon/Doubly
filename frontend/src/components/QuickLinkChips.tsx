/**
 * 화면 상단 바로가기 줄 — 아이콘+라벨 칩, 가로 스크롤.
 *
 * <p>운동 탭(6개)·식단 탭(2개)이 각자 다른 정렬·스타일의 텍스트 링크를 쓰다 보니
 * 세그먼트로 토글되는 한 화면인데도 서로 다른 화면처럼 느껴졌다. 항목 수와 무관하게
 * 같은 컴포넌트를 써서 톤을 맞춘다.
 *
 * <p>넘치는 항목이 있으면(overflow) 오른쪽에 배경색으로 흐려지는 힌트를 얹어
 * "더 있다"는 걸 알려준다 — 이전엔 스크롤 가능 여부를 알려주는 단서가 전혀 없었다.
 */
import React, { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontSize, radius, spacing } from '../constants/theme';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

export interface QuickLink {
  icon: IconName;
  label: string;
  onPress: () => void;
}

/** hex → [투명, 불투명] 그라데이션 — 화면 배경색을 그대로 따라가도록 하드코딩 대신 계산한다 */
function fadeColors(hex: string): [string, string] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [`rgba(${r},${g},${b},0)`, `rgba(${r},${g},${b},1)`];
}

export function QuickLinkChips({ links }: { links: QuickLink[] }) {
  const [overflow, setOverflow] = useState(false);
  const containerW = useRef(0);
  const contentW = useRef(0);

  const checkOverflow = () => {
    if (containerW.current && contentW.current) {
      setOverflow(contentW.current > containerW.current + 1);
    }
  };

  return (
    <View
      style={styles.wrap}
      onLayout={(e) => {
        containerW.current = e.nativeEvent.layout.width;
        checkOverflow();
      }}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.row}
        onContentSizeChange={(w) => {
          contentW.current = w;
          checkOverflow();
        }}
      >
        {links.map((l) => (
          <TouchableOpacity key={l.label} style={styles.chip} activeOpacity={0.7} onPress={l.onPress}>
            <MaterialCommunityIcons name={l.icon} size={16} color={colors.primary} />
            <Text style={styles.chipText}>{l.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {overflow ? (
        <LinearGradient
          colors={fadeColors(colors.background)}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.fade}
          pointerEvents="none"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 0 },
  scroll: { flexGrow: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 44, // 터치 타깃 권장(44px) — 예전 텍스트 링크는 패딩 없이 글자 높이뿐이었다
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textPrimary },
  fade: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 28 },
});
