/** 일상 남기기 — 사진(선택, 최대 5장) + 글 작성. 글/사진 중 하나는 필수 */
import React, { useRef, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { FormKeyboardView } from '../../components/FormKeyboardView';
import { feedApi } from '../../api/feed';
import { MaterialCommunityIcons } from '../../components/Icon';
import { pickImages, uploadImage } from '../../utils/imageUpload';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { runBusy } from '../../store/busyStore';
import { usePlanStore } from '../../store/planStore';
import { haptics } from '../../utils/haptics';
import { useDirtyGuard } from '../../hooks/useDirtyGuard';
import { useSpacingFix } from '../../hooks/useSpacingFix';
import { SpacingFixBar } from '../../components/SpacingFixBar';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<HomeStackParamList, 'FeedCompose'>;

/** 인스타그램류 앱을 넘길 이유가 없다 — 서버 상한(FeedService.MAX_PHOTOS_PER_POST)과 맞춘다 */
const MAX_PHOTOS = 5;

export function FeedComposeScreen({ navigation }: Props) {
  const [content, setContent] = useState('');
  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  /*
   * 올라간 사진의 URL 캐시(로컬 uri → Cloudinary url). 서명 발급마다 PHOTO_UPLOAD 가 선차감되고
   * 환불이 없어서, 5장 중 3장이 올라간 뒤 실패했을 때 재시도에서 그 3장을 다시 올리면 한도만
   * 두 번 나간다. 화면이 살아 있는 동안 한 번 올라간 사진은 다시 올리지 않는다.
   */
  const uploadedRef = useRef<Map<string, string>>(new Map());

  // 글이나 사진이 있으면 이탈(뒤로가기·스와이프) 전에 확인한다
  const allowLeave = useDirtyGuard(content.trim().length > 0 || photoUris.length > 0);

  /*
   * 띄어쓰기 정리 — 채팅과 달리 여기는 문장을 쓰는 자리라 붙여 쓴 글을 풀어주면 도움이
   * 된다. 자동으로 고치지 않고 눌렀을 때만 바꾼다(되돌리기 제공).
   */
  const spacing_ = useSpacingFix();
  const onFixSpacing = async () => {
    const corrected = await spacing_.fix(content);
    if (corrected === null) {
      toast.info('고칠 띄어쓰기가 없어요.');
      return;
    }
    haptics.light();
    setContent(corrected);
  };
  const onUndoSpacing = () => {
    const before = spacing_.undo();
    if (before !== null) setContent(before);
  };

  const onAddPhotos = async () => {
    const remaining = MAX_PHOTOS - photoUris.length;
    if (remaining <= 0) return;
    try {
      const uris = await pickImages(remaining);
      if (uris.length > 0) setPhotoUris((prev) => [...prev, ...uris]);
    } catch (e) {
      toast.error(getErrorMessage(e, '사진 선택에 실패했어요.'));
    }
  };

  const onRemovePhoto = (index: number) => {
    setPhotoUris((prev) => prev.filter((_, i) => i !== index));
  };

  const onSave = async () => {
    if (!content.trim() && photoUris.length === 0) {
      toast.error('글이나 사진 중 하나는 남겨주세요.');
      return;
    }
    setSaving(true);
    try {
      let imageUrls: string[] | undefined;
      if (photoUris.length > 0) {
        const pending = photoUris.filter((uri) => !uploadedRef.current.has(uri));
        /*
         * 한도 프리체크 — 예전엔 Promise.all 로 동시에 올려서, 잔여 3장인 FREE 사용자가 5장을 고르면
         * 3장 차감 + 2장 402 + 글 없음이 됐다(한도는 환불되지 않는다. 2026-09-08 점검 #4).
         * 잔여치는 표시용이라 최종 판정은 여전히 서버가 하지만, 여기서 걸러지면 한 장도 안 나간다.
         * PRO(무제한)는 remaining 이 null 이라 그대로 지나간다.
         */
        if (pending.length > 0) {
          await usePlanStore.getState().load();
          const remaining = usePlanStore.getState().remainingOf('PHOTO_UPLOAD');
          if (remaining !== null && remaining < pending.length) {
            if (remaining <= 0) {
              usePlanStore.getState().showUpgrade('이번 달 사진 한도를 다 썼어요. PRO에서는 제한 없이 올릴 수 있어요.');
            } else {
              toast.error(`이번 달 사진 한도가 ${remaining}장 남았어요. 사진을 ${remaining}장까지 줄여주세요.`);
            }
            return;
          }
        }
        imageUrls = await runBusy(
          photoUris.length > 1 ? `사진 ${photoUris.length}장 올리는 중…` : '사진 올리는 중…',
          async () => {
            // 순차 업로드 — 한 장이 실패하면 거기서 멈춘다. 올라간 장은 캐시에 남아 재시도 때 건너뛴다.
            const urls: string[] = [];
            for (const uri of photoUris) {
              let url = uploadedRef.current.get(uri);
              if (!url) {
                url = await uploadImage(uri);
                uploadedRef.current.set(uri, url);
              }
              urls.push(url);
            }
            return urls;
          },
        );
      }
      await feedApi.createPost({ content: content.trim() || undefined, imageUrls });
      haptics.success();
      toast.success('일상을 남겼어요 ');
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
      {/* 키보드가 "남기기" 버튼을 가리지 않도록 회피 (스크롤하면 키보드가 내려간다) */}
      <FormKeyboardView contentContainerStyle={styles.container}>
          {photoUris.length === 0 ? (
            <TouchableOpacity
              style={[styles.photoBox, styles.photoBoxEmpty]}
              onPress={onAddPhotos}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="사진 추가하기"
            >
              <Text style={styles.photoPlaceholder}>사진 추가하기 (선택, 최대 {MAX_PHOTOS}장)</Text>
            </TouchableOpacity>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.thumbRow}
              contentContainerStyle={styles.thumbRowContent}
            >
              {photoUris.map((uri, index) => (
                <View key={uri + index} style={styles.thumbBox}>
                  <Image source={{ uri }} style={styles.thumb} resizeMode="cover" />
                  <TouchableOpacity
                    style={styles.thumbRemove}
                    onPress={() => onRemovePhoto(index)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="사진 빼기"
                  >
                    <MaterialCommunityIcons name="close" size={14} color={colors.white} />
                  </TouchableOpacity>
                </View>
              ))}
              {photoUris.length < MAX_PHOTOS ? (
                <TouchableOpacity
                  style={styles.thumbAdd}
                  onPress={onAddPhotos}
                  accessibilityRole="button"
                  accessibilityLabel="사진 추가하기"
                >
                  <MaterialCommunityIcons name="plus" size={22} color={colors.textSecondary} />
                </TouchableOpacity>
              ) : null}
            </ScrollView>
          )}

          <TextField
            label="오늘의 일상"
            placeholder="예: 퇴근하고 같이 한강 러닝 날씨 최고!"
            value={content}
            onChangeText={(next) => {
              // 사용자가 다시 손대면 되돌리기는 의미가 없어진다
              spacing_.clearUndo();
              setContent(next);
            }}
            multiline
          />

          {content.trim().length > 0 ? (
            <SpacingFixBar
              busy={spacing_.busy}
              canUndo={spacing_.canUndo}
              onFix={onFixSpacing}
              onUndo={onUndoSpacing}
            />
          ) : null}

          <Button title="남기기" onPress={onSave} loading={saving} style={styles.saveBtn} />
      </FormKeyboardView>
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  container: { padding: spacing.lg, paddingBottom: spacing.xl },
  photoBox: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  photoBoxEmpty: { width: '100%', aspectRatio: 3 / 2 },
  photoPlaceholder: { color: colors.textSecondary, fontSize: fontSize.body, fontWeight: '600' },

  // 사진이 하나라도 있으면 큰 박스 대신 가로 스크롤 썸네일 줄로 바뀐다
  thumbRow: { marginBottom: spacing.sm },
  thumbRowContent: { gap: spacing.sm },
  thumbBox: {
    width: 88,
    height: 88,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  thumb: { width: '100%', height: '100%' },
  thumbRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbAdd: {
    width: 88,
    height: 88,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },

  saveBtn: { marginTop: spacing.md },
}));
