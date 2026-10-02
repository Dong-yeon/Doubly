/**
 * 사진첩 지도 보기 — "우리" 탭의 세 번째 모양(docs/photo-feed-current-state.md §10).
 *
 * <p>좌표가 있는 장소에 걸린 사진(맛집 방문·장소를 붙인 끼니)을 장소별 핀으로 둔다. 일상·운동은 위치가
 * 없어 지도에 없다. 핀을 누르면 그 장소의 가장 최근 사진부터 뷰어가 열리고(부모가 연다), 넘기면
 * 다른 장소로 이어진다.
 *
 * <p>지도는 럽슐랭 탭과 같은 {@link KakaoMap} 이다. 그 지도는 <b>처음 그릴 때만</b> 핀에 시야를 맞추므로
 * (사용자가 옮긴 시야를 뺏지 않으려는 설계 — kakaoMapHtml.ts), 데이터가 온 뒤에 마운트하고 필터가 바뀌면
 * 부모가 key 를 갈아 새로 맞추게 한다.
 *
 * <p>핀은 그 장소의 <b>가장 최근 사진</b>(52px 둥근 사각형) + 장수 뱃지, 아래에 가게 이름표다
 * ({@code KakaoMapMarker.imageUrl} — 네이티브 WebView HTML 과 웹 구현이 같은 모양으로 그린다).
 */
import React, { useMemo } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { KakaoMap } from '../../components/KakaoMap';
import { thumbnailUrl } from '../../utils/imageUrl';
import type { KakaoMapMarker } from '../../utils/kakaoMapHtml';
import type { FeedPhotoMapPlace } from '../../types';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';
import { layout } from '../../theme/layout';

interface Props {
  /** null 이면 아직 못 받았다 — 지도를 마운트하지 않는다(위 주석: 첫 그리기에만 시야를 맞춘다) */
  places: FeedPhotoMapPlace[] | null;
  loading: boolean;
  error: boolean;
  truncated: boolean;
  filtered: boolean;
  onPressPlace: (placeId: number) => void;
  onRetry: () => void;
}

export function AlbumMap({ places, loading, error, truncated, filtered, onPressPlace, onRetry }: Props) {
  const markers = useMemo<KakaoMapMarker[]>(
    () =>
      (places ?? []).map((p) => {
        const count = p.items.reduce(
          (n, i) => n + (i.imageUrls && i.imageUrls.length > 0 ? i.imageUrls.length : 1),
          0,
        );
        // 핀 = 그 장소의 가장 최근 사진(목록 순서상 [0]). 52dp 칸이라 썸네일로 받는다 — 원본을 지도에 깔면 무겁다
        const cover = p.items[0]?.imageUrl;
        return {
          id: p.placeId,
          lat: p.lat,
          lng: p.lng,
          title: p.name,
          color: colors.coral,
          imageUrl: cover ? thumbnailUrl(cover, 52) : undefined,
          count,
        };
      }),
    [places],
  );

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.notice}>지도 사진을 불러오지 못했어요.</Text>
        <Pressable
          onPress={onRetry}
          style={({ pressed }) => [styles.retryBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="지도 사진 다시 불러오기"
        >
          <Text style={styles.retryText}>다시 시도</Text>
        </Pressable>
      </View>
    );
  }
  if (places === null) {
    return <View style={styles.center}>{loading ? <ActivityIndicator color={colors.primary} /> : null}</View>;
  }
  if (places.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.notice}>
          {filtered
            ? '조건에 맞는 장소 사진이 없어요.'
            : '맛집에 다녀온 사진이나 장소를 붙인 식단 사진이\n여기 지도에 모여요.'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <KakaoMap markers={markers} height={0} style={styles.map} onMarkerPress={onPressPlace} />
      {truncated ? (
        <View style={styles.banner} pointerEvents="none">
          <Text style={styles.bannerText}>사진이 많아 최근 것부터 일부만 보여요</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = themedStyles((colors) => ({
  root: { flex: 1, paddingHorizontal: layout.screenPadding, paddingBottom: layout.listBottom + layout.touchTarget },
  map: { flex: 1, borderRadius: radius.lg, overflow: 'hidden' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: layout.screenPadding,
  },
  notice: { fontSize: fontSize.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 21 },
  retryBtn: {
    minHeight: layout.touchTarget,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  retryText: { fontSize: fontSize.body, fontWeight: '700', color: colors.textPrimary },
  pressed: { opacity: 0.7 },
  banner: {
    position: 'absolute',
    top: spacing.sm,
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  bannerText: { fontSize: fontSize.caption, color: '#FFFFFF', fontWeight: '600' },
}));
