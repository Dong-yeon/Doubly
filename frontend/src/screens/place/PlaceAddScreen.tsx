/** 장소 추가 — 이름·주소·카테고리·상태(위시/방문). 좌표는 지도 SDK 도입 후 지원 */
import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { PlaceStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { KakaoMap } from '../../components/KakaoMap';
import { placeApi } from '../../api/place';
import { isKakaoMapConfigured } from '../../constants/config';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { PlaceStatus } from '../../types';

type Props = NativeStackScreenProps<PlaceStackParamList, 'PlaceAdd'>;

const CATEGORIES = ['한식', '중식', '일식', '양식', '카페', '디저트', '술집', '기타'];

const STATUS_OPTIONS: { value: PlaceStatus; label: string }[] = [
  { value: 'WISHLIST', label: '💛 가고 싶어요' },
  { value: 'VISITED', label: '✅ 다녀왔어요' },
];

export function PlaceAddScreen({ navigation }: Props) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [status, setStatus] = useState<PlaceStatus>('WISHLIST');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [saving, setSaving] = useState(false);

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
      });
      haptics.success();
      toast.success('장소를 추가했어요 📍');
      navigation.goBack();
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
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
              <Text style={styles.label}>위치 선택 (선택) — 지도를 탭하면 핀이 찍혀요</Text>
              <KakaoMap selectable height={240} onSelect={onMapSelect} />
              <Text style={styles.coordText}>
                {coords ? `📍 위치 선택됨 (${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)})` : '아직 위치를 선택하지 않았어요'}
              </Text>
            </>
          ) : null}

          <Text style={styles.label}>카테고리 (선택)</Text>
          <View style={styles.chipRow}>
            {CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.chip, category === c && styles.chipActive]}
                onPress={() => setCategory(category === c ? null : c)}
              >
                <Text style={[styles.chipText, category === c && styles.chipTextActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>상태</Text>
          <View style={styles.chipRow}>
            {STATUS_OPTIONS.map((o) => (
              <TouchableOpacity
                key={o.value}
                style={[styles.statusChip, status === o.value && styles.chipActive]}
                onPress={() => setStatus(o.value)}
              >
                <Text style={[styles.chipText, status === o.value && styles.chipTextActive]}>{o.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Button title="추가하기" onPress={onSave} loading={saving} disabled={!name.trim()} style={styles.submit} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  container: { padding: spacing.lg, paddingBottom: spacing.xl },
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
});
