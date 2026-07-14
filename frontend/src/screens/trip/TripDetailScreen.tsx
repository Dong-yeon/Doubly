/** 여행 상세 — 일정·메모 + 담긴 장소 목록(지도 핀) + 장소 담기/빼기 */
import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { PlaceStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { KakaoMap } from '../../components/KakaoMap';
import { tripApi } from '../../api/trip';
import { placeApi } from '../../api/place';
import { isKakaoMapConfigured } from '../../constants/config';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { Place, TripDetail } from '../../types';
import { tripStatusLabel } from './TripListScreen';

type Props = NativeStackScreenProps<PlaceStackParamList, 'TripDetail'>;

export function TripDetailScreen({ navigation, route }: Props) {
  const { tripId } = route.params;
  const [detail, setDetail] = useState<TripDetail | null>(null);
  const [loading, setLoading] = useState(false);
  // 장소 담기 모달 — 이 여행에 없는 커플 장소 목록
  const [pickerOpen, setPickerOpen] = useState(false);
  const [candidates, setCandidates] = useState<Place[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await tripApi.detail(tripId);
      setDetail(d);
      navigation.setOptions({ title: d.trip.title });
    } catch (e) {
      toast.error(getErrorMessage(e, '여행을 불러오지 못했어요.'));
    } finally {
      setLoading(false);
    }
  }, [tripId, navigation]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const openPicker = async () => {
    try {
      const all = await placeApi.list();
      setCandidates(all.filter((p) => p.tripId !== tripId));
      setPickerOpen(true);
    } catch (e) {
      toast.error(getErrorMessage(e, '장소를 불러오지 못했어요.'));
    }
  };

  const onAttach = async (place: Place) => {
    setPickerOpen(false);
    try {
      await tripApi.attachPlace(tripId, place.id);
      haptics.light();
      toast.success(`"${place.name}"을(를) 여행에 담았어요 `);
      load();
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e));
    }
  };

  const onDetach = (place: Place) => {
    Alert.alert('장소 빼기', `"${place.name}"을(를) 이 여행에서 뺄까요?\n장소는 맛집 지도에 그대로 남아요.`, [
      { text: '취소', style: 'cancel' },
      {
        text: '빼기',
        onPress: async () => {
          try {
            await tripApi.detachPlace(tripId, place.id);
            haptics.light();
            toast.success('장소를 여행에서 뺐어요.');
            load();
          } catch (e) {
            Alert.alert('오류', getErrorMessage(e));
          }
        },
      },
    ]);
  };

  const trip = detail?.trip;
  const places = detail?.places ?? [];
  const markers = places
    .filter((p) => p.lat != null && p.lng != null)
    .map((p) => ({ id: p.id, lat: p.lat as number, lng: p.lng as number, title: p.name }));

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={places}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={styles.list}
        refreshing={loading}
        onRefresh={load}
        ListHeaderComponent={
          trip ? (
            <View>
              {trip.coverImageUrl ? (
                <Image source={{ uri: trip.coverImageUrl }} style={styles.cover} resizeMode="cover" />
              ) : null}
              <View style={styles.headerRow}>
                <View style={styles.statusChip}>
                  <Text style={styles.statusText}>{tripStatusLabel(trip)}</Text>
                </View>
                <TouchableOpacity onPress={() => navigation.navigate('TripForm', { trip })}>
                  <Text style={styles.editLink}>수정</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.dates}>
                {trip.startDate} ~ {trip.endDate}
              </Text>
              {trip.memo ? <Text style={styles.memo}>{trip.memo}</Text> : null}

              {isKakaoMapConfigured() && markers.length > 0 ? (
                <View style={styles.mapWrap}>
                  <KakaoMap
                    markers={markers}
                    height={200}
                    onMarkerPress={(id) => {
                      const place = places.find((p) => p.id === id);
                      if (place) {
                        navigation.navigate('PlaceDetail', { placeId: place.id, name: place.name });
                      }
                    }}
                  />
                </View>
              ) : null}

              <View style={styles.placesHeader}>
                <Text style={styles.sectionTitle}>담긴 장소 ({places.length})</Text>
                <Button title="＋ 장소 담기" variant="secondary" size="md" onPress={openPicker} />
              </View>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.placeCard}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('PlaceDetail', { placeId: item.id, name: item.name })}
            onLongPress={() => onDetach(item)}
          >
            <View style={styles.placeHeader}>
              <Text style={styles.placeName}>{item.name}</Text>
              <Text style={styles.placeStatus}>
                {item.status === 'VISITED' ? '다녀옴' : '가보고파'}
              </Text>
            </View>
            {item.address ? <Text style={styles.placeAddress}>{item.address}</Text> : null}
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          !loading && trip ? (
            <Text style={styles.empty}>
              아직 담긴 장소가 없어요. 맛집 지도의 장소를 담아보세요! (길게 눌러 빼기)
            </Text>
          ) : null
        }
      />

      {/* 장소 담기 모달 */}
      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPickerOpen(false)}>
          <Pressable style={styles.sheet}>
            <Text style={styles.sheetTitle}>어떤 장소를 담을까요?</Text>
            <FlatList
              data={candidates}
              keyExtractor={(p) => String(p.id)}
              style={styles.sheetList}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.candidate} activeOpacity={0.7} onPress={() => onAttach(item)}>
                  <Text style={styles.candidateName}>{item.name}</Text>
                  <Text style={styles.candidateInfo}>
                    {item.tripId != null ? '다른 여행에서 옮겨요' : item.category ?? ''}
                  </Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.empty}>담을 수 있는 장소가 없어요. 맛집 지도에서 먼저 추가해주세요!</Text>
              }
            />
            <Button title="닫기" variant="ghost" size="md" onPress={() => setPickerOpen(false)} />
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, paddingBottom: spacing.xl },
  cover: { width: '100%', height: 160, borderRadius: radius.lg, marginBottom: spacing.md },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryBg,
  },
  statusText: { fontSize: fontSize.caption, color: colors.primary, fontWeight: '800' },
  editLink: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700' },
  dates: { fontSize: fontSize.body, color: colors.textPrimary, fontWeight: '700', marginTop: spacing.sm },
  memo: { fontSize: fontSize.body, color: colors.textSecondary, marginTop: spacing.xs, lineHeight: 21 },
  mapWrap: { marginTop: spacing.md, borderRadius: radius.lg, overflow: 'hidden' },
  placesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionTitle: { fontSize: fontSize.subtitle, fontWeight: '700', color: colors.textPrimary },
  placeCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  placeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  placeName: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary },
  placeStatus: { fontSize: fontSize.body },
  placeAddress: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: spacing.xs },
  empty: { fontSize: fontSize.caption, color: colors.textSecondary, textAlign: 'center', paddingVertical: spacing.lg },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: spacing.xl },
  sheet: {
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.xl,
    padding: spacing.lg,
    maxHeight: '70%',
  },
  sheetTitle: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.md },
  sheetList: { marginBottom: spacing.sm },
  candidate: {
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  candidateName: { fontSize: fontSize.body, fontWeight: '700', color: colors.textPrimary },
  candidateInfo: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 2 },
});
