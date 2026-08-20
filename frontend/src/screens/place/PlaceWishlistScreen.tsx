/**
 * 위시리스트 — 아직 럽슐랭 인증(tier>0) 전인 장소 전부. 아직 안 가본 후보든, 다녀왔지만
 * 둘 다 평가 전이거나 탈락한 곳이든 여기 모인다. 방문 후 나/상대가 모두 평점을 매기면
 * 자동으로 럽슐랭 가이드로 승격된다.
 *
 * <p>검색·상태·식단 필터는 {@link usePlaceStore}에 둬서 지도 화면과 공유한다 — 세그먼트를
 * 오가도 검색 조건이 유지된다(예전엔 목록/지도가 한 화면이라 자연히 공유됐었다).
 */
import React, { useCallback, useMemo } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { PlaceStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { Chip } from '../../components/Chip';
import { EmptyState } from '../../components/EmptyState';
import { IconButton } from '../../components/IconButton';
import { TextField } from '../../components/TextField';
import { PlaceSectionTabs } from './PlaceSectionTabs';
import { STATUS_FILTERS, DIET_FILTERS } from './placeFilters';
import { placeApi } from '../../api/place';
import { usePlaceStore } from '../../store/placeStore';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { Place } from '../../types';
import { themedStyles } from '../../theme/themedStyles';
import { layout } from '../../theme/layout';

type Nav = NativeStackNavigationProp<PlaceStackParamList>;

export function PlaceWishlistScreen() {
  const navigation = useNavigation<Nav>();
  const allPlaces = usePlaceStore((s) => s.places);
  const loading = usePlaceStore((s) => s.loading);
  const loadError = usePlaceStore((s) => s.loadError);
  const load = usePlaceStore((s) => s.load);
  const search = usePlaceStore((s) => s.search);
  const setSearch = usePlaceStore((s) => s.setSearch);
  const filter = usePlaceStore((s) => s.statusFilter);
  const setFilter = usePlaceStore((s) => s.setStatusFilter);
  const dietFilter = usePlaceStore((s) => s.dietFilter);
  const setDietFilter = usePlaceStore((s) => s.setDietFilter);
  const invalidate = usePlaceStore((s) => s.invalidate);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => {});
    }, [load]),
  );

  const places = useMemo(() => allPlaces.filter((p) => p.lovelichelinTier === 0), [allPlaces]);

  const onDelete = (place: Place) => {
    Alert.alert('장소 삭제', `"${place.name}"을(를) 삭제할까요?\n방문 기록도 함께 삭제돼요.`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await placeApi.remove(place.id);
            haptics.light();
            toast.success('장소를 삭제했어요.');
            invalidate();
            load(true);
          } catch (e) {
            Alert.alert('오류', getErrorMessage(e));
          }
        },
      },
    ]);
  };

  const filtered = places
    .filter((p) => !search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase()))
    .filter((p) => filter === 'ALL' || p.status === filter)
    .filter((p) => dietFilter === 'ALL' || p.dietTag === dietFilter);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.titleRow}>
        <Text style={styles.screenTitle}>위시리스트</Text>
        {/* 여행(Trip) 진입로 임시로 가려둠 — 기능 자체는 그대로 두고 나중에 다시 노출할 수 있다 */}
        {/* <IconButton icon="airplane" label="우리 여행" onPress={() => navigation.navigate('TripList')} /> */}
      </View>
      <PlaceSectionTabs />

      {places.length > 0 ? (
        <View style={styles.searchWrap}>
          <TextField
            placeholder="장소 이름으로 검색"
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
        </View>
      ) : null}

      <View style={styles.filterRow}>
        {STATUS_FILTERS.map((f) => (
          <Chip key={f.value} label={f.label} selected={filter === f.value} onPress={() => setFilter(f.value)} />
        ))}
      </View>
      <View style={styles.filterRow}>
        {DIET_FILTERS.map((f) => (
          <Chip
            key={f.value}
            label={f.label}
            selected={dietFilter === f.value}
            onPress={() => setDietFilter(f.value)}
          />
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={styles.list}
        refreshing={loading}
        onRefresh={() => load(true)}
        ListHeaderComponent={filtered.length > 0 ? <Text style={styles.deleteHint}>카드를 길게 눌러 삭제할 수 있어요</Text> : null}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('PlaceDetail', { placeId: item.id, name: item.name })}
            onLongPress={() => onDelete(item)}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.name}>{item.name}</Text>
              {item.category ? (
                <View style={styles.categoryChip}>
                  <Text style={styles.categoryText}>{item.category}</Text>
                </View>
              ) : null}
              {item.dietTag !== 'NEUTRAL' ? (
                <View style={[styles.categoryChip, styles.dietTagChip]}>
                  <Text style={styles.categoryText}>{item.dietTag === 'CLEAN' ? '🥗 클린식' : '🍔 치팅데이'}</Text>
                </View>
              ) : null}
              {item.tripId != null ? (
                <View style={styles.categoryChip}>
                  <Text style={styles.categoryText}>✈️ 여행에 담김</Text>
                </View>
              ) : null}
            </View>
            {item.address ? <Text style={styles.address}>{item.address}</Text> : null}
            <View style={styles.cardFooter}>
              <Text style={styles.statusBadge}>
                {item.status === 'VISITED' ? '다녀왔어요' : '가고 싶어요'}
              </Text>
              {item.visitCount > 0 ? (
                <Text style={styles.visitInfo}>
                  {item.avgRating ? `${item.avgRating.toFixed(1)} · ` : ''}방문 {item.visitCount}회
                  {item.lastVisitedAt ? ` · 최근 ${item.lastVisitedAt}` : ''}
                </Text>
              ) : null}
            </View>
            {/* 한쪽만 평가해 아직 럽슐랭으로 승격되지 못한 경우 — 나머지 한 명을 재촉하는 힌트 */}
            {item.myRating != null || item.partnerRating != null ? (
              <Text style={styles.pendingHint}>
                {item.myRating != null && item.partnerRating != null
                  ? '럽슐랭 탈락 — 재평가하면 다시 등급이 매겨져요'
                  : `${item.myRating != null ? '내' : '상대'} 평점만 매겨졌어요 — 나머지 한 명의 평가를 기다리는 중`}
              </Text>
            ) : null}
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          !loading ? (
            loadError ? (
              <EmptyState
                icon="cloud-off-outline"
                title="장소를 불러오지 못했어요"
                description="네트워크 상태를 확인하고 다시 시도해주세요."
                error
                onRetry={() => load()}
              />
            ) : places.length > 0 ? (
              <EmptyState icon="map-marker-outline" title="조건에 맞는 장소가 없어요" description="검색어나 필터를 바꿔보세요." />
            ) : (
              <EmptyState
                icon="map-marker-outline"
                title="아직 저장한 장소가 없어요"
                description="함께 가고 싶은 맛집, 여행지, 전시를 추가해보세요! (카드를 길게 눌러 삭제)"
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
  searchWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  list: { padding: spacing.lg, paddingBottom: layout.listBottomWithFab },
  deleteHint: { fontSize: fontSize.caption, color: colors.textSecondary, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  name: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary },
  categoryChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryText: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '600' },
  dietTagChip: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  address: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: spacing.xs },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  statusBadge: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textPrimary },
  visitInfo: { fontSize: fontSize.caption, color: colors.primary, fontWeight: '700' },
  pendingHint: { fontSize: fontSize.micro, color: colors.togetherText, fontWeight: '700', marginTop: spacing.xs },
  fabWrap: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg },
}));
