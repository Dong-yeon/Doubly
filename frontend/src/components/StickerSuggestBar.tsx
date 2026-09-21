/**
 * 스티커 추천 줄 — 입력창 바로 위, SpellCheckBar 와 같은 자리·같은 톤.
 *
 * <p>카톡의 "키워드 이모티콘"처럼 <b>바꿔주지 않고 보여준다</b>. 탭하면 그 스티커가 나가고
 * 입력창은 비운다. 그냥 계속 치면 사라진다(글이 길어지면 추천 조건에서 벗어난다).
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Image, View } from 'react-native';
import { stickerImageOf } from '../constants/stickerImages';
import type { StickerCodeEntry } from '../utils/stickerCodes';
import { spacing, radius } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';

interface Props {
  items: StickerCodeEntry[];
  onPick: (entry: StickerCodeEntry) => void;
}

export function StickerSuggestBar({ items, onPick }: Props) {
  if (items.length === 0) return null;
  return (
    <View style={styles.bar}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={styles.row}>
        {items.map((e) => {
          const def = stickerImageOf(e.code);
          if (!def) return null;
          return (
            <Pressable
              key={e.code}
              onPress={() => onPick(e)}
              accessibilityRole="button"
              accessibilityLabel={`${e.character} ${e.label} 스티커 보내기`}
              style={({ pressed }) => [styles.item, pressed && styles.pressed]}
            >
              <Image source={def.source} style={styles.image} resizeMode="contain" />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = themedStyles((colors) => ({
  bar: {
    backgroundColor: colors.surfaceAlt,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
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
}));
