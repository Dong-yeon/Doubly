/** 콘텐츠 추가 — 제목 직접 입력 + 종류(영화/공연/드라마)·상태(보고싶어요/봤어요) 선택 */
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Alert } from '../../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { PlaceStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { FormKeyboardView } from '../../components/FormKeyboardView';
import { Chip } from '../../components/Chip';
import { contentApi } from '../../api/content';
import { useContentStore } from '../../store/contentStore';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { useDirtyGuard } from '../../hooks/useDirtyGuard';
import { fontSize, spacing } from '../../constants/theme';
import { CONTENT_TYPES } from '../../constants/contentTypes';
import type { ContentStatus, ContentType } from '../../types';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<PlaceStackParamList, 'ContentAdd'>;

const STATUS_OPTIONS: { value: ContentStatus; label: string }[] = [
  { value: 'WISHLIST', label: '보고 싶어요' },
  { value: 'DONE', label: '봤어요' },
];

export function ContentAddScreen({ navigation, route }: Props) {
  // 기존 콘텐츠를 들고 들어오면 수정 모드 — 필드를 채워두고 저장 시 update 를 호출한다
  const editingContent = route.params?.content;
  const isEdit = editingContent != null;

  const [title, setTitle] = useState(editingContent?.title ?? '');
  const [type, setType] = useState<ContentType>(editingContent?.type ?? 'MOVIE');
  const [status, setStatus] = useState<ContentStatus>(editingContent?.status ?? 'WISHLIST');
  const [saving, setSaving] = useState(false);

  const dirty = isEdit
    ? title.trim() !== (editingContent?.title ?? '') ||
      type !== (editingContent?.type ?? 'MOVIE') ||
      status !== (editingContent?.status ?? 'WISHLIST')
    : title.trim().length > 0;
  const allowLeave = useDirtyGuard(dirty);

  const onSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const payload = { title: title.trim(), type, status };
      if (editingContent) {
        await contentApi.update(editingContent.id, payload);
        haptics.success();
        toast.success('콘텐츠를 수정했어요 ');
      } else {
        await contentApi.save(payload);
        haptics.success();
        toast.success('콘텐츠를 추가했어요 ');
      }
      allowLeave();
      useContentStore.getState().invalidate();
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
        <TextField
          label="제목"
          placeholder="예: 아바타"
          value={title}
          onChangeText={setTitle}
          maxLength={100}
        />

        <Text style={styles.label}>종류</Text>
        <View style={styles.chipRow}>
          {CONTENT_TYPES.map((t) => (
            <Chip key={t.value} label={t.label} selected={type === t.value} onPress={() => setType(t.value)} fill />
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
          disabled={!title.trim()}
          style={styles.submit}
        />
      </FormKeyboardView>
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingBottom: spacing.xl },
  label: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    fontWeight: '700',
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  submit: { marginTop: spacing.lg },
}));
