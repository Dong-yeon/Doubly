/**
 * 지도에서 핀을 눌렀을 때 시트 미리보기에 뜨는 카드 한 장 — 이름·카테고리·나/상대 별점·최근 방문 + [다녀왔어요] [상세].
 *
 * <p>카드 본문을 누르면 상세로 간다. 버튼 둘은 본문 버튼의 <b>형제</b>다(버튼 안 버튼 금지 — verify:nested-buttons).
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { LovelichelinBadge } from '../../components/LovelichelinBadge';
import { stars } from '../../utils/ratingStars';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';
import type { Place } from '../../types';

interface Props {
  place: Place;
  partnerName: string | null;
  onOpen: () => void;
  onVisit: () => void;
}

export function PlacePinCard({ place, partnerName, onOpen, onVisit }: Props) {
  const partner = partnerName ?? '상대';
  const visited = place.visitCount > 0 && place.lastVisitedAt;
  return (
    <View style={styles.card}>
      <Pressable
        onPress={onOpen}
        style={({ pressed }) => [styles.body, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${place.name} 상세 보기`}
      >
        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={1}>
            {place.name}
          </Text>
          {place.lovelichelinTier > 0 ? <LovelichelinBadge tier={place.lovelichelinTier} size="sm" /> : null}
        </View>
        {place.category ? <Text style={styles.category}>{place.category}</Text> : null}
        <View style={styles.ratingRow}>
          <Text style={[styles.rating, { color: colors.me }]}>나 {place.myRating ? stars(place.myRating) : '미평가'}</Text>
          <Text style={[styles.rating, { color: colors.partner }]} numberOfLines={1}>
            {partner} {place.partnerRating ? stars(place.partnerRating) : '미평가'}
          </Text>
        </View>
        <Text style={styles.visit}>
          {visited ? `최근 방문 ${place.lastVisitedAt} · ${place.visitCount}회` : '아직 안 가봤어요'}
        </Text>
      </Pressable>
      <View style={styles.actions}>
        <Button title="다녀왔어요" size="sm" onPress={onVisit} style={styles.action} />
        <Button title="상세" size="sm" variant="secondary" onPress={onOpen} style={styles.action} />
      </View>
    </View>
  );
}

const styles = themedStyles((colors) => ({
  card: {
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm,
  },
  body: { gap: spacing.xxs },
  pressed: { opacity: 0.7 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flexShrink: 1, fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  category: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '600' },
  ratingRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xxs },
  rating: { fontSize: fontSize.caption, fontWeight: '700', flexShrink: 1 },
  visit: { fontSize: fontSize.caption, color: colors.textPrimary, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1 },
}));
