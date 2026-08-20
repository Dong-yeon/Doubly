/** 장소 상세 — 방문 기록 목록 + 기록 추가 (별점·사진·메모) */
import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Alert } from '../../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { PlaceStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { Checkbox } from '../../components/Checkbox';
import { EmptyState } from '../../components/EmptyState';
import { ImageViewer } from '../../components/ImageViewer';
import { IconButton } from '../../components/IconButton';
import { KakaoMap } from '../../components/KakaoMap';
import { LovelichelinBadge } from '../../components/LovelichelinBadge';
import { LovelichelinFanfareModal } from '../../components/LovelichelinFanfareModal';
import { usePlaceStore } from '../../store/placeStore';
import { isKakaoMapConfigured } from '../../constants/config';
import { placeApi } from '../../api/place';
import { useDietStore } from '../../store/dietStore';
import { pickImage, uploadImage } from '../../utils/imageUpload';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { runBusy } from '../../store/busyStore';
import { haptics } from '../../utils/haptics';
import { toDateString } from '../../utils/date';
import { stars } from '../../utils/ratingStars';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { MealType, Place, PlaceVisit } from '../../types';
import { themedStyles } from '../../theme/themedStyles';
import { useAndroidKeyboardHeight } from '../../hooks/useAndroidKeyboardHeight';

type Props = NativeStackScreenProps<PlaceStackParamList, 'PlaceDetail'>;

const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: 'BREAKFAST', label: '아침' },
  { value: 'LUNCH', label: '점심' },
  { value: 'DINNER', label: '저녁' },
  { value: 'SNACK', label: '간식' },
];

// 현재 시간대에 맞는 끼니 기본 선택 (DietRecordScreen 과 동일 규칙)
function defaultMealType(): MealType {
  const h = new Date().getHours();
  if (h < 11) return 'BREAKFAST';
  if (h < 15) return 'LUNCH';
  if (h < 21) return 'DINNER';
  return 'SNACK';
}

export function PlaceDetailScreen({ route, navigation }: Props) {
  const { placeId, name: placeName } = route.params;
  const androidKeyboardHeight = useAndroidKeyboardHeight();
  const saveMeal = useDietStore((s) => s.save);
  const [place, setPlace] = useState<Place | null>(null);
  const [visits, setVisits] = useState<PlaceVisit[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // 사진 있는 카드를 눌러 전체화면으로 본다 — 예전엔 onLongPress(삭제)만 있고
  // 탭엔 반응이 없어 "눌리는데 아무 일도 안 남" 이었다(QA_CHECKLIST.md P2-22)
  const [viewingIndex, setViewingIndex] = useState<number | null>(null);
  const photoVisits = useMemo(() => visits.filter((v) => v.imageUrl), [visits]);

  // 방문 기록 입력 폼
  const [formOpen, setFormOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [memo, setMemo] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 오늘 식단으로도 등록 — 방문 기록 저장 시 meals 에도 즉시 기록하고 place_visits.meal_id 로 연결
  const [logMeal, setLogMeal] = useState(false);
  const [mealType, setMealType] = useState<MealType>(defaultMealType());
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');

  // 럽슐랭 대표 평점 — 방문기록 별점(위)과 별개로, 장소당 한 사람당 1개만 유지된다.
  // revisitIntent 는 API가 되돌려주지 않는 선택 응답이라, 사용자가 이번에 직접 건드리지
  // 않으면 undefined 로 두고 저장 요청에서도 생략한다 — 그래야 별점만 다시 매기려고
  // 재평가할 때 이전에 남긴 "다시 안 올래요" 응답을 조용히 true 로 덮어쓰지 않는다.
  const [myRatingInput, setMyRatingInput] = useState(0);
  const [revisitIntent, setRevisitIntent] = useState<boolean | undefined>(undefined);
  const [ratingSaving, setRatingSaving] = useState(false);
  // 재평가로 등급이 유지/하락할 때는 축하 모달을 열지 않는다 — 0→양수로 "새로 등극"할 때만
  const [fanfareTier, setFanfareTier] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [p, v] = await Promise.all([placeApi.get(placeId), placeApi.visits(placeId)]);
      setPlace(p);
      setVisits(v);
      setMyRatingInput(p.myRating ?? 0);
      // 수정 후 돌아왔을 때도 헤더 타이틀이 최신 이름을 따라가도록
      navigation.setOptions({ title: p.name });
    } catch (e) {
      toast.error(getErrorMessage(e, '장소 정보를 불러오지 못했어요.'));
      // 실패해도 목록은 비우지 않는다 — "진짜 빈 목록"과 구분은 loadError 로 한다
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [placeId, navigation]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onPickPhoto = async () => {
    try {
      const uri = await pickImage();
      if (uri) setPhotoUri(uri);
    } catch (e) {
      toast.error(getErrorMessage(e, '사진 선택에 실패했어요.'));
    }
  };

  const resetForm = () => {
    setRating(0);
    setMemo('');
    setPhotoUri(null);
    setLogMeal(false);
    setMealType(defaultMealType());
    setCalories('');
    setProtein('');
    setCarbs('');
    setFat('');
  };

  const onSaveVisit = async () => {
    setSaving(true);
    try {
      let imageUrl: string | undefined;
      if (photoUri) {
        imageUrl = await runBusy('사진 올리는 중…', () => uploadImage(photoUri));
      }

      // 식단으로도 등록 체크 시 meals 를 먼저 저장하고, 발급된 id 를 방문 기록에 연동한다
      let mealId: number | undefined;
      if (logMeal) {
        const savedMeal = await saveMeal({
          mealDate: toDateString(),
          mealType,
          memo: memo.trim() ? `${placeName} · ${memo.trim()}` : placeName,
          photoUrl: imageUrl,
          calories: calories ? Number(calories) : undefined,
          carbs: carbs ? Number(carbs) : undefined,
          protein: protein ? Number(protein) : undefined,
          fat: fat ? Number(fat) : undefined,
        });
        mealId = savedMeal.id;
      }

      await placeApi.recordVisit(placeId, {
        rating: rating > 0 ? rating : undefined,
        memo: memo.trim() || undefined,
        imageUrl,
        mealId,
      });
      haptics.success();
      toast.success(logMeal ? '방문 기록과 식단을 함께 남겼어요! ' : '방문 기록 완료! ');
      setFormOpen(false);
      resetForm();
      load();
      // 방문 기록이 상태·평균 별점·커버 사진을 바꿀 수 있다 — 가이드/위시리스트/지도가
      // 다음에 focus 될 때 캐시된 목록 대신 다시 받아오게 한다
      usePlaceStore.getState().invalidate();
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  // 럽슐랭 대표 평점 저장 — 재평가 시 upsert. 등급이 0→양수로 새로 등극하면 축하 모달을 연다
  const onSaveRating = async () => {
    if (!place || myRatingInput === 0) return;
    setRatingSaving(true);
    try {
      const previousTier = place.lovelichelinTier;
      const updated = await placeApi.rate(placeId, { rating: myRatingInput, revisitIntent });
      setPlace(updated);
      haptics.success();
      // 등급이 바뀌면 가이드↔위시리스트 사이를 오갈 수 있다 — 캐시를 무효화한다
      usePlaceStore.getState().invalidate();
      if (previousTier === 0 && updated.lovelichelinTier > 0) {
        setFanfareTier(updated.lovelichelinTier);
      } else {
        toast.success('럽슐랭 평가를 저장했어요.');
      }
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e));
    } finally {
      setRatingSaving(false);
    }
  };

  // 장소 자체 삭제 — 예전엔 목록 화면에서 카드를 길게 눌러야만 가능해서, 상세로 들어온
  // 뒤에는 지울 방법이 없었다. 정보 카드에 명시적인 삭제 버튼을 둔다.
  const onDeletePlace = () => {
    if (!place) return;
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
            usePlaceStore.getState().invalidate();
            navigation.goBack();
          } catch (e) {
            Alert.alert('오류', getErrorMessage(e));
          }
        },
      },
    ]);
  };

  const onDeleteVisit = (visit: PlaceVisit) => {
    Alert.alert('방문 기록 삭제', `${visit.visitedAt} 기록을 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await placeApi.removeVisit(placeId, visit.id);
            haptics.light();
            toast.success('방문 기록을 삭제했어요.');
            load();
            usePlaceStore.getState().invalidate();
          } catch (e) {
            Alert.alert('오류', getErrorMessage(e));
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* 키보드가 "기록 저장" 버튼을 가리지 않도록 회피 — Android 는 FlatList 를 직접
          감싸는 KeyboardAvoidingView 의 자동 높이 보정이 edge-to-edge 에서 먹지 않아
          (실기기 확인) useAndroidKeyboardHeight 로 실측 높이만큼 직접 패딩한다. */}
      <KeyboardAvoidingView
        style={[styles.flex, Platform.OS === 'android' && { paddingBottom: androidKeyboardHeight }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FlatList
          data={visits}
          keyExtractor={(v) => String(v.id)}
          contentContainerStyle={styles.list}
          // 키보드가 열려 있어도 "기록 저장" 첫 탭이 바로 동작하도록
          keyboardShouldPersistTaps="handled"
          refreshing={loading}
          onRefresh={load}
          ListHeaderComponent={
            <View>
              {place ? (
                <View style={styles.infoCard}>
                  <View style={styles.infoTop}>
                    <Text style={styles.infoName}>{place.name}</Text>
                    <View style={styles.infoActions}>
                      <IconButton
                        icon="pencil-outline"
                        label="장소 정보 수정"
                        onPress={() => navigation.navigate('PlaceAdd', { place })}
                      />
                      <IconButton
                        icon="delete-outline"
                        label="장소 삭제"
                        color={colors.danger}
                        onPress={onDeletePlace}
                      />
                    </View>
                  </View>
                  <View style={styles.infoChipRow}>
                    <View style={styles.infoChip}>
                      <Text style={styles.infoChipText}>
                        {place.status === 'VISITED' ? '다녀왔어요' : '가고 싶어요'}
                      </Text>
                    </View>
                    {place.category ? (
                      <View style={styles.infoChip}>
                        <Text style={styles.infoChipText}>{place.category}</Text>
                      </View>
                    ) : null}
                    {place.dietTag !== 'NEUTRAL' ? (
                      <View style={[styles.infoChip, styles.infoDietChip]}>
                        <Text style={styles.infoChipText}>
                          {place.dietTag === 'CLEAN' ? '🥗 클린식' : '🍔 치팅데이'}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  {place.address ? <Text style={styles.infoAddress}>{place.address}</Text> : null}
                  {place.visitCount > 0 ? (
                    <Text style={styles.infoStats}>
                      {place.avgRating ? `${place.avgRating.toFixed(1)} · ` : ''}
                      방문 {place.visitCount}회
                      {place.lastVisitedAt ? ` · 최근 ${place.lastVisitedAt}` : ''}
                    </Text>
                  ) : null}
                  {isKakaoMapConfigured() && place.lat != null && place.lng != null ? (
                    <KakaoMap
                      markers={[
                        { id: place.id, lat: place.lat as number, lng: place.lng as number, title: place.name },
                      ]}
                      centerLat={place.lat as number}
                      centerLng={place.lng as number}
                      height={140}
                      style={styles.infoMap}
                    />
                  ) : null}

                  {/* 럽슐랭 평가 — 방문기록 별점(아래)과 별개로, 장소당 나/상대 대표 평점이 각 1개씩 유지된다 */}
                  <View style={styles.lovelichelinSection}>
                    <View style={styles.lovelichelinHeader}>
                      <Text style={styles.label}>럽슐랭 평가</Text>
                      <LovelichelinBadge tier={place.lovelichelinTier} size="sm" />
                    </View>
                    <View style={styles.ratingRow}>
                      <View style={styles.ratingCol}>
                        <Text style={styles.ratingColLabel}>나</Text>
                        <View style={styles.starRowSm}>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <TouchableOpacity
                              key={n}
                              onPress={() => setMyRatingInput(myRatingInput === n ? 0 : n)}
                              accessibilityLabel={`나의 럽슐랭 평점 ${n}점`}
                            >
                              <Text style={[styles.starSm, { color: colors.me }]}>
                                {n <= myRatingInput ? '★' : '☆'}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                      <View style={styles.ratingCol}>
                        <Text style={styles.ratingColLabel}>상대</Text>
                        <Text style={[styles.starSmReadonly, { color: colors.partner }]}>
                          {place.partnerRating ? stars(place.partnerRating) : '아직 평가 전'}
                        </Text>
                      </View>
                    </View>
                    <Checkbox
                      checked={revisitIntent ?? true}
                      onChange={setRevisitIntent}
                      label="다시 올래요?"
                    />
                    <Button
                      title="럽슐랭 평가 저장"
                      variant="secondary"
                      size="sm"
                      onPress={onSaveRating}
                      loading={ratingSaving}
                      disabled={myRatingInput === 0}
                    />
                  </View>
                </View>
              ) : null}

              {formOpen ? (
                <View style={styles.form}>
                  <Text style={styles.label}>별점</Text>
                  <View style={styles.starRow}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <TouchableOpacity key={n} onPress={() => setRating(rating === n ? 0 : n)}>
                        <Text style={styles.star}>{n <= rating ? '★' : '☆'}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <TouchableOpacity style={[styles.photoBox, photoUri ? styles.photoBoxFilled : styles.photoBoxEmpty]} onPress={onPickPhoto} activeOpacity={0.8}>
                    {photoUri ? (
                      <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />
                    ) : (
                      <Text style={styles.photoPlaceholder}>사진 추가하기</Text>
                    )}
                  </TouchableOpacity>

                  <TextField
                    label="메모 (선택)"
                    placeholder="예: 족발이 진짜 부드러워요. 웨이팅 30분"
                    value={memo}
                    onChangeText={setMemo}
                    multiline
                  />

                  <Checkbox
                    checked={logMeal}
                    onChange={setLogMeal}
                    label="오늘 식단으로도 기록할까요?"
                  />

                  {logMeal ? (
                    <View style={styles.mealLogBox}>
                      <Text style={styles.label}>끼니</Text>
                      <View style={styles.typeRow}>
                        {MEAL_TYPES.map((t) => (
                          <TouchableOpacity
                            key={t.value}
                            style={[styles.typeChip, mealType === t.value && styles.typeChipActive]}
                            onPress={() => setMealType(t.value)}
                          >
                            <Text style={[styles.typeText, mealType === t.value && styles.typeTextActive]}>
                              {t.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      <TextField
                        label="칼로리 (kcal, 선택)"
                        placeholder="650"
                        keyboardType="number-pad"
                        value={calories}
                        onChangeText={(t) => setCalories(t.replace(/[^0-9]/g, ''))}
                      />

                      <Text style={styles.label}>매크로 (g, 선택)</Text>
                      <View style={styles.macroInputRow}>
                        <View style={styles.macroInput}>
                          <TextField
                            label="탄수화물"
                            placeholder="0"
                            keyboardType="number-pad"
                            value={carbs}
                            onChangeText={(t) => setCarbs(t.replace(/[^0-9]/g, ''))}
                          />
                        </View>
                        <View style={styles.macroInput}>
                          <TextField
                            label="단백질"
                            placeholder="0"
                            keyboardType="number-pad"
                            value={protein}
                            onChangeText={(t) => setProtein(t.replace(/[^0-9]/g, ''))}
                          />
                        </View>
                        <View style={styles.macroInput}>
                          <TextField
                            label="지방"
                            placeholder="0"
                            keyboardType="number-pad"
                            value={fat}
                            onChangeText={(t) => setFat(t.replace(/[^0-9]/g, ''))}
                          />
                        </View>
                      </View>
                    </View>
                  ) : null}

                  <View style={styles.formActions}>
                    <Button
                      title="취소"
                      variant="ghost"
                      size="md"
                      onPress={() => {
                        // 취소해도 별점·메모·사진이 남아있어 다시 열면 이전 입력이
                        // 그대로 보였다(QA_CHECKLIST.md P2-23) — 닫을 때 함께 비운다.
                        setFormOpen(false);
                        resetForm();
                      }}
                      style={styles.flex}
                    />
                    <Button title="기록 저장" size="md" onPress={onSaveVisit} loading={saving} style={styles.flex} />
                  </View>
                </View>
              ) : (
                <Button title="방문 기록 남기기" variant="secondary" onPress={() => setFormOpen(true)} />
              )}

              <Text style={styles.sectionTitle}>방문 기록</Text>
              {/* 지울 기록이 있을 때만 의미가 있다 — 빈 목록에는 EmptyState 쪽 안내로 충분 */}
              {visits.length > 0 ? <Text style={styles.visitHint}>길게 눌러 삭제 · 사진은 탭해서 크게 보기</Text> : null}
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.visitCard}
              activeOpacity={item.imageUrl ? 0.8 : 1}
              onLongPress={() => onDeleteVisit(item)}
              onPress={
                item.imageUrl
                  ? () => setViewingIndex(photoVisits.findIndex((v) => v.id === item.id))
                  : undefined
              }
              accessibilityHint={item.imageUrl ? '탭해서 사진 크게 보기 · 길게 눌러 삭제' : '길게 눌러 삭제'}
            >
              <View style={styles.visitHeader}>
                <Text style={styles.visitDate}>
                  {item.visitedAt} · {item.visitedByName ?? '커플'}
                </Text>
                {item.rating ? <Text style={styles.visitStars}>{stars(item.rating)}</Text> : null}
              </View>
              {item.imageUrl ? (
                <Image source={{ uri: item.imageUrl }} style={styles.visitPhoto} resizeMode="cover" />
              ) : null}
              {item.memo ? <Text style={styles.visitMemo}>{item.memo}</Text> : null}
              {item.mealId ? <Text style={styles.mealBadge}>🍽 식단에도 기록됨</Text> : null}
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            !loading ? (
              loadError ? (
                <EmptyState
                  icon="cloud-off-outline"
                  title="방문 기록을 불러오지 못했어요"
                  description="네트워크 상태를 확인하고 다시 시도해주세요."
                  error
                  onRetry={load}
                />
              ) : (
                <EmptyState
                  icon="map-marker-outline"
                  title="아직 방문 기록이 없어요"
                  description="다녀오셨다면 남겨보세요! (길게 눌러 삭제)"
                />
              )
            ) : null
          }
        />
      </KeyboardAvoidingView>
      <ImageViewer
        images={photoVisits.map((v) => ({
          key: String(v.id),
          uri: v.imageUrl as string,
          title: `${v.visitedAt} · ${v.visitedByName ?? '커플'}`,
          caption: v.memo ?? undefined,
        }))}
        initialIndex={viewingIndex}
        onClose={() => setViewingIndex(null)}
      />
      <LovelichelinFanfareModal
        visible={fanfareTier > 0}
        tier={fanfareTier}
        placeName={place?.name ?? ''}
        onClose={() => setFanfareTier(0)}
      />
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, paddingBottom: spacing.xl },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  infoTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  infoName: { flex: 1, fontSize: fontSize.title, fontWeight: '800', color: colors.textPrimary },
  infoActions: { flexDirection: 'row', alignItems: 'center' },
  infoChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  infoChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoDietChip: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  infoChipText: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '600' },
  infoAddress: { fontSize: fontSize.body, color: colors.textSecondary, marginTop: spacing.sm },
  infoStats: { fontSize: fontSize.caption, color: colors.primary, fontWeight: '700', marginTop: spacing.xs },
  infoMap: { marginTop: spacing.md },
  lovelichelinSection: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  lovelichelinHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ratingRow: { flexDirection: 'row', gap: spacing.lg },
  ratingCol: { flex: 1 },
  ratingColLabel: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700', marginBottom: 2 },
  starRowSm: { flexDirection: 'row', gap: 2 },
  starSm: { fontSize: 22 },
  starSmReadonly: { fontSize: fontSize.body, fontWeight: '700' },
  form: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  label: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700', marginBottom: spacing.sm },
  starRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  star: { fontSize: 32, color: colors.accent },
  photoBox: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  /*
   * 사진 유무로 높이 규칙이 다르다. 예전엔 photoBox 에 고정 height 를 두고
   * photoBoxFilled 에서 `height: undefined` 로 지우려 했는데, 스타일 병합에서
   * undefined 는 무시되어 고정 높이가 그대로 남고 aspectRatio 가 먹지 않았다.
   * 그래서 기본에는 높이를 두지 않고 상태별 스타일로 나눈다.
   */
  photoBoxEmpty: { width: '100%', aspectRatio: 16 / 9 },
  photoBoxFilled: { width: '100%', aspectRatio: 4 / 3 },
  photo: { width: '100%', height: '100%' },
  photoPlaceholder: { color: colors.textSecondary, fontSize: fontSize.body, fontWeight: '600' },
  mealLogBox: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  typeRow: { flexDirection: 'row', gap: spacing.sm },
  typeChip: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  typeChipActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  typeText: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '600' },
  typeTextActive: { color: colors.textPrimary, fontWeight: '800' },
  macroInputRow: { flexDirection: 'row', gap: spacing.sm },
  macroInput: { flex: 1 },
  formActions: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  sectionTitle: {
    fontSize: fontSize.subtitle,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  visitHint: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: -spacing.xs, marginBottom: spacing.sm },
  visitCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  visitHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  visitDate: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '600' },
  visitStars: { fontSize: fontSize.body, color: colors.togetherText, fontWeight: '700' },
  visitPhoto: { width: '100%', height: 160, borderRadius: radius.md, marginTop: spacing.sm },
  visitMemo: { fontSize: fontSize.body, color: colors.textPrimary, marginTop: spacing.sm },
  mealBadge: { fontSize: fontSize.caption, color: colors.primary, fontWeight: '700', marginTop: spacing.sm },
  empty: { fontSize: fontSize.caption, color: colors.textSecondary, textAlign: 'center', paddingVertical: spacing.lg },
}));
