/**
 * 그날 페이지 — 나만의 하루 기록 쓰기·고치기·지우기. 기분 + 몇 줄 + 사진 한 장.
 *
 * <p>하루에 하나라 따로 "수정 화면"이 없다 — 이 화면이 보기이자 쓰기다. 지난 날짜도 쓸 수 있다
 * (어제 못 쓴 걸 오늘 쓰는 게 일기의 기본 동작이다). 서버가 미래 날짜만 거절한다.
 * docs/PERSONAL_JOURNAL_ANALYSIS_2026-10-02.md §4-3.
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { FormKeyboardView } from '../../components/FormKeyboardView';
import { SpacingFixBar } from '../../components/SpacingFixBar';
import { MaterialCommunityIcons } from '../../components/Icon';
import { journalApi, type JournalEntry } from '../../api/journal';
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
  const { date, source, draftMood, draftBody } = route.params;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [mood, setMood] = useState<string | null>(draftMood ?? null);
  const [body, setBody] = useState(draftBody ?? '');
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
  }, [date, reloadKey]);

  const dirty =
    (mood ?? null) !== (entry?.moodEmoji ?? null) ||
    body.trim() !== (entry?.body ?? '').trim() ||
    (photo ?? null) !== (entry?.photoUrl ?? null);
  const allowLeave = useDirtyGuard(!loading && dirty);

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

  const onDelete = () => {
    Alert.alert('이 날 기록을 지울까요?', '지운 기록은 되돌릴 수 없어요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '지우기',
        style: 'destructive',
        onPress: () => {
          journalApi
            .remove(date)
            .then(() => {
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

        <Text style={styles.sectionLabel}>오늘 기분</Text>
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
          label="나에게 쓰는 오늘"
          placeholder="오늘 어땠어요? 한 줄이어도 좋아요."
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
