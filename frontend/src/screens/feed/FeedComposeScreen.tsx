/** 일상 남기기 — 사진(선택) + 글 작성. 글/사진 중 하나는 필수 */
import React, { useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { feedApi } from '../../api/feed';
import { pickImage, uploadImage } from '../../utils/imageUpload';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { colors, fontSize, radius, spacing } from '../../constants/theme';

type Props = NativeStackScreenProps<HomeStackParamList, 'FeedCompose'>;

export function FeedComposeScreen({ navigation }: Props) {
  const [content, setContent] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const onPickPhoto = async () => {
    try {
      const uri = await pickImage();
      if (uri) setPhotoUri(uri);
    } catch (e) {
      toast.error(getErrorMessage(e, '사진 선택에 실패했어요.'));
    }
  };

  const onSave = async () => {
    if (!content.trim() && !photoUri) {
      toast.error('글이나 사진 중 하나는 남겨주세요.');
      return;
    }
    setSaving(true);
    try {
      let imageUrl: string | undefined;
      if (photoUri) {
        imageUrl = await uploadImage(photoUri);
      }
      await feedApi.createPost({ content: content.trim() || undefined, imageUrl });
      haptics.success();
      toast.success('일상을 남겼어요 ');
      navigation.goBack();
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.photoBox} onPress={onPickPhoto} activeOpacity={0.8}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />
          ) : (
            <Text style={styles.photoPlaceholder}>사진 추가하기 (선택)</Text>
          )}
        </TouchableOpacity>
        {photoUri ? (
          <TouchableOpacity onPress={() => setPhotoUri(null)}>
            <Text style={styles.removePhoto}>사진 지우기</Text>
          </TouchableOpacity>
        ) : null}

        <TextField
          label="오늘의 일상"
          placeholder="예: 퇴근하고 같이 한강 러닝 날씨 최고!"
          value={content}
          onChangeText={setContent}
          multiline
        />

        <Button title="남기기" onPress={onSave} loading={saving} style={styles.saveBtn} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingBottom: spacing.xl },
  photoBox: {
    height: 220,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  photo: { width: '100%', height: '100%' },
  photoPlaceholder: { color: colors.textSecondary, fontSize: fontSize.body, fontWeight: '600' },
  removePhoto: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    textAlign: 'right',
    marginBottom: spacing.sm,
    textDecorationLine: 'underline',
  },
  saveBtn: { marginTop: spacing.md },
});
