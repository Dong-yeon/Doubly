/** 식단 기록 입력 — 끼니·사진·칼로리·메모 + 즐겨찾기 원탭 추가. 운동(WorkoutRecordScreen) 미러링 */
import React, { useCallback, useRef, useState } from 'react';
import { Image, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { WorkoutStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { FormKeyboardView } from '../../components/FormKeyboardView';
import { DateField } from '../../components/DateField';
import { Chip } from '../../components/Chip';
import { useDietStore } from '../../store/dietStore';
import { useRelationStore } from '../../store/relationStore';
import { useDirtyGuard } from '../../hooks/useDirtyGuard';
import { publishEnsuringConnection } from '../../api/chatSocket';
import { dietApi } from '../../api/diet';
import { pickImage, takePhoto, uploadImage } from '../../utils/imageUpload';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { runBusy } from '../../store/busyStore';
import { haptics } from '../../utils/haptics';
import { toDateString } from '../../utils/date';
import { buildDietShareCopy } from '../../utils/dietShare';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { FavoriteFood, MealType, RecentFood } from '../../types';
import { themedStyles } from '../../theme/themedStyles';

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

export function DietRecordScreen({ navigation, route }: Props) {
  const save = useDietStore((s) => s.save);
  const couple = useRelationStore((s) => s.couple);
  const [mealType, setMealType] = useState<MealType>(defaultMealType());
  /** 기록할 날짜 — 캘린더에서 날짜를 골라 들어오면 그 날짜, 아니면 오늘 */
  const [mealDate, setMealDate] = useState(route.params?.date ?? toDateString());
  const [memo, setMemo] = useState('');
  const [calories, setCalories] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzingText, setAnalyzingText] = useState(false);
  // AI 분석 매크로(탄단지) + 추가 영양소(당류/나트륨/식이섬유) — 결과 표시용. sugar/sodium/fiber 는
  // 즐겨찾기 추가 경로에는 없어서 옵션으로 둔다(그 경로는 이 값들을 채우지 않는다).
  const [macros, setMacros] = useState<{
    carbs: number; protein: number; fat: number;
    sugar?: number; sodium?: number; fiber?: number;
  } | null>(null);
  // 업로드 결과 캐시 — AI 분석과 저장이 같은 사진을 두 번 올리지 않도록
  const uploadedRef = useRef<{ uri: string; url: string } | null>(null);

  // 입력이 하나라도 있으면 이탈(뒤로가기·스와이프) 전에 확인한다
  const dirty = memo.trim().length > 0 || calories.trim().length > 0 || photoUri != null;
  const allowLeave = useDirtyGuard(dirty);

  // 즐겨찾는 음식
  const [favorites, setFavorites] = useState<FavoriteFood[]>([]);
  const loadFavorites = useCallback(() => {
    dietApi.favorites().then(setFavorites).catch(() => setFavorites([]));
  }, []);
  useFocusEffect(useCallback(() => loadFavorites(), [loadFavorites]));

  // 최근 먹은 음식 — 즐겨찾기와 달리 저장 없이 최근 기록에서 자동으로 뽑힌다
  const [recentFoods, setRecentFoods] = useState<RecentFood[]>([]);
  useFocusEffect(
    useCallback(() => {
      dietApi.recentFoods().then(setRecentFoods).catch(() => setRecentFoods([]));
    }, []),
  );

  // 최근 항목 탭 — 즐겨찾기(addFavorite)와 같은 방식으로 메모·칼로리·매크로를 더한다
  const addRecent = (food: RecentFood) => {
    haptics.light();
    addName(food.memo);
    if (food.calories) {
      setCalories((prev) => String((Number(prev) || 0) + (food.calories ?? 0)));
    }
    if (food.carbs || food.protein || food.fat) {
      setMacros((prev) => ({
        carbs: (prev?.carbs ?? 0) + (food.carbs ?? 0),
        protein: (prev?.protein ?? 0) + (food.protein ?? 0),
        fat: (prev?.fat ?? 0) + (food.fat ?? 0),
      }));
    }
  };

  const addName = (food: string) => {
    setMemo((prev) => (prev.trim() ? `${prev.trim()}, ${food}` : food));
  };

  // 즐겨찾기 세트 탭 — 항목명은 모두 메모에, 칼로리·매크로는 세트 합산치를 더한다
  const addFavorite = (fav: FavoriteFood) => {
    haptics.light();
    addName(fav.items.map((i) => i.name).join(', '));
    if (fav.totalCalories) {
      setCalories((prev) => String((Number(prev) || 0) + fav.totalCalories));
    }
    if (fav.totalCarbs || fav.totalProtein || fav.totalFat) {
      setMacros((prev) => ({
        carbs: (prev?.carbs ?? 0) + fav.totalCarbs,
        protein: (prev?.protein ?? 0) + fav.totalProtein,
        fat: (prev?.fat ?? 0) + fav.totalFat,
      }));
    }
  };

  /**
   * 현재 입력을 즐겨찾기 세트로 저장 — 메모에 콤마로 적어둔 여러 음식을 각각의 항목으로 나눈다
   * (예: "닭가슴살, 고구마, 아몬드" → 3개 항목). 항목별 칼로리/매크로 입력 UI는 아직 없어서
   * 현재 입력한 칼로리·매크로 합계는 첫 항목에 몰아 저장한다 — 세트 전체 합산치는 정확하게 유지된다.
   */
  const saveCurrentAsFavorite = async () => {
    const names = memo.split(',').map((s) => s.trim()).filter(Boolean);
    if (names.length === 0) {
      toast.error('음식 이름(메모)을 먼저 입력해주세요.');
      return;
    }
    try {
      const items = names.map((itemName, i) => ({
        name: itemName,
        calories: i === 0 && calories ? Number(calories) : undefined,
        carbs: i === 0 ? macros?.carbs : undefined,
        protein: i === 0 ? macros?.protein : undefined,
        fat: i === 0 ? macros?.fat : undefined,
      }));
      const fav = await dietApi.saveFavorite({ items });
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

  // AI 음식 분석 — 결과는 추정치라 필드에 채워만 주고 확정(저장)은 사용자가 한다
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
      const names = result.foods.map((f) => f.name).join(', ');
      setMemo((prev) => (prev.trim() ? `${prev.trim()}, ${names}` : names));
      if (result.totalCalories > 0) {
        setCalories(String(result.totalCalories));
      } else {
        // 음식은 알아봤지만 양을 가늠하지 못한 경우 — 빈 칸으로 두면 실패로 오해한다
        toast.info('칼로리는 추정하지 못했어요. 직접 입력해주세요.');
      }
      setMacros({
        carbs: result.totalCarbs, protein: result.totalProtein, fat: result.totalFat,
        sugar: result.totalSugar, sodium: result.totalSodium, fiber: result.totalFiber,
      });
      haptics.success();
      toast.success(result.comment?.trim() || 'AI 분석 완료! ');
    } catch (e) {
      toast.error(getErrorMessage(e, 'AI 분석에 실패했어요.'));
    } finally {
      setAnalyzing(false);
    }
  };

  // 메모에 적은 음식으로 칼로리 추정 — 사진 없이도 쓰는 경로. 결과는 추정치라 필드에 채워만 준다
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
      if (result.totalCalories > 0) {
        setCalories(String(result.totalCalories));
      } else {
        toast.info('칼로리는 추정하지 못했어요. 직접 입력해주세요.');
      }
      setMacros({
        carbs: result.totalCarbs, protein: result.totalProtein, fat: result.totalFat,
        sugar: result.totalSugar, sodium: result.totalSodium, fiber: result.totalFiber,
      });
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
        mealDate,
        mealType,
        memo: memo.trim() || undefined,
        photoUrl,
        calories: calories ? Number(calories) : undefined,
        carbs: macros?.carbs,
        protein: macros?.protein,
        fat: macros?.fat,
        sugar: macros?.sugar,
        sodium: macros?.sodium,
        fiber: macros?.fiber,
      });
      haptics.success();
      toast.success('식단 기록 완료! ');

      /*
       * 저장이 끝나면 공유 여부와 무관하게 화면부터 닫는다.
       * goBack 을 공유 Alert 의 버튼 안에만 두면, Android 에서 바깥 탭·뒤로가기로
       * Alert 를 닫았을 때 입력이 채워진 화면이 스택에 남는다 — 이후 건강 탭으로
       * 재진입해 "완료!"를 다시 누르면 같은 기록이 중복 등록된다.
       * Alert 는 전역이라 화면이 닫힌 뒤에도 정상 표시되고, 공유 핸들러도
       * 클로저에 잡힌 값만 쓰므로 화면 상태에 의존하지 않는다.
       */
      allowLeave();
      navigation.goBack();

      // 커플이 연결돼 있으면 채팅 공유 제안
      // 단백질 목표를 이번 기록으로 막 채웠으면 확인창·카드 문구를 다르게 만든다 (saved.goals 는
      // 저장 응답에만 실리는 일회성 정보 — MealService.detectGoalsAchieved 참고)
      if (couple?.id) {
        const summary = `${label}${memo.trim() ? ` · ${memo.trim()}` : ''}${
          calories ? ` (${calories}kcal)` : ''
        }`;
        const { alertTitle, alertMessage, cardContent } = buildDietShareCopy(summary, saved.goals);
        const isGoalAchieved = !!saved.goals && saved.goals.length > 0;

        Alert.alert(alertTitle, alertMessage, [
          { text: '다음에', style: 'cancel' },
          {
            text: '공유하기',
            onPress: async () => {
              await publishEnsuringConnection(couple.id, {
                messageType: 'MEAL_CARD',
                content: cardContent,
                imageUrl: saved.photoUrl ?? undefined,
              });
              toast.success(isGoalAchieved ? '🎯 목표 달성 소식을 공유했어요 ' : '채팅에 공유했어요 ');
            },
          },
        ]);
      }
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FormKeyboardView contentContainerStyle={styles.container}>
          {/* 지난 끼니도 기록할 수 있게 — 예전엔 저장 시각의 오늘로 고정이었다 */}
          <DateField
            label="먹은 날"
            value={mealDate}
            onChange={setMealDate}
            max={toDateString()}
            pickerTitle="언제 먹은 식단인가요?"
          />

          {/* 끼니 선택 */}
          <Text style={styles.label}>끼니</Text>
          <View style={styles.typeRow}>
            {MEAL_TYPES.map((t) => (
              <Chip
                key={t.value}
                label={t.label}
                selected={mealType === t.value}
                onPress={() => setMealType(t.value)}
                fill
              />
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
                // 사진 분석 결과·업로드 캐시도 함께 버린다 — 남겨두면 다른 음식
                // 메모로 저장할 때 이전 사진의 탄단지가 그 기록에 붙는다
                setMacros(null);
                uploadedRef.current = null;
              }}
            >
              <Text style={styles.removePhoto}>사진 제거</Text>
            </TouchableOpacity>
          ) : null}

          {/* AI 음식 분석 — 사진이 있을 때만 노출, 결과는 메모/칼로리에 자동 입력 */}
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

          {/* 즐겨찾기 세트 — 원탭 추가(길게 눌러 삭제). 여러 음식을 한 세트로 묶어뒀다가 한 번에 불러온다.
              없으면 시작용 추천 */}
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
                  {f.totalCalories ? <Text style={styles.favChipCal}>{f.totalCalories}kcal</Text> : null}
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

          {/* 최근 먹은 음식 — 즐겨찾기와 달리 따로 저장하지 않아도 최근 기록에서 자동으로 뽑힌다 */}
          {recentFoods.length > 0 ? (
            <>
              <Text style={styles.label}>최근 먹은 음식</Text>
              <View style={styles.presetRow}>
                {recentFoods.map((f) => (
                  <TouchableOpacity
                    key={f.memo}
                    style={styles.recentChip}
                    onPress={() => addRecent(f)}
                  >
                    <Text style={styles.recentChipText} numberOfLines={1}>{f.memo}</Text>
                    {f.calories ? <Text style={styles.favChipCal}>{f.calories}kcal</Text> : null}
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : null}

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
          {/*
            AI 분석 탄단지 — 사진 분석·텍스트 분석 공통 표시.
            예전엔 사진 블록 안에만 있어서, 사진 없이 "AI로 칼로리 계산"을 하면
            탄단지가 저장은 되는데 화면에는 한 번도 보이지 않았다.
          */}
          {macros ? (
            <View style={styles.macroRow}>
              <View style={styles.macroItem}>
                <Text style={styles.macroValue}>{macros.carbs}g</Text>
                <Text style={styles.macroLabel}>탄수화물</Text>
              </View>
              <View style={styles.macroItem}>
                <Text style={styles.macroValue}>{macros.protein}g</Text>
                <Text style={styles.macroLabel}>단백질</Text>
              </View>
              <View style={styles.macroItem}>
                <Text style={styles.macroValue}>{macros.fat}g</Text>
                <Text style={styles.macroLabel}>지방</Text>
              </View>
            </View>
          ) : null}
          {/* 추가 영양소 — AI 분석에서만 채워진다(즐겨찾기 경로는 없음). 목표(target)는 없는
              정보성 지표라 위 매크로보다 한 톤 낮춰 작게 보여준다. */}
          {macros && (macros.sugar != null || macros.sodium != null || macros.fiber != null) ? (
            <Text style={styles.extraNutrients}>
              당류 {macros.sugar ?? 0}g · 나트륨 {macros.sodium ?? 0}mg · 식이섬유 {macros.fiber ?? 0}g
            </Text>
          ) : null}
          <TextField
            label="칼로리 (kcal, 선택)"
            placeholder="450"
            keyboardType="number-pad"
            value={calories}
            onChangeText={(t) => setCalories(t.replace(/[^0-9]/g, ''))}
          />

          <Button title="완료!" onPress={onSave} loading={saving} style={styles.save} />
      </FormKeyboardView>
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
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
  extraNutrients: { fontSize: fontSize.caption, color: colors.textTertiary, marginTop: spacing.xs, textAlign: 'center' },
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
  recentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: 160,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  recentChipText: { fontSize: fontSize.caption, color: colors.textPrimary, fontWeight: '700', flexShrink: 1 },
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
}));
