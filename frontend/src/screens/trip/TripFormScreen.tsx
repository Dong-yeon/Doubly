/** 여행 만들기/수정 — 제목·날짜·메모·커버 사진 */
import React, { useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { PlaceStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { DateField } from '../../components/DateField';
import { tripApi } from '../../api/trip';
import { pickImage, uploadImage } from '../../utils/imageUpload';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { runBusy } from '../../store/busyStore';
import { haptics } from '../../utils/haptics';
import { colors, fontSize, radius, spacing } from '../../constants/theme';

type Props = NativeStackScreenProps<PlaceStackParamList, 'TripForm'>;

export function TripFormScreen({ navigation, route }: Props) {
  const editing = route.params.trip;
  const [title, setTitle] = useState(editing?.title ?? '');
  const [startDate, setStartDate] = useState(editing?.startDate ?? '');
  const [endDate, setEndDate] = useState(editing?.endDate ?? '');
  const [memo, setMemo] = useState(editing?.memo ?? '');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /** 시작일을 종료일 뒤로 옮기면 종료일이 뒤집힌다 — 함께 밀어준다 */
  const onChangeStart = (value: string) => {
    setStartDate(value);
    if (endDate && endDate < value) setEndDate(value);
  };

  const onPickPhoto = async () => {
    try {
      const uri = await pickImage();
      if (uri) setPhotoUri(uri);
    } catch (e) {
      toast.error(getErrorMessage(e, '사진 선택에 실패했어요.'));
    }
  };

  const onSave = async () => {
    if (!title.trim()) {
      toast.error('여행 이름을 입력해주세요.');
      return;
    }
    if (!startDate || !endDate) {
      toast.error('여행 날짜를 선택해주세요.');
      return;
    }
    setSaving(true);
    try {
      let coverImageUrl: string | undefined;
      if (photoUri) {
        coverImageUrl = await runBusy('사진 올리는 중…', () => uploadImage(photoUri));
      }
      const payload = {
        title: title.trim(),
        startDate,
        endDate,
        memo: memo.trim() || undefined,
        coverImageUrl,
      };
      if (editing) {
        await tripApi.update(editing.id, payload);
        toast.success('여행을 수정했어요 ');
      } else {
        await tripApi.save(payload);
        toast.success('여행을 만들었어요 ');
      }
      haptics.success();
      navigation.goBack();
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const coverPreview = photoUri ?? editing?.coverImageUrl ?? null;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.photoBox} onPress={onPickPhoto} activeOpacity={0.8}>
          {coverPreview ? (
            <Image source={{ uri: coverPreview }} style={styles.photo} resizeMode="cover" />
          ) : (
            <Text style={styles.photoPlaceholder}>커버 사진 추가하기 (선택)</Text>
          )}
        </TouchableOpacity>

        <TextField
          label="여행 이름"
          placeholder="예: 제주도 2박 3일 "
          value={title}
          onChangeText={setTitle}
          maxLength={100}
        />
        <View style={styles.dateRow}>
          <View style={styles.flex}>
            <DateField label="시작일" value={startDate} onChange={onChangeStart} max={endDate || undefined} />
          </View>
          <View style={styles.flex}>
            {/* 시작일보다 앞선 날은 아예 못 고르게 한다 */}
            <DateField label="종료일" value={endDate} onChange={setEndDate} min={startDate || undefined} />
          </View>
        </View>
        <TextField
          label="메모 (선택)"
          placeholder="예: 렌터카 예약 완료, 흑돼지 필수!"
          value={memo}
          onChangeText={setMemo}
          multiline
        />

        <Button
          title={editing ? '수정하기' : '여행 만들기'}
          onPress={onSave}
          loading={saving}
          style={styles.saveBtn}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingBottom: spacing.xl },
  photoBox: {
    height: 160,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  photo: { width: '100%', height: '100%' },
  photoPlaceholder: { color: colors.textSecondary, fontSize: fontSize.body, fontWeight: '600' },
  dateRow: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  saveBtn: { marginTop: spacing.md },
});
