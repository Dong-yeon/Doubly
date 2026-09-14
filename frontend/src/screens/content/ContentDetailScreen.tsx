/**
 * 콘텐츠 상세 — 관람 기록 목록 + 기록 추가 (별점·날짜·사진·메모).
 *
 * <p>장소 쪽(PlaceDetailScreen)과 같은 구조이며, 2026-09-14 에 같은 이유로 함께 정리했다:
 * 관람 기록 별점이 <b>등급에 아무 영향이 없었다</b>(ContentService.recordLog 는
 * content_ratings 를 건드리지 않는다 — PlaceService.recordVisit 과 같은 구멍). 그래서
 * "봤어요" 하나로 합쳐 기록과 대표 평점을 함께 올린다. 자세한 배경은 장소 쪽 파일 상단 주석과
 * docs/LOVELICHELIN_UX_REANALYSIS_2026-09-14.md 3-1 · 5-1.
 */
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
import { DateField } from '../../components/DateField';
import { EmptyState } from '../../components/EmptyState';
import { ImageViewer } from '../../components/ImageViewer';
import { IconButton } from '../../components/IconButton';
import { LovelichelinBadge } from '../../components/LovelichelinBadge';
import { LovelichelinFanfareModal } from '../../components/LovelichelinFanfareModal';
import { LovelichelinRuleSheet } from '../../components/LovelichelinRuleSheet';
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
import { toDateString } from '../../utils/date';
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
  // 본 날짜 — API는 원래 watchedAt 을 받고 있었는데 화면에만 없어 늘 오늘로 저장됐다
  const [watchedAt, setWatchedAt] = useState(toDateString());
  const [memo, setMemo] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 럽슐랭 대표 평점 — 기본 동선("봤어요")이 이 값을 함께 쓰므로 평소엔 한 줄 요약으로 접어두고,
  // 이번 관람과 무관하게 작품 평가만 고칠 때만 펼친다(장소 쪽과 같은 구조).
  const [myRatingInput, setMyRatingInput] = useState(0);
  const [ratingEditing, setRatingEditing] = useState(false);
  const [ratingSaving, setRatingSaving] = useState(false);
  const [ruleOpen, setRuleOpen] = useState(false);
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
    setWatchedAt(toDateString());
    setMemo('');
    setPhotoUri(null);
  };

  /*
   * "봤어요" 저장 — 관람 기록을 남기고, 별점을 매겼으면 그 별점을 럽슐랭 대표 평점으로 함께
   * 올린다(파일 상단 주석). 기록이 저장된 뒤 평점에서 실패하면 재시도가 관람 기록을 두 번
   * 쌓으므로 폼을 닫고 알리기만 한다 — 장소 쪽 onSaveVisit 과 같은 처리.
   */
  const onSaveLog = async () => {
    setSaving(true);
    try {
      let imageUrl: string | undefined;
      if (photoUri) {
        imageUrl = await runBusy('사진 올리는 중…', () => uploadImage(photoUri));
      }

      await contentApi.recordLog(contentId, {
        watchedAt,
        rating: rating > 0 ? rating : undefined,
        memo: memo.trim() || undefined,
        imageUrl,
      });

      setFormOpen(false);
      resetForm();

      if (rating > 0) {
        try {
          const previousTier = content?.lovelichelinTier ?? 0;
          const updated = await contentApi.rate(contentId, { rating });
          setMyRatingInput(rating);
          if (previousTier === 0 && updated.lovelichelinTier > 0) {
            setFanfareTier(updated.lovelichelinTier);
          } else {
            toast.success(`관람 기록 완료! 내 럽슐랭 평가도 ${stars(rating)} 로 저장했어요.`);
          }
        } catch (e) {
          toast.error(getErrorMessage(e, '관람 기록은 남겼지만 럽슐랭 평가 저장에 실패했어요. 위 "수정"에서 다시 시도해주세요.'));
        }
      } else {
        toast.success('관람 기록 완료! ');
      }

      haptics.success();
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
      const updated = await contentApi.rate(contentId, { rating: myRatingInput });
      setContent(updated);
      setRatingEditing(false);
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
                  <View style={styles.infoHeaderRow}>
                    {content.posterUrl ? (
                      <Image source={{ uri: content.posterUrl }} style={styles.infoPoster} resizeMode="cover" />
                    ) : null}
                    <View style={styles.flex}>
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
                    </View>
                  </View>
                  {content.logCount > 0 ? (
                    <Text style={styles.infoStats}>
                      {content.avgRating ? `${content.avgRating.toFixed(1)} · ` : ''}
                      관람 {content.logCount}회
                      {content.lastWatchedAt ? ` · 최근 ${content.lastWatchedAt}` : ''}
                    </Text>
                  ) : null}

                  {/* 럽슐랭 평가 — 평소엔 한 줄 요약. 별점을 매기는 자리는 아래 "봤어요" 하나다 */}
                  <View style={styles.lovelichelinSection}>
                    <View style={styles.lovelichelinHeader}>
                      <View style={styles.lovelichelinLabelRow}>
                        <Text style={styles.label}>럽슐랭 평가</Text>
                        <IconButton
                          icon="comment-question-outline"
                          label="럽슐랭 등급 기준 보기"
                          onPress={() => setRuleOpen(true)}
                        />
                      </View>
                      <LovelichelinBadge tier={content.lovelichelinTier} size="sm" />
                    </View>

                    <View style={styles.ratingSummaryRow}>
                      <View style={styles.ratingSummaryTexts}>
                        <Text style={[styles.ratingSummary, { color: colors.me }]}>
                          나 {content.myRating ? stars(content.myRating) : '아직 평가 전'}
                        </Text>
                        <Text style={[styles.ratingSummary, { color: colors.partner }]}>
                          상대 {content.partnerRating ? stars(content.partnerRating) : '아직 평가 전'}
                        </Text>
                      </View>
                      <Button
                        title={ratingEditing ? '닫기' : content.myRating ? '수정' : '평가하기'}
                        variant="ghost"
                        size="sm"
                        onPress={() => {
                          setMyRatingInput(content.myRating ?? 0);
                          setRatingEditing((v) => !v);
                        }}
                      />
                    </View>

                    {ratingEditing ? (
                      <>
                        <View style={styles.starRowSm}>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <TouchableOpacity
                              key={n}
                              // 같은 별 재탭으로 0이 되면 저장 버튼만 이유 없이 죽어 보인다
                              onPress={() => setMyRatingInput(n)}
                              accessibilityLabel={`나의 럽슐랭 평점 ${n}점`}
                            >
                              <Text style={[styles.starSm, { color: colors.me }]}>
                                {n <= myRatingInput ? '★' : '☆'}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                        <Button
                          title="평가 저장"
                          variant="secondary"
                          size="sm"
                          onPress={onSaveRating}
                          loading={ratingSaving}
                          disabled={myRatingInput === 0}
                        />
                      </>
                    ) : null}
                  </View>
                </View>
              ) : null}

              {formOpen ? (
                <View style={styles.form}>
                  <Text style={styles.label}>별점</Text>
                  <View style={styles.starRow}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <TouchableOpacity
                        key={n}
                        onPress={() => setRating(rating === n ? 0 : n)}
                        accessibilityRole="button"
                        accessibilityLabel={`평점 ${n}점`}
                      >
                        <Text style={styles.star}>{n <= rating ? '★' : '☆'}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.starHint}>
                    {rating > 0
                      ? content?.myRating
                        ? '내 럽슐랭 평가도 이 별점으로 바뀌어요'
                        : '이 별점이 내 럽슐랭 평가가 돼요 — 둘 다 매기면 등급이 붙어요'
                      : '별점 없이 기록만 남길 수도 있어요'}
                  </Text>

                  <DateField
                    label="본 날"
                    value={watchedAt}
                    onChange={setWatchedAt}
                    max={toDateString()}
                    pickerTitle="언제 보셨나요?"
                  />

                  <TouchableOpacity
                    style={[styles.photoBox, photoUri ? styles.photoBoxFilled : styles.photoBoxEmpty]}
                    onPress={onPickPhoto}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={photoUri ? '사진 변경' : '사진 추가하기'}
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
                  title="봤어요"
                  onPress={() => {
                    resetForm();
                    setRatingEditing(false);
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
                <EmptyState icon="movie-open-outline" title="아직 관람 기록이 없어요" description="다 보셨다면 별점과 함께 남겨보세요!" />
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
      <LovelichelinRuleSheet visible={ruleOpen} onClose={() => setRuleOpen(false)} />
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
  infoHeaderRow: { flexDirection: 'row', gap: spacing.md },
  infoPoster: { width: 64, height: 92, borderRadius: radius.md },
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
  lovelichelinLabelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  ratingSummaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  ratingSummaryTexts: { flex: 1, gap: 2 },
  ratingSummary: { fontSize: fontSize.caption, fontWeight: '700' },
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
  // 별점이 대표 평점으로도 간다는 사실을 그 자리에서 알려준다 (PlaceDetailScreen 과 같은 문구)
  starHint: { fontSize: fontSize.caption, color: colors.textSecondary, marginBottom: spacing.md },
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
