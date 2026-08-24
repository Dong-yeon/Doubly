/** 콘텐츠 상세 — 관람 기록 목록 + 기록 추가 (별점·사진·메모) */
import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Alert } from '../../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { PlaceStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { Checkbox } from '../../components/Checkbox';
import { EmptyState } from '../../components/EmptyState';
import { ImageViewer } from '../../components/ImageViewer';
import { IconButton } from '../../components/IconButton';
import { LovelichelinBadge } from '../../components/LovelichelinBadge';
import { LovelichelinFanfareModal } from '../../components/LovelichelinFanfareModal';
import { SoloPickBadge } from '../../components/SoloPickBadge';
import { useContentStore } from '../../store/contentStore';
import { SOLO_PICK_MIN_RATING } from '../place/placeFilters';
import { contentApi } from '../../api/content';
import { contentTypeLabel } from '../../constants/contentTypes';
import { pickImage, uploadImage } from '../../utils/imageUpload';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { runBusy } from '../../store/busyStore';
import { haptics } from '../../utils/haptics';
import { stars } from '../../utils/ratingStars';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { Content, ContentLog } from '../../types';
import { themedStyles } from '../../theme/themedStyles';
import { useAndroidKeyboardHeight } from '../../hooks/useAndroidKeyboardHeight';

type Props = NativeStackScreenProps<PlaceStackParamList, 'ContentDetail'>;

export function ContentDetailScreen({ route, navigation }: Props) {
  const { contentId, title: contentTitle } = route.params;
  const androidKeyboardHeight = useAndroidKeyboardHeight();
  const [content, setContent] = useState<Content | null>(null);
  const [logs, setLogs] = useState<ContentLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // 사진 있는 카드를 눌러 전체화면으로 본다 — PlaceDetailScreen 과 같은 패턴
  const [viewingIndex, setViewingIndex] = useState<number | null>(null);
  const photoLogs = useMemo(() => logs.filter((l) => l.imageUrl), [logs]);

  // 관람 기록 입력 폼
  const [formOpen, setFormOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [memo, setMemo] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 럽슐랭 대표 평점 — 관람기록 별점(위)과 별개로, 콘텐츠당 한 사람당 1개만 유지된다.
  // revisitIntent 는 API가 되돌려주지 않는 선택 응답이라, 이번에 직접 건드리지 않으면
  // undefined 로 두고 저장 요청에서도 생략한다(PlaceDetailScreen과 같은 이유).
  const [myRatingInput, setMyRatingInput] = useState(0);
  const [revisitIntent, setRevisitIntent] = useState<boolean | undefined>(undefined);
  const [ratingSaving, setRatingSaving] = useState(false);
  const [fanfareTier, setFanfareTier] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [c, l] = await Promise.all([contentApi.get(contentId), contentApi.logs(contentId)]);
      setContent(c);
      setLogs(l);
      setMyRatingInput(c.myRating ?? 0);
      navigation.setOptions({ title: c.title });
    } catch (e) {
      toast.error(getErrorMessage(e, '콘텐츠 정보를 불러오지 못했어요.'));
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [contentId, navigation]);

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

  const resetForm = () => {
    setRating(0);
    setMemo('');
    setPhotoUri(null);
  };

  const onSaveLog = async () => {
    setSaving(true);
    try {
      let imageUrl: string | undefined;
      if (photoUri) {
        imageUrl = await runBusy('사진 올리는 중…', () => uploadImage(photoUri));
      }

      await contentApi.recordLog(contentId, {
        rating: rating > 0 ? rating : undefined,
        memo: memo.trim() || undefined,
        imageUrl,
      });
      haptics.success();
      toast.success('관람 기록 완료! ');
      setFormOpen(false);
      resetForm();
      load();
      useContentStore.getState().invalidate();
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  // 럽슐랭 대표 평점 저장 — 재평가 시 upsert. 등급이 0→양수로 새로 등극하면 축하 모달을 연다
  const onSaveRating = async () => {
    if (!content || myRatingInput === 0) return;
    setRatingSaving(true);
    try {
      const previousTier = content.lovelichelinTier;
      const updated = await contentApi.rate(contentId, { rating: myRatingInput, revisitIntent });
      setContent(updated);
      haptics.success();
      useContentStore.getState().invalidate();
      if (previousTier === 0 && updated.lovelichelinTier > 0) {
        setFanfareTier(updated.lovelichelinTier);
      } else {
        toast.success('럽슐랭 평가를 저장했어요.');
      }
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e));
    } finally {
      setRatingSaving(false);
    }
  };

  const onDeleteContent = () => {
    if (!content) return;
    Alert.alert('콘텐츠 삭제', `"${content.title}"을(를) 삭제할까요?\n관람 기록도 함께 삭제돼요.`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await contentApi.remove(content.id);
            haptics.light();
            toast.success('콘텐츠를 삭제했어요.');
            useContentStore.getState().invalidate();
            navigation.goBack();
          } catch (e) {
            Alert.alert('오류', getErrorMessage(e));
          }
        },
      },
    ]);
  };

  const onDeleteLog = (log: ContentLog) => {
    Alert.alert('관람 기록 삭제', `${log.watchedAt} 기록을 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await contentApi.removeLog(contentId, log.id);
            haptics.light();
            toast.success('관람 기록을 삭제했어요.');
            load();
            useContentStore.getState().invalidate();
          } catch (e) {
            Alert.alert('오류', getErrorMessage(e));
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView
        style={[styles.flex, Platform.OS === 'android' && { paddingBottom: androidKeyboardHeight }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FlatList
          data={logs}
          keyExtractor={(l) => String(l.id)}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          refreshing={loading}
          onRefresh={load}
          ListHeaderComponent={
            <View>
              {content ? (
                <View style={styles.infoCard}>
                  <View style={styles.infoTop}>
                    <Text style={styles.infoName}>{content.title}</Text>
                    <View style={styles.infoActions}>
                      <IconButton
                        icon="pencil-outline"
                        label="콘텐츠 정보 수정"
                        onPress={() => navigation.navigate('ContentAdd', { content })}
                      />
                      <IconButton
                        icon="delete-outline"
                        label="콘텐츠 삭제"
                        color={colors.danger}
                        onPress={onDeleteContent}
                      />
                    </View>
                  </View>
                  <View style={styles.infoChipRow}>
                    <View style={styles.infoChip}>
                      <Text style={styles.infoChipText}>{content.status === 'DONE' ? '봤어요' : '보고 싶어요'}</Text>
                    </View>
                    <View style={styles.infoChip}>
                      <Text style={styles.infoChipText}>{contentTypeLabel(content.type)}</Text>
                    </View>
                    {content.lovelichelinTier === 0 &&
                    ((content.myRating != null && content.myRating >= SOLO_PICK_MIN_RATING && content.partnerRating == null) ||
                      (content.partnerRating != null &&
                        content.partnerRating >= SOLO_PICK_MIN_RATING &&
                        content.myRating == null)) ? (
                      <SoloPickBadge who={content.myRating != null ? 'me' : 'partner'} size="sm" />
                    ) : null}
                  </View>
                  {content.logCount > 0 ? (
                    <Text style={styles.infoStats}>
                      {content.avgRating ? `${content.avgRating.toFixed(1)} · ` : ''}
                      관람 {content.logCount}회
                      {content.lastWatchedAt ? ` · 최근 ${content.lastWatchedAt}` : ''}
                    </Text>
                  ) : null}

                  {/* 럽슐랭 평가 — 관람기록 별점(아래)과 별개로, 콘텐츠당 나/상대 대표 평점이 각 1개씩 유지된다 */}
                  <View style={styles.lovelichelinSection}>
                    <View style={styles.lovelichelinHeader}>
                      <Text style={styles.label}>럽슐랭 평가</Text>
                      <LovelichelinBadge tier={content.lovelichelinTier} size="sm" />
                    </View>
                    <View style={styles.ratingRow}>
                      <View style={styles.ratingCol}>
                        <Text style={styles.ratingColLabel}>나</Text>
                        <View style={styles.starRowSm}>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <TouchableOpacity
                              key={n}
                              onPress={() => setMyRatingInput(myRatingInput === n ? 0 : n)}
                              accessibilityLabel={`나의 럽슐랭 평점 ${n}점`}
                            >
                              <Text style={[styles.starSm, { color: colors.me }]}>
                                {n <= myRatingInput ? '★' : '☆'}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                      <View style={styles.ratingCol}>
                        <Text style={styles.ratingColLabel}>상대</Text>
                        <Text style={[styles.starSmReadonly, { color: colors.partner }]}>
                          {content.partnerRating ? stars(content.partnerRating) : '아직 평가 전'}
                        </Text>
                      </View>
                    </View>
                    <Checkbox checked={revisitIntent ?? true} onChange={setRevisitIntent} label="다시 볼래요?" />
                    <Button
                      title="럽슐랭 평가 저장"
                      variant="secondary"
                      size="sm"
                      onPress={onSaveRating}
                      loading={ratingSaving}
                      disabled={myRatingInput === 0}
                    />
                  </View>
                </View>
              ) : null}

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

                  <TouchableOpacity
                    style={[styles.photoBox, photoUri ? styles.photoBoxFilled : styles.photoBoxEmpty]}
                    onPress={onPickPhoto}
                    activeOpacity={0.8}
                  >
                    {photoUri ? (
                      <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />
                    ) : (
                      <Text style={styles.photoPlaceholder}>사진 추가하기 (티켓·스크린샷)</Text>
                    )}
                  </TouchableOpacity>

                  <TextField
                    label="메모 (선택)"
                    placeholder="예: 반전이 진짜 소름. 예매 꼭 미리 하기"
                    value={memo}
                    onChangeText={setMemo}
                    multiline
                  />

                  <View style={styles.formActions}>
                    <Button
                      title="취소"
                      variant="ghost"
                      size="md"
                      onPress={() => {
                        setFormOpen(false);
                        resetForm();
                      }}
                      style={styles.flex}
                    />
                    <Button title="기록 저장" size="md" onPress={onSaveLog} loading={saving} style={styles.flex} />
                  </View>
                </View>
              ) : (
                <Button
                  title="관람 기록 남기기"
                  variant="secondary"
                  onPress={() => {
                    resetForm();
                    setFormOpen(true);
                  }}
                />
              )}

              <Text style={styles.sectionTitle}>관람 기록</Text>
              {logs.length > 0 ? <Text style={styles.logHint}>길게 눌러 삭제 · 사진은 탭해서 크게 보기</Text> : null}
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.logCard}
              activeOpacity={item.imageUrl ? 0.8 : 1}
              onLongPress={() => onDeleteLog(item)}
              onPress={
                item.imageUrl ? () => setViewingIndex(photoLogs.findIndex((l) => l.id === item.id)) : undefined
              }
              accessibilityHint={item.imageUrl ? '탭해서 사진 크게 보기 · 길게 눌러 삭제' : '길게 눌러 삭제'}
            >
              <View style={styles.logHeader}>
                <Text style={styles.logDate}>
                  {item.watchedAt} · {item.loggedByName ?? '커플'}
                </Text>
                {item.rating ? <Text style={styles.logStars}>{stars(item.rating)}</Text> : null}
              </View>
              {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.logPhoto} resizeMode="cover" /> : null}
              {item.memo ? <Text style={styles.logMemo}>{item.memo}</Text> : null}
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            !loading ? (
              loadError ? (
                <EmptyState
                  icon="cloud-off-outline"
                  title="관람 기록을 불러오지 못했어요"
                  description="네트워크 상태를 확인하고 다시 시도해주세요."
                  error
                  onRetry={load}
                />
              ) : (
                <EmptyState icon="movie-open-outline" title="아직 관람 기록이 없어요" description="다 보셨다면 남겨보세요! (길게 눌러 삭제)" />
              )
            ) : null
          }
        />
      </KeyboardAvoidingView>
      <ImageViewer
        images={photoLogs.map((l) => ({
          key: String(l.id),
          uri: l.imageUrl as string,
          title: `${l.watchedAt} · ${l.loggedByName ?? '커플'}`,
          caption: l.memo ?? undefined,
        }))}
        initialIndex={viewingIndex}
        onClose={() => setViewingIndex(null)}
      />
      <LovelichelinFanfareModal
        visible={fanfareTier > 0}
        tier={fanfareTier}
        placeName={content?.title ?? ''}
        description="둘이 함께 검증한 우리만의 인생 콘텐츠예요."
        onClose={() => setFanfareTier(0)}
      />
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  list: { padding: spacing.lg, paddingBottom: spacing.xl },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  infoTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  infoName: { flex: 1, fontSize: fontSize.title, fontWeight: '800', color: colors.textPrimary },
  infoActions: { flexDirection: 'row', alignItems: 'center' },
  infoChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  infoChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoChipText: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '600' },
  infoStats: { fontSize: fontSize.caption, color: colors.primary, fontWeight: '700', marginTop: spacing.xs },
  lovelichelinSection: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  lovelichelinHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ratingRow: { flexDirection: 'row', gap: spacing.lg },
  ratingCol: { flex: 1 },
  ratingColLabel: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700', marginBottom: 2 },
  starRowSm: { flexDirection: 'row', gap: 2 },
  starSm: { fontSize: 22 },
  starSmReadonly: { fontSize: fontSize.body, fontWeight: '700' },
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
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  photoBoxEmpty: { width: '100%', aspectRatio: 16 / 9 },
  photoBoxFilled: { width: '100%', aspectRatio: 4 / 3 },
  photo: { width: '100%', height: '100%' },
  photoPlaceholder: { color: colors.textSecondary, fontSize: fontSize.body, fontWeight: '600' },
  formActions: { flexDirection: 'row', gap: spacing.sm },
  sectionTitle: {
    fontSize: fontSize.subtitle,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  logHint: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: -spacing.xs, marginBottom: spacing.sm },
  logCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logDate: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '600' },
  logStars: { fontSize: fontSize.body, color: colors.togetherText, fontWeight: '700' },
  logPhoto: { width: '100%', height: 160, borderRadius: radius.md, marginTop: spacing.sm },
  logMemo: { fontSize: fontSize.body, color: colors.textPrimary, marginTop: spacing.sm },
}));
