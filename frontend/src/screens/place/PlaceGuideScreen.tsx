/**
 * 럽슐랭 가이드 — 둘이 함께 검증해 등급을 받은(tier>0) 장소들의 매거진 카드뷰 + AI 총평.
 * 목록은 {@link usePlaceStore}(위시리스트/지도와 공유하는 캐시)를 그대로 걸러서 쓴다 —
 * 세그먼트를 오갈 때마다 다시 받아오지 않는다. 커버 사진/한줄평도 백엔드가 목록 응답에
 * 이미 실어주므로(place_visits N+1 없음) 여기서 따로 조회하지 않는다.
 */
import React, { useCallback, useMemo } from 'react';
import { FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { PlaceStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { IconButton } from '../../components/IconButton';
import { MaterialCommunityIcons } from '../../components/Icon';
import { AiInsightButton } from '../../components/AiInsightButton';
import { LovelichelinBadge } from '../../components/LovelichelinBadge';
import { PlaceSectionTabs } from './PlaceSectionTabs';
import { placeApi } from '../../api/place';
import { usePlaceStore } from '../../store/placeStore';
import { stars } from '../../utils/ratingStars';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { LovelichelinSummary } from '../../types';
import { themedStyles } from '../../theme/themedStyles';
import { layout } from '../../theme/layout';

type Nav = NativeStackNavigationProp<PlaceStackParamList>;

/** AI 럽슐랭 에디터 총평 렌더 — AiInsightButton 의 데이트 코스와 같은 구조 */
function renderSummary(s: LovelichelinSummary) {
  if (!s.available) {
    return (
      <Text style={styles.summaryEmpty}>
        아직 인증된 럽슐랭 장소가 없어요. 둘이 함께 다녀온 곳에 평점을 매겨보세요!
      </Text>
    );
  }
  return (
    <View style={{ gap: spacing.sm }}>
      {s.review ? <Text style={styles.summaryText}>{s.review}</Text> : null}
      {s.nextRecommendation ? (
        <View style={styles.summaryNext}>
          <Text style={styles.summaryNextArea}>💡 다음 추천: {s.nextRecommendation.area}</Text>
          {s.nextRecommendation.reason ? (
            <Text style={styles.summaryNextReason}>{s.nextRecommendation.reason}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function PlaceGuideScreen() {
  const navigation = useNavigation<Nav>();
  const allPlaces = usePlaceStore((s) => s.places);
  const loading = usePlaceStore((s) => s.loading);
  const loadError = usePlaceStore((s) => s.loadError);
  const load = usePlaceStore((s) => s.load);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => {}); // 에러는 loadError 로 화면에 이미 반영된다
    }, [load]),
  );

  const places = useMemo(
    () =>
      allPlaces
        .filter((p) => p.lovelichelinTier > 0)
        .sort((a, b) => {
          if (b.lovelichelinTier !== a.lovelichelinTier) return b.lovelichelinTier - a.lovelichelinTier;
          return (b.lovelichelinCertifiedAt ?? '').localeCompare(a.lovelichelinCertifiedAt ?? '');
        }),
    [allPlaces],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.titleRow}>
        <Text style={styles.screenTitle}>럽슐랭</Text>
        <View style={styles.titleActions}>
          <AiInsightButton
            label="AI 총평"
            title="AI 럽슐랭 에디터의 총평"
            fetcher={placeApi.lovelichelinSummary}
            render={renderSummary}
          />
          <IconButton icon="airplane" label="우리 여행" onPress={() => navigation.navigate('TripList')} />
        </View>
      </View>
      <PlaceSectionTabs />

      <FlatList
        data={places}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={styles.list}
        refreshing={loading}
        onRefresh={() => load(true)}
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => navigation.navigate('PlaceDetail', { placeId: item.id, name: item.name })}
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
                  <Text style={styles.magazineName}>{item.name}</Text>
                  <LovelichelinBadge tier={item.lovelichelinTier} size="sm" />
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
                  <Text style={styles.magazineDate}>{item.lovelichelinCertifiedAt.slice(0, 10)} 등극</Text>
                ) : null}
              </View>
            </Card>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          !loading ? (
            loadError ? (
              <EmptyState
                icon="cloud-off-outline"
                title="가이드를 불러오지 못했어요"
                description="네트워크 상태를 확인하고 다시 시도해주세요."
                error
                onRetry={() => load()}
              />
            ) : (
              <EmptyState
                icon="crown"
                title="아직 럽슐랭으로 인증된 장소가 없어요"
                description="위시리스트에 담은 곳을 다녀온 뒤, 둘 다 평점을 매기면 등급이 매겨져요!"
              />
            )
          ) : null
        }
      />

      <View style={styles.fabWrap}>
        <Button title="＋ 장소 추가하기" onPress={() => navigation.navigate('PlaceAdd')} />
      </View>
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  screenTitle: { fontSize: fontSize.title, fontWeight: '800', color: colors.textPrimary },
  titleActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  list: { padding: spacing.lg, paddingBottom: layout.listBottomWithFab },
  magazineCard: { padding: 0, overflow: 'hidden', marginBottom: spacing.md },
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
  fabWrap: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg },
  summaryEmpty: { fontSize: fontSize.body, color: colors.textSecondary, lineHeight: 22 },
  summaryText: { fontSize: fontSize.body, color: colors.textSecondary, lineHeight: 22 },
  summaryNext: {
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.togetherBg,
  },
  summaryNextArea: { fontSize: fontSize.body, fontWeight: '800', color: colors.togetherText },
  summaryNextReason: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: spacing.xxs },
}));
