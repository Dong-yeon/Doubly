/**
 * 장소 상세 — 방문 기록 목록 + 기록 추가 (별점·날짜·사진·메모).
 *
 * <p><b>왜 별점이 하나인가(2026-09-14)</b>: 예전엔 이 화면에 별 위젯이 둘이었다 —
 * 위쪽 "럽슐랭 평가"(place_ratings, 등급을 정하는 대표 평점)와 아래쪽 방문 기록 별점
 * (place_visits.rating). 설계상으로는 다른 값이지만 사용자에겐 같은 별 다섯 개였고,
 * 무엇보다 <b>방문 기록 쪽 별점은 등급에 아무 영향이 없었다</b>: PlaceService.recordVisit()
 * 은 place_ratings 를 건드리지 않아 tier·재촉 푸시·가이드 노출·솔로 픽 어디에도 반영되지
 * 않는다(바뀌는 건 avgRating 숫자뿐). 즉 "다녀왔으니 별 다섯 개"라는 가장 자연스러운 동선을
 * 밟은 사람은 럽슐랭을 한 곳도 만들지 못했다.
 *
 * <p>그래서 <b>"다녀왔어요" 하나</b>로 합친다 — 폼의 별점을 저장하면 방문 기록을 남기고
 * 그 별점을 대표 평점으로 upsert 한다(rate() 는 원래 upsert 라 재방문에도 안전). 이미
 * 식단 탭이 쓰던 방식이고(DietRecordScreen), 이제 두 탭의 규칙이 같다. 대표 평점만 따로
 * 고치고 싶을 때(오늘은 별로였지만 가게 평가는 유지)를 위해 위쪽은 한 줄 요약 + "수정"으로
 * 접어둔다. 분석: docs/LOVELICHELIN_UX_REANALYSIS_2026-09-14.md 3-1 · 5-1.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
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
import type { PlaceScreensParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { SpacingFixBar } from '../../components/SpacingFixBar';
import { useSpacingFix } from '../../hooks/useSpacingFix';
import { Checkbox } from '../../components/Checkbox';
import { DateField } from '../../components/DateField';
import { EmptyState } from '../../components/EmptyState';
import { ImageViewer } from '../../components/ImageViewer';
import { IconButton } from '../../components/IconButton';
import { KakaoMap } from '../../components/KakaoMap';
import { LovelichelinBadge } from '../../components/LovelichelinBadge';
import { LovelichelinFanfareModal } from '../../components/LovelichelinFanfareModal';
import { LovelichelinRuleSheet } from '../../components/LovelichelinRuleSheet';
import { SoloPickBadge } from '../../components/SoloPickBadge';
import { usePlaceStore } from '../../store/placeStore';
import { SOLO_PICK_MIN_RATING } from './placeFilters';
import { isKakaoMapConfigured } from '../../constants/config';
import { placeApi } from '../../api/place';
import { useDeleteAction } from '../../hooks/useDeleteAction';
import { useDietStore } from '../../store/dietStore';
import { pickImage, uploadImage } from '../../utils/imageUpload';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { runBusy } from '../../store/busyStore';
import { haptics } from '../../utils/haptics';
import { toDateString } from '../../utils/date';
import { defaultMealType } from '../../utils/mealType';
import { stars } from '../../utils/ratingStars';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { MealType, Place, PlaceVisit } from '../../types';
import { themedStyles } from '../../theme/themedStyles';
import { useAndroidKeyboardHeight } from '../../hooks/useAndroidKeyboardHeight';

// 럽슐랭 탭과 홈(여행) 스택 양쪽에 등록되는 화면 — 두 스택이 공유하는 최소 목록으로 타입을 잡는다
type Props = NativeStackScreenProps<PlaceScreensParamList, 'PlaceDetail'>;

const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: 'BREAKFAST', label: '아침' },
  { value: 'LUNCH', label: '점심' },
  { value: 'DINNER', label: '저녁' },
  { value: 'SNACK', label: '간식' },
];

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
  // 기록은 대개 사후에 남긴다 — "지난 주말 갔던 곳"이 오늘로 저장되지 않게 날짜를 고를 수 있다
  // (API는 원래 visitedAt 을 받고 있었는데 화면에만 없었다)
  const [visitedAt, setVisitedAt] = useState(toDateString());
  const [memo, setMemo] = useState('');

  /*
   * 띄어쓰기 정리 — 채팅과 달리 여기는 문장을 쓰는 자리다. 자동으로 고치지 않고
   * 눌렀을 때만 바꾼다(되돌리기 제공) — 맞춤법상 맞아도 원치 않는 변경이 있다.
   */
  const spacingFix = useSpacingFix();
  const onFixMemoSpacing = async () => {
    const corrected = await spacingFix.fix(memo);
    if (corrected === null) {
      toast.info('고칠 띄어쓰기가 없어요.');
      return;
    }
    haptics.light();
    setMemo(corrected);
  };
  const onUndoMemoSpacing = () => {
    const before = spacingFix.undo();
    if (before !== null) setMemo(before);
  };
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /*
   * 식단으로도 등록 — 방문 기록 저장 시 meals 에도 기록하고 place_visits.meal_id 로 연결한다.
   * 끼니만 고르고 칼로리·탄단지 입력은 받지 않는다: 식단 탭이 2026-09-09 에 버린 정밀 입력이
   * 여기서만 되살아나 있었다. 사진만 있으면 서버가 뒤이어 칼로리를 채우고(MealPhotoAutoAnalysisService),
   * 고치고 싶으면 식단 탭에서 고친다.
   */
  const [logMeal, setLogMeal] = useState(false);
  const [mealType, setMealType] = useState<MealType>(defaultMealType());
  /*
   * 식단을 먼저 저장하고 방문 기록을 남기는 2단 저장이라, 뒤가 실패하면 식단만 떠 있는
   * 상태가 된다. 그대로 재시도하면 식단이 두 번 쌓이므로 발급받은 id 를 들고 있다가
   * 재시도 때 재사용한다 — 폼을 닫을 때만 비운다.
   */
  const savedMealId = useRef<number | undefined>(undefined);

  // 럽슐랭 대표 평점 — 기본 동선("다녀왔어요")이 이 값을 함께 쓰므로 평소엔 한 줄 요약으로
  // 접어두고, 방문과 무관하게 가게 평가만 고칠 때만 펼친다.
  const [myRatingInput, setMyRatingInput] = useState(0);
  const [ratingEditing, setRatingEditing] = useState(false);
  const [ratingSaving, setRatingSaving] = useState(false);
  const [ruleOpen, setRuleOpen] = useState(false);
  // 재평가로 등급이 유지/하락할 때는 축하 모달을 열지 않는다 — 0→양수로 "새로 등극"할 때만
  const [fanfareTier, setFanfareTier] = useState(0);

  /*
   * 삭제 in-flight 가드 — 장소 자체 삭제(성공 시 화면을 뜨는 단발성 액션)와 방문 기록
   * 한 건 삭제(목록 행)는 모양이 서로 달라 인스턴스를 따로 둔다(QA_CHECKLIST.md 전역
   * 반복 패턴 7). 장소 삭제는 id 가 하나뿐이라 boolean 처럼만 쓰지만, 훅 시그니처를
   * 맞추기 위해 그대로 number 제네릭을 쓴다.
   */
  const { deletingId: deletingPlaceId, runDelete: runDeletePlace } = useDeleteAction<number>();
  const { deletingId: deletingVisitId, runDelete: runDeleteVisit } = useDeleteAction<number>();

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
    setVisitedAt(toDateString());
    setMemo('');
    setPhotoUri(null);
    setLogMeal(false);
    setMealType(defaultMealType());
    savedMealId.current = undefined;
  };

  /*
   * "다녀왔어요" 저장 — 방문 기록을 남기고, 별점을 매겼으면 그 별점을 럽슐랭 대표 평점으로
   * 함께 올린다(파일 상단 주석). 실패 지점마다 남는 것이 달라 처리도 다르다:
   *   ① 사진 업로드 / ② 식단 저장  — 아직 방문 기록이 없다. 폼을 열어둔 채 알리고 재시도.
   *   ③ 방문 기록                  — 식단만 떠 있을 수 있다. savedMealId 로 중복을 막고 재시도.
   *   ④ 대표 평점                  — 방문 기록은 이미 남았다. 재시도하면 방문이 두 번 쌓이므로
   *                                 폼을 닫고 "평가만 실패"를 알린다(위 '수정'에서 다시 할 수 있다).
   */
  const onSaveVisit = async () => {
    setSaving(true);
    try {
      let imageUrl: string | undefined;
      if (photoUri) {
        imageUrl = await runBusy('사진 올리는 중…', () => uploadImage(photoUri));
      }

      // 식단으로도 등록 체크 시 meals 를 먼저 저장하고, 발급된 id 를 방문 기록에 연동한다
      if (logMeal && savedMealId.current == null) {
        const savedMeal = await saveMeal({
          // 다녀온 날 = 먹은 날. 예전엔 방문 날짜와 무관하게 항상 오늘로 저장했다
          mealDate: visitedAt,
          mealType,
          memo: memo.trim() ? `${placeName} · ${memo.trim()}` : placeName,
          photoUrl: imageUrl,
        });
        savedMealId.current = savedMeal.id;
      }

      await placeApi.recordVisit(placeId, {
        visitedAt,
        rating: rating > 0 ? rating : undefined,
        memo: memo.trim() || undefined,
        imageUrl,
        mealId: savedMealId.current,
      });

      // 여기부터는 방문 기록이 이미 남았다 — 재시도로 되돌아오면 안 된다
      setFormOpen(false);
      const mealSuffix = logMeal ? '방문 기록과 식단을 함께 남겼어요!' : '방문 기록 완료!';
      resetForm();

      if (rating > 0) {
        try {
          const previousTier = place?.lovelichelinTier ?? 0;
          const updated = await placeApi.rate(placeId, { rating });
          setMyRatingInput(rating);
          if (previousTier === 0 && updated.lovelichelinTier > 0) {
            setFanfareTier(updated.lovelichelinTier);
          } else {
            toast.success(`${mealSuffix} 내 럽슐랭 평가도 ${stars(rating)} 로 저장했어요.`);
          }
        } catch (e) {
          // 방문 기록은 살아 있으므로 실패로 되돌리지 않는다 — 무엇이 안 됐는지만 알린다
          toast.error(getErrorMessage(e, '방문 기록은 남겼지만 럽슐랭 평가 저장에 실패했어요. 위 "수정"에서 다시 시도해주세요.'));
        }
      } else {
        toast.success(mealSuffix);
      }

      haptics.success();
      load();
      // 방문 기록이 상태·평균 별점·커버 사진을 바꿀 수 있다 — 가이드/둘러보기/지도가
      // 다음에 focus 될 때 캐시된 목록 대신 다시 받아오게 한다
      usePlaceStore.getState().invalidate();
    } catch (e) {
      // 식단이 이미 저장된 뒤 방문 기록에서 실패했다면 그 사실을 알려준다 — 아무 말이 없으면
      // 전부 실패한 줄 알고 폼을 닫아버리고, 식단 탭에서 뒤늦게 발견하게 된다
      Alert.alert(
        '오류',
        savedMealId.current != null
          ? `${getErrorMessage(e)}\n\n식단 기록은 이미 저장됐어요. 다시 저장해도 식단이 중복되지는 않아요.`
          : getErrorMessage(e),
      );
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
      const updated = await placeApi.rate(placeId, { rating: myRatingInput });
      setPlace(updated);
      setRatingEditing(false);
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
        onPress: () =>
          runDeletePlace(place.id, async () => {
            await placeApi.remove(place.id);
            haptics.light();
            toast.success('장소를 삭제했어요.');
            usePlaceStore.getState().invalidate();
            navigation.goBack();
          }),
      },
    ]);
  };

  const onDeleteVisit = (visit: PlaceVisit) => {
    Alert.alert('방문 기록 삭제', `${visit.visitedAt} 기록을 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () =>
          runDeleteVisit(visit.id, async () => {
            await placeApi.removeVisit(placeId, visit.id);
            haptics.light();
            toast.success('방문 기록을 삭제했어요.');
            load();
            usePlaceStore.getState().invalidate();
          }),
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
                        // 성공하면 곧장 goBack 이라 흐려질 행이 없다 — 응답 대기 중 연타로
                        // 중복 DELETE 되지 않게 버튼만 잠근다(QA_CHECKLIST.md 전역 반복 패턴 7)
                        disabled={deletingPlaceId != null}
                        onPress={onDeletePlace}
                      />
                    </View>
                  </View>
                  <View style={styles.infoChipRow}>
                    {place.category ? (
                      <View style={styles.infoChip}>
                        <Text style={styles.infoChipText}>{place.category}</Text>
                      </View>
                    ) : null}
                    {place.lovelichelinTier === 0 &&
                    ((place.myRating != null && place.myRating >= SOLO_PICK_MIN_RATING && place.partnerRating == null) ||
                      (place.partnerRating != null &&
                        place.partnerRating >= SOLO_PICK_MIN_RATING &&
                        place.myRating == null)) ? (
                      <SoloPickBadge who={place.myRating != null ? 'me' : 'partner'} size="sm" />
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

                  {/*
                    럽슐랭 평가 — 평소엔 "나 ★★★★ · 상대 ★★★" 한 줄 요약이다. 별점을 매기는
                    자리는 아래 "다녀왔어요" 폼 하나로 모았고(파일 상단 주석), 여기는 방문과
                    무관하게 가게 평가만 고칠 때 펼친다.
                  */}
                  <View style={styles.lovelichelinSection}>
                    <View style={styles.lovelichelinHeader}>
                      <View style={styles.lovelichelinLabelRow}>
                        <Text style={styles.label}>럽슐랭 평가</Text>
                        {/* 앱이 판정만 보여주고 규칙은 말하지 않던 자리 — 기준을 여기서 편다 */}
                        <IconButton
                          icon="comment-question-outline"
                          label="럽슐랭 등급 기준 보기"
                          onPress={() => setRuleOpen(true)}
                        />
                      </View>
                      <LovelichelinBadge tier={place.lovelichelinTier} size="sm" />
                    </View>

                    <View style={styles.ratingSummaryRow}>
                      <View style={styles.ratingSummaryTexts}>
                        <Text style={[styles.ratingSummary, { color: colors.me }]}>
                          나 {place.myRating ? stars(place.myRating) : '아직 평가 전'}
                        </Text>
                        <Text style={[styles.ratingSummary, { color: colors.partner }]}>
                          상대 {place.partnerRating ? stars(place.partnerRating) : '아직 평가 전'}
                        </Text>
                      </View>
                      <Button
                        title={ratingEditing ? '닫기' : place.myRating ? '수정' : '평가하기'}
                        variant="ghost"
                        size="sm"
                        onPress={() => {
                          // 펼칠 때마다 저장된 값에서 다시 시작한다 — 고치다 만 값이 남아 있으면
                          // 다음에 열었을 때 실제 평점과 다른 별이 켜져 있다
                          setMyRatingInput(place.myRating ?? 0);
                          setRatingEditing((v) => !v);
                        }}
                      />
                    </View>

                    {ratingEditing ? (
                      <>
                        <View style={styles.starRowSm}>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <TouchableOpacity
                              key={n}
                              // 같은 별을 다시 눌러 0으로 푸는 토글이 있었는데, 별점 위젯에서
                              // 같은 별 재탭은 흔한 실수라 저장 버튼만 이유 없이 죽어 보였다.
                              // 평점 삭제 경로는 원래 API 에도 없다 — 고르면 고른 값으로 둔다.
                              onPress={() => setMyRatingInput(n)}
                              accessibilityLabel={`나의 럽슐랭 평점 ${n}점`}
                            >
                              <Text style={[styles.starSm, { color: colors.me }]}>
                                {n <= myRatingInput ? '★' : '☆'}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                        <Button
                          title="평가 저장"
                          variant="secondary"
                          size="sm"
                          onPress={onSaveRating}
                          loading={ratingSaving}
                          disabled={myRatingInput === 0}
                        />
                      </>
                    ) : null}
                  </View>
                </View>
              ) : null}

              {formOpen ? (
                <View style={styles.form}>
                  <Text style={styles.label}>별점</Text>
                  <View style={styles.starRow}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <TouchableOpacity
                        key={n}
                        // 여기선 0(별점 없이 기록만)이 의미 있는 값이라 토글을 남긴다
                        onPress={() => setRating(rating === n ? 0 : n)}
                        accessibilityRole="button"
                        accessibilityLabel={`별점 ${n}점`}
                      >
                        <Text style={styles.star}>{n <= rating ? '★' : '☆'}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.starHint}>
                    {rating > 0
                      ? place?.myRating
                        ? '내 럽슐랭 평가도 이 별점으로 바뀌어요'
                        : '이 별점이 내 럽슐랭 평가가 돼요 — 둘 다 매기면 등급이 붙어요'
                      : '별점 없이 기록만 남길 수도 있어요'}
                  </Text>

                  <DateField
                    label="다녀온 날"
                    value={visitedAt}
                    onChange={setVisitedAt}
                    max={toDateString()}
                    pickerTitle="언제 다녀오셨나요?"
                  />

                  <TouchableOpacity
                    style={[styles.photoBox, photoUri ? styles.photoBoxFilled : styles.photoBoxEmpty]}
                    onPress={onPickPhoto}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={photoUri ? '사진 변경하기' : undefined}
                  >
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
                    onChangeText={(next) => {
                      // 사용자가 다시 손대면 되돌리기는 의미가 없어진다
                      spacingFix.clearUndo();
                      setMemo(next);
                    }}
                    multiline
                  />

                  {memo.trim().length > 0 ? (
                    <SpacingFixBar
                      busy={spacingFix.busy}
                      canUndo={spacingFix.canUndo}
                      onFix={onFixMemoSpacing}
                      onUndo={onUndoMemoSpacing}
                    />
                  ) : null}

                  <Checkbox
                    checked={logMeal}
                    onChange={setLogMeal}
                    label="식단으로도 기록할까요?"
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
                            accessibilityState={{ selected: mealType === t.value }}
                          >
                            <Text style={[styles.typeText, mealType === t.value && styles.typeTextActive]}>
                              {t.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <Text style={styles.mealHint}>
                        칼로리는 사진이 있으면 자동으로 채워져요. 럽바디 탭에서 고칠 수 있어요.
                      </Text>
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
                <Button
                  title="다녀왔어요"
                  onPress={() => {
                    resetForm();
                    setRatingEditing(false);
                    setFormOpen(true);
                  }}
                />
              )}

              <Text style={styles.sectionTitle}>방문 기록</Text>
              {/* 지울 기록이 있을 때만 의미가 있다 — 빈 목록에는 EmptyState 쪽 안내로 충분 */}
              {visits.length > 0 ? <Text style={styles.visitHint}>길게 눌러 삭제 · 사진은 탭해서 크게 보기</Text> : null}
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.visitCard, deletingVisitId === item.id && styles.visitCardDeleting]}
              activeOpacity={item.imageUrl ? 0.8 : 1}
              disabled={deletingVisitId === item.id}
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
                  description="다녀오셨다면 별점과 함께 남겨보세요!"
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
      <LovelichelinRuleSheet visible={ruleOpen} onClose={() => setRuleOpen(false)} />
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
  infoChipText: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '600' },
  infoAddress: { fontSize: fontSize.body, color: colors.textSecondary, marginTop: spacing.sm },
  infoStats: { fontSize: fontSize.caption, color: colors.textPrimary, fontWeight: '700', marginTop: spacing.xs },
  infoMap: { marginTop: spacing.md },
  lovelichelinSection: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  lovelichelinHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // label 에 marginBottom 이 있어 ⓘ 와 밑줄이 어긋난다 — 줄 자체를 가운데로 맞춘다
  lovelichelinLabelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  // 접힌 상태의 한 줄 요약 — "나 ★★★★ / 상대 ★★★" 과 수정 버튼
  ratingSummaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  ratingSummaryTexts: { flex: 1, gap: 2 },
  ratingSummary: { fontSize: fontSize.caption, fontWeight: '700' },
  starRowSm: { flexDirection: 'row', gap: 2 },
  starSm: { fontSize: 22 },
  form: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  label: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700', marginBottom: spacing.sm },
  starRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xs },
  star: { fontSize: 32, color: colors.accent },
  // 별점이 대표 평점으로도 간다는 사실을 그 자리에서 알려준다 — 별 위젯을 하나로 합친 뒤
  // 이게 없으면 "등급은 어디서 매기지?" 가 된다
  starHint: { fontSize: fontSize.caption, color: colors.textSecondary, marginBottom: spacing.md },
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
  mealHint: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: spacing.sm },
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
  // 삭제 진행 중 표시 — useDeleteAction (QA_CHECKLIST.md 전역 반복 패턴 7)
  visitCardDeleting: { opacity: 0.5 },
  visitHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  visitDate: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '600' },
  visitStars: { fontSize: fontSize.body, color: colors.togetherText, fontWeight: '700' },
  visitPhoto: { width: '100%', height: 160, borderRadius: radius.md, marginTop: spacing.sm },
  visitMemo: { fontSize: fontSize.body, color: colors.textPrimary, marginTop: spacing.sm },
  mealBadge: { fontSize: fontSize.caption, color: colors.primary, fontWeight: '700', marginTop: spacing.sm },
  empty: { fontSize: fontSize.caption, color: colors.textSecondary, textAlign: 'center', paddingVertical: spacing.lg },
}));
