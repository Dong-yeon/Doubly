/** 식단 기록 입력 — 끼니·사진·칼로리·메모 + 즐겨찾기 원탭 추가. 운동(WorkoutRecordScreen) 미러링 */
import React, { useCallback, useRef, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
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
import type { FavoriteFood, MealType } from '../../types';

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
  // AI 분석 매크로(탄단지) — 결과 표시용
  const [macros, setMacros] = useState<{ carbs: number; protein: number; fat: number } | null>(null);
  // 업로드 결과 캐시 — AI 분석과 저장이 같은 사진을 두 번 올리지 않도록
  const uploadedRef = useRef<{ uri: string; url: string } | null>(null);

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
        carbs: macros?.carbs,
        protein: macros?.protein,
        fat: macros?.fat,
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
      if (result.totalCalories > 0) setCalories(String(result.totalCalories));
      setMacros({ carbs: result.totalCarbs, protein: result.totalProtein, fat: result.totalFat });
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
      if (result.totalCalories > 0) setCalories(String(result.totalCalories));
      setMacros({ carbs: result.totalCarbs, protein: result.totalProtein, fat: result.totalFat });
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
        carbs: macros?.carbs,
        protein: macros?.protein,
        fat: macros?.fat,
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
          <TouchableOpacity style={[styles.photoBox, photoUri ? styles.photoBoxFilled : null]} onPress={onPickPhoto} activeOpacity={0.8}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />
            ) : (
              <Text style={styles.photoPlaceholder}>사진 추가하기</Text>
            )}
          </TouchableOpacity>
          {photoUri ? (
            <TouchableOpacity onPress={() => setPhotoUri(null)}>
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
    // 사진이 없을 때(안내 문구)만 쓰는 높이 — 사진이 들어오면 photoBoxFilled 가 4:3 으로 키운다
    height: 160,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  /* 사진은 잘리지 않고 크게 — 고정 높이 + cover 조합은 세로 사진을 심하게 잘라냈다 */
  photoBoxFilled: { height: undefined, aspectRatio: 4 / 3 },
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
