/**
 * 장소 추가 — 카카오 장소 검색(서버) + 이름·주소·카테고리·지도 위치 선택.
 *
 * <p><b>검색 결과를 누르면 그 자리에서 저장한다</b>(새로 추가할 때만). 예전엔 결과가 폼을 채우기만 하고
 * [추가하기]를 한 번 더 눌러야 했다 — 식단 화면은 이미 바로 저장하고 있었다. 수정 모드는 폼을 채우는
 * 데서 멈춘다(무엇이 바뀌는지 사람이 보고 확정해야 한다).
 *
 * <p><b>검색은 지도가 아니라 서버(GET /places/search)가 한다</b>: 지도 SDK 의 keywordSearch 는 카카오 장소
 * id 를 버려 같은 장소가 두 번 생기곤 했다. 서버 결과는 id 와 앱 카테고리까지 싣고 온다.
 * 지도는 표시와 좌표 고르기만 맡는다. 결정 기록: docs/LOVELICHELIN_CHAT_LINK_2026-10-02.md
 */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { PlaceScreensParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { FormKeyboardView } from '../../components/FormKeyboardView';
import { Chip } from '../../components/Chip';
import { KakaoMap } from '../../components/KakaoMap';
import type { KakaoMapHandle } from '../../components/KakaoMap.types';
import { placeApi } from '../../api/place';
import { errorCodeOf } from '../../api/client';
import { usePlaceStore } from '../../store/placeStore';
import { isKakaoMapConfigured } from '../../constants/config';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { useDirtyGuard } from '../../hooks/useDirtyGuard';
import { useReturnToTab } from '../../hooks/useReturnToTab';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { PLACE_CATEGORIES } from '../../constants/placeCategories';
import type { Place, PlaceSearchResult } from '../../types';
import { themedStyles } from '../../theme/themedStyles';

// 럽슐랭 탭과 홈(여행) 스택 양쪽에 등록되는 화면 — 두 스택이 공유하는 최소 목록으로 타입을 잡는다
type Props = NativeStackScreenProps<PlaceScreensParamList, 'PlaceAdd'>;

/** 402 는 api/client 가 이미 업그레이드 시트를 열었다 — 화면이 또 알리면 같은 말을 두 번 한다 */
function isPlanError(e: unknown): boolean {
  const code = errorCodeOf(e);
  return code === 'PLAN_UPGRADE_REQUIRED' || code === 'PLAN_LIMIT_EXCEEDED';
}

export function PlaceAddScreen({ navigation, route }: Props) {
  // 기존 장소를 들고 들어오면 수정 모드 — 필드를 채워두고 저장 시 update 를 호출한다
  const editingPlace = route.params?.place;
  const isEdit = editingPlace != null;
  // 지도 탭에서 빈 곳을 탭해 "여기에 추가"로 들어오면 좌표·주소가 미리 채워져 있다
  const initialCoords = route.params?.initialCoords;

  const [name, setName] = useState(editingPlace?.name ?? '');
  const [address, setAddress] = useState(editingPlace?.address ?? initialCoords?.address ?? '');
  const [category, setCategory] = useState<string | null>(editingPlace?.category ?? null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    editingPlace?.lat != null && editingPlace?.lng != null
      ? { lat: editingPlace.lat, lng: editingPlace.lng }
      : initialCoords
        ? { lat: initialCoords.lat, lng: initialCoords.lng }
        : null,
  );
  const [saving, setSaving] = useState(false);

  // 카카오 장소 검색 — 서버 경유(파일 상단 주석). 지도 ref 는 핀 옮기기에만 쓴다
  const mapRef = useRef<KakaoMapHandle>(null);
  // 채팅 링크를 해석하지 못하고 넘어왔으면 링크에서 읽은 이름으로 시작한다(아래 effect 가 바로 검색)
  const initialKeyword = route.params?.initialKeyword?.trim() ?? '';
  const [keyword, setKeyword] = useState(initialKeyword);
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  // 채팅에서 검색어를 들고 왔으면 열리자마자 찾고 있는 상태로 시작한다(아래 effect)
  const [searching, setSearching] = useState(initialKeyword.length > 0 && !isEdit);
  // 서버에 카카오 키가 없으면 검색은 늘 빈 결과다 — "결과 없음"과 다른 말을 해야 한다
  const [searchUnavailable, setSearchUnavailable] = useState(false);
  // 결과를 눌러 바로 저장하는 중인 항목 — 연타로 두 번 저장되지 않게 잠근다
  const [savingResultKey, setSavingResultKey] = useState<string | null>(null);

  // 입력이 하나라도 있으면(수정 모드는 원본과 달라지면) 이탈(뒤로가기·스와이프) 전에 확인한다
  const dirty = isEdit
    ? name.trim() !== (editingPlace?.name ?? '') ||
      address.trim() !== (editingPlace?.address ?? '') ||
      category !== (editingPlace?.category ?? null) ||
      (coords?.lat ?? null) !== (editingPlace?.lat ?? null) ||
      (coords?.lng ?? null) !== (editingPlace?.lng ?? null)
    : name.trim().length > 0 ||
      address.trim().length > 0 ||
      category != null ||
      coords != null ||
      // 채팅에서 채워 온 검색어는 사용자가 쓴 것이 아니다 — 그대로면 떠날 때 묻지 않는다
      (keyword.trim().length > 0 && keyword.trim() !== initialKeyword);
  const allowLeave = useDirtyGuard(dirty);

  // 홈처럼 다른 탭에서 열렸으면 닫을 때 그 탭으로 돌려보낸다(훅 주석에 경위)
  const stayInThisTab = useReturnToTab(route.params?.returnTo);

  const onSearch = () => {
    const q = keyword.trim();
    if (!q || searching) return;
    setSearching(true);
    setResults([]);
    setSearchUnavailable(false);
    void fetchResults(q);
  };

  // 서버 검색 — 상태는 응답이 온 뒤에만 바꾼다(effect 에서도 부르기 때문)
  const fetchResults = async (q: string) => {
    try {
      const res = await placeApi.search(q);
      setSearchUnavailable(!res.available);
      setResults(res.places);
      if (res.available && res.places.length === 0) toast.error('검색 결과가 없어요. 이름을 직접 입력해도 돼요.');
    } catch (e) {
      toast.error(getErrorMessage(e, '장소 검색에 실패했어요.'));
    } finally {
      setSearching(false);
    }
  };

  // 채팅 링크에서 넘어온 검색어 — 화면이 열리자마자 한 번 찾아 둔다(결과를 누르면 바로 담긴다)
  useEffect(() => {
    if (initialKeyword && !isEdit) void fetchResults(initialKeyword);
    // 처음 한 번만 — 검색어를 고쳐 다시 찾는 건 사용자 몫이다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * 새 장소 저장이 끝난 뒤 — 새로 생겼으면 닫고, 이미 있던 장소면 "이미 있어요"와 함께 그 장소 상세로
   * 보낸다. 예전엔 중복이어도 "추가했어요"가 떠서 같은 곳을 두 번 담은 줄 알았다.
   */
  const finishSaved = (saved: Place) => {
    allowLeave();
    usePlaceStore.getState().invalidate();
    if (saved.created === false) {
      haptics.light();
      toast.info('이미 럽슐랭에 있어요');
      // 상세로 넘어가는 것은 이 탭 안의 이동이다 — 홈에서 열었어도 홈으로 튀지 않게 한다
      stayInThisTab();
      navigation.replace('PlaceDetail', { placeId: saved.id, name: saved.name });
      return;
    }
    haptics.success();
    toast.success('장소를 추가했어요');
    navigation.goBack();
  };

  const onPickResult = async (place: PlaceSearchResult) => {
    // 수정 모드 — 폼만 채운다. 무엇이 바뀌는지 보고 [수정하기]로 확정한다
    if (isEdit) {
      setName(place.name);
      if (place.address) setAddress(place.address);
      if (place.lat != null && place.lng != null) {
        setCoords({ lat: place.lat, lng: place.lng });
        mapRef.current?.setPin(place.lat, place.lng);
      }
      if (place.category) setCategory((prev) => prev ?? place.category ?? null);
      setResults([]);
      setKeyword('');
      haptics.light();
      return;
    }

    // 새로 추가 — 누른 그 자리에서 저장한다(식단 화면 DietRecordScreen.onAddFromKakao 와 같은 동작)
    if (savingResultKey != null) return;
    setSavingResultKey(resultKeyOf(place));
    try {
      const saved = await placeApi.save({
        name: place.name,
        address: place.address ?? undefined,
        lat: place.lat ?? undefined,
        lng: place.lng ?? undefined,
        category: place.category ?? undefined,
        // 이미 같은 커플에 있는 장소면(카카오 id 로 대조) 새로 만들지 않고 그 장소가 온다(created=false)
        kakaoPlaceId: place.kakaoPlaceId ?? undefined,
      });
      finishSaved(saved);
    } catch (e) {
      if (!isPlanError(e)) toast.error(getErrorMessage(e, '장소를 추가하지 못했어요.'));
    } finally {
      setSavingResultKey(null);
    }
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
      };
      if (editingPlace) {
        await placeApi.update(editingPlace.id, payload);
        haptics.success();
        toast.success('장소를 수정했어요');
        allowLeave();
        usePlaceStore.getState().invalidate();
        navigation.goBack();
      } else {
        finishSaved(await placeApi.save(payload));
      }
    } catch (e) {
      if (!isPlanError(e)) Alert.alert('오류', getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FormKeyboardView contentContainerStyle={styles.container}>
          {/* 설명은 레이블이 아니라 placeholder 가 — 레이블은 명사 하나(§7-3 7번) */}
          <Text style={styles.label}>카카오 장소 검색</Text>
          <View style={styles.searchRow}>
            <View style={styles.flex}>
              <TextField
                placeholder={isEdit ? '이름으로 찾으면 주소·위치가 채워져요' : '이름으로 찾아 누르면 바로 담겨요'}
                value={keyword}
                onChangeText={setKeyword}
                onSubmitEditing={onSearch}
                returnKeyType="search"
              />
            </View>
            <Button title="검색" size="md" onPress={onSearch} loading={searching} />
          </View>
          {searchUnavailable ? (
            <Text style={styles.searchNote}>지금은 장소 검색을 쓸 수 없어요. 아래에 직접 입력해주세요.</Text>
          ) : null}
          {results.map((r, i) => {
            const key = resultKeyOf(r);
            const savingThis = savingResultKey === key;
            return (
              <TouchableOpacity
                key={`${key}-${i}`}
                style={[styles.resultCard, savingResultKey != null && !savingThis && styles.resultDimmed]}
                activeOpacity={0.7}
                disabled={savingResultKey != null}
                onPress={() => onPickResult(r)}
                accessibilityRole="button"
                accessibilityLabel={isEdit ? `${r.name}(으)로 채우기` : `${r.name} 럽슐랭에 담기`}
              >
                <View style={styles.resultRow}>
                  <View style={styles.flex}>
                    <Text style={styles.resultName}>{r.name}</Text>
                    {r.address ? <Text style={styles.resultAddress}>{r.address}</Text> : null}
                  </View>
                  {savingThis ? <ActivityIndicator size="small" color={colors.primary} /> : null}
                </View>
              </TouchableOpacity>
            );
          })}

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
              <Text style={styles.label}>위치 (선택)</Text>
              <KakaoMap
                ref={mapRef}
                selectable
                height={240}
                // 수정 모드는 기존 위치를, 지도 탭 "여기에 추가"로 들어온 경우엔 그 좌표를
                // 핀으로 미리 보여준다 (탭으로 바꾸면 새 핀이 함께 표시됨)
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
              />
              {/* 미선택 문장은 없다 — 핀 없는 지도가 이미 그 상태다 */}
              {coords ? (
                <Text style={styles.coordText}>
                  위치 선택됨 · {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                </Text>
              ) : null}
            </>
          ) : null}

          <Text style={styles.label}>카테고리 (선택)</Text>
          <View style={styles.chipRow}>
            {PLACE_CATEGORIES.map((c) => (
              <Chip
                key={c}
                label={c}
                selected={category === c}
                onPress={() => setCategory(category === c ? null : c)}
              />
            ))}
          </View>

          <Button
            title={isEdit ? '수정하기' : '추가하기'}
            onPress={onSave}
            loading={saving}
            disabled={!name.trim() || savingResultKey != null}
            style={styles.submit}
          />
      </FormKeyboardView>
    </SafeAreaView>
  );
}

/** 검색 결과 한 줄의 식별자 — 카카오 id 가 없을 일은 거의 없지만 없으면 이름으로 */
function resultKeyOf(r: PlaceSearchResult): string {
  return r.kakaoPlaceId ?? `${r.name}|${r.address ?? ''}`;
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  container: { padding: spacing.lg, paddingBottom: spacing.xl },
  searchRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  searchNote: { fontSize: fontSize.caption, color: colors.textSecondary, marginBottom: spacing.xs },
  resultCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  resultDimmed: { opacity: 0.5 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
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
