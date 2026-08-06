/** 식단 기록 입력 — 끼니·사진·칼로리·메모 + 즐겨찾기 원탭 추가. 운동(WorkoutRecordScreen) 미러링 */
import React, { useCallback, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Alert } from '../../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { WorkoutStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { useDietStore } from '../../store/dietStore';
import { useRelationStore } from '../../store/relationStore';
import { publishEnsuringConnection } from '../../api/chatSocket';
import { dietApi } from '../../api/diet';
import { pickImage, takePhoto, uploadImage } from '../../utils/imageUpload';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { runBusy } from '../../store/busyStore';
import { haptics } from '../../utils/haptics';
import { toDateString } from '../../utils/date';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { AnalyzedFood, FavoriteFood, MealType } from '../../types';

type Props = NativeStackScreenProps<WorkoutStackParamList, 'DietRecord'>;

const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: 'BREAKFAST', label: '아침' },
  { value: 'LUNCH', label: '점심' },
  { value: 'DINNER', label: '저녁' },
  { value: 'SNACK', label: '간식' },
];

// 현재 시간대에 맞는 끼니 기본 선택
function defaultMealType(): MealType {
  const h = new Date().getHours();
  if (h < 11) return 'BREAKFAST';
  if (h < 15) return 'LUNCH';
  if (h < 21) return 'DINNER';
  return 'SNACK';
}

// 즐겨찾기가 없을 때 보여줄 시작용 추천 (탭하면 이름만 추가)
const STARTER_SUGGESTIONS = ['닭가슴살', '샐러드', '현미밥', '고구마', '계란', '단백질쉐이크', '아메리카노'];

export function DietRecordScreen({ navigation }: Props) {
  const save = useDietStore((s) => s.save);
  const couple = useRelationStore((s) => s.couple);
  const [mealType, setMealType] = useState<MealType>(defaultMealType());
  const [memo, setMemo] = useState('');
  const [calories, setCalories] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzingText, setAnalyzingText] = useState(false);
  // AI가 인식한 음식 목록 — 칩으로 보여주고 잘못 잡힌 항목은 하나씩 뺄 수 있다.
  // 칼로리·탄단지는 항상 이 목록의 합으로 파생시킨다(별도 state 로 안 들고 다닌다 — 둘이
  // 따로 놀면 칩을 지웠는데 합계가 안 바뀌는 식으로 어긋나기 쉽다).
  const [detectedFoods, setDetectedFoods] = useState<AnalyzedFood[]>([]);
  // 업로드 결과 캐시 — AI 분석과 저장이 같은 사진을 두 번 올리지 않도록
  const uploadedRef = useRef<{ uri: string; url: string } | null>(null);

  const foodTotals = detectedFoods.reduce(
    (acc, f) => ({
      calories: acc.calories + (f.calories || 0),
      carbs: acc.carbs + (f.carbs || 0),
      protein: acc.protein + (f.protein || 0),
      fat: acc.fat + (f.fat || 0),
    }),
    { calories: 0, carbs: 0, protein: 0, fat: 0 },
  );

  // AI 결과 반영 — 사진 분석·텍스트 분석 공통. 메모는 건드리지 않는다(아래 onAnalyze 참고).
  const applyFoods = (foods: AnalyzedFood[]) => {
    setDetectedFoods(foods);
    const total = foods.reduce((sum, f) => sum + (f.calories || 0), 0);
    setCalories(foods.length > 0 ? String(total) : '');
  };

  const removeDetectedFood = (index: number) => {
    haptics.light();
    applyFoods(detectedFoods.filter((_, i) => i !== index));
  };

  // 즐겨찾는 음식
  const [favorites, setFavorites] = useState<FavoriteFood[]>([]);
  const loadFavorites = useCallback(() => {
    dietApi.favorites().then(setFavorites).catch(() => setFavorites([]));
  }, []);
  useFocusEffect(useCallback(() => loadFavorites(), [loadFavorites]));

  const addName = (food: string) => {
    setMemo((prev) => (prev.trim() ? `${prev.trim()}, ${food}` : food));
  };

  // 즐겨찾기 탭 — 이름은 메모에, 칼로리는 합산
  const addFavorite = (fav: FavoriteFood) => {
    haptics.light();
    addName(fav.name);
    if (fav.calories) {
      setCalories((prev) => String((Number(prev) || 0) + (fav.calories ?? 0)));
    }
  };

  // 현재 입력을 즐겨찾기로 저장
  const saveCurrentAsFavorite = async () => {
    const name = memo.trim();
    if (!name) {
      toast.error('음식 이름(메모)을 먼저 입력해주세요.');
      return;
    }
    try {
      const fav = await dietApi.saveFavorite({
        name,
        calories: calories ? Number(calories) : undefined,
        carbs: detectedFoods.length > 0 ? foodTotals.carbs : undefined,
        protein: detectedFoods.length > 0 ? foodTotals.protein : undefined,
        fat: detectedFoods.length > 0 ? foodTotals.fat : undefined,
      });
      haptics.success();
      toast.success('즐겨찾기에 저장했어요 ');
      setFavorites((prev) => [fav, ...prev]);
    } catch (e) {
      toast.error(getErrorMessage(e, '즐겨찾기 저장에 실패했어요.'));
    }
  };

  const deleteFavorite = (fav: FavoriteFood) => {
    Alert.alert('즐겨찾기 삭제', `"${fav.name}"을(를) 즐겨찾기에서 뺄까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await dietApi.removeFavorite(fav.id);
            haptics.light();
            setFavorites((prev) => prev.filter((f) => f.id !== fav.id));
          } catch (e) {
            toast.error(getErrorMessage(e));
          }
        },
      },
    ]);
  };

  const pickFrom = async (source: 'camera' | 'gallery') => {
    try {
      const uri = source === 'camera' ? await takePhoto() : await pickImage();
      if (uri) setPhotoUri(uri);
    } catch (e) {
      toast.error(getErrorMessage(e, '사진 선택에 실패했어요.'));
    }
  };

  const onPickPhoto = () => {
    // 웹은 카메라 촬영 UX가 어색하므로 갤러리(파일 선택)만 사용
    if (Platform.OS === 'web') {
      void pickFrom('gallery');
      return;
    }
    Alert.alert('사진 추가', '어떻게 추가할까요?', [
      { text: '카메라 촬영', onPress: () => void pickFrom('camera') },
      { text: '갤러리에서 선택', onPress: () => void pickFrom('gallery') },
      { text: '취소', style: 'cancel' },
    ]);
  };

  const ensureUploaded = async (uri: string): Promise<string> => {
    if (uploadedRef.current?.uri === uri) return uploadedRef.current.url;
    const url = await uploadImage(uri);
    uploadedRef.current = { uri, url };
    return url;
  };

  // AI 음식 분석 — 인식된 음식은 칩으로 보여주고, 메모는 건드리지 않는다.
  // (사진이 이미 무엇을 먹었는지 말해주므로 이름을 텍스트로 또 채울 필요가 없다 —
  //  칩을 나중에 하나 지웠을 때 메모 문자열에서 정확히 그 이름만 잘라내야 하는
  //  꼬임도 애초에 생기지 않는다.)
  const onAnalyze = async () => {
    if (!photoUri) return;
    setAnalyzing(true);
    try {
      const photoUrl = await runBusy('사진 올리는 중…', () => ensureUploaded(photoUri));
      const result = await runBusy('AI가 음식을 분석하고 있어요', () => dietApi.analyze(photoUrl));
      if (!result.isFood || result.foods.length === 0) {
        toast.error('음식 사진이 아닌 것 같아요 ');
        return;
      }
      applyFoods(result.foods);
      if (result.totalCalories <= 0) {
        // 음식은 알아봤지만 양을 가늠하지 못한 경우 — 빈 칸으로 두면 실패로 오해한다
        toast.info('칼로리는 추정하지 못했어요. 직접 입력해주세요.');
      }
      haptics.success();
      toast.success(result.comment?.trim() || 'AI 분석 완료! ');
    } catch (e) {
      toast.error(getErrorMessage(e, 'AI 분석에 실패했어요.'));
    } finally {
      setAnalyzing(false);
    }
  };

  // 메모에 적은 음식으로 칼로리 추정 — 사진 없이도 쓰는 경로.
  // 메모는 사용자가 직접 쓴 설명이라 그대로 두고, 파싱된 음식만 칩으로 보여준다.
  const onAnalyzeText = async () => {
    const text = memo.trim();
    if (!text) return;
    setAnalyzingText(true);
    try {
      const result = await runBusy('AI가 칼로리를 계산하고 있어요', () => dietApi.analyzeText(text));
      if (!result.isFood || result.foods.length === 0) {
        toast.error('무엇을 먹었는지 알아보지 못했어요. 음식 이름을 적어주세요.');
        return;
      }
      applyFoods(result.foods);
      if (result.totalCalories <= 0) {
        toast.info('칼로리는 추정하지 못했어요. 직접 입력해주세요.');
      }
      haptics.success();
      toast.success(result.comment?.trim() || 'AI 칼로리 계산 완료!');
    } catch (e) {
      toast.error(getErrorMessage(e, 'AI 계산에 실패했어요.'));
    } finally {
      setAnalyzingText(false);
    }
  };

  const onSave = async () => {
    if (!memo.trim() && !photoUri) {
      Alert.alert('알림', '음식 메모나 사진을 하나 이상 입력해주세요.');
      return;
    }
    setSaving(true);
    try {
      let photoUrl: string | undefined;
      if (photoUri) {
        photoUrl = await runBusy('사진 올리는 중…', () => ensureUploaded(photoUri));
      }
      const label = MEAL_TYPES.find((t) => t.value === mealType)?.label ?? '';
      const saved = await save({
        mealDate: toDateString(),
        mealType,
        memo: memo.trim() || undefined,
        photoUrl,
        calories: calories ? Number(calories) : undefined,
        carbs: detectedFoods.length > 0 ? foodTotals.carbs : undefined,
        protein: detectedFoods.length > 0 ? foodTotals.protein : undefined,
        fat: detectedFoods.length > 0 ? foodTotals.fat : undefined,
      });
      haptics.success();
      toast.success('식단 기록 완료! ');

      // 커플이 연결돼 있으면 채팅 공유 제안
      if (couple?.id) {
        const summary = `${label}${memo.trim() ? ` · ${memo.trim()}` : ''}${
          calories ? ` (${calories}kcal)` : ''
        }`;
        Alert.alert('식단 기록 완료! ', '이 식단을 채팅에 공유할까요?', [
          { text: '다음에', style: 'cancel', onPress: () => navigation.goBack() },
          {
            text: '공유하기',
            onPress: async () => {
              await publishEnsuringConnection(couple.id, {
                messageType: 'MEAL_CARD',
                content: summary,
                imageUrl: saved.photoUrl ?? undefined,
              });
              toast.success('채팅에 공유했어요 ');
              navigation.goBack();
            },
          },
        ]);
        return;
      }
      navigation.goBack();
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.date}>{toDateString()}</Text>

          {/* 끼니 선택 */}
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

          {/* 사진 */}
          <Text style={styles.label}>사진</Text>
          <TouchableOpacity style={[styles.photoBox, photoUri ? styles.photoBoxFilled : styles.photoBoxEmpty]} onPress={onPickPhoto} activeOpacity={0.8}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />
            ) : (
              <Text style={styles.photoPlaceholder}>사진 추가하기</Text>
            )}
          </TouchableOpacity>
          {photoUri ? (
            <TouchableOpacity
              onPress={() => {
                setPhotoUri(null);
                // 이 사진에서 나온 인식 결과라 사진이 사라지면 같이 지운다
                applyFoods([]);
              }}
            >
              <Text style={styles.removePhoto}>사진 제거</Text>
            </TouchableOpacity>
          ) : null}

          {/* AI 음식 분석 — 사진이 있을 때만 노출. 결과(칩)는 아래 공통 섹션에서 보여준다 */}
          {photoUri ? (
            <>
              <Button
                title="AI로 음식 분석"
                variant="soft"
                size="md"
                onPress={onAnalyze}
                loading={analyzing}
                style={styles.analyzeButton}
              />
              <Text style={styles.analyzeHint}>분석 결과는 추정치예요. 저장 전에 수정할 수 있어요.</Text>
            </>
          ) : null}

          {/* 즐겨찾기 — 원탭 추가 (길게 눌러 삭제). 없으면 시작용 추천 */}
          <View style={styles.favHeader}>
            <Text style={styles.label}>즐겨찾기</Text>
            <TouchableOpacity onPress={saveCurrentAsFavorite}>
              <Text style={styles.favSave}>＋ 현재 저장</Text>
            </TouchableOpacity>
          </View>
          {favorites.length > 0 ? (
            <View style={styles.presetRow}>
              {favorites.map((f) => (
                <TouchableOpacity
                  key={f.id}
                  style={styles.favChip}
                  onPress={() => addFavorite(f)}
                  onLongPress={() => deleteFavorite(f)}
                >
                  <Text style={styles.favChipText}>{f.name}</Text>
                  {f.calories ? <Text style={styles.favChipCal}>{f.calories}kcal</Text> : null}
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <>
              <Text style={styles.favHint}>자주 먹는 음식을 저장하면 원탭으로 추가할 수 있어요.</Text>
              <View style={styles.presetRow}>
                {STARTER_SUGGESTIONS.map((p) => (
                  <TouchableOpacity key={p} style={styles.presetChip} onPress={() => addName(p)}>
                    <Text style={styles.presetText}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <TextField
            label="먹은 음식 / 메모"
            placeholder="예: 닭가슴살 샐러드, 현미밥"
            value={memo}
            onChangeText={setMemo}
            multiline
          />
          {/* 적어둔 음식으로 칼로리 추정 — 사진이 없을 때의 경로 (사진이 있으면 위 사진 분석을 쓴다) */}
          {!photoUri && memo.trim() ? (
            <>
              <Button
                title="AI로 칼로리 계산"
                variant="soft"
                size="md"
                onPress={onAnalyzeText}
                loading={analyzingText}
                style={styles.analyzeButton}
              />
              <Text style={styles.analyzeHint}>계산 결과는 추정치예요. 저장 전에 수정할 수 있어요.</Text>
            </>
          ) : null}

          {/* AI가 인식한 음식 — 사진 분석·텍스트 분석 공통. 잘못 잡힌 항목은 칩의 ×로 뺀다.
              빼면 칼로리·탄단지 합계가 바로 그만큼 줄어든다 (applyFoods 에서 재계산). */}
          {detectedFoods.length > 0 ? (
            <>
              <Text style={styles.label}>AI가 알아본 음식</Text>
              <View style={styles.presetRow}>
                {detectedFoods.map((f, i) => (
                  <View key={`${f.name}-${i}`} style={styles.foodChip}>
                    <Text style={styles.foodChipText}>{f.name}</Text>
                    {f.calories ? <Text style={styles.foodChipCal}>{f.calories}kcal</Text> : null}
                    <TouchableOpacity
                      onPress={() => removeDetectedFood(i)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`${f.name} 빼기`}
                    >
                      <MaterialCommunityIcons name="close" size={13} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
              <View style={styles.macroRow}>
                <View style={styles.macroItem}>
                  <Text style={styles.macroValue}>{foodTotals.carbs}g</Text>
                  <Text style={styles.macroLabel}>탄수화물</Text>
                </View>
                <View style={styles.macroItem}>
                  <Text style={styles.macroValue}>{foodTotals.protein}g</Text>
                  <Text style={styles.macroLabel}>단백질</Text>
                </View>
                <View style={styles.macroItem}>
                  <Text style={styles.macroValue}>{foodTotals.fat}g</Text>
                  <Text style={styles.macroLabel}>지방</Text>
                </View>
              </View>
            </>
          ) : null}
          <TextField
            label="칼로리 (kcal, 선택)"
            placeholder="450"
            keyboardType="number-pad"
            value={calories}
            onChangeText={(t) => setCalories(t.replace(/[^0-9]/g, ''))}
          />

          <Button title="완료!" onPress={onSave} loading={saving} style={styles.save} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  container: { padding: spacing.lg, paddingBottom: spacing.xl },
  date: { fontSize: fontSize.subtitle, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.md },
  label: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700', marginBottom: spacing.sm, marginTop: spacing.md },
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
  photoBox: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  /*
   * 사진 유무로 높이 규칙이 다르다. 예전엔 photoBox 에 고정 height 를 두고
   * photoBoxFilled 에서 `height: undefined` 로 지우려 했는데, 스타일 병합에서
   * undefined 는 무시되어 고정 높이가 그대로 남고 aspectRatio 가 먹지 않았다.
   * 그래서 기본에는 높이를 두지 않고 상태별 스타일로 나눈다.
   */
  photoBoxEmpty: { width: '100%', aspectRatio: 3 / 2 },
  photoBoxFilled: { width: '100%', aspectRatio: 1 },
  photo: { width: '100%', height: '100%' },
  photoPlaceholder: { color: colors.textSecondary, fontSize: fontSize.body, fontWeight: '600' },
  removePhoto: { color: colors.danger, fontSize: fontSize.caption, marginTop: spacing.xs, alignSelf: 'flex-end' },
  analyzeButton: { marginTop: spacing.sm },
  analyzeHint: { color: colors.textSecondary, fontSize: fontSize.caption, marginTop: spacing.xs, textAlign: 'center' },
  macroRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  macroItem: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  macroValue: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  macroLabel: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 2 },
  // 즐겨찾기 칩(primary)과 색을 달리해 "AI가 방금 추측한 것 — 지울 수 있다"는 걸 구분한다
  foodChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  foodChipText: { fontSize: fontSize.caption, color: colors.textPrimary, fontWeight: '700' },
  foodChipCal: { fontSize: 10, color: colors.textSecondary, fontWeight: '700' },
  favHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  favSave: { fontSize: fontSize.caption, color: colors.primary, fontWeight: '800' },
  favHint: { fontSize: fontSize.caption, color: colors.textSecondary, marginBottom: spacing.sm },
  favChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primaryBg,
  },
  favChipText: { fontSize: fontSize.caption, color: colors.primary, fontWeight: '700' },
  favChipCal: { fontSize: 10, color: colors.textSecondary, fontWeight: '700' },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  presetChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  presetText: { fontSize: fontSize.caption, color: colors.textPrimary, fontWeight: '600' },
  save: { marginTop: spacing.lg },
});
