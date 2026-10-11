/**
 * 스티커 추천 줄 — 입력창 바로 위, SpellCheckBar 와 같은 자리·같은 톤.
 *
 * <p>카톡의 "키워드 이모티콘"처럼 <b>바꿔주지 않고 보여준다</b>. 탭하면 그 스티커가 나가고
 * 입력창의 글은 그대로 둔다 — "나도 사랑해"를 치다 그림을 곁들인 사람의 문장을 지우면 안 된다.
 *
 * <p>캐릭터 스티커와 움직이는 이모티콘이 한 줄에 선다. 움직이는 이모티콘도 여기서는
 * <b>정적 썸네일</b>이다 — 막대에서 여섯 개가 한꺼번에 움직이면 타이핑 중인 눈을 뺏는다
 * (animatedStickers.ts 의 "격자에는 정적 PNG" 와 같은 이유).
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Image, View } from 'react-native';
import { MaterialCommunityIcons } from './Icon';
import { stickerImageOf } from '../constants/stickerImages';
import { animatedStickerOf } from '../constants/animatedStickers';
import { remoteStickerOf } from '../store/remoteStickerStore';
import type { StickerSuggestion } from '../utils/stickerCodes';
import { colors, spacing, radius } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';

interface Props {
  items: StickerSuggestion[];
  onPick: (item: StickerSuggestion) => void;
  /** X — 이번 입력 동안은 다시 띄우지 않는다(호출부가 기억한다) */
  onDismiss: () => void;
  /** 캐릭터 스티커 길게 누르기 — 입력 중인 문장을 문구로 넣은 "문구 넣기" 시트를 연다 */
  onCompose?: (item: StickerSuggestion) => void;
}

function thumbOf(item: StickerSuggestion) {
  if (item.kind === 'image') return stickerImageOf(item.code)?.source;
  const bundled = animatedStickerOf(item.code)?.thumb;
  if (bundled) return bundled;
  // 서버 배포 이모티콘 — 패널에서 이미 받은 썸네일이면 디스크 캐시에서 나온다
  const remote = remoteStickerOf(item.code);
  return remote ? { uri: remote.thumbUrl } : undefined;
}

export function StickerSuggestBar({ items, onPick, onDismiss, onCompose }: Props) {
  if (items.length === 0) return null;
  return (
    <View style={styles.bar}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        style={styles.scroll}
        contentContainerStyle={styles.row}
      >
        {items.map((item) => {
          const source = thumbOf(item);
          if (!source) return null;
          const composable = !!onCompose && item.kind === 'image';
          return (
            <Pressable
              key={`${item.kind}:${item.code}`}
              onPress={() => onPick(item)}
              onLongPress={composable ? () => onCompose?.(item) : undefined}
              delayLongPress={350}
              accessibilityRole="button"
              accessibilityLabel={`${item.label} ${item.kind === 'animated' ? '움직이는 이모티콘' : '스티커'} 보내기${composable ? '. 길게 누르면 지금 쓰는 말을 넣어 보내기' : ''}`}
              style={({ pressed }) => [styles.item, pressed && styles.pressed]}
            >
              <Image source={source} style={styles.image} resizeMode="contain" />
            </Pressable>
          );
        })}
      </ScrollView>
      <Pressable
        onPress={onDismiss}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="스티커 추천 닫기"
        style={styles.close}
      >
        <MaterialCommunityIcons name="close" size={18} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = themedStyles((colors) => ({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  scroll: { flex: 1 },
  row: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, gap: spacing.xs },
  item: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  pressed: { opacity: 0.6 },
  image: { width: 48, height: 48 },
  close: { paddingHorizontal: spacing.md, alignSelf: 'stretch', justifyContent: 'center' },
}));
