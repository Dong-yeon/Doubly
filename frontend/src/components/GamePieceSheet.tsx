/**
 * 게임 말 얼굴 고르기 — 우리 이모지 중 하나(내 얼굴·상대 얼굴 모두). 고른 하나를 나도 상대도 계속 본다.
 *
 * <p>예전엔 판 상황마다 표정을 바꿨는데 어지럽다는 의견이 있었다(사용자, 2026-10-12). 서버에 저장한다
 * (GET/PUT /games/pieces, V137) — 상대 화면에도 내가 고른 얼굴이 떠야 하므로.
 */
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Sheet } from './Sheet';
import type { CoupleEmoji } from '../types';
import { fontSize, radius, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';

interface Props {
  visible: boolean;
  onClose: () => void;
  emojis: CoupleEmoji[];
  /** 지금 고른 이모지 — 없으면 기본 말 */
  selectedId: number | null;
  onSelect: (emojiId: number | null) => void;
  /** 기본 말 색(내 색) */
  baseColor: string;
}

export function GamePieceSheet({ visible, onClose, emojis, selectedId, onSelect, baseColor }: Props) {
  // 최신 세트부터 — 같은 사람의 표정이 한데 모이게
  const sorted = [...emojis].sort((a, b) => b.id - a.id);
  return (
    <Sheet visible={visible} onClose={onClose} position="bottom" cardStyle={styles.card}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>내 말 고르기</Text>
        <Text style={styles.desc}>고른 얼굴이 판 위 내 말이 돼요. 상대 화면에도 똑같이 보여요.</Text>
        <View style={styles.grid}>
          <Pressable
            onPress={() => onSelect(null)}
            accessibilityRole="button"
            accessibilityLabel="기본 말"
            style={[styles.cell, selectedId == null && styles.cellOn]}
          >
            <View style={[styles.base, { backgroundColor: baseColor }]} />
            <Text style={styles.label}>기본</Text>
          </Pressable>
          {sorted.map((e) => (
            <Pressable
              key={e.id}
              onPress={() => onSelect(e.id)}
              accessibilityRole="button"
              accessibilityLabel={`${e.label} 얼굴`}
              style={[styles.cell, selectedId === e.id && styles.cellOn]}
            >
              <Image source={{ uri: e.imageUrl }} style={styles.face} contentFit="contain" />
              <Text style={styles.label} numberOfLines={1}>{e.label}</Text>
            </Pressable>
          ))}
        </View>
        {emojis.length === 0 ? (
          <Text style={styles.desc}>아직 우리 이모지가 없어요. 채팅의 우리 이모지에서 만들 수 있어요.</Text>
        ) : null}
      </ScrollView>
    </Sheet>
  );
}

const styles = themedStyles((colors) => ({
  card: { maxHeight: '80%' },
  body: { padding: spacing.lg, gap: spacing.sm },
  title: { fontSize: fontSize.title, fontWeight: '800', color: colors.textPrimary },
  desc: { fontSize: fontSize.caption, color: colors.textSecondary, lineHeight: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  cell: {
    width: 72,
    alignItems: 'center',
    gap: 4,
    padding: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cellOn: { borderColor: colors.primary, backgroundColor: colors.primaryBg },
  face: { width: 52, height: 52 },
  base: { width: 40, height: 40, borderRadius: 20, marginVertical: 6 },
  label: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },
}));
