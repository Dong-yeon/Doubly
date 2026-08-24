/** 장소 추가 — 카카오 플레이스 검색 자동 입력 + 이름·주소·카테고리·상태(위시/방문)·지도 위치 선택 */
import React, { useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { PlaceScreensParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { FormKeyboardView } from '../../components/FormKeyboardView';
import { Chip } from '../../components/Chip';
import { KakaoMap } from '../../components/KakaoMap';
import type { KakaoMapHandle, KakaoPlaceResult } from '../../components/KakaoMap.types';
import { placeApi } from '../../api/place';
import { usePlaceStore } from '../../store/placeStore';
import { isKakaoMapConfigured } from '../../constants/config';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { useDirtyGuard } from '../../hooks/useDirtyGuard';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { PlaceStatus } from '../../types';
import { themedStyles } from '../../theme/themedStyles';

// 럽슐랭 탭과 홈(여행) 스택 양쪽에 등록되는 화면 — 두 스택이 공유하는 최소 목록으로 타입을 잡는다
type Props = NativeStackScreenProps<PlaceScreensParamList, 'PlaceAdd'>;

// 맛집뿐 아니라 여행지·전시 같은 데이트 장소 전반을 담는다 — 음식 → 나들이 순
const CATEGORIES = ['한식', '중식', '일식', '양식', '카페', '디저트', '술집', '여행지', '박물관·전시', '액티비티', '기타'];

// 카카오 카테고리 그룹 코드 → 앱 카테고리 자동 매핑 (CE7 카페 / AT4 관광명소 / CT1 문화시설)
const KAKAO_CATEGORY_AUTO: Record<string, string> = {
  CE7: '카페',
  AT4: '여행지',
  CT1: '박물관·전시',
};

const STATUS_OPTIONS: { value: PlaceStatus; label: string }[] = [
  { value: 'WISHLIST', label: '가고 싶어요' },
  { value: 'VISITED', label: '다녀왔어요' },
];

export function PlaceAddScreen({ navigation, route }: Props) {
  // 기존 장소를 들고 들어오면 수정 모드 — 필드를 채워두고 저장 시 update 를 호출한다
  const editingPlace = route.params?.place;
  const isEdit = editingPlace != null;
  // 지도 탭에서 빈 곳을 탭해 "여기에 추가"로 들어오면 좌표·주소가 미리 채워져 있다
  const initialCoords = route.params?.initialCoords;

  const [name, setName] = useState(editingPlace?.name ?? '');
  const [address, setAddress] = useState(editingPlace?.address ?? initialCoords?.address ?? '');
  const [category, setCategory] = useState<string | null>(editingPlace?.category ?? null);
  const [status, setStatus] = useState<PlaceStatus>(editingPlace?.status ?? 'WISHLIST');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    editingPlace?.lat != null && editingPlace?.lng != null
      ? { lat: editingPlace.lat, lng: editingPlace.lng }
      : initialCoords
        ? { lat: initialCoords.lat, lng: initialCoords.lng }
        : null,
  );
  const [saving, setSaving] = useState(false);

  // 카카오 플레이스 키워드 검색 (지도 SDK services — WebView 브리지)
  const mapRef = useRef<KakaoMapHandle>(null);
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<KakaoPlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 입력이 하나라도 있으면(수정 모드는 원본과 달라지면) 이탈(뒤로가기·스와이프) 전에 확인한다
  const dirty = isEdit
    ? name.trim() !== (editingPlace?.name ?? '') ||
      address.trim() !== (editingPlace?.address ?? '') ||
      category !== (editingPlace?.category ?? null) ||
      status !== (editingPlace?.status ?? 'WISHLIST') ||
      (coords?.lat ?? null) !== (editingPlace?.lat ?? null) ||
      (coords?.lng ?? null) !== (editingPlace?.lng ?? null)
    : name.trim().length > 0 ||
      address.trim().length > 0 ||
      category != null ||
      coords != null ||
      keyword.trim().length > 0;
  const allowLeave = useDirtyGuard(dirty);

  const onSearch = () => {
    const q = keyword.trim();
    if (!q) return;
    setSearching(true);
    setResults([]);
    mapRef.current?.search(q);
    // 지도 로딩 전 등 응답이 없을 때를 대비한 안전장치. 결과가 먼저 도착하면
    // onSearchResults 가 이 타이머를 지우므로, 여기가 실행됐다는 건 타임아웃이 이긴
    // 것이다 — 검색이 조용히 아무것도 못 찾은 것처럼 보이지 않게 이유를 알려준다.
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setSearching(false);
      toast.error('검색이 너무 오래 걸려요. 다시 시도해주세요.');
    }, 6000);
  };

  const onSearchResults = (_kw: string, found: KakaoPlaceResult[]) => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    setSearching(false);
    setResults(found);
    if (found.length === 0) toast.error('검색 결과가 없어요.');
  };

  // 검색 결과 선택 → 이름·주소·좌표 자동 입력 + 지도 핀
  const onPickResult = (place: KakaoPlaceResult) => {
    setName(place.name);
    if (place.address) setAddress(place.address);
    setCoords({ lat: place.lat, lng: place.lng });
    const auto = place.categoryGroup ? KAKAO_CATEGORY_AUTO[place.categoryGroup] : undefined;
    if (auto) setCategory((prev) => prev ?? auto);
    mapRef.current?.setPin(place.lat, place.lng);
    setResults([]);
    setKeyword('');
    haptics.light();
  };

  // 지도 탭 → 좌표 저장 + (주소가 비어 있으면) 자동 입력
  const onMapSelect = (pos: { lat: number; lng: number; address?: string | null }) => {
    setCoords({ lat: pos.lat, lng: pos.lng });
    if (pos.address) {
      setAddress((prev) => (prev.trim() ? prev : pos.address ?? ''));
    }
  };

  const onSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        address: address.trim() || undefined,
        lat: coords?.lat,
        lng: coords?.lng,
        category: category ?? undefined,
        status,
      };
      if (editingPlace) {
        await placeApi.update(editingPlace.id, payload);
        haptics.success();
        toast.success('장소를 수정했어요 ');
      } else {
        await placeApi.save(payload);
        haptics.success();
        toast.success('장소를 추가했어요 ');
      }
      allowLeave();
      usePlaceStore.getState().invalidate();
      navigation.goBack();
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FormKeyboardView contentContainerStyle={styles.container}>
          {isKakaoMapConfigured() ? (
            <>
              <Text style={styles.label}>카카오 장소 검색 — 이름·주소·위치가 자동 입력돼요</Text>
              <View style={styles.searchRow}>
                <View style={styles.flex}>
                  <TextField
                    placeholder="예: 국립중앙박물관"
                    value={keyword}
                    onChangeText={setKeyword}
                    onSubmitEditing={onSearch}
                    returnKeyType="search"
                  />
                </View>
                <Button title="검색" size="md" onPress={onSearch} loading={searching} />
              </View>
              {results.map((r) => (
                <TouchableOpacity
                  key={`${r.name}-${r.lat}-${r.lng}`}
                  style={styles.resultCard}
                  activeOpacity={0.7}
                  onPress={() => onPickResult(r)}
                >
                  <Text style={styles.resultName}>{r.name}</Text>
                  {r.address ? <Text style={styles.resultAddress}>{r.address}</Text> : null}
                </TouchableOpacity>
              ))}
            </>
          ) : null}

          <TextField
            label="장소 이름"
            placeholder="예: 남산서울타워"
            value={name}
            onChangeText={setName}
            maxLength={100}
          />
          <TextField
            label="주소 (선택)"
            placeholder="예: 서울 마포구 어울마당로 5길 12"
            value={address}
            onChangeText={setAddress}
          />

          {isKakaoMapConfigured() ? (
            <>
              <Text style={styles.label}>위치 확인 (선택) — 지도를 탭해 직접 고를 수도 있어요</Text>
              <KakaoMap
                ref={mapRef}
                selectable
                height={240}
                // 수정 모드는 기존 위치를, 지도 탭 "여기에 추가"로 들어온 경우엔 그 좌표를
                // 핀으로 미리 보여준다 (탭·검색으로 바꾸면 새 핀이 함께 표시됨)
                markers={
                  editingPlace?.lat != null && editingPlace?.lng != null
                    ? [
                        {
                          id: editingPlace.id,
                          lat: editingPlace.lat as number,
                          lng: editingPlace.lng as number,
                          title: editingPlace.name,
                        },
                      ]
                    : initialCoords
                      ? [{ id: -1, lat: initialCoords.lat, lng: initialCoords.lng, title: '선택한 위치' }]
                      : undefined
                }
                centerLat={editingPlace?.lat ?? initialCoords?.lat ?? undefined}
                centerLng={editingPlace?.lng ?? initialCoords?.lng ?? undefined}
                onSelect={onMapSelect}
                onSearchResults={onSearchResults}
              />
              <Text style={styles.coordText}>
                {coords ? `위치 선택됨 (${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)})` : '아직 위치를 선택하지 않았어요'}
              </Text>
            </>
          ) : null}

          <Text style={styles.label}>카테고리 (선택)</Text>
          <View style={styles.chipRow}>
            {CATEGORIES.map((c) => (
              <Chip
                key={c}
                label={c}
                selected={category === c}
                onPress={() => setCategory(category === c ? null : c)}
              />
            ))}
          </View>

          <Text style={styles.label}>상태</Text>
          <View style={styles.chipRow}>
            {STATUS_OPTIONS.map((o) => (
              <Chip
                key={o.value}
                label={o.label}
                selected={status === o.value}
                onPress={() => setStatus(o.value)}
                fill
              />
            ))}
          </View>

          <Button
            title={isEdit ? '수정하기' : '추가하기'}
            onPress={onSave}
            loading={saving}
            disabled={!name.trim()}
            style={styles.submit}
          />
      </FormKeyboardView>
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  container: { padding: spacing.lg, paddingBottom: spacing.xl },
  searchRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  resultCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  resultName: { fontSize: fontSize.body, fontWeight: '700', color: colors.textPrimary },
  resultAddress: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 2 },
  label: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    fontWeight: '700',
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  coordText: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: spacing.xs },
  submit: { marginTop: spacing.lg },
}));
