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
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Platform, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { DietStackParamList } from '../../navigation/types';
import { MaterialCommunityIcons } from '../../components/Icon';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { NumberStepper } from '../../components/NumberStepper';
import { FormKeyboardView } from '../../components/FormKeyboardView';
import { DateField } from '../../components/DateField';
import { Chip } from '../../components/Chip';
import { Sheet } from '../../components/Sheet';
import { useDietStore } from '../../store/dietStore';
import { useRelationStore } from '../../store/relationStore';
import { usePlaceStore } from '../../store/placeStore';
import { useDirtyGuard } from '../../hooks/useDirtyGuard';
import { publishEnsuringConnection } from '../../api/chatSocket';
import { dietApi, SaveMealItemPayload } from '../../api/diet';
import { foodDbApi } from '../../api/foodDb';
import { placeApi } from '../../api/place';
import { pickImageAsset, takePhotoAsset, shrinkImage, uploadImage } from '../../utils/imageUpload';
import { getErrorMessage } from '../../utils/error';
import { errorCodeOf } from '../../api/client';
import { toast } from '../../store/toastStore';
import { runBusy } from '../../store/busyStore';
import { haptics } from '../../utils/haptics';
import { toDateString } from '../../utils/date';
import { buildDietShareCopy } from '../../utils/dietShare';
import { defaultMealType } from '../../utils/mealType';
import { colors, fontSize, radius, shadow, spacing } from '../../constants/theme';
import { onColor } from '../../theme/onColor';
import type {
  AnalyzedFood,
  BarcodeLookup,
  FavoriteFood,
  MealAnalysisSource,
  MealType,
  Place,
  PlaceSearchResult,
  RecentFood,
} from '../../types';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<DietStackParamList, 'DietRecord'>;

const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: 'BREAKFAST', label: '아침' },
  { value: 'LUNCH', label: '점심' },
  { value: 'DINNER', label: '저녁' },
  { value: 'SNACK', label: '간식' },
];

/** 서버 검증(MealItemRequest)과 맞춘 길이 상한 — 저장 시점에 튕기지 않게 입력에서 막는다 */
const MAX_NAME = 100;
const MAX_PORTION = 50;

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
  /**
   * 사진 속 위치 — AI 사진 분석(source=PHOTO_FOOD)에서만 채워짐. 항목 자체에 실어두면
   * 사용자가 항목을 고치거나 지워도 칩이 따로 관리할 상태 없이 자연히 같이 바뀐다
   * (바코드·즐겨찾기 등 다른 경로로 들어온 항목은 항상 undefined — 칩이 안 뜬다).
   */
  box?: number[] | null;
}

const num = (v: string) => (v.trim() ? Number(v) : undefined);
const isFilled = (i: ItemForm) => i.name.trim().length > 0;

/** 적어둔 항목을 AI 에 보낼 한 줄로. 응답을 적용할지 판단할 때도 같은 규칙으로 다시 만든다. */
const describeItems = (items: ItemForm[]) =>
  items
    .filter(isFilled)
    .map((i) => (i.portion.trim() ? `${i.name.trim()} ${i.portion.trim()}` : i.name.trim()))
    .join(', ');
// 서버(MealService.half)와 같은 반올림 — 미리보기 숫자가 실제 저장값과 어긋나지 않게
const halfRound = (v: number) => Math.round(v / 2);

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
  /**
   * 사진 원본 크기 — 사진 위 칩(음식 위치 표시)을 정확히 앉히려고 필요하다. 사진 컨테이너가
   * 이 비율(aspectRatio)을 그대로 쓰면 cover/contain 이 같아져(잘리는 부분이 없어) box 의
   * 0~1000 정규화 좌표를 크롭 보정 없이 바로 퍼센트 위치로 쓸 수 있다.
   * 새로 고른 사진뿐 아니라(원격 URL) 수정 화면의 기존 사진도 재분석하면 칩이 떠야 하므로,
   * pickFrom 이 아니라 photoUri 변화에 걸어(Image.getSize) 두 경로를 하나로 처리한다.
   */
  const [photoSize, setPhotoSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    if (!photoUri) {
      setPhotoSize(null);
      return;
    }
    let cancelled = false;
    Image.getSize(
      photoUri,
      (width, height) => {
        if (!cancelled) setPhotoSize({ width, height });
      },
      () => {
        // 실패해도 치명적이지 않다 — photoSize 가 없으면 칩을 그냥 안 그린다(기존 정사각 크롭 유지)
        if (!cancelled) setPhotoSize(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [photoUri]);
  /** AI 사진 분석이 무엇을 읽었는지 — 완료 후 안내 문구를 갈라 보여준다(신뢰도 표현) */
  const [analysisSource, setAnalysisSource] = useState<MealAnalysisSource | null>(null);
  /** 사진 위 칩을 탭했을 때 해당 항목 카드를 잠깐 강조 */
  const [highlightedItemKey, setHighlightedItemKey] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
  }, []);
  const onTapChip = (key: string) => {
    haptics.light();
    setHighlightedItemKey(key);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightedItemKey(null), 1500);
  };
  /**
   * "데이트" 칩 — 켜면 상대방에게도 같은 끼니가 절반 칼로리로 자동 등록된다.
   * 수정 화면에서는 노출하지 않는다 — 서버의 update() 는 상대방에게 아무 영향도 주지 않아서
   * (조용한 손보기 전용 경로), 이미 저장된 기록의 데이트 여부를 여기서 바꿀 수 있는 것처럼
   * 보이면 오해를 산다.
   */
  const [dateMeal, setDateMeal] = useState(false);
  /*
   * 어디서 먹었는지(럽슐랭 장소 연동) — 식단 기록 = 그 장소를 다녀왔다는 뜻이라, 고르면
   * 저장 시 방문 기록으로도 남는다. 별점은 그 김에 럽슐랭 대표 평점까지 같이 매기는
   * 선택 사항(방문만 남기고 평가는 건너뛸 수 있다). 수정 화면에서는 dateMeal 과 같은
   * 이유로 노출하지 않는다.
   */
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [placeRating, setPlaceRating] = useState(0);
  const [placeSheetOpen, setPlaceSheetOpen] = useState(false);
  const [placeSearch, setPlaceSearch] = useState('');
  /*
   * 카카오 장소 검색(새 장소 추가) — 저장된 장소 목록에 없을 때의 경로. 검색어를 그대로
   * 재사용해 "검색" 버튼 한 번으로 저장된 목록 필터와 카카오 조회를 동시에 돌린다.
   * addingPlaceName 은 어느 결과를 지금 담는 중인지(버튼별 로딩 표시) 판별용.
   */
  const [kakaoResults, setKakaoResults] = useState<PlaceSearchResult[] | null>(null);
  const [kakaoSearching, setKakaoSearching] = useState(false);
  const [kakaoUnavailable, setKakaoUnavailable] = useState(false);
  const [addingPlaceName, setAddingPlaceName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzingText, setAnalyzingText] = useState(false);
  /** DB 이름 검색 — 어느 항목에 대한 결과인지(key)와 후보 목록. 한 번에 한 항목만 연다. */
  const [dbSearch, setDbSearch] = useState<{ key: string; results: BarcodeLookup[] } | null>(null);
  const [searchingDbKey, setSearchingDbKey] = useState<string | null>(null);
  /*
   * 추가 영양소(당류/나트륨/식이섬유) — 항목(MealItem)에는 없는 끼니 레벨 값이라
   * AI 분석·바코드 조회에서만 채워진다. 탄단지는 항목이 들고 있으므로 여기엔 없다.
   */
  const [extras, setExtras] = useState<{ sugar?: number; sodium?: number; fiber?: number } | null>(
    editing && (editing.sugar != null || editing.sodium != null || editing.fiber != null)
      ? {
          sugar: editing.sugar ?? undefined,
          sodium: editing.sodium ?? undefined,
          fiber: editing.fiber ?? undefined,
        }
      : null,
  );

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
   * 업로드 캐시 — AI 분석과 저장이 같은 사진을 두 번 올리지 않도록.
   * 결과 URL 이 아니라 <b>업로드 Promise</b> 를 담는다. 사진을 고르는 즉시 백그라운드로
   * 올리기 시작하는데(pickFrom), 그게 끝나기 전에 분석을 눌러도 그 업로드를 같이
   * 기다리게 하려면 진행 중인 Promise 자체가 캐시에 있어야 한다.
   *
   * 수정으로 들어왔으면 이미 올라가 있는 사진이라 그 URL 을 이미 끝난 Promise 로 넣어둔다
   * (photoUri === photoUrl 이므로 ensureUploaded 가 재업로드 없이 통과한다).
   */
  const uploadedRef = useRef<{ uri: string; url: Promise<string> } | null>(
    editing?.photoUrl ? { uri: editing.photoUrl, url: Promise.resolve(editing.photoUrl) } : null,
  );
  /**
   * 선업로드가 <b>이미 끝난</b> uri. 분석·저장에서 화면 잠금을 걸지 말지 판단한다 —
   * 올릴 게 남지 않았는데 "사진 올리는 중…" 이 한 프레임 번쩍이면 오히려 느려 보인다.
   */
  const uploadedDoneRef = useRef<string | null>(editing?.photoUrl ?? null);

  // 헤더 제목은 스택 옵션이 "식단 기록"으로 고정돼 있어 수정일 때만 바꿔 단다
  useLayoutEffect(() => {
    if (editing) navigation.setOptions({ title: '식단 수정' });
  }, [editing, navigation]);

  const filled = useMemo(() => items.filter(isFilled), [items]);
  /*
   * AI 응답이 도착한 <b>그 순간</b>의 항목을 읽기 위한 ref. 아래 onAnalyzeText 는 결과로
   * 목록을 통째로 교체하는데, 기다리는 동안 사용자가 뭔가 더 적었다면 그걸 지워버린다.
   * (예전엔 전역 화면 잠금이 입력을 막아 이 문제가 없었다 — 잠금을 걷어내면서 필요해졌다)
   */
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  const partnerName = couple?.partner?.name ?? '상대방';

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
    dateMeal,
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

  // 받은 즐겨찾기 선물 배지 — 실패해도 화면 전체를 막을 정도는 아니라 조용히 무시한다
  const [pendingGiftCount, setPendingGiftCount] = useState(0);
  useFocusEffect(
    useCallback(() => {
      dietApi
        .receivedFavoriteFoodGifts()
        .then((gifts) => setPendingGiftCount(gifts.filter((g) => g.status === 'PENDING').length))
        .catch(() => undefined);
    }, []),
  );

  const [giftingId, setGiftingId] = useState<number | null>(null);
  const giftFavorite = (fav: FavoriteFood) => {
    Alert.alert('즐겨찾기 공유', `"${fav.name}"을(를) 애인에게 공유할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '공유하기',
        onPress: async () => {
          haptics.light();
          setGiftingId(fav.id);
          try {
            await dietApi.sendFavoriteFoodGift(fav.id);
            haptics.success();
            toast.success('즐겨찾기를 공유했어요!');
          } catch (e) {
            toast.error(getErrorMessage(e, '공유에 실패했어요.'));
          } finally {
            setGiftingId(null);
          }
        },
      },
    ]);
  };

  // 최근 먹은 음식 — 즐겨찾기와 달리 저장 없이 최근 기록에서 자동으로 뽑힌다
  const [recentFoods, setRecentFoods] = useState<RecentFood[]>([]);
  useFocusEffect(
    useCallback(() => {
      dietApi.recentFoods().then(setRecentFoods).catch(() => setRecentFoods([]));
    }, []),
  );

  // 럽슐랭 장소 목록 — 이미 저장된 커플 장소 중에서 골라 방문 기록을 연동한다. 목록
  // 자체는 usePlaceStore 가 캐싱하므로 여기선 (처음 한 번이면) 요청만 걸어둔다.
  const places = usePlaceStore((s) => s.places);
  useEffect(() => {
    usePlaceStore.getState().load();
  }, []);
  const placeCandidates = useMemo(() => {
    const q = placeSearch.trim().toLowerCase();
    if (!q) return places;
    return places.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.address ?? '').toLowerCase().includes(q),
    );
  }, [places, placeSearch]);

  // 시트를 닫을 때(백드롭·닫기 버튼 공통) 검색 상태까지 비운다 — 다음에 열었을 때
  // 이전 카카오 검색 결과가 엉뚱하게 남아 있지 않게.
  const closePlaceSheet = () => {
    setPlaceSheetOpen(false);
    setPlaceSearch('');
    setKakaoResults(null);
    setKakaoUnavailable(false);
  };

  // 저장된 장소 중에 없을 때 — 카카오에서 실존 장소를 찾는다. 검색어 입력창을 그대로
  // 재사용해 "저장된 장소 필터"와 "카카오 검색어"가 항상 같은 텍스트를 가리키게 한다.
  const onKakaoSearch = async () => {
    const q = placeSearch.trim();
    if (!q) return;
    setKakaoSearching(true);
    setKakaoResults(null);
    setKakaoUnavailable(false);
    try {
      const res = await placeApi.search(q);
      setKakaoUnavailable(!res.available);
      setKakaoResults(res.places);
    } catch (e) {
      toast.error(getErrorMessage(e, '장소 검색에 실패했어요.'));
    } finally {
      setKakaoSearching(false);
    }
  };

  /*
   * 카카오 검색 결과를 바로 럽슐랭 장소로 추가 — 식단 기록에서 등록하는 흐름이라
   * 추가 즉시 선택 상태로 만들어 별점까지 이어서 매길 수 있게 한다.
   */
  const onAddFromKakao = async (result: PlaceSearchResult) => {
    setAddingPlaceName(result.name);
    try {
      const saved = await placeApi.save({
        name: result.name,
        address: result.address ?? undefined,
        lat: result.lat ?? undefined,
        lng: result.lng ?? undefined,
        category: result.category ?? undefined,
        // 이미 등록된 같은 장소면(카카오 id로 대조) 새로 만들지 않고 그 장소가 그대로 온다
        kakaoPlaceId: result.kakaoPlaceId ?? undefined,
      });
      haptics.success();
      toast.success(`${saved.name}을(를) 럽슐랭에 추가했어요`);
      usePlaceStore.getState().invalidate();
      setSelectedPlace(saved);
      setPlaceRating(0);
      closePlaceSheet();
    } catch (e) {
      // 402(플랜 한도)는 api/client 가 이미 업그레이드 시트를 열었다 — 여기서 또 띄우면
      // 같은 사실을 두 번 알리게 된다 (HomeScreen.notifyUnless402 와 같은 이유).
      const code = errorCodeOf(e);
      if (code === 'PLAN_UPGRADE_REQUIRED' || code === 'PLAN_LIMIT_EXCEEDED') return;
      toast.error(getErrorMessage(e, '장소를 추가하지 못했어요.'));
    } finally {
      setAddingPlaceName(null);
    }
  };

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

  // 바코드 스캔 결과 — BarcodeScanScreen 이 같은 DietRecord 인스턴스로 돌아오며 채운다.
  // 실제 표기값이라 항목 하나로 그대로 들어온다. 소비 후 파라미터를 지워야
  // 뒤로가기·재진입 시 같은 결과가 다시 적용되지 않는다.
  useEffect(() => {
    const result = route.params?.barcodeResult;
    if (!result) return;
    appendFoods([
      {
        name: (result.foodName || `바코드 ${result.barcode}`).slice(0, MAX_NAME),
        portion: (result.servingSize ?? '').slice(0, MAX_PORTION),
        calories: result.calories ? String(result.calories) : '',
        carbs: result.carbs ? String(result.carbs) : '',
        protein: result.protein ? String(result.protein) : '',
        fat: result.fat ? String(result.fat) : '',
      },
    ]);
    if (result.sugar != null || result.sodium != null || result.fiber != null) {
      // 통째로 교체하면 이번 스캔이 안 채운 값(예: 나트륨)이 이전에 이미 알고 있던
      // 값을 null 로 덮어써버린다 — 기존 값과 병합한다.
      setExtras((prev) => ({
        sugar: result.sugar ?? prev?.sugar,
        sodium: result.sodium ?? prev?.sodium,
        fiber: result.fiber ?? prev?.fiber,
      }));
    }
    haptics.success();
    toast.success(result.foodName ? `${result.foodName} 정보를 불러왔어요` : '바코드 정보를 불러왔어요');
    navigation.setParams({ barcodeResult: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.barcodeResult]);

  // 최근 항목 탭 — 즐겨찾기(addFavorite)와 같은 방식으로 항목 하나로 들어온다
  const addRecent = (food: RecentFood) => {
    haptics.light();
    appendFoods([
      {
        name: food.memo.slice(0, MAX_NAME),
        calories: food.calories ? String(food.calories) : '',
        carbs: food.carbs ? String(food.carbs) : '',
        protein: food.protein ? String(food.protein) : '',
        fat: food.fat ? String(food.fat) : '',
      },
    ]);
  };

  /** AI 분석 결과(사진/텍스트 공통) → 항목 폼 */
  const toForm = (f: AnalyzedFood): Partial<ItemForm> => ({
    name: f.name.slice(0, MAX_NAME),
    portion: (f.portion ?? '').slice(0, MAX_PORTION),
    calories: f.calories ? String(f.calories) : '',
    carbs: f.carbs ? String(f.carbs) : '',
    protein: f.protein ? String(f.protein) : '',
    fat: f.fat ? String(f.fat) : '',
    // 텍스트 분석 결과는 항상 box 가 없으니(서버가 null) 자연히 undefined 로 들어온다
    box: f.box,
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
      toast.success('즐겨찾기에 저장했어요');
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

  /**
   * 업로드는 uri 당 한 번 — <b>진행 중인 것까지</b> 공유한다.
   *
   * <p>결과(url)가 아니라 Promise 를 캐시하는 게 요점이다. 선업로드가 아직 끝나기 전에
   * "AI로 음식 분석"을 누르면, 결과만 캐시하는 방식에서는 캐시가 비어 있어 <b>같은 사진을
   * 두 번</b> 올린다. 진행 중인 Promise 를 돌려주면 그냥 그 업로드를 같이 기다린다.
   */
  const ensureUploaded = (uri: string): Promise<string> => {
    if (uploadedRef.current?.uri === uri) return uploadedRef.current.url;
    const url = uploadImage(uri).then(
      (uploaded) => {
        // 그사이 사진이 바뀌었다면 이건 남의 결과다 — 지금 캐시된 uri 일 때만 "끝남"으로 적는다
        if (uploadedRef.current?.uri === uri) uploadedDoneRef.current = uri;
        return uploaded;
      },
      (e) => {
        // 실패한 업로드를 캐시에 남겨두면 다시 눌러도 같은 실패만 돌아온다 — 비워서 재시도를 연다.
        // 그사이 사진이 바뀌었다면 그건 남의 캐시이므로 uri 가 그대로일 때만 건드린다.
        if (uploadedRef.current?.uri === uri) uploadedRef.current = null;
        throw e;
      },
    );
    uploadedRef.current = { uri, url };
    return url;
  };

  /**
   * 분석·저장이 쓰는 업로드 — 선업로드가 아직 안 끝났을 때만 화면을 잠근다.
   * 이미 끝나 있으면 기다릴 게 없으므로 오버레이 없이 곧장 다음 단계로 넘어간다.
   */
  const uploadForSubmit = (uri: string): Promise<string> =>
    uploadedDoneRef.current === uri
      ? ensureUploaded(uri)
      : runBusy('사진 올리는 중…', () => ensureUploaded(uri));

  const pickFrom = async (source: 'camera' | 'gallery') => {
    try {
      const picked = source === 'camera' ? await takePhotoAsset() : await pickImageAsset();
      if (!picked) return;
      // 고르자마자 줄인다 — 업로드·서버 다운로드·Gemini 전송이 한꺼번에 가벼워진다
      const uri = await shrinkImage(picked);
      setPhotoUri(uri);
      // 새 사진이니 이전 사진의 분석 안내(추정치/표기값 문구)는 더 이상 안 맞는다
      setAnalysisSource(null);
      /*
       * 선업로드 — 사용자가 "AI로 음식 분석"이나 "저장"을 누를 때쯤이면 이미 끝나 있게 한다.
       * 업로드는 어차피 두 경로 모두의 앞 단계고, 사진을 고른 직후는 사용자가 화면을 보며
       * 멈춰 있는 구간이라 여기에 태우면 그만큼의 대기가 통째로 사라진다.
       *
       * 실패는 여기서 삼킨다 — ensureUploaded 가 캐시를 비워두므로 분석/저장 때 다시 시도하며
       * 그때 제대로 알린다. 아직 아무것도 누르지 않은 사용자에게 업로드 오류를 띄우면
       * 무엇 때문에 뜬 건지 알 수 없다.
       */
      void ensureUploaded(uri).catch(() => {});
    } catch (e) {
      toast.error(getErrorMessage(e, '사진 선택에 실패했어요.'));
    }
  };

  const onPickPhoto = () => {
    // TEMP DEBUG(2026-09-03): iOS 에서 이 버튼이 반응 없다는 리포트 — 핸들러가
    // 아예 안 불리는지, 불리는데 다이얼로그만 안 뜨는지 구분하려고 임시로 남긴다.
    toast.info('DEBUG: onPickPhoto called, platform=' + Platform.OS);
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

  // AI 음식 분석 — 결과는 추정치라 항목으로 채워만 주고 확정(저장)은 사용자가 한다
  const onAnalyze = async () => {
    if (!photoUri) return;
    setAnalyzing(true);
    try {
      const photoUrl = await uploadForSubmit(photoUri);
      // 전역 화면 잠금은 걷었다(대기가 분 단위까지 늘 수 있다). 이 경로는 결과를
      // 기존 항목 <b>뒤에 덧붙이므로</b>, 기다리는 동안 뭘 더 적어도 지워지지 않는다.
      const result = await dietApi.analyze(photoUrl);
      if (!result.isFood || result.foods.length === 0) {
        // 실제 음식·메뉴판·영양성분표 중 아무것도 못 찾았을 때만 여기로 온다(source 세 갈래 모두 실패)
        toast.error('음식 사진이 아닌 것 같아요');
        return;
      }
      // 다음 안내 문구·사진 위 칩 표시를 여기서 정한다 — appendFoods 보다 먼저 둬서
      // hasChips 계산(items 기반)이 이번 렌더에 바로 반영되게 한다
      setAnalysisSource(result.source ?? 'PHOTO_FOOD');
      appendFoods(result.foods.map(toForm));
      if (result.foods.every((f) => !f.calories)) {
        // 음식은 알아봤지만 양을 가늠하지 못한 경우 — 빈 칸으로 두면 실패로 오해한다
        toast.info('칼로리는 추정하지 못했어요. 직접 입력해주세요.');
      }
      // 탄단지는 항목이 들고 있으니 끼니 레벨 값(당류/나트륨/식이섬유)만 담는다
      setExtras({ sugar: result.totalSugar, sodium: result.totalSodium, fiber: result.totalFiber });
      haptics.success();
      toast.success(
        result.comment?.trim() ||
          (result.source === 'NUTRITION_LABEL'
            ? '영양성분표를 읽었어요!'
            : result.source === 'TEXT_IN_PHOTO'
              ? '사진 속 글자로 알아냈어요!'
              : 'AI 분석 완료! '),
      );
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
    const text = describeItems(items);
    if (!text) return;
    setAnalyzingText(true);
    try {
      const result = await dietApi.analyzeText(text);
      if (!result.isFood || result.foods.length === 0) {
        toast.error('무엇을 먹었는지 알아보지 못했어요. 음식 이름을 적어주세요.');
        return;
      }
      /*
       * 기다리는 사이에 목록이 바뀌었으면 덮어쓰지 않는다 — 이 응답은 <b>보낼 때의</b>
       * 목록에 대한 답이라, 지금 목록을 교체하면 방금 적은 것을 지우는 셈이다.
       */
      if (describeItems(itemsRef.current) !== text) {
        toast.info('적어둔 음식이 바뀌어서 결과를 넣지 않았어요. 다시 눌러주세요.');
        return;
      }
      setItems(result.foods.map((f) => newItem(toForm(f))));
      if (result.foods.every((f) => !f.calories)) {
        toast.info('칼로리는 추정하지 못했어요. 직접 입력해주세요.');
      }
      setExtras({ sugar: result.totalSugar, sodium: result.totalSodium, fiber: result.totalFiber });
      haptics.success();
      toast.success(result.comment?.trim() || 'AI 칼로리 계산 완료!');
    } catch (e) {
      toast.error(getErrorMessage(e, 'AI 계산에 실패했어요.'));
    } finally {
      setAnalyzingText(false);
    }
  };

  /**
   * 음식 이름으로 공공 DB(식품안전나라) 검색 — AI 계산과 달리 무료에 실제 표기값이다.
   * 바코드처럼 정확히 일치하는 게 있을 때만 의미가 있어서, 못 찾으면(빈 배열) 조용히
   * AI 계산으로 넘어가라고 안내만 한다(에러로 취급하지 않는다).
   */
  const onSearchDb = async (item: ItemForm) => {
    const name = item.name.trim();
    if (!name) {
      toast.error('음식 이름을 먼저 적어주세요.');
      return;
    }
    setDbSearch(null);
    setSearchingDbKey(item.key);
    try {
      const results = await foodDbApi.search(name);
      if (results.length === 0) {
        toast.info('DB에 없는 음식이에요. "AI로 칼로리 계산"을 이용해보세요.');
        return;
      }
      haptics.light();
      setDbSearch({ key: item.key, results });
    } catch (e) {
      toast.error(getErrorMessage(e, '검색에 실패했어요.'));
    } finally {
      setSearchingDbKey(null);
    }
  };

  /** DB 검색 결과 중 하나를 골라 해당 항목에 채운다 — 실제 표기값이라 그대로 신뢰한다 */
  const pickDbResult = (item: ItemForm, r: BarcodeLookup) => {
    haptics.success();
    updateItem(item.key, {
      name: (r.foodName || item.name).slice(0, MAX_NAME),
      portion: (r.servingSize ?? '').slice(0, MAX_PORTION),
      calories: r.calories ? String(r.calories) : '',
      carbs: r.carbs ? String(r.carbs) : '',
      protein: r.protein ? String(r.protein) : '',
      fat: r.fat ? String(r.fat) : '',
    });
    if (r.sugar != null || r.sodium != null || r.fiber != null) {
      setExtras({ sugar: r.sugar ?? undefined, sodium: r.sodium ?? undefined, fiber: r.fiber ?? undefined });
    }
    setDbSearch(null);
    toast.success('실제 표기값으로 채웠어요');
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
        photoUrl = await uploadForSubmit(photoUri);
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
        // 추가 영양소는 항목 단위가 없는 끼니 레벨 값 — AI 분석·바코드에서만 채워진다
        sugar: extras?.sugar,
        sodium: extras?.sodium,
        fiber: extras?.fiber,
        // 커플이 아니면 서버가 조용히 무시하므로 editing 상태에서만 항상 false 로 둔다
        sharedWithPartner: !editing && dateMeal ? true : undefined,
      };

      /*
       * 수정은 여기서 끝낸다 — 이미 공유했을 수도 있는 기록이라 채팅 공유를 다시 묻지 않고,
       * 목표 달성 축하(goals)도 서버가 수정 응답에는 싣지 않는다(MealService.update 참고).
       */
      if (editing) {
        await update(editing.id, payload);
        haptics.success();
        toast.success('식단을 수정했어요');
        allowLeave();
        navigation.goBack();
        return;
      }

      const saved = await save(payload);
      haptics.success();

      /*
       * 장소를 골랐으면 이 식단 기록을 그 장소 방문 기록으로도 남긴다 — "식단에 등록했다"는
       * 곧 "거기 다녀왔다"는 뜻이라 두 번 입력받지 않는다. 별점을 같이 매겼으면 럽슐랭 대표
       * 평점도 그 자리에서 upsert 한다(재평가라도 안전 — PlaceService.rate 참고). 이 연동이
       * 실패해도 식단 기록 자체는 이미 저장됐으므로 전체 저장을 실패로 되돌리지 않는다.
       */
      let placeToastSuffix = '';
      // 장소 연동이 실패해도 식단 기록 자체는 이미 저장됐다 — 하지만 바로 아래서 성공
      // 토스트를 또 띄우면(둘 다 단일 슬롯 toastStore라 나중 호출이 앞 걸 그냥 덮어써서)
      // 이 실패 토스트는 화면에 뜰 새도 없이 사라졌다(2026-08-31). 실패 여부를 들고 있다가
      // 토스트를 딱 한 번만 — 실패했으면 타입도 error 로 — 보낸다.
      let placeLinkFailed = false;
      if (selectedPlace) {
        try {
          await placeApi.recordVisit(selectedPlace.id, {
            visitedAt: mealDate,
            mealId: saved.id,
            rating: placeRating > 0 ? placeRating : undefined,
          });
          if (placeRating > 0) {
            const previousTier = selectedPlace.lovelichelinTier;
            const updated = await placeApi.rate(selectedPlace.id, { rating: placeRating, revisitIntent: true });
            placeToastSuffix =
              previousTier === 0 && updated.lovelichelinTier > 0
                ? ` · 럽슐랭 ${updated.lovelichelinTier}스타 등극! 🎉`
                : ` · ${selectedPlace.name} 럽슐랭 평가 완료`;
          } else {
            placeToastSuffix = ` · ${selectedPlace.name} 방문 기록 완료`;
          }
          usePlaceStore.getState().invalidate();
        } catch (e) {
          placeLinkFailed = true;
          placeToastSuffix = ` · ${getErrorMessage(e, '장소 방문 기록 연동에 실패했어요. 럽슐랭에서 다시 시도해주세요.')}`;
        }
      }

      const saveMessage =
        (payload.sharedWithPartner
          ? `데이트 식단 완료! ${partnerName}님에게도 등록됐어요 💕`
          : '식단 기록 완료! ') + placeToastSuffix;
      if (placeLinkFailed) {
        toast.error(saveMessage);
      } else {
        toast.success(saveMessage);
      }

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

  // 사진 위 칩(음식 위치 표시)을 하나라도 그릴지 — box 를 가진 항목이 하나도 없으면
  // 사진 컨테이너를 기존 정사각 크롭 그대로 둔다(레이아웃이 괜히 흔들리지 않게)
  const hasChips = items.some((i) => i.box && i.box.length === 4);

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

          {/*
            "데이트" 칩 — 커플 연결돼 있을 때만 노출. 수정 화면에서는 안 보여준다(update()
            는 상대방에게 아무 영향이 없어서, 여기서 데이트 여부를 바꿀 수 있는 것처럼
            보이면 오해를 산다).
          */}
          {couple?.id && !editing ? (
            <>
              <Text style={styles.label}>함께</Text>
              <Chip
                label={`🍽️ ${partnerName}님과 같이 먹었어요`}
                selected={dateMeal}
                onPress={() => setDateMeal((v) => !v)}
              />
              {dateMeal ? (
                <Text style={styles.dateMealHint}>
                  {partnerName}님에게도 같은 끼니가 등록되고, 칼로리는 서로 절반씩 나눠 담겨요.
                </Text>
              ) : null}
            </>
          ) : null}

          {/*
            럽슐랭 장소 연동 — 식단 기록 = 방문. 수정 화면에서는 노출하지 않는다(위 "함께"와
            같은 이유 — update() 는 상대방·장소 어느 쪽에도 영향이 없어서, 여기서 방문을
            새로 만들 수 있는 것처럼 보이면 오해를 산다).
          */}
          {!editing ? (
            <>
              <Text style={styles.label}>어디서 드셨어요? (선택)</Text>
              {/*
                닫기 버튼을 픽커 안에 겹쳐 넣지 않고 행의 별도 형제로 둔다 — 터치 영역이
                겹치는 중첩 TouchableOpacity 는 안드로이드에서 눌림이 새기 쉽다.
              */}
              <View style={styles.placePicker}>
                <TouchableOpacity
                  style={styles.placePickerMain}
                  onPress={() => setPlaceSheetOpen(true)}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons name="map-marker-outline" size={18} color={colors.textSecondary} />
                  <Text style={styles.placePickerText} numberOfLines={1}>
                    {/*
                      "저장한 장소에서 고르기"라고만 쓰면 이 시트가 새 장소 검색·등록도 겸한다는 걸
                      아무도 모른다(실제로 사용자가 이 기능 자체를 모르고 있었다 — 2026-09-02
                      리포트). 시트를 열어야 "카카오에서 찾기"가 보이므로, 닫힌 상태 문구부터
                      "검색"을 앞세운다.
                    */}
                    {selectedPlace ? selectedPlace.name : '장소 검색하기'}
                  </Text>
                </TouchableOpacity>
                {selectedPlace ? (
                  <TouchableOpacity
                    onPress={() => {
                      setSelectedPlace(null);
                      setPlaceRating(0);
                    }}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="선택한 장소 지우기"
                  >
                    <MaterialCommunityIcons name="close" size={18} color={colors.textTertiary} />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    onPress={() => setPlaceSheetOpen(true)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="장소 고르기"
                  >
                    <MaterialCommunityIcons name="chevron-right" size={18} color={colors.textTertiary} />
                  </TouchableOpacity>
                )}
              </View>

              {selectedPlace ? (
                <>
                  <Text style={styles.label}>같이 별점도 남길까요? (선택)</Text>
                  <View style={styles.starRow}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <TouchableOpacity
                        key={n}
                        onPress={() => setPlaceRating(placeRating === n ? 0 : n)}
                        accessibilityRole="button"
                        accessibilityLabel={`별점 ${n}점`}
                      >
                        <Text style={styles.star}>{n <= placeRating ? '★' : '☆'}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.placeRatingHint}>
                    {placeRating > 0
                      ? '방문 기록과 함께 럽슐랭 평가에도 반영돼요.'
                      : '별점 없이 저장하면 방문 기록만 남아요.'}
                  </Text>
                </>
              ) : null}
            </>
          ) : null}

          {/* 포장식품은 바코드로 바로 조회 — 사진/텍스트 AI 분석보다 정확하다(추정이 아니라 실제 표기값) */}
          <TouchableOpacity style={styles.barcodeBtn} onPress={() => navigation.navigate('BarcodeScan')}>
            <MaterialCommunityIcons name="camera-outline" size={18} color={colors.primary} />
            <Text style={styles.barcodeBtnText}>바코드로 찾기</Text>
          </TouchableOpacity>

          {/* 사진 */}
          <Text style={styles.label}>사진</Text>
          {/*
            칩(음식 위치 표시)을 사진 탭 영역과 형제로 둔다 — 겹치는 TouchableOpacity 를
            중첩하면 안드로이드에서 눌림이 샌다(place 픽커의 닫기 버튼과 같은 이유).
            hasChips 인 동안만 실제 사진 비율(photoSize)로 컨테이너를 바꾼다 — cover 크롭이
            없어져 0~1000 정규화 좌표를 보정 없이 그대로 퍼센트 위치로 쓸 수 있다.
          */}
          <View
            style={[
              styles.photoBox,
              photoUri
                ? hasChips && photoSize
                  ? { width: '100%', aspectRatio: photoSize.width / photoSize.height }
                  : styles.photoBoxFilled
                : styles.photoBoxEmpty,
            ]}
          >
            <TouchableOpacity
              style={styles.photoTapArea}
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
            {hasChips
              ? items.map((item, idx) =>
                  item.box && item.box.length === 4 ? (
                    <TouchableOpacity
                      key={item.key}
                      style={[
                        styles.photoChip,
                        { left: `${item.box[1] / 10}%`, top: `${item.box[0] / 10}%` },
                      ]}
                      onPress={() => onTapChip(item.key)}
                      hitSlop={4}
                    >
                      <Text style={styles.photoChipText}>{idx + 1}</Text>
                    </TouchableOpacity>
                  ) : null,
                )
              : null}
          </View>
          {photoUri ? (
            <TouchableOpacity
              onPress={() => {
                setPhotoUri(null);
                setAnalysisSource(null);
                // 업로드 캐시만 버린다. 분석으로 들어온 음식 항목은 그대로 둔다 —
                // 사진을 지워도 먹은 건 먹은 것이고, 틀렸으면 항목별로 지울 수 있다.
                uploadedRef.current = null;
                uploadedDoneRef.current = null;
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
              {/*
                신뢰도 표현 — NUTRITION_LABEL 은 추정이 아니라 표기값을 그대로 읽은 것이라
                바코드·DB 조회와 같은 급으로 다르게 말한다(추정치라고 하면 신뢰도를 낮춰 보인다).
              */}
              <Text style={styles.analyzeHint}>
                {analysisSource === 'NUTRITION_LABEL'
                  ? '영양성분표를 읽었어요. 표기값 그대로예요 — 저장 전에 확인해주세요.'
                  : analysisSource === 'TEXT_IN_PHOTO'
                    ? '사진 속 글자로 알아낸 추정치예요. 저장 전에 항목별로 수정할 수 있어요.'
                    : '분석 결과는 추정치예요. 저장 전에 항목별로 수정할 수 있어요.'}
              </Text>
            </>
          ) : null}

          {/* 즐겨찾기 세트 — 원탭 추가(길게 눌러 삭제). 세트에 담긴 음식이 각각 항목으로 들어온다.
              없으면 시작용 추천 */}
          <View style={styles.favHeader}>
            <Text style={styles.label}>즐겨찾기</Text>
            <View style={styles.favHeaderActions}>
              <TouchableOpacity
                style={styles.favInboxLink}
                onPress={() => navigation.navigate('FavoriteFoodGiftInbox')}
              >
                <Text style={styles.favSave}>🎁 선물함</Text>
                {pendingGiftCount > 0 ? (
                  <View style={styles.giftCountBadge}>
                    <Text style={styles.giftCountBadgeText}>{pendingGiftCount}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
              <TouchableOpacity onPress={saveCurrentAsFavorite}>
                <Text style={styles.favSave}>＋ 현재 저장</Text>
              </TouchableOpacity>
            </View>
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
                  <TouchableOpacity
                    hitSlop={8}
                    disabled={giftingId === f.id}
                    onPress={() => giftFavorite(f)}
                    accessibilityRole="button"
                    accessibilityLabel="즐겨찾기 공유하기"
                  >
                    <Text style={styles.favChipGift}>🎁</Text>
                  </TouchableOpacity>
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

          {/* 최근 먹은 음식 — 즐겨찾기와 달리 따로 저장하지 않아도 최근 기록에서 자동으로 뽑힌다.
              탭하면 음식 항목으로 들어온다 */}
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

          {/* 음식 항목 — 반찬 하나가 카드 하나. 칼로리·탄단지를 항목별로 고친다 */}
          <Text style={styles.label}>먹은 음식</Text>
          {items.map((item, idx) => (
            <View
              key={item.key}
              style={[styles.itemCard, highlightedItemKey === item.key && styles.itemCardHighlighted]}
            >
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

              <View style={styles.nameRow}>
                <View style={styles.nameField}>
                  <TextField
                    placeholder="음식명 (예: 공기밥)"
                    value={item.name}
                    maxLength={MAX_NAME}
                    onChangeText={(t) => updateItem(item.key, { name: t })}
                  />
                </View>
                <TouchableOpacity
                  style={styles.dbSearchBtn}
                  onPress={() => onSearchDb(item)}
                  disabled={searchingDbKey === item.key}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="음식 DB에서 검색하기"
                >
                  {searchingDbKey === item.key ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <MaterialCommunityIcons name="magnify" size={22} color={colors.primary} />
                  )}
                </TouchableOpacity>
              </View>
              {dbSearch?.key === item.key ? (
                <View style={styles.dbResultBox}>
                  <Text style={styles.dbResultHint}>공공 DB 검색 결과 — 실제 표기값이에요</Text>
                  {dbSearch.results.map((r, i) => (
                    <TouchableOpacity
                      key={`${r.barcode || r.foodName || i}-${i}`}
                      style={styles.dbResultRow}
                      onPress={() => pickDbResult(item, r)}
                    >
                      <Text style={styles.dbResultName} numberOfLines={1}>{r.foodName || '이름 없음'}</Text>
                      <Text style={styles.dbResultMeta} numberOfLines={1}>
                        {[r.servingSize, r.calories != null ? `${r.calories}kcal` : null].filter(Boolean).join(' · ')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity onPress={() => setDbSearch(null)}>
                    <Text style={styles.dbResultClose}>닫기</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
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

          {/* 데이트 식단 미리보기 — 저장하면 실제로 이 값으로 나뉘어 각자에게 기록된다는 걸 미리 보여준다 */}
          {dateMeal && (filled.length > 0 || num(totalCalories)) ? (
            <Text style={styles.dateMealPreview}>
              🍽 나와 {partnerName}님 각각{' '}
              {halfRound(filled.length > 0 ? totals.calories : num(totalCalories) ?? 0)}kcal씩 기록돼요
            </Text>
          ) : null}

          {/* 추가 영양소 — AI 분석·바코드에서만 채워진다(즐겨찾기 경로는 없음). 목표(target)는 없는
              정보성 지표라 위 매크로보다 한 톤 낮춰 작게 보여준다. */}
          {extras && (extras.sugar != null || extras.sodium != null || extras.fiber != null) ? (
            <Text style={styles.extraNutrients}>
              당류 {extras.sugar ?? 0}g · 나트륨 {extras.sodium ?? 0}mg · 식이섬유 {extras.fiber ?? 0}g
            </Text>
          ) : null}

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
            /* 분석 중 저장하면 곧 도착할 결과를 못 받은 채 화면을 떠난다 — 잠금을 걷어낸
               지금은 눌릴 수 있으므로 여기서 막는다 */
            disabled={analyzing || analyzingText}
            style={styles.save}
          />
      </FormKeyboardView>

      {/*
        럽슐랭 장소 선택 시트 — 저장된 장소 중에서 고르거나, 없으면 카카오에서 찾아 바로
        추가한다(다녀온 곳이니 곧장 방문완료로 생긴다 — onAddFromKakao 참고).
      */}
      <Sheet visible={placeSheetOpen} onClose={closePlaceSheet} cardStyle={styles.placeSheetCard}>
        <Text style={styles.sheetTitle}>어디서 드셨어요?</Text>
        <TextField
          placeholder="장소 이름으로 검색"
          value={placeSearch}
          onChangeText={setPlaceSearch}
          onSubmitEditing={onKakaoSearch}
          returnKeyType="search"
        />
        {places.length > 0 ? (
          <>
            <Text style={styles.sheetSectionLabel}>저장된 장소</Text>
            <FlatList
              data={placeCandidates}
              keyExtractor={(p) => String(p.id)}
              style={styles.placeSheetList}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.placeCandidate}
                  activeOpacity={0.7}
                  onPress={() => {
                    setSelectedPlace(item);
                    setPlaceRating(item.myRating ?? 0);
                    closePlaceSheet();
                  }}
                >
                  <Text style={styles.placeCandidateName}>{item.name}</Text>
                  <Text style={styles.placeCandidateInfo}>{item.category ?? item.address ?? ''}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={styles.empty}>검색 결과가 없어요.</Text>}
            />
          </>
        ) : null}

        {/* 새 장소 추가 — 저장된 목록에 없을 때. 검색창의 텍스트를 그대로 카카오 키워드로 쓴다 */}
        <View style={styles.kakaoHeaderRow}>
          <Text style={styles.sheetSectionLabel}>
            {places.length > 0 ? '저장된 장소에 없나요?' : '아직 저장한 장소가 없어요'}
          </Text>
          <Button
            title="카카오에서 찾기"
            size="sm"
            variant="soft"
            disabled={!placeSearch.trim()}
            loading={kakaoSearching}
            onPress={onKakaoSearch}
          />
        </View>
        {kakaoUnavailable ? (
          <Text style={styles.empty}>지금은 새 장소 검색을 쓸 수 없어요. 럽슐랭 탭에서 직접 추가해주세요.</Text>
        ) : null}
        {kakaoResults ? (
          <FlatList
            data={kakaoResults}
            keyExtractor={(p, i) => `${p.name}-${p.lat ?? ''}-${p.lng ?? ''}-${i}`}
            style={styles.placeSheetList}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <View style={styles.kakaoResultRow}>
                <View style={styles.flex}>
                  <Text style={styles.placeCandidateName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.placeCandidateInfo} numberOfLines={1}>
                    {item.category ?? item.address ?? ''}
                  </Text>
                </View>
                <Button
                  title="추가"
                  size="sm"
                  loading={addingPlaceName === item.name}
                  onPress={() => onAddFromKakao(item)}
                />
              </View>
            )}
            ListEmptyComponent={<Text style={styles.empty}>검색 결과가 없어요.</Text>}
          />
        ) : null}

        <Button title="닫기" variant="ghost" size="md" onPress={closePlaceSheet} />
      </Sheet>
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
  barcodeBtn: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primaryBg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  barcodeBtnText: { fontSize: fontSize.body, fontWeight: '800', color: colors.primary },
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
  // 사진 탭 영역 — 칩(형제 View)과 겹치지 않는 별도 레이어. photoBox 를 그대로 채운다
  photoTapArea: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  photo: { width: '100%', height: '100%' },
  photoPlaceholder: { color: colors.textSecondary, fontSize: fontSize.body, fontWeight: '600' },
  /*
   * 음식 위치 칩 — box[1](xMin)/box[0](yMin) 를 퍼센트로 그대로 쓴다(둘 다 절대 위치 top/left).
   * 음수 오프셋(중앙 정렬용 translate)을 안 쓰는 이유: photoBox 가 overflow:hidden 이라
   * 박스 좌상단이 사진 가장자리에 붙으면 칩이 잘려 나간다 — 배지 자체를 좌상단 코너에
   * "얹는" 모양으로 그려 항상 사진 안쪽에 머물게 한다.
   */
  photoChip: {
    position: 'absolute',
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  photoChipText: { color: onColor(colors.primary), fontSize: fontSize.caption, fontWeight: '800' },
  removePhoto: { color: colors.danger, fontSize: fontSize.caption, marginTop: spacing.xs, alignSelf: 'flex-end' },
  analyzeButton: { marginTop: spacing.sm },
  analyzeHint: { color: colors.textSecondary, fontSize: fontSize.caption, marginTop: spacing.xs, textAlign: 'center' },
  dateMealHint: { color: colors.textSecondary, fontSize: fontSize.caption, marginTop: spacing.xs },
  dateMealPreview: {
    color: colors.primary,
    fontSize: fontSize.caption,
    fontWeight: '700',
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
    textAlign: 'center',
  },

  // 럽슐랭 장소 연동 — 선택 버튼 + 별점
  placePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 48,
  },
  placePickerMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  placePickerText: { flex: 1, fontSize: fontSize.body, color: colors.textPrimary, fontWeight: '600' },
  starRow: { flexDirection: 'row', gap: spacing.sm },
  star: { fontSize: 32, color: colors.accent },
  placeRatingHint: { color: colors.textSecondary, fontSize: fontSize.caption, marginTop: spacing.xs },
  placeSheetCard: { maxHeight: '80%' },
  sheetTitle: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.md },
  sheetSectionLabel: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    fontWeight: '700',
    marginTop: spacing.md,
  },
  // 저장된 장소/카카오 결과 두 목록이 한 시트 안에 같이 들어가므로, 하나가 길어져도
  // 시트(placeSheetCard, maxHeight 80%) 밖으로 밀어내지 않게 목록마다 각자 스크롤을 준다
  placeSheetList: { maxHeight: 200, marginTop: spacing.sm, marginBottom: spacing.sm },
  placeCandidate: { paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  placeCandidateName: { fontSize: fontSize.body, fontWeight: '700', color: colors.textPrimary },
  placeCandidateInfo: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 2 },
  kakaoHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  kakaoResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  empty: { fontSize: fontSize.caption, color: colors.textSecondary, textAlign: 'center', paddingVertical: spacing.lg },

  // 음식 항목 카드 — 운동 기록의 세트 카드와 같은 형태
  itemCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  // 사진 위 칩을 탭했을 때 그 항목 카드를 잠깐 강조 — onTapChip 참고
  itemCardHighlighted: { borderColor: colors.primary, backgroundColor: colors.primaryBg },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  itemHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  itemNo: { fontSize: fontSize.body, fontWeight: '700', color: colors.primary },
  itemKcal: { fontSize: fontSize.caption, fontWeight: '800', color: colors.accent },
  remove: { color: colors.danger, fontSize: fontSize.caption },
  // 음식명 + DB 검색 버튼 — TextField 는 자체 marginBottom 을 갖고 있어 행 안에서도 간격이 맞는다
  nameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  nameField: { flex: 1 },
  dbSearchBtn: {
    width: 54,
    height: 54,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // DB 이름 검색 결과 — 항목당 하나만 열리고, 실제 표기값이라 눈에 띄게 강조한다
  dbResultBox: {
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primaryBg,
    padding: spacing.sm,
  },
  dbResultHint: { fontSize: fontSize.caption, color: colors.primary, fontWeight: '700', marginBottom: spacing.xs },
  dbResultRow: { paddingVertical: spacing.xs },
  dbResultName: { fontSize: fontSize.body, color: colors.textPrimary, fontWeight: '700' },
  dbResultMeta: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 2 },
  dbResultClose: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700', marginTop: spacing.xs, textAlign: 'right' },
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
  extraNutrients: { fontSize: fontSize.caption, color: colors.textTertiary, marginTop: spacing.xs, textAlign: 'center' },

  favHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  favHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  favInboxLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  favSave: { fontSize: fontSize.caption, color: colors.primary, fontWeight: '800' },
  favHint: { fontSize: fontSize.caption, color: colors.textSecondary, marginBottom: spacing.sm },
  giftCountBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  giftCountBadgeText: { fontSize: 9, fontWeight: '800', color: colors.white },
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
  // 선물 아이콘 — 칩 전체 탭(항목 추가)과 겹치지 않도록 별도 터치 영역을 준다
  favChipGift: { fontSize: fontSize.caption, marginLeft: 2 },
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
