/** 장소 추가 — 카카오 플레이스 검색 자동 입력 + 이름·주소·카테고리·상태(위시/방문)·지도 위치 선택 */
import React, { useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { PlaceStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { FormKeyboardView } from '../../components/FormKeyboardView';
import { Chip } from '../../components/Chip';
import { KakaoMap } from '../../components/KakaoMap';
import type { KakaoMapHandle, KakaoPlaceResult } from '../../components/KakaoMap.types';
import { placeApi } from '../../api/place';
import { isKakaoMapConfigured } from '../../constants/config';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { useDirtyGuard } from '../../hooks/useDirtyGuard';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { PlaceDietTag, PlaceStatus } from '../../types';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<PlaceStackParamList, 'PlaceAdd'>;

const CATEGORIES = ['한식', '중식', '일식', '양식', '카페', '디저트', '술집', '기타'];

const STATUS_OPTIONS: { value: PlaceStatus; label: string }[] = [
  { value: 'WISHLIST', label: '가고 싶어요' },
  { value: 'VISITED', label: '다녀왔어요' },
];

// 클린식/치팅데이 구분 — 평소엔 클린식, 주말·보상 데이트엔 치팅데이 맛집을 따로 찾는 수요 반영
const DIET_TAG_OPTIONS: { value: PlaceDietTag; label: string }[] = [
  { value: 'NEUTRAL', label: '구분 없음' },
  { value: 'CLEAN', label: '🥗 클린식' },
  { value: 'CHEAT', label: '🍔 치팅데이' },
];

export function PlaceAddScreen({ navigation }: Props) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [status, setStatus] = useState<PlaceStatus>('WISHLIST');
  const [dietTag, setDietTag] = useState<PlaceDietTag>('NEUTRAL');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [saving, setSaving] = useState(false);

  // 카카오 플레이스 키워드 검색 (지도 SDK services — WebView 브리지)
  const mapRef = useRef<KakaoMapHandle>(null);
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<KakaoPlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 입력이 하나라도 있으면 이탈(뒤로가기·스와이프) 전에 확인한다
  const dirty =
    name.trim().length > 0 ||
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
    if (place.categoryGroup === 'CE7') setCategory((prev) => prev ?? '카페');
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
      await placeApi.save({
        name: name.trim(),
        address: address.trim() || undefined,
        lat: coords?.lat,
        lng: coords?.lng,
        category: category ?? undefined,
        status,
        dietTag,
      });
      haptics.success();
      toast.success('장소를 추가했어요 ');
      allowLeave();
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
                    placeholder="예: 온기족발"
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
            placeholder="예: 온기족발 본점"
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
              <KakaoMap ref={mapRef} selectable height={240} onSelect={onMapSelect} onSearchResults={onSearchResults} />
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

          <Text style={styles.label}>식단 구분 (선택) — 평소엔 클린식, 보상 데이트엔 치팅데이로 찾아볼 수 있어요</Text>
          <View style={styles.chipRow}>
            {DIET_TAG_OPTIONS.map((o) => (
              <TouchableOpacity
                key={o.value}
                style={[styles.statusChip, dietTag === o.value && styles.chipActive]}
                onPress={() => setDietTag(o.value)}
              >
                <Text style={[styles.chipText, dietTag === o.value && styles.chipTextActive]}>{o.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Button title="추가하기" onPress={onSave} loading={saving} disabled={!name.trim()} style={styles.submit} />
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
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  statusChip: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  chipActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  chipText: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '600' },
  chipTextActive: { color: colors.textPrimary, fontWeight: '800' },
  coordText: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: spacing.xs },
  submit: { marginTop: spacing.lg },
}));
