/** 장소 상세 — 방문 기록 목록 + 기록 추가 (별점·사진·메모) */
import React, { useCallback, useState } from 'react';
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
import { placeApi } from '../../api/place';
import { useDietStore } from '../../store/dietStore';
import { pickImage, uploadImage } from '../../utils/imageUpload';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { runBusy } from '../../store/busyStore';
import { haptics } from '../../utils/haptics';
import { toDateString } from '../../utils/date';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { MealType, PlaceVisit } from '../../types';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<PlaceStackParamList, 'PlaceDetail'>;

function stars(rating?: number | null): string {
  if (!rating) return '';
  return '★'.repeat(rating) + '☆'.repeat(5 - rating);
}

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

export function PlaceDetailScreen({ route }: Props) {
  const { placeId, name: placeName } = route.params;
  const saveMeal = useDietStore((s) => s.save);
  const [visits, setVisits] = useState<PlaceVisit[]>([]);
  const [loading, setLoading] = useState(false);

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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setVisits(await placeApi.visits(placeId));
    } catch (e) {
      toast.error(getErrorMessage(e, '방문 기록을 불러오지 못했어요.'));
    } finally {
      setLoading(false);
    }
  }, [placeId]);

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
      setRating(0);
      setMemo('');
      setPhotoUri(null);
      setLogMeal(false);
      setMealType(defaultMealType());
      setCalories('');
      setProtein('');
      setCarbs('');
      setFat('');
      load();
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e));
    } finally {
      setSaving(false);
    }
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
          } catch (e) {
            Alert.alert('오류', getErrorMessage(e));
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* 키보드가 "기록 저장" 버튼을 가리지 않도록 회피 */}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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
                      onPress={() => setFormOpen(false)}
                      style={styles.flex}
                    />
                    <Button title="기록 저장" size="md" onPress={onSaveVisit} loading={saving} style={styles.flex} />
                  </View>
                </View>
              ) : (
                <Button title="방문 기록 남기기" variant="secondary" onPress={() => setFormOpen(true)} />
              )}

              <Text style={styles.sectionTitle}>방문 기록</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.visitCard} activeOpacity={0.8} onLongPress={() => onDeleteVisit(item)}>
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
              <Text style={styles.empty}>아직 방문 기록이 없어요. 다녀오셨다면 남겨보세요! (길게 눌러 삭제)</Text>
            ) : null
          }
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, paddingBottom: spacing.xl },
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
