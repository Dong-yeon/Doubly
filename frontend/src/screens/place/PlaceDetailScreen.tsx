/** 장소 상세 — 방문 기록 목록 + 기록 추가 (별점·사진·메모) */
import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { PlaceStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { placeApi } from '../../api/place';
import { pickImage, uploadImage } from '../../utils/imageUpload';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { runBusy } from '../../store/busyStore';
import { haptics } from '../../utils/haptics';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { PlaceVisit } from '../../types';

type Props = NativeStackScreenProps<PlaceStackParamList, 'PlaceDetail'>;

function stars(rating?: number | null): string {
  if (!rating) return '';
  return '★'.repeat(rating) + '☆'.repeat(5 - rating);
}

export function PlaceDetailScreen({ route }: Props) {
  const { placeId } = route.params;
  const [visits, setVisits] = useState<PlaceVisit[]>([]);
  const [loading, setLoading] = useState(false);

  // 방문 기록 입력 폼
  const [formOpen, setFormOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [memo, setMemo] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
      await placeApi.recordVisit(placeId, {
        rating: rating > 0 ? rating : undefined,
        memo: memo.trim() || undefined,
        imageUrl,
      });
      haptics.success();
      toast.success('방문 기록 완료! ');
      setFormOpen(false);
      setRating(0);
      setMemo('');
      setPhotoUri(null);
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
      <FlatList
        data={visits}
        keyExtractor={(v) => String(v.id)}
        contentContainerStyle={styles.list}
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

                <TouchableOpacity style={[styles.photoBox, photoUri ? styles.photoBoxFilled : null]} onPress={onPickPhoto} activeOpacity={0.8}>
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
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.empty}>아직 방문 기록이 없어요. 다녀오셨다면 남겨보세요! (길게 눌러 삭제)</Text>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
    // 사진이 없을 때(안내 문구)만 쓰는 높이 — 사진이 들어오면 photoBoxFilled 가 4:3 으로 키운다
    height: 140,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  /* 사진은 잘리지 않고 크게 — 고정 높이 + cover 조합은 세로 사진을 심하게 잘라냈다 */
  photoBoxFilled: { height: undefined, aspectRatio: 4 / 3 },
  photo: { width: '100%', height: '100%' },
  photoPlaceholder: { color: colors.textSecondary, fontSize: fontSize.body, fontWeight: '600' },
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
  visitStars: { fontSize: fontSize.body, color: colors.accent, fontWeight: '700' },
  visitPhoto: { width: '100%', height: 160, borderRadius: radius.md, marginTop: spacing.sm },
  visitMemo: { fontSize: fontSize.body, color: colors.textPrimary, marginTop: spacing.sm },
  empty: { fontSize: fontSize.caption, color: colors.textSecondary, textAlign: 'center', paddingVertical: spacing.lg },
});
