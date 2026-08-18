/**
 * 식단 기록 입력 — 끼니·사진·음식 항목(반찬 단위)·메모 + 즐겨찾기 원탭 추가.
 * 운동(WorkoutRecordScreen)의 세트 카드 구조를 미러링한다.
 *
 * <p>예전에는 음식 이름을 메모 한 칸에 콤마로 이어 적고 칼로리는 끼니 전체 합계 한 칸이었다.
 * 그래서 AI가 음식별로 내준 칼로리·매크로가 저장 직전에 버려졌고, "공기밥만 빼기" 같은
 * 수정이 아예 불가능했다(전체 칼로리를 손으로 다시 계산해야 했다).
 * 지금은 항목이 실제 음식이고, 합계는 항목에서 계산된다.
 *
 * <p>새 기록과 수정을 한 화면이 겸한다 — route.params.meal 이 있으면 그 기록을 채워놓고
 * 저장 시 PUT 으로 보낸다. 폼이 완전히 같아서 화면을 나누면 두 벌을 같이 고쳐야 한다.
 */
import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Image, Platform, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { WorkoutStackParamList } from '../../navigation/types';
import { MaterialCommunityIcons } from '../../components/Icon';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { NumberStepper } from '../../components/NumberStepper';
import { FormKeyboardView } from '../../components/FormKeyboardView';
import { DateField } from '../../components/DateField';
import { Chip } from '../../components/Chip';
import { useDietStore } from '../../store/dietStore';
import { useRelationStore } from '../../store/relationStore';
import { useDirtyGuard } from '../../hooks/useDirtyGuard';
import { publishEnsuringConnection } from '../../api/chatSocket';
import { dietApi, SaveMealItemPayload } from '../../api/diet';
import { pickImage, takePhoto, uploadImage } from '../../utils/imageUpload';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { runBusy } from '../../store/busyStore';
import { haptics } from '../../utils/haptics';
import { toDateString } from '../../utils/date';
import { buildDietShareCopy } from '../../utils/dietShare';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { AnalyzedFood, FavoriteFood, MealType } from '../../types';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<WorkoutStackParamList, 'DietRecord'>;

const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: 'BREAKFAST', label: '아침' },
  { value: 'LUNCH', label: '점심' },
  { value: 'DINNER', label: '저녁' },
  { value: 'SNACK', label: '간식' },
];

/** 서버 검증(MealItemRequest)과 맞춘 길이 상한 — 저장 시점에 튕기지 않게 입력에서 막는다 */
const MAX_NAME = 100;
const MAX_PORTION = 50;

// 현재 시간대에 맞는 끼니 기본 선택
function defaultMealType(): MealType {
  const h = new Date().getHours();
  if (h < 11) return 'BREAKFAST';
  if (h < 15) return 'LUNCH';
  if (h < 21) return 'DINNER';
  return 'SNACK';
}

// 즐겨찾기가 없을 때 보여줄 시작용 추천 (탭하면 항목으로 추가)
const STARTER_SUGGESTIONS = ['닭가슴살', '샐러드', '현미밥', '고구마', '계란', '단백질쉐이크', '아메리카노'];

/** 편집 중인 음식 한 줄 — 숫자는 입력 중간 상태를 보존하려고 문자열로 들고 있는다 */
interface ItemForm {
  /** React key — 인덱스를 키로 쓰면 중간 항목을 지울 때 입력 포커스·값이 밀린다 */
  key: string;
  name: string;
  portion: string;
  calories: string;
  carbs: string;
  protein: string;
  fat: string;
  /** 탄단지 입력 펼침 — 대부분 AI가 채우고 손대지 않아 기본은 접어둔다 */
  showMacros: boolean;
}

const num = (v: string) => (v.trim() ? Number(v) : undefined);
const isFilled = (i: ItemForm) => i.name.trim().length > 0;

export function DietRecordScreen({ navigation, route }: Props) {
  const save = useDietStore((s) => s.save);
  const update = useDietStore((s) => s.update);
  const couple = useRelationStore((s) => s.couple);
  /** 수정할 기록 — 없으면 새 기록 작성 */
  const editing = route.params?.meal;
  const [mealType, setMealType] = useState<MealType>(editing?.mealType ?? defaultMealType());
  /** 기록할 날짜 — 수정이면 그 기록의 날짜, 캘린더에서 날짜를 골라 들어오면 그 날짜, 아니면 오늘 */
  const [mealDate, setMealDate] = useState(editing?.mealDate ?? route.params?.date ?? toDateString());
  const [memo, setMemo] = useState(editing?.memo ?? '');
  /**
   * 항목을 하나도 안 쓰고 총 칼로리만 적는 경로 — 사진만 찍고 끝낼 때.
   * 항목이 있는 기록을 수정할 때는 합계가 항목에서 계산되므로 비워둔다.
   */
  const [totalCalories, setTotalCalories] = useState(
    editing && !editing.items?.length && editing.calories ? String(editing.calories) : '',
  );
  const [photoUri, setPhotoUri] = useState<string | null>(editing?.photoUrl ?? null);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzingText, setAnalyzingText] = useState(false);

  const keySeq = useRef(0);
  const newItem = useCallback((patch?: Partial<ItemForm>): ItemForm => {
    keySeq.current += 1;
    return {
      key: `item-${keySeq.current}`,
      name: '',
      portion: '',
      calories: '',
      carbs: '',
      protein: '',
      fat: '',
      showMacros: false,
      ...patch,
    };
  }, []);

  const [items, setItems] = useState<ItemForm[]>(() => {
    const existing = editing?.items ?? [];
    if (existing.length === 0) return [newItem()];
    return existing.map((i) =>
      newItem({
        name: i.name,
        portion: i.portion ?? '',
        calories: i.calories ? String(i.calories) : '',
        carbs: i.carbs ? String(i.carbs) : '',
        protein: i.protein ? String(i.protein) : '',
        fat: i.fat ? String(i.fat) : '',
      }),
    );
  });

  /*
   * 업로드 결과 캐시 — AI 분석과 저장이 같은 사진을 두 번 올리지 않도록.
   * 수정으로 들어왔으면 이미 올라가 있는 사진이라 그 URL 을 그대로 캐시에 넣어둔다
   * (photoUri === photoUrl 이므로 ensureUploaded 가 재업로드 없이 통과한다).
   */
  const uploadedRef = useRef<{ uri: string; url: string } | null>(
    editing?.photoUrl ? { uri: editing.photoUrl, url: editing.photoUrl } : null,
  );

  // 헤더 제목은 스택 옵션이 "식단 기록"으로 고정돼 있어 수정일 때만 바꿔 단다
  useLayoutEffect(() => {
    if (editing) navigation.setOptions({ title: '식단 수정' });
  }, [editing, navigation]);

  const filled = useMemo(() => items.filter(isFilled), [items]);

  /** 끼니 합계 — 서버도 같은 방식으로 다시 더한다(여기 값은 화면 표시용) */
  const totals = useMemo(
    () =>
      filled.reduce(
        (acc, i) => ({
          calories: acc.calories + (Number(i.calories) || 0),
          carbs: acc.carbs + (Number(i.carbs) || 0),
          protein: acc.protein + (Number(i.protein) || 0),
          fat: acc.fat + (Number(i.fat) || 0),
        }),
        { calories: 0, carbs: 0, protein: 0, fat: 0 },
      ),
    [filled],
  );

  /*
   * 이탈 확인은 "처음 상태에서 달라졌는가"로 판정한다.
   * 입력이 채워져 있는지만 보면, 수정으로 들어온 화면은 아무것도 안 건드려도
   * 항상 dirty 라 그냥 나가려 해도 매번 확인창이 뜬다.
   * 탄단지 펼침(showMacros)은 내용이 아니므로 비교에서 뺀다.
   */
  const snapshot = JSON.stringify({
    mealType,
    mealDate,
    memo,
    totalCalories,
    photoUri,
    items: items.map((i) => [i.name, i.portion, i.calories, i.carbs, i.protein, i.fat]),
  });
  const initialSnapshot = useRef<string | null>(null);
  if (initialSnapshot.current === null) initialSnapshot.current = snapshot;
  const allowLeave = useDirtyGuard(snapshot !== initialSnapshot.current);

  // 즐겨찾는 음식
  const [favorites, setFavorites] = useState<FavoriteFood[]>([]);
  const loadFavorites = useCallback(() => {
    dietApi.favorites().then(setFavorites).catch(() => setFavorites([]));
  }, []);
  useFocusEffect(useCallback(() => loadFavorites(), [loadFavorites]));

  const updateItem = (key: string, patch: Partial<ItemForm>) => {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  };
  const addItem = () => setItems((prev) => [...prev, newItem()]);
  const removeItem = (key: string) => {
    setItems((prev) => {
      const next = prev.filter((i) => i.key !== key);
      // 전부 지워 빈 화면이 되면 입력할 칸이 사라진다 — 빈 카드 하나는 남긴다
      return next.length > 0 ? next : [newItem()];
    });
  };

  /**
   * 음식 여러 개를 항목으로 붙인다 — 이름이 비어 있는 카드는 버리고 뒤에 이어붙인다.
   * (운동 기록의 프리셋 적용과 같은 방식: 빈 칸부터 채워지는 것처럼 보인다)
   */
  const appendFoods = useCallback(
    (foods: Partial<ItemForm>[]) => {
      setItems((prev) => [...prev.filter(isFilled), ...foods.map((f) => newItem(f))]);
    },
    [newItem],
  );

  const addName = (name: string) => appendFoods([{ name }]);

  /** AI 분석 결과(사진/텍스트 공통) → 항목 폼 */
  const toForm = (f: AnalyzedFood): Partial<ItemForm> => ({
    name: f.name.slice(0, MAX_NAME),
    portion: (f.portion ?? '').slice(0, MAX_PORTION),
    calories: f.calories ? String(f.calories) : '',
    carbs: f.carbs ? String(f.carbs) : '',
    protein: f.protein ? String(f.protein) : '',
    fat: f.fat ? String(f.fat) : '',
  });

  // 즐겨찾기 세트 탭 — 세트에 담긴 음식이 각각 항목으로 들어온다.
  // 예전엔 이름만 메모에 붙고 칼로리는 합산돼 섞여서, 잘못 누르면 되돌릴 방법이 없었다.
  const addFavorite = (fav: FavoriteFood) => {
    haptics.light();
    appendFoods(
      fav.items.map((i) => ({
        name: i.name,
        calories: i.calories ? String(i.calories) : '',
        carbs: i.carbs ? String(i.carbs) : '',
        protein: i.protein ? String(i.protein) : '',
        fat: i.fat ? String(i.fat) : '',
      })),
    );
  };

  /** 현재 입력한 음식들을 즐겨찾기 세트로 저장 — 항목이 1:1 로 그대로 옮겨간다 */
  const saveCurrentAsFavorite = async () => {
    if (filled.length === 0) {
      toast.error('음식을 먼저 입력해주세요.');
      return;
    }
    try {
      const fav = await dietApi.saveFavorite({
        items: filled.map((i) => ({
          name: i.name.trim(),
          calories: num(i.calories),
          carbs: num(i.carbs),
          protein: num(i.protein),
          fat: num(i.fat),
        })),
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

  // AI 음식 분석 — 결과는 추정치라 항목으로 채워만 주고 확정(저장)은 사용자가 한다
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
      appendFoods(result.foods.map(toForm));
      if (result.foods.every((f) => !f.calories)) {
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

  /**
   * 적어둔 음식 이름으로 칼로리 추정 — 사진 없이도 쓰는 경로.
   * 이름만 적어둔 항목들을 통째로 보내 칼로리·매크로가 채워진 목록으로 <b>교체</b>한다
   * (명시적으로 누르는 버튼이고, 결과가 마음에 안 들면 항목별로 고치면 된다).
   */
  const onAnalyzeText = async () => {
    const text = filled
      .map((i) => (i.portion.trim() ? `${i.name.trim()} ${i.portion.trim()}` : i.name.trim()))
      .join(', ');
    if (!text) return;
    setAnalyzingText(true);
    try {
      const result = await runBusy('AI가 칼로리를 계산하고 있어요', () => dietApi.analyzeText(text));
      if (!result.isFood || result.foods.length === 0) {
        toast.error('무엇을 먹었는지 알아보지 못했어요. 음식 이름을 적어주세요.');
        return;
      }
      setItems(result.foods.map((f) => newItem(toForm(f))));
      if (result.foods.every((f) => !f.calories)) {
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
    if (filled.length === 0 && !memo.trim() && !photoUri) {
      Alert.alert('알림', '음식이나 사진을 하나 이상 입력해주세요.');
      return;
    }
    setSaving(true);
    try {
      let photoUrl: string | undefined;
      if (photoUri) {
        photoUrl = await runBusy('사진 올리는 중…', () => ensureUploaded(photoUri));
      }
      const label = MEAL_TYPES.find((t) => t.value === mealType)?.label ?? '';
      const payloadItems: SaveMealItemPayload[] = filled.map((i) => ({
        name: i.name.trim(),
        portion: i.portion.trim() || undefined,
        calories: num(i.calories),
        carbs: num(i.carbs),
        protein: num(i.protein),
        fat: num(i.fat),
      }));
      const payload = {
        mealDate,
        mealType,
        memo: memo.trim() || undefined,
        photoUrl,
        // 항목이 있으면 합계는 서버가 계산한다 — 여기서 합계를 같이 보내도 무시된다
        items: payloadItems.length > 0 ? payloadItems : undefined,
        calories: payloadItems.length === 0 ? num(totalCalories) : undefined,
      };

      /*
       * 수정은 여기서 끝낸다 — 이미 공유했을 수도 있는 기록이라 채팅 공유를 다시 묻지 않고,
       * 목표 달성 축하(goals)도 서버가 수정 응답에는 싣지 않는다(MealService.update 참고).
       */
      if (editing) {
        await update(editing.id, payload);
        haptics.success();
        toast.success('식단을 수정했어요 ');
        allowLeave();
        navigation.goBack();
        return;
      }

      const saved = await save(payload);
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
        const foodNames = filled.map((i) => i.name.trim()).join(', ') || memo.trim();
        const kcal = saved.calories ?? undefined;
        const summary = `${label}${foodNames ? ` · ${foodNames}` : ''}${kcal ? ` (${kcal}kcal)` : ''}`;
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
                // 업로드 캐시만 버린다. 분석으로 들어온 음식 항목은 그대로 둔다 —
                // 사진을 지워도 먹은 건 먹은 것이고, 틀렸으면 항목별로 지울 수 있다.
                uploadedRef.current = null;
              }}
            >
              <Text style={styles.removePhoto}>사진 제거</Text>
            </TouchableOpacity>
          ) : null}

          {/* AI 음식 분석 — 사진이 있을 때만 노출, 결과는 음식 항목으로 자동 입력 */}
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
              <Text style={styles.analyzeHint}>분석 결과는 추정치예요. 저장 전에 항목별로 수정할 수 있어요.</Text>
            </>
          ) : null}

          {/* 즐겨찾기 세트 — 원탭 추가(길게 눌러 삭제). 세트에 담긴 음식이 각각 항목으로 들어온다.
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

          {/* 음식 항목 — 반찬 하나가 카드 하나. 칼로리·탄단지를 항목별로 고친다 */}
          <Text style={styles.label}>먹은 음식</Text>
          {items.map((item, idx) => (
            <View key={item.key} style={styles.itemCard}>
              <View style={styles.itemHeader}>
                <Text style={styles.itemNo}>음식 {idx + 1}</Text>
                <View style={styles.itemHeaderRight}>
                  {Number(item.calories) > 0 ? (
                    <Text style={styles.itemKcal}>{Number(item.calories)}kcal</Text>
                  ) : null}
                  {items.length > 1 || isFilled(item) ? (
                    <TouchableOpacity onPress={() => removeItem(item.key)} hitSlop={8}>
                      <Text style={styles.remove}>삭제</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>

              <TextField
                placeholder="음식명 (예: 공기밥)"
                value={item.name}
                maxLength={MAX_NAME}
                onChangeText={(t) => updateItem(item.key, { name: t })}
              />
              <TextField
                placeholder="양 (예: 1인분, 반 공기)"
                value={item.portion}
                maxLength={MAX_PORTION}
                onChangeText={(t) => updateItem(item.key, { portion: t })}
              />

              <NumberStepper
                label="칼로리 (kcal)"
                placeholder="300"
                value={item.calories}
                onChange={(v) => updateItem(item.key, { calories: v })}
                step={10}
              />

              {/* 탄단지는 대개 AI가 채워두고 손대지 않는다 — 접어두되 값은 요약으로 보여준다 */}
              <TouchableOpacity
                style={styles.macroToggle}
                onPress={() => updateItem(item.key, { showMacros: !item.showMacros })}
                accessibilityRole="button"
              >
                <MaterialCommunityIcons
                  name={item.showMacros ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={colors.textSecondary}
                />
                <Text style={styles.macroToggleText}>
                  {`탄 ${Number(item.carbs) || 0}g · 단 ${Number(item.protein) || 0}g · 지 ${Number(item.fat) || 0}g`}
                </Text>
              </TouchableOpacity>
              {item.showMacros ? (
                <View style={styles.macroInputRow}>
                  <NumberStepper
                    label="탄수(g)"
                    placeholder="0"
                    value={item.carbs}
                    onChange={(v) => updateItem(item.key, { carbs: v })}
                    step={5}
                  />
                  <NumberStepper
                    label="단백(g)"
                    placeholder="0"
                    value={item.protein}
                    onChange={(v) => updateItem(item.key, { protein: v })}
                    step={5}
                  />
                  <NumberStepper
                    label="지방(g)"
                    placeholder="0"
                    value={item.fat}
                    onChange={(v) => updateItem(item.key, { fat: v })}
                    step={5}
                  />
                </View>
              ) : null}
            </View>
          ))}

          <Button title="＋ 음식 추가" variant="ghost" onPress={addItem} />

          {/* 적어둔 음식으로 칼로리 추정 — 사진이 없을 때의 경로 (사진이 있으면 위 사진 분석을 쓴다) */}
          {!photoUri && filled.length > 0 ? (
            <>
              <Button
                title="AI로 칼로리 계산"
                variant="soft"
                size="md"
                onPress={onAnalyzeText}
                loading={analyzingText}
                style={styles.analyzeButton}
              />
              <Text style={styles.analyzeHint}>적어둔 음식으로 계산해요. 결과는 추정치이고 항목별로 수정할 수 있어요.</Text>
            </>
          ) : null}

          {/* 합계 — 항목이 있으면 항목에서 계산되고, 없으면 총 칼로리를 직접 적는다 */}
          {filled.length > 0 ? (
            <View style={styles.totalCard}>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>합계 · 음식 {filled.length}개</Text>
                <Text style={styles.totalKcal}>{totals.calories}kcal</Text>
              </View>
              <Text style={styles.totalMacro}>
                {`탄수화물 ${totals.carbs}g · 단백질 ${totals.protein}g · 지방 ${totals.fat}g`}
              </Text>
            </View>
          ) : (
            <TextField
              label="칼로리 (kcal, 선택)"
              placeholder="450"
              keyboardType="number-pad"
              value={totalCalories}
              onChangeText={(t) => setTotalCalories(t.replace(/[^0-9]/g, ''))}
            />
          )}

          <TextField
            label="메모 (선택)"
            placeholder="오늘의 한마디"
            value={memo}
            onChangeText={setMemo}
            multiline
          />

          <Button
            title={editing ? '수정 완료' : '완료!'}
            onPress={onSave}
            loading={saving}
            style={styles.save}
          />
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

  // 음식 항목 카드 — 운동 기록의 세트 카드와 같은 형태
  itemCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  itemHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  itemNo: { fontSize: fontSize.body, fontWeight: '700', color: colors.primary },
  itemKcal: { fontSize: fontSize.caption, fontWeight: '800', color: colors.accent },
  remove: { color: colors.danger, fontSize: fontSize.caption },
  macroToggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 44 },
  macroToggleText: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '600' },
  macroInputRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },

  // 합계 — 항목에서 자동 계산되는 값이라 입력 칸이 아니라 요약 카드로 보여준다
  totalCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700' },
  totalKcal: { fontSize: fontSize.subtitle, color: colors.textPrimary, fontWeight: '800' },
  totalMacro: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: spacing.xs },

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
}));
