/**
 * 럽슐랭 장소 목록 한 줄 — 네이버 지도 모바일 목록처럼 <b>왼쪽 글자 + 오른쪽 작은 정사각 사진</b>(2026-10-06).
 *
 * <p>예전엔 등급 있는 곳이 16:9 커버 사진의 매거진 카드라, 지도 아래 40% 시트에서 사진 한 장이 목록을 다 먹었다
 * (사용자: "사진이 너무 크게 나온다"). 이제 모든 곳이 같은 한 줄이고, 등급은 이름 옆 배지가 말한다. 카드 박스 대신
 * 구분선 — 한 화면에 더 많이 보인다.
 *
 * <p>지도 시트와 지도를 못 쓸 때의 목록이 같이 쓴다. 시트에서만 "위치 없음"이 붙는다(지도에 핀이 없는 이유).
 */
import React from 'react';
import { Image, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '../../components/Icon';
import { LovelichelinBadge } from '../../components/LovelichelinBadge';
import { SoloPickBadge } from '../../components/SoloPickBadge';
import { isSoloPick } from './placeFilters';
import { stars } from '../../utils/ratingStars';
import { neighborhoodOf } from '../../utils/placeLinks';
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
  // 둘째 줄 — "냉면 · 연남동"(무엇을 파는 곳인지 + 동네)
  const meta = [item.categoryDetail ?? item.category, neighborhoodOf(item.address)].filter(Boolean).join(' · ');
  const partner = partnerName ?? '상대';
  const bothRated = item.myRating != null && item.partnerRating != null;

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={[styles.row, deleting && styles.rowDeleting]}
        activeOpacity={0.7}
        disabled={deleting}
        onPress={onPress}
        onLongPress={onLongPress}
      >
        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text style={styles.name} numberOfLines={1}>
              {item.name}
            </Text>
            {item.lovelichelinTier > 0 ? <LovelichelinBadge tier={item.lovelichelinTier} size="sm" /> : null}
            {item.lovelichelinTier === 0 && isSoloPick(item) ? (
              <SoloPickBadge who={item.myRating != null ? 'me' : 'partner'} size="sm" />
            ) : null}
            {item.tripId != null ? (
              <MaterialCommunityIcons name="airplane" size={14} color={colors.textSecondary} />
            ) : null}
          </View>
          {meta ? (
            <Text style={styles.meta} numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
          {/* 별점 — 둘 다 매겼으면 나/상대 나란히, 한쪽만이면 누구 차례인지(ratingHint) */}
          {bothRated ? (
            <Text style={styles.ratings} numberOfLines={1}>
              <Text style={{ color: colors.me }}>나 ★{item.myRating}</Text>
              <Text style={styles.dot}> · </Text>
              <Text style={{ color: colors.partner }}>
                {partner} ★{item.partnerRating}
              </Text>
            </Text>
          ) : item.myRating != null || item.partnerRating != null ? (
            <Text style={styles.pendingHint} numberOfLines={1}>
              {ratingHint(item, partnerName)}
            </Text>
          ) : null}
          <Text style={styles.visit} numberOfLines={1}>
            {item.visitCount > 0
              ? `방문 ${item.visitCount}회${item.lastVisitedAt ? ` · 최근 ${item.lastVisitedAt.slice(5).replace('-', '/')}` : ''}`
              : '아직 안 가봤어요'}
          </Text>
          {item.coverMemo ? (
            <Text style={styles.memo} numberOfLines={1}>
              “{item.coverMemo}”
            </Text>
          ) : null}
        </View>
        {/* 사진은 오른쪽 작은 정사각 하나 — 없으면 자리째 비운다(빈 회색 칸을 두지 않는다) */}
        {item.coverImageUrl ? (
          <Image source={{ uri: item.coverImageUrl }} style={styles.thumb} resizeMode="cover" />
        ) : null}
      </TouchableOpacity>
      {/* "위치 없음"은 행 안의 버튼이 아니라 아래 형제다 — 버튼 안 버튼(웹 마크업 오류)을 피한다 */}
      {noLocation ? (
        <Pressable
          onPress={onFixLocation}
          style={styles.noLocation}
          accessibilityRole="button"
          accessibilityLabel={`${item.name} 위치 없음 — 지도에 위치 지정하기`}
        >
          <MaterialCommunityIcons name="map-marker-outline" size={14} color={colors.textSecondary} />
          <Text style={styles.noLocationText}>위치 없음 · 지도에 표시하기</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = themedStyles((colors) => ({
  // 한 장소 = 한 줄. 카드 박스 대신 아래 구분선
  wrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  // 삭제 진행 중 표시 — useDeleteAction (QA_CHECKLIST.md 전역 반복 패턴 7)
  rowDeleting: { opacity: 0.5 },
  body: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  name: { flexShrink: 1, fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  meta: { fontSize: fontSize.caption, color: colors.textSecondary },
  ratings: { fontSize: fontSize.caption, fontWeight: '700' },
  dot: { color: colors.textSecondary },
  pendingHint: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '600' },
  /*
   * 방문 횟수는 <b>정보 글자지 상태가 아니다</b> — 색을 입히지 않는다(2026-09-23 화면 정리와 같은 원칙).
   */
  visit: { fontSize: fontSize.caption, color: colors.textPrimary, fontWeight: '600' },
  memo: { fontSize: fontSize.caption, color: colors.textSecondary, fontStyle: 'italic' },
  // 네이버 지도 목록의 작은 사진 — 76px 정사각, 둥근 모서리
  thumb: { width: 76, height: 76, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  // 위치 없음 — 행 아래 작은 줄(44pt 터치)
  noLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 44,
    marginTop: -spacing.sm,
  },
  noLocationText: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700' },
}));
