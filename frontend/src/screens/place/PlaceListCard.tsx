/**
 * 럽슐랭 장소 목록 카드 — 등급 있는 곳은 매거진 카드, 나머지는 한 줄 카드.
 *
 * <p>지도 기본 화면(하단 시트)과 지도를 못 쓸 때의 목록이 같은 카드를 쓴다 — 예전 PlaceScreen 목록의
 * renderItem 을 그대로 옮겼다(2026-10-05). 시트에서만 "위치 없음" 표시가 붙는다(지도에 핀이 없는 이유).
 */
import React from 'react';
import { Image, Pressable, Text, TouchableOpacity, View } from 'react-native';
import { Card } from '../../components/Card';
import { MaterialCommunityIcons } from '../../components/Icon';
import { LovelichelinBadge } from '../../components/LovelichelinBadge';
import { SoloPickBadge } from '../../components/SoloPickBadge';
import { isSoloPick } from './placeFilters';
import { stars } from '../../utils/ratingStars';
import { localDateOf } from '../../utils/date';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';
import type { Place } from '../../types';

/**
 * 아직 등급이 없는 카드의 한 줄 설명 — 장소·콘텐츠가 같은 문구를 쓴다.
 *
 * <p>예전 문구는 "럽슐랭 탈락 — 재평가하면 다시 등급이 매겨져요" 였다. 내가 ★★★★, 상대가
 * ★★ 를 준 우리 단골집에 앱이 "탈락"이라고 쓰는 셈이라 커플 앱의 어휘가 아니었다. 미슐랭
 * 패러디의 재미는 성공 쪽 어휘(등극·인증)에만 남기고, 실패 쪽은 <b>판정 대신 사실</b>을 쓴다 —
 * 둘의 별점이 갈렸다는 것, 혹은 누구 차례인지.
 */
export function ratingHint(
  item: { myRating?: number | null; partnerRating?: number | null },
  partnerName: string | null,
): string {
  const partner = partnerName ?? '상대';
  if (item.myRating != null && item.partnerRating != null) {
    return `의견이 갈렸어요 · 나 ${stars(item.myRating)} / ${partner} ${stars(item.partnerRating)}`;
  }
  return item.myRating != null
    ? `${partner}님 별점을 기다리고 있어요`
    : `${partner}님이 별점을 남겼어요 · 내 차례예요`;
}

/** 좌표가 없어 지도에 핀이 없는 곳 */
export function hasNoLocation(p: Pick<Place, 'lat' | 'lng'>): boolean {
  return p.lat == null || p.lng == null;
}

interface Props {
  item: Place;
  partnerName: string | null;
  deleting: boolean;
  onPress: () => void;
  onLongPress: () => void;
  /** 주면 좌표 없는 곳에 "위치 없음" 표시를 붙이고, 누르면 이걸 부른다(위치 지정 화면) */
  onFixLocation?: () => void;
}

export function PlaceListCard({ item, partnerName, deleting, onPress, onLongPress, onFixLocation }: Props) {
  const noLocation = onFixLocation != null && hasNoLocation(item);
  // "위치 없음"은 카드 안의 버튼이 아니라 카드 아래 형제다 — 버튼 안 버튼(웹 마크업 오류)을 피한다
  const locationFix = noLocation ? (
    <Pressable
      onPress={onFixLocation}
      style={styles.noLocation}
      accessibilityRole="button"
      accessibilityLabel={`${item.name} 위치 없음 — 지도에 위치 지정하기`}
    >
      <MaterialCommunityIcons name="map-marker-outline" size={14} color={colors.textSecondary} />
      <Text style={styles.noLocationText}>위치 없음 · 지도에 표시하기</Text>
    </Pressable>
  ) : null;

  if (item.lovelichelinTier > 0) {
    return (
      <View style={styles.magazineWrap}>
        <TouchableOpacity
          activeOpacity={0.85}
          // Card 의 style 은 ViewStyle 하나만 받아 배열 병합이 안 된다 — 삭제 중 흐림은 감싸는 쪽에 건다
          style={deleting ? styles.cardDeleting : undefined}
          disabled={deleting}
          onPress={onPress}
          onLongPress={onLongPress}
        >
          <Card elevation="sm" tint="together" style={styles.magazineCard}>
            {item.coverImageUrl ? (
              <Image source={{ uri: item.coverImageUrl }} style={styles.coverPhoto} resizeMode="cover" />
            ) : (
              <View style={styles.coverPlaceholder}>
                <MaterialCommunityIcons name="crown" size={32} color={colors.togetherText} />
              </View>
            )}
            <View style={styles.magazineBody}>
              <View style={styles.magazineHeaderRow}>
                <Text style={styles.magazineName} numberOfLines={2}>
                  {item.name}
                </Text>
                <View style={styles.noShrink}>
                  <LovelichelinBadge tier={item.lovelichelinTier} size="sm" />
                </View>
              </View>
              {item.category ? <Text style={styles.magazineCategory}>{item.category}</Text> : null}
              <View style={styles.magazineRatingRow}>
                <Text style={[styles.magazineRating, { color: colors.me }]}>
                  나 {item.myRating ? stars(item.myRating) : '미평가'}
                </Text>
                <Text style={[styles.magazineRating, { color: colors.partner }]}>
                  상대 {item.partnerRating ? stars(item.partnerRating) : '미평가'}
                </Text>
              </View>
              {item.coverMemo ? (
                <Text style={styles.magazineMemo} numberOfLines={2}>
                  “{item.coverMemo}”
                </Text>
              ) : null}
              {item.lovelichelinCertifiedAt ? (
                <Text style={styles.magazineDate}>{localDateOf(item.lovelichelinCertifiedAt)} 등극</Text>
              ) : null}
            </View>
          </Card>
        </TouchableOpacity>
        {locationFix}
      </View>
    );
  }

  return (
    <View style={styles.cardWrap}>
      <TouchableOpacity
        style={[styles.card, noLocation && styles.cardWithFix, deleting && styles.cardDeleting]}
        activeOpacity={0.7}
        disabled={deleting}
        onPress={onPress}
        onLongPress={onLongPress}
      >
        {/* 이름 한 줄, 태그(카테고리·솔로 픽·여행)는 둘째 줄 — 한 줄에 wrap 하면 긴 이름 사이로 알약이 끼어들었다 */}
        <Text style={styles.name} numberOfLines={2}>
          {item.name}
        </Text>
        {item.category || isSoloPick(item) || item.tripId != null ? (
          <View style={styles.tagRow}>
            {item.category ? (
              <View style={styles.categoryChip}>
                <Text style={styles.categoryText}>{item.category}</Text>
              </View>
            ) : null}
            {isSoloPick(item) ? <SoloPickBadge who={item.myRating != null ? 'me' : 'partner'} size="sm" /> : null}
            {item.tripId != null ? (
              <View style={styles.categoryChip}>
                <MaterialCommunityIcons name="airplane" size={12} color={colors.textSecondary} />
                <Text style={styles.categoryText}>여행에 담김</Text>
              </View>
            ) : null}
          </View>
        ) : null}
        {item.address ? <Text style={styles.address}>{item.address}</Text> : null}
        <View style={styles.cardFooter}>
          {item.visitCount > 0 ? (
            <Text style={styles.visitInfo}>
              {item.avgRating ? `${item.avgRating.toFixed(1)} · ` : ''}방문 {item.visitCount}회
              {item.lastVisitedAt ? ` · 최근 ${item.lastVisitedAt}` : ''}
            </Text>
          ) : null}
        </View>
        {item.myRating != null || item.partnerRating != null ? (
          <Text style={styles.pendingHint}>{ratingHint(item, partnerName)}</Text>
        ) : null}
      </TouchableOpacity>
      {locationFix}
    </View>
  );
}

const styles = themedStyles((colors) => ({
  noShrink: { flexShrink: 0 },
  // 가이드 매거진 카드
  magazineWrap: { marginBottom: spacing.md },
  magazineCard: { padding: 0, overflow: 'hidden' },
  coverPhoto: { width: '100%', aspectRatio: 16 / 9 },
  coverPlaceholder: {
    width: '100%',
    aspectRatio: 16 / 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.togetherBg,
  },
  magazineBody: { padding: spacing.md, gap: spacing.xs },
  magazineHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  magazineName: { flex: 1, fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  magazineCategory: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '600' },
  magazineRatingRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
  magazineRating: { fontSize: fontSize.caption, fontWeight: '700' },
  magazineMemo: { fontSize: fontSize.body, color: colors.textPrimary, fontStyle: 'italic', marginTop: spacing.xs },
  magazineDate: { fontSize: fontSize.micro, color: colors.textSecondary, marginTop: spacing.xs },
  // 장소 목록 카드
  cardWrap: { marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  // 아래에 "위치 없음" 줄이 붙으면 카드와 한 덩어리로 보이게 아래 모서리를 편다
  cardWithFix: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  // 삭제 진행 중 표시 — useDeleteAction (QA_CHECKLIST.md 전역 반복 패턴 7)
  cardDeleting: { opacity: 0.5 },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap', marginTop: spacing.xs },
  name: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryText: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '600' },
  address: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: spacing.xs },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  /*
   * 평점·방문 횟수는 <b>정보 글자지 상태가 아니다</b> — 초록일 이유가 없다(2026-09-23).
   * 선택 상태를 말하는 초록(필터 칩)과 소유자 색(pendingHint = togetherText)은 그대로 둔다.
   */
  visitInfo: { fontSize: fontSize.caption, color: colors.textPrimary, fontWeight: '700' },
  pendingHint: { fontSize: fontSize.micro, color: colors.togetherText, fontWeight: '700', marginTop: spacing.xs },
  // 위치 없음 — 카드 바로 아래 붙는 한 줄(44pt 터치)
  noLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: colors.border,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  noLocationText: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700' },
}));
