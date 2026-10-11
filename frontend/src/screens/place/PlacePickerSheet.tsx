/**
 * 저장한 장소 고르기 시트 — "봤어요"의 "어디서 봤어요?(선택)"(V133)가 쓴다. 저장한 곳 중에서 고르거나, 없으면 카카오에서 찾아
 * 그 자리에서 담고 고른다(서버가 같은 곳이면 새로 만들지 않는다 — PlaceService.findExisting).
 *
 * <p>식단 기록 화면에도 비슷한 장소 시트가 있지만(DietRecordScreen) 외식 기록 흐름에 묶여 있어 그대로 두었다 — 공통화는
 * docs/LOVELICHELIN_AI_COURSE_2026-10-07.md §6 의 후보 목록에 적었다.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Sheet } from '../../components/Sheet';
import { Button } from '../../components/Button';
import { placeApi, toSavePlacePayload } from '../../api/place';
import { usePlaceStore } from '../../store/placeStore';
import { placeSubtitle } from '../../utils/placeLinks';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';
import type { PlaceSearchResult } from '../../types';

/** 검색어 없이 보여 주는 저장 장소 수 — 최근 담은 순 */
const RECENT_COUNT = 12;

interface Props {
  visible: boolean;
  onClose: () => void;
  onPick: (place: { id: number; name: string }) => void;
}

export function PlacePickerSheet({ visible, onClose, onPick }: Props) {
  const places = usePlaceStore((s) => s.places);
  const loadPlaces = usePlaceStore((s) => s.load);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<PlaceSearchResult[] | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    if (visible) void loadPlaces();
  }, [visible, loadPlaces]);

  const saved = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...places].sort((a, b) => b.id - a.id);
    if (!q) return sorted.slice(0, RECENT_COUNT);
    return sorted.filter((p) => p.name.toLowerCase().includes(q) || (p.address ?? '').toLowerCase().includes(q));
  }, [places, query]);

  const close = () => {
    setQuery('');
    setResults(null);
    onClose();
  };

  const onSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setResults(null);
    try {
      const res = await placeApi.search(q);
      if (!res.available) toast.info('지금은 장소 검색을 쓸 수 없어요.');
      setResults(res.places);
    } catch (e) {
      toast.error(getErrorMessage(e, '장소 검색에 실패했어요.'));
    } finally {
      setSearching(false);
    }
  };

  const onAddResult = async (r: PlaceSearchResult) => {
    const key = r.kakaoPlaceId ?? `${r.name}|${r.address ?? ''}`;
    setSavingKey(key);
    try {
      const place = await placeApi.save(toSavePlacePayload(r));
      usePlaceStore.getState().invalidate();
      onPick({ id: place.id, name: place.name });
      close();
    } catch (e) {
      // 402(장소 한도)는 api/client 가 업그레이드 안내를 이미 띄웠다 — 여기선 문구만
      toast.error(getErrorMessage(e, '장소를 담지 못했어요.'));
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <Sheet visible={visible} onClose={close} position="bottom" cardStyle={styles.card}>
      <Text style={styles.title}>어디서 봤어요?</Text>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={(t) => {
            setQuery(t);
            setResults(null);
          }}
          placeholder="극장·공연장 이름"
          placeholderTextColor={colors.textSecondary}
          returnKeyType="search"
          onSubmitEditing={onSearch}
          accessibilityLabel="장소 이름 검색"
        />
        <Button title="찾기" size="sm" variant="secondary" onPress={onSearch} disabled={!query.trim()} />
      </View>
      <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
        {saved.length > 0 ? <Text style={styles.section}>{query.trim() ? '저장한 곳' : '최근 담은 곳'}</Text> : null}
        {saved.map((p) => (
          <Pressable
            key={p.id}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            onPress={() => {
              onPick({ id: p.id, name: p.name });
              close();
            }}
            accessibilityRole="button"
            accessibilityLabel={`${p.name} 고르기`}
          >
            <Text style={styles.name} numberOfLines={1}>
              {p.name}
            </Text>
            {placeSubtitle(p) ? <Text style={styles.sub}>{placeSubtitle(p)}</Text> : null}
          </Pressable>
        ))}
        {searching ? <ActivityIndicator style={styles.spinner} color={colors.primary} /> : null}
        {results ? (
          <>
            <Text style={styles.section}>카카오에서 찾은 곳 — 고르면 럽슐랭에도 담겨요</Text>
            {results.length === 0 ? <Text style={styles.sub}>찾은 곳이 없어요.</Text> : null}
            {results.map((r) => {
              const key = r.kakaoPlaceId ?? `${r.name}|${r.address ?? ''}`;
              return (
                <Pressable
                  key={key}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                  disabled={savingKey != null}
                  onPress={() => onAddResult(r)}
                  accessibilityRole="button"
                  accessibilityLabel={`${r.name} 담고 고르기`}
                >
                  <Text style={styles.name} numberOfLines={1}>
                    {r.name}
                  </Text>
                  {placeSubtitle(r) ? <Text style={styles.sub}>{placeSubtitle(r)}</Text> : null}
                  {savingKey === key ? <ActivityIndicator size="small" color={colors.primary} /> : null}
                </Pressable>
              );
            })}
          </>
        ) : query.trim() && saved.length === 0 && !searching ? (
          <Text style={styles.sub}>저장한 곳 중엔 없어요. [찾기]로 카카오에서 찾아보세요.</Text>
        ) : null}
      </ScrollView>
      <Button title="닫기" variant="ghost" size="md" onPress={close} />
    </Sheet>
  );
}

const styles = themedStyles((colors) => ({
  card: { maxHeight: '85%', gap: spacing.sm },
  title: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    flex: 1,
    height: 44,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceAlt,
    color: colors.textPrimary,
    fontSize: fontSize.body,
  },
  list: { flexGrow: 0, flexShrink: 1 },
  section: { fontSize: fontSize.caption, fontWeight: '800', color: colors.textSecondary, marginTop: spacing.sm, marginBottom: spacing.xs },
  row: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 2, minHeight: 44 },
  pressed: { opacity: 0.6 },
  name: { fontSize: fontSize.body, fontWeight: '700', color: colors.textPrimary },
  sub: { fontSize: fontSize.caption, color: colors.textSecondary },
  spinner: { marginVertical: spacing.md },
}));
