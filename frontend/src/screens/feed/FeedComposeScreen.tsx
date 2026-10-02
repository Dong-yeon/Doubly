/** 일상 남기기 — 사진(선택, 최대 5장) + 글 작성. 글/사진 중 하나는 필수 */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AlbumStackParamList, HomeStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { DateField } from '../../components/DateField';
import { todayKst } from '../../utils/date';
import { FormKeyboardView } from '../../components/FormKeyboardView';
import { feedApi } from '../../api/feed';
import { MaterialCommunityIcons } from '../../components/Icon';
import { pickImages, uploadImage } from '../../utils/imageUpload';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { runBusy } from '../../store/busyStore';
import { usePlanStore } from '../../store/planStore';
import { useAuthStore } from '../../store/authStore';
import { useRelationStore } from '../../store/relationStore';
import { clearWritingDraft, draftKeys, loadWritingDraft, saveWritingDraft } from '../../utils/writingDraft';
import { haptics } from '../../utils/haptics';
import { useDirtyGuard } from '../../hooks/useDirtyGuard';
import { useSpacingFix } from '../../hooks/useSpacingFix';
import { SpacingFixBar } from '../../components/SpacingFixBar';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';

/*
 * 홈 스택과 "우리" 탭 스택 <b>양쪽에</b> 등록되는 화면이라 어느 쪽으로 열릴지 모른다
 * (navigation/types.ts AlbumStackParamList 주석). 두 파람리스트를 합쳐 두면 어느 쪽에서
 * 열려도 같은 타입으로 동작한다 — 경로 문자열만 블록마다 다르다.
 */
type Props = NativeStackScreenProps<HomeStackParamList & AlbumStackParamList, 'FeedCompose'>;

/** 인스타그램류 앱을 넘길 이유가 없다 — 서버 상한(FeedService.MAX_PHOTOS_PER_POST)과 맞춘다 */
const MAX_PHOTOS = 5;
/** 서버 상한(CreatePostRequest.content @Size(max = 2000))과 맞춘다 */
const MAX_CONTENT = 2000;

/** 이미 올라가 있는 사진(서버 URL) — 고치기에서 그대로 둔 사진은 다시 올리지 않는다 */
const isRemote = (uri: string) => /^https?:\/\//.test(uri);

export function FeedComposeScreen({ navigation, route }: Props) {
  /*
   * 고치기 — postId 가 있으면 그 포스트를 서버에서 읽어 채운다. 본문을 파라미터로 받지 않는 이유는
   * navigation/types 주석. 고치기는 초안을 남기지 않는다(원본이 서버에 있다).
   */
  const editingId = route.params?.postId;
  const partnerName = useRelationStore((s) => s.couple?.partner?.name) ?? '상대';
  const editing = editingId != null;
  const [original, setOriginal] = useState<{ content: string; photos: string[]; recordDate: string } | null>(null);
  const [content, setContent] = useState('');
  /*
   * 기록일 — 이 일이 있었던 날(V119). 어젯밤 일을 오늘 아침 올려도 어제 기록이 되어야 사진첩·작년 오늘이
   * 식단·운동·방문과 같은 날에 묶인다. 기본은 오늘(KST), 미래는 고를 수 없다(서버도 거절).
   */
  const [recordDate, setRecordDate] = useState(() => todayKst());
  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  /*
   * 중복 제출 가드 — saving 은 state 라 다음 렌더 전까지는 false 로 읽힌다. 그 사이 두 번 누르면
   * 포스트가 두 개 생기고 상대에게 푸시도 두 번 간다(서버엔 멱등키가 없다). ref 는 즉시 바뀐다.
   */
  const savingRef = useRef(false);
  /*
   * 올라간 사진의 URL 캐시(로컬 uri → Cloudinary url). 서명 발급마다 PHOTO_UPLOAD 가 선차감되고
   * 환불이 없어서, 5장 중 3장이 올라간 뒤 실패했을 때 재시도에서 그 3장을 다시 올리면 한도만
   * 두 번 나간다. 화면이 살아 있는 동안 한 번 올라간 사진은 다시 올리지 않는다.
   */
  const uploadedRef = useRef<Map<string, string>>(new Map());

  useLayoutEffect(() => {
    if (editing) navigation.setOptions({ title: '일상 고치기' });
  }, [navigation, editing]);
  useEffect(() => {
    if (editingId == null) return undefined;
    let active = true;
    feedApi
      .getPost(editingId)
      .then((post) => {
        if (!active) return;
        const photos =
          post.imageUrls && post.imageUrls.length > 0 ? post.imageUrls : post.imageUrl ? [post.imageUrl] : [];
        const loaded = { content: post.content ?? '', photos, recordDate: post.recordDate ?? todayKst() };
        setOriginal(loaded);
        setContent(loaded.content);
        setPhotoUris(loaded.photos);
        setRecordDate(loaded.recordDate);
      })
      .catch((e) => {
        if (!active) return;
        toast.error(getErrorMessage(e, '일상을 불러오지 못했어요.'));
        navigation.goBack();
      });
    return () => {
      active = false;
    };
  }, [editingId, navigation]);

  // 글이나 사진이 있으면 이탈(뒤로가기·스와이프) 전에 확인한다. 고치기는 원본과 달라졌을 때만
  const dirty = editing
    ? original !== null &&
      (content.trim() !== original.content.trim() ||
        recordDate !== original.recordDate ||
        photoUris.join('\n') !== original.photos.join('\n'))
    : content.trim().length > 0 || photoUris.length > 0;
  const allowLeave = useDirtyGuard(dirty);

  /*
   * 초안 보존(utils/writingDraft) — 앱이 꺼지거나 웹을 새로고침해도 쓰던 글이 남는다. 사진은 남기지 않는다.
   * 불러오기가 끝나기 전에는 저장하지 않는다 — 빈 글로 남아 있던 초안을 덮어쓰지 않으려고.
   */
  const userId = useAuthStore((s) => s.user?.id);
  const [draftLoaded, setDraftLoaded] = useState(false);
  useEffect(() => {
    if (editing) return undefined;
    let active = true;
    loadWritingDraft(draftKeys.feedCompose, userId).then((draft) => {
      if (!active) return;
      if (draft?.text) {
        // 그사이 이미 쓰기 시작했으면 그 글이 우선이다
        setContent((current) => (current ? current : draft.text));
        toast.info('쓰던 글을 불러왔어요');
      }
      setDraftLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [userId, editing]);
  useEffect(() => {
    if (!draftLoaded || userId == null) return undefined;
    const timer = setTimeout(() => {
      if (content.trim()) void saveWritingDraft(draftKeys.feedCompose, { userId, text: content });
      else void clearWritingDraft(draftKeys.feedCompose);
    }, 400);
    return () => clearTimeout(timer);
  }, [content, draftLoaded, userId]);
  // 화면을 정상적으로 벗어나면(남겼거나, 이탈 확인에서 "닫기") 초안을 지운다. 강제 종료는 여기를 지나지 않는다.
  // 고치기 화면은 새 글 초안을 건드리지 않는다 — 쓰다 만 새 글이 있을 수 있다
  useEffect(
    () => () => {
      if (!editing) void clearWritingDraft(draftKeys.feedCompose);
    },
    [editing],
  );

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
    if (savingRef.current) return;
    if (!content.trim() && photoUris.length === 0) {
      toast.error('글이나 사진 중 하나는 남겨주세요.');
      return;
    }
    /*
     * 글 길이는 사진을 올리기 <b>전에</b> 본다 — 서버의 400 은 업로드가 끝난 뒤에야 오는데,
     * 그때는 PHOTO_UPLOAD 가 이미 장당 차감돼 있다(환불 없음). maxLength 가 입력은 막지만
     * 띄어쓰기 정리처럼 코드가 넣은 값은 그 제한을 지나므로 여기서 한 번 더 본다.
     */
    if (content.trim().length > MAX_CONTENT) {
      toast.error(`글은 ${MAX_CONTENT}자 이내로 써주세요. 지금 ${content.trim().length}자예요.`);
      return;
    }
    if (editing && original === null) return; // 아직 원본을 못 읽었다
    savingRef.current = true;
    setSaving(true);
    try {
      let imageUrls: string[] | undefined;
      if (photoUris.length > 0) {
        // 한도는 새로 올릴 사진만 센다 — 고치기에서 그대로 둔 사진(서버 URL)은 이미 올라가 있다
        const pending = photoUris.filter((uri) => !isRemote(uri) && !uploadedRef.current.has(uri));
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
              /*
               * "둘이 함께 쓰는"을 붙인다 — 한도는 커플 한 주머니라(PlanGuard.scopeOf) 내가
               * 한 장도 안 올렸는데 0이 될 수 있다. 이유를 안 적으면 고장으로 읽힌다.
               */
              usePlanStore.getState().showUpgrade('이번 달 사진 한도를 다 썼어요. 둘이 함께 쓰는 한도예요. PRO에서는 넉넉하게 올릴 수 있어요.');
            } else {
              toast.error(`이번 달 사진 한도가 ${remaining}장 남았어요(둘이 함께 쓰는 한도). 사진을 ${remaining}장까지 줄여주세요.`);
            }
            return;
          }
        }
        imageUrls = await runBusy(
          pending.length > 1 ? `사진 ${pending.length}장 올리는 중…` : '사진 올리는 중…',
          async () => {
            // 순차 업로드 — 한 장이 실패하면 거기서 멈춘다. 올라간 장은 캐시에 남아 재시도 때 건너뛴다.
            const urls: string[] = [];
            for (const uri of photoUris) {
              if (isRemote(uri)) {
                urls.push(uri);
                continue;
              }
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
      if (editingId != null) {
        await feedApi.updatePost(editingId, {
          content: content.trim() || undefined,
          imageUrls: imageUrls ?? [],
          recordDate,
        });
        haptics.success();
        toast.success('일상을 고쳤어요');
      } else {
        await feedApi.createPost({ content: content.trim() || undefined, imageUrls, recordDate });
        void clearWritingDraft(draftKeys.feedCompose);
        haptics.success();
        toast.success('일상을 남겼어요 ');
      }
      allowLeave();
      navigation.goBack();
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* 키보드가 "남기기" 버튼을 가리지 않도록 회피 (스크롤하면 키보드가 내려간다) */}
      <FormKeyboardView contentContainerStyle={styles.container}>
          {/*
            공개 범위 — 누가 보는지를 쓰기 전에 말한다. 하루 기록의 "나만 보여요" 줄과 같은 모양이라 두 기능이
            나란히 읽힌다(docs/daily-mood-current-state.md §6). 푸시는 간격 제한이 있어(무드) 약속하지 않고
            "보인다"까지만 말한다.
          */}
          <View style={styles.scopeRow}>
            <MaterialCommunityIcons name="account-group-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.scopeText}>
              {editing
                ? `고친 내용도 ${partnerName}님에게 바로 보여요`
                : `${partnerName}님에게 바로 보여요 · 우리 기록과 사진첩에 남아요`}
            </Text>
          </View>
          {photoUris.length === 0 ? (
            <TouchableOpacity
              style={[styles.photoBox, styles.photoBoxEmpty]}
              onPress={onAddPhotos}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="사진 추가하기"
            >
              {/* 점선 타일 + 아이콘 — 문장 대신 형태로 말한다 (docs/SCREEN_DESIGN_PASS_2026-09-23.md §4-3) */}
              <MaterialCommunityIcons name="image-plus" size={32} color={colors.textSecondary} />
              <Text style={styles.photoPlaceholder}>사진 추가</Text>
              <Text style={styles.photoHint}>최대 {MAX_PHOTOS}장</Text>
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

          <DateField
            label="언제의 일상인가요"
            value={recordDate}
            onChange={setRecordDate}
            max={todayKst()}
            pickerTitle="언제 있었던 일인가요?"
          />

          <TextField
            label={recordDate === todayKst() ? '오늘의 일상' : '그날의 일상'}
            placeholder="무슨 일이 있었나요?"
            value={content}
            onChangeText={(next) => {
              // 사용자가 다시 손대면 되돌리기는 의미가 없어진다
              spacing_.clearUndo();
              setContent(next);
            }}
            multiline
            maxLength={MAX_CONTENT}
          />
          {content.length > MAX_CONTENT - 200 ? (
            <Text style={styles.counter}>
              {content.length} / {MAX_CONTENT}
            </Text>
          ) : null}

          {content.trim().length > 0 ? (
            <SpacingFixBar
              busy={spacing_.busy}
              canUndo={spacing_.canUndo}
              onFix={onFixSpacing}
              onUndo={onUndoSpacing}
            />
          ) : null}

          <Button
            title={editing ? '고치기' : '남기기'}
            onPress={onSave}
            loading={saving}
            disabled={editing && original === null}
            style={styles.saveBtn}
          />
      </FormKeyboardView>
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  container: { padding: spacing.lg, paddingBottom: spacing.xl },
  // 공개 범위 줄 — JournalDayScreen.privateRow 와 같은 모양(자물쇠 대신 사람 아이콘)
  scopeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  scopeText: { flex: 1, color: colors.textSecondary, fontSize: fontSize.caption },
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
  // 빈 사진 자리 — 점선 테두리(추가할 수 있는 자리라는 관용 형태), 높이는 3:2 에서 줄여 글 입력을 위로
  photoBoxEmpty: { width: '100%', aspectRatio: 2 / 1, borderStyle: 'dashed', borderColor: colors.borderStrong, gap: spacing.xxs },
  photoPlaceholder: { color: colors.textSecondary, fontSize: fontSize.body, fontWeight: '600', marginTop: spacing.xs },
  photoHint: { color: colors.textMuted, fontSize: fontSize.caption },
  counter: { alignSelf: 'flex-end', color: colors.textTertiary, fontSize: fontSize.caption, marginTop: -spacing.xs },

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
