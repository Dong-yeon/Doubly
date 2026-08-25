/**
 * 콘텐츠 추가 — 제목 검색(TMDB, 영화·드라마) 자동 입력 또는 직접 입력 +
 * 종류(영화/공연/드라마)·상태(보고싶어요/봤어요) 선택.
 *
 * <p>공연(PERFORMANCE)은 TMDB 대상이 아니라 검색 결과에 나오지 않는다 — 항상 직접 입력.
 */
import React, { useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { CONTENT_TYPES, contentTypeLabel } from '../../constants/contentTypes';
import type { ContentSearchResult, ContentStatus, ContentType } from '../../types';
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
  const [posterUrl, setPosterUrl] = useState<string | null>(editingContent?.posterUrl ?? null);
  const [saving, setSaving] = useState(false);

  // 제목 검색 (TMDB) — 영화·드라마만. 검색 자체가 실패해도(미설정 등) 직접 입력은 항상 된다.
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<ContentSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  const dirty = isEdit
    ? title.trim() !== (editingContent?.title ?? '') ||
      type !== (editingContent?.type ?? 'MOVIE') ||
      status !== (editingContent?.status ?? 'WISHLIST')
    : title.trim().length > 0;
  const allowLeave = useDirtyGuard(dirty);

  const onSearch = async () => {
    const q = keyword.trim();
    if (!q) return;
    setSearching(true);
    setResults(null);
    setUnavailable(false);
    try {
      const res = await contentApi.search(q);
      setUnavailable(!res.available);
      setResults(res.results);
      if (res.available && res.results.length === 0) toast.error('검색 결과가 없어요.');
    } catch (e) {
      toast.error(getErrorMessage(e, '검색에 실패했어요.'));
    } finally {
      setSearching(false);
    }
  };

  // 검색 결과 선택 → 제목·종류·포스터 자동 입력
  const onPickResult = (result: ContentSearchResult) => {
    setTitle(result.title);
    setType(result.type);
    setPosterUrl(result.posterUrl ?? null);
    setResults(null);
    setKeyword('');
    haptics.light();
  };

  const onSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const payload = { title: title.trim(), type, status, posterUrl: posterUrl ?? undefined };
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
        <Text style={styles.label}>제목 검색 (영화·드라마) — 고르면 포스터까지 채워져요</Text>
        <View style={styles.searchRow}>
          <View style={styles.flex}>
            <TextField
              placeholder="예: 아바타"
              value={keyword}
              onChangeText={setKeyword}
              onSubmitEditing={onSearch}
              returnKeyType="search"
            />
          </View>
          <Button title="검색" size="md" onPress={onSearch} loading={searching} />
        </View>
        {unavailable ? (
          <Text style={styles.hint}>지금은 제목 검색을 쓸 수 없어요. 아래에 직접 입력해주세요.</Text>
        ) : null}
        {results?.map((r, i) => (
          <TouchableOpacity
            key={`${r.title}-${r.year ?? ''}-${i}`}
            style={styles.resultCard}
            activeOpacity={0.7}
            onPress={() => onPickResult(r)}
          >
            {r.posterUrl ? (
              <Image source={{ uri: r.posterUrl }} style={styles.resultPoster} resizeMode="cover" />
            ) : (
              <View style={styles.resultPosterPlaceholder} />
            )}
            <View style={styles.flex}>
              <Text style={styles.resultName} numberOfLines={1}>
                {r.title}
                {r.year ? ` (${r.year})` : ''}
              </Text>
              <Text style={styles.resultMeta}>{contentTypeLabel(r.type)}</Text>
            </View>
          </TouchableOpacity>
        ))}

        <View style={styles.divider} />

        {posterUrl ? (
          <View style={styles.posterPreviewRow}>
            <Image source={{ uri: posterUrl }} style={styles.posterPreview} resizeMode="cover" />
            <TouchableOpacity onPress={() => setPosterUrl(null)}>
              <Text style={styles.posterRemove}>포스터 제거</Text>
            </TouchableOpacity>
          </View>
        ) : null}

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
  flex: { flex: 1 },
  container: { padding: spacing.lg, paddingBottom: spacing.xl },
  searchRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  hint: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: spacing.xs },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    marginTop: spacing.xs,
  },
  resultPoster: { width: 40, height: 56, borderRadius: radius.sm },
  resultPosterPlaceholder: {
    width: 40,
    height: 56,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
  },
  resultName: { fontSize: fontSize.body, fontWeight: '700', color: colors.textPrimary },
  resultMeta: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  posterPreviewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  posterPreview: { width: 56, height: 80, borderRadius: radius.sm },
  posterRemove: { fontSize: fontSize.caption, color: colors.danger, fontWeight: '700' },
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
