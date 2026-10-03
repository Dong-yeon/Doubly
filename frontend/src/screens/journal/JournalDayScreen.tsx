/**
 * 그날 페이지 — 나만의 하루 기록 쓰기·고치기·지우기. 기분 + 몇 줄 + 사진 한 장.
 *
 * <p>하루에 하나라 따로 "수정 화면"이 없다 — 이 화면이 보기이자 쓰기다. 지난 날짜도 쓸 수 있다
 * (어제 못 쓴 걸 오늘 쓰는 게 일기의 기본 동작이다). 서버가 미래 날짜만 거절한다.
 * docs/PERSONAL_JOURNAL_ANALYSIS_2026-10-02.md §4-3.
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { FormKeyboardView } from '../../components/FormKeyboardView';
import { SpacingFixBar } from '../../components/SpacingFixBar';
import { MaterialCommunityIcons } from '../../components/Icon';
import { Sheet } from '../../components/Sheet';
import { journalApi, journalToday, type JournalEntry } from '../../api/journal';
import { takeJournalDraft } from '../../store/journalDraft';
import { useAuthStore } from '../../store/authStore';
import { useRelationStore } from '../../store/relationStore';
import { clearWritingDraft, draftKeys, loadWritingDraft, saveWritingDraft } from '../../utils/writingDraft';
import { MOOD_EMOJIS } from '../../constants/moodEmojis';
import { pickImage, uploadImageWithSignature } from '../../utils/imageUpload';
import { useDirtyGuard } from '../../hooks/useDirtyGuard';
import { useSpacingFix } from '../../hooks/useSpacingFix';
import { getErrorMessage } from '../../utils/error';
import { Alert } from '../../utils/alert';
import { toast } from '../../store/toastStore';
import { runBusy } from '../../store/busyStore';
import { haptics } from '../../utils/haptics';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<HomeStackParamList, 'JournalDay'>;

/** 서버 상한(SaveJournalRequest.body)과 맞춘다 */
const MAX_BODY = 2000;
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

/** '2026-10-02' → '10월 2일 (금)' */
export function journalDateTitle(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const weekday = DAY_NAMES[new Date(y, m - 1, d).getDay()];
  return `${m}월 ${d}일 (${weekday})`;
}

export function JournalDayScreen({ navigation, route }: Props) {
  const { date, source } = route.params;
  const isToday = date === journalToday();
  // 무드 시트 "더 쓰기"의 초안 — 첫 렌더에 한 번만 꺼낸다(URL 에 싣지 않으려고 메모리로 받는다)
  const [draft] = useState(() => takeJournalDraft(date));

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [mood, setMood] = useState<string | null>(draft?.mood ?? null);
  const [body, setBody] = useState(draft?.body ?? '');
  /** 지금 화면에 보이는 사진 — 서버 URL 이거나, 아직 안 올린 기기 안 uri */
  const [photo, setPhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /*
   * 올라간 사진 캐시(기기 uri → Cloudinary url). 서명마다 하루 한도(JOURNAL_PHOTO 3)가 선차감되고
   * 환불이 없어서, 저장이 실패한 뒤 다시 누를 때 같은 사진을 또 올리면 한도만 나간다.
   */
  const uploadedRef = useRef<Map<string, string>>(new Map());

  useLayoutEffect(() => {
    navigation.setOptions({ title: journalDateTitle(date) });
  }, [navigation, date]);

  /*
   * 초안 보존(utils/writingDraft) — 앱이 꺼지거나 새로고침돼도 쓰던 글·기분이 남는다(사진은 남기지 않는다).
   * 서버 기록을 받은 뒤에만 되살리고, 쓰기 시작할 때의 서버 버전(base)과 지금 버전이 같을 때만 덮는다 —
   * 그사이 다른 기기에서 고쳤다면 초안을 버린다(그쪽 글을 지우지 않는다). 시각을 비교하지 않는 이유:
   * 서버 시각은 시간대 없는 벽시계라 기기 시각과 앞뒤를 잴 수 없다. 같은 문자열인지만 본다.
   * 무드 시트에서 막 넘어온 메모리 초안이 있으면 그게 더 새것이라 저장된 초안은 보지 않는다.
   */
  const userId = useAuthStore((s) => s.user?.id);
  const draftKey = draftKeys.journal(date);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const versionOf = (e: JournalEntry | null) => (e ? (e.updatedAt ?? e.createdAt) : null);

  const [reloadKey, setReloadKey] = useState(0);
  const retry = () => {
    setLoading(true);
    setLoadError(false);
    setReloadKey((k) => k + 1);
  };
  useEffect(() => {
    let active = true;
    journalApi
      .day(date)
      .then((found) => {
        if (!active) return;
        setEntry(found);
        if (found) {
          // 저장된 기록이 있으면 그게 기준이다. 무드 시트의 초안은 기록이 없을 때만 넘어온다.
          setMood(found.moodEmoji ?? null);
          setBody(found.body ?? '');
          setPhoto(found.photoUrl ?? null);
        }
        if (draft) {
          setDraftLoaded(true);
          return;
        }
        loadWritingDraft(draftKey, userId).then((saved) => {
          if (!active) return;
          if (saved && (saved.base ?? null) === versionOf(found)) {
            setMood(saved.mood ?? null);
            setBody(saved.text);
            toast.info('쓰던 글을 불러왔어요');
          } else if (saved) {
            void clearWritingDraft(draftKey);
          }
          setDraftLoaded(true);
        });
      })
      .catch(() => {
        if (active) setLoadError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // draft 는 첫 렌더에 한 번 꺼낸 값이고 userId 는 이 화면이 사는 동안 바뀌지 않는다 — 다시 불러올 일은 없다
  }, [date, reloadKey, draft, draftKey, userId]);

  const dirty =
    (mood ?? null) !== (entry?.moodEmoji ?? null) ||
    body.trim() !== (entry?.body ?? '').trim() ||
    (photo ?? null) !== (entry?.photoUrl ?? null);
  const allowLeave = useDirtyGuard(!loading && dirty);

  useEffect(() => {
    if (loading || !draftLoaded || userId == null) return undefined;
    const timer = setTimeout(() => {
      // 사진만 바뀐 경우는 남길 게 없다(사진은 초안에 넣지 않는다)
      const changedText = (mood ?? null) !== (entry?.moodEmoji ?? null) || body.trim() !== (entry?.body ?? '').trim();
      if (changedText) void saveWritingDraft(draftKey, { userId, text: body, mood, base: versionOf(entry) });
      else void clearWritingDraft(draftKey);
    }, 400);
    return () => clearTimeout(timer);
  }, [mood, body, entry, loading, draftLoaded, userId, draftKey]);
  // 정상적으로 벗어나면(저장·삭제·이탈 확인 "닫기") 지운다. 강제 종료는 여기를 지나지 않는다
  useEffect(() => () => void clearWritingDraft(draftKey), [draftKey]);

  const spacing_ = useSpacingFix();
  const onFixSpacing = async () => {
    const corrected = await spacing_.fix(body);
    if (corrected === null) {
      toast.info('고칠 띄어쓰기가 없어요.');
      return;
    }
    haptics.light();
    setBody(corrected);
  };
  const onUndoSpacing = () => {
    const before = spacing_.undo();
    if (before !== null) setBody(before);
  };

  const onPickPhoto = async () => {
    try {
      const uri = await pickImage();
      if (uri) setPhoto(uri);
    } catch (e) {
      toast.error(getErrorMessage(e, '사진을 고르지 못했어요.'));
    }
  };

  /** 아직 안 올린 기기 사진이면 올리고 URL 을 돌려준다 */
  const resolvePhotoUrl = async (): Promise<string | null> => {
    if (!photo || photo === entry?.photoUrl || /^https?:\/\//.test(photo)) return photo;
    const cached = uploadedRef.current.get(photo);
    if (cached) return cached;
    const url = await runBusy('사진 올리는 중…', async () =>
      uploadImageWithSignature(photo, await journalApi.photoSignature()),
    );
    uploadedRef.current.set(photo, url);
    return url;
  };

  const onSave = async () => {
    if (!mood && !body.trim() && !photo) {
      toast.error('기분이나 한 줄 중 하나는 남겨 주세요.');
      return;
    }
    setSaving(true);
    try {
      const photoUrl = await resolvePhotoUrl();
      const saved = await journalApi.save(date, {
        moodEmoji: mood,
        body: body.trim() || null,
        photoUrl,
        source: source ?? 'JOURNAL_LIST',
      });
      setEntry(saved);
      void clearWritingDraft(draftKey);
      haptics.success();
      toast.success('나만의 기록에 남겼어요');
      allowLeave();
      navigation.goBack();
    } catch (e) {
      Alert.alert('저장하지 못했어요', getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  /*
   * 우리 기록에 공유(1차-b) — 하루 기록이 상대에게 닿는 유일한 출구다. 서버가 사진을 복사해 독립된 일상 글을
   * 만든다: 이 기록을 고쳐도 그 글은 그대로고, 기분은 함께 가지 않는다(무드는 이미 상대에게 보이는 별도 채널).
   * 본문은 공유본에서만 다듬을 수 있다. 저장하지 않은 고침이 있으면 버튼을 숨긴다 — 공유되는 건 저장된 기록이다.
   */
  const partnerName = useRelationStore((s) => s.couple?.partner?.name);
  const connected = !!partnerName;
  const [shareOpen, setShareOpen] = useState(false);
  const [shareText, setShareText] = useState('');
  const [sharing, setSharing] = useState(false);
  const openShare = () => {
    setShareText(entry?.body ?? '');
    setShareOpen(true);
  };
  const canShare = shareText.trim().length > 0 || !!entry?.photoUrl;
  const onShare = async () => {
    if (sharing || !canShare) return;
    setSharing(true);
    try {
      const updated = await journalApi.share(date, shareText.trim() || undefined);
      setEntry(updated);
      setShareOpen(false);
      haptics.success();
      toast.success('우리 기록에 공유했어요');
    } catch (e) {
      toast.error(getErrorMessage(e, '공유하지 못했어요.'));
    } finally {
      setSharing(false);
    }
  };

  const onDelete = () => {
    Alert.alert(
      '이 날 기록을 지울까요?',
      entry?.sharedPostId
        ? '지운 기록은 되돌릴 수 없어요. 우리 기록에 공유한 글은 그대로 남아요.'
        : '지운 기록은 되돌릴 수 없어요.',
      [
      { text: '취소', style: 'cancel' },
      {
        text: '지우기',
        style: 'destructive',
        onPress: () => {
          journalApi
            .remove(date)
            .then(() => {
              void clearWritingDraft(draftKey);
              toast.success('기록을 지웠어요');
              allowLeave();
              navigation.goBack();
            })
            .catch((e) => toast.error(getErrorMessage(e, '기록을 지우지 못했어요.')));
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]} edges={['bottom']}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (loadError) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]} edges={['bottom']}>
        <Text style={styles.errorText}>기록을 불러오지 못했어요.</Text>
        <Button title="다시 시도" variant="secondary" size="md" onPress={retry} />
      </SafeAreaView>
    );
  }

  // 지금 고른 무드가 기본 12종이 아니면(PRO 무드·우리 이모지의 감정 대역) 맨 앞에 그대로 보여 준다
  const moodChoices = mood && !MOOD_EMOJIS.some((m) => m.emoji === mood)
    ? [{ emoji: mood, label: '고른 기분' }, ...MOOD_EMOJIS]
    : MOOD_EMOJIS;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FormKeyboardView contentContainerStyle={styles.container}>
        <View style={styles.privateRow}>
          <MaterialCommunityIcons name="lock-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.privateText}>나만 보여요 · 상대에게도, 우리 기록에도 나가지 않아요</Text>
        </View>

        <Text style={styles.sectionLabel}>{isToday ? '오늘 기분' : '그날 기분'}</Text>
        <View style={styles.moodRow}>
          {moodChoices.map((m) => {
            const selected = mood === m.emoji;
            return (
              <Pressable
                key={m.emoji}
                onPress={() => setMood(selected ? null : m.emoji)}
                style={({ pressed }) => [styles.moodChip, selected && styles.moodChipOn, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`${m.label}${selected ? ', 고름 — 다시 누르면 빼기' : ''}`}
                accessibilityState={{ selected }}
              >
                <Text style={styles.moodEmoji}>{m.emoji}</Text>
              </Pressable>
            );
          })}
        </View>

        <TextField
          label={isToday ? '나에게 쓰는 오늘' : '나에게 쓰는 그날'}
          placeholder={isToday ? '오늘 어땠어요? 한 줄이어도 좋아요.' : '그날 어땠어요? 한 줄이어도 좋아요.'}
          value={body}
          onChangeText={(next) => {
            spacing_.clearUndo();
            setBody(next);
          }}
          multiline
          maxLength={MAX_BODY}
          style={styles.bodyInput}
        />
        {body.length > MAX_BODY - 200 ? (
          <Text style={styles.counter}>
            {body.length} / {MAX_BODY}
          </Text>
        ) : null}
        {body.trim().length > 0 ? (
          <SpacingFixBar
            busy={spacing_.busy}
            canUndo={spacing_.canUndo}
            onFix={onFixSpacing}
            onUndo={onUndoSpacing}
          />
        ) : null}

        {photo ? (
          <View style={styles.photoBox}>
            <Image source={{ uri: photo }} style={styles.photo} resizeMode="cover" />
            <TouchableOpacity
              style={styles.photoRemove}
              onPress={() => setPhoto(null)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="사진 빼기"
            >
              <MaterialCommunityIcons name="close" size={16} color={colors.white} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.photoEmpty}
            onPress={onPickPhoto}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="사진 한 장 붙이기"
          >
            <MaterialCommunityIcons name="image-plus" size={24} color={colors.textSecondary} />
            <Text style={styles.photoEmptyText}>사진 한 장 (선택)</Text>
          </TouchableOpacity>
        )}

        <Button title="남기기" onPress={onSave} loading={saving} style={styles.saveBtn} />

        {entry && connected && !dirty ? (
          entry.sharedPostId ? (
            <View style={styles.sharedRow}>
              <MaterialCommunityIcons name="account-group-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.sharedText}>우리 기록에 공유한 날이에요</Text>
              <Pressable
                onPress={() => navigation.navigate('FeedCompose', { postId: entry.sharedPostId ?? undefined })}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="공유한 글 고치기"
              >
                <Text style={styles.sharedLink}>공유한 글 고치기</Text>
              </Pressable>
            </View>
          ) : (
            <Button
              title="우리 기록에 공유하기"
              variant="secondary"
              onPress={openShare}
              style={styles.shareBtn}
            />
          )
        ) : null}

        {/* 삭제는 길게 누르기가 아니라 보이는 자리에 — 발견할 수 없는 삭제는 없는 것과 같다(럽바디 리뷰 A-8) */}
        {entry ? (
          <TouchableOpacity
            onPress={onDelete}
            style={styles.deleteBtn}
            accessibilityRole="button"
            accessibilityLabel="이 날 기록 지우기"
          >
            <MaterialCommunityIcons name="delete-outline" size={18} color={colors.danger} />
            <Text style={styles.deleteText}>이 날 기록 지우기</Text>
          </TouchableOpacity>
        ) : null}
      </FormKeyboardView>

      <Sheet visible={shareOpen} onClose={() => !sharing && setShareOpen(false)} position="bottom">
        <Text style={styles.sheetTitle}>우리 기록에 공유</Text>
        <Text style={styles.sheetNote}>
          {`${partnerName ?? '상대'}님에게 알림이 가고 우리 기록·사진첩에 남아요.\n이 기록을 나중에 고쳐도 공유한 글은 바뀌지 않아요. 기분은 함께 가지 않아요.`}
        </Text>
        {entry?.photoUrl ? <Image source={{ uri: entry.photoUrl }} style={styles.sheetPhoto} resizeMode="cover" /> : null}
        <TextInput
          style={styles.sheetInput}
          value={shareText}
          onChangeText={setShareText}
          placeholder="함께 보여 줄 글 (원본은 그대로예요)"
          placeholderTextColor={colors.textTertiary}
          maxLength={MAX_BODY}
          multiline
          accessibilityLabel="공유할 글 — 원본 기록은 바뀌지 않아요"
        />
        {!canShare ? <Text style={styles.sheetHint}>글이나 사진이 있어야 공유할 수 있어요.</Text> : null}
        <View style={styles.sheetButtons}>
          <Button title="취소" variant="ghost" size="md" onPress={() => setShareOpen(false)} disabled={sharing} />
          <Button title="공유하기" size="md" onPress={onShare} loading={sharing} disabled={!canShare} />
        </View>
      </Sheet>
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg },
  errorText: { color: colors.textSecondary, fontSize: fontSize.body },
  container: { padding: spacing.lg, paddingBottom: spacing.xl },
  privateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.lg,
  },
  privateText: { flex: 1, color: colors.textSecondary, fontSize: fontSize.caption },
  shareBtn: { marginTop: spacing.sm },
  sharedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  sharedText: { flex: 1, color: colors.textSecondary, fontSize: fontSize.caption },
  sharedLink: { color: colors.primary, fontSize: fontSize.caption, fontWeight: '700' },
  sheetTitle: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  sheetNote: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.md, lineHeight: 18 },
  sheetPhoto: { width: '100%', height: 160, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, marginBottom: spacing.sm },
  sheetInput: {
    minHeight: 96,
    maxHeight: 200,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    padding: spacing.md,
    fontSize: fontSize.body,
    color: colors.textPrimary,
    textAlignVertical: 'top',
  },
  sheetHint: { fontSize: fontSize.caption, color: colors.danger, marginTop: spacing.xs },
  sheetButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.md },
  sectionLabel: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.xs },
  moodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.lg },
  moodChip: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  moodChipOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  pressed: { opacity: 0.7 },
  moodEmoji: { fontSize: 24, lineHeight: 28 },
  bodyInput: { minHeight: 160 },
  counter: { alignSelf: 'flex-end', color: colors.textTertiary, fontSize: fontSize.caption, marginTop: -spacing.xs },
  photoBox: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
    marginTop: spacing.sm,
  },
  photo: { width: '100%', height: '100%' },
  photoRemove: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    height: 56,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceAlt,
    marginTop: spacing.sm,
  },
  photoEmptyText: { color: colors.textSecondary, fontSize: fontSize.body, fontWeight: '600' },
  saveBtn: { marginTop: spacing.lg },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
    marginTop: spacing.lg,
    minHeight: 44,
  },
  deleteText: { color: colors.danger, fontSize: fontSize.body, fontWeight: '600' },
}));
