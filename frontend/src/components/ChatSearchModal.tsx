/**
 * 대화 검색 — 전체 기간, 텍스트 메시지 본문 기준(백엔드 커서 페이징).
 *
 * docs/CHAT_RETENTION_AND_KAKAO_BENCHMARK_2026-09-03.md §6 1순위 — 영구 보관인데
 * 검색이 없어 반년 전 대화를 못 찾는다는 갭을 메운다. 결과를 고르면 부모가
 * ChatRoomScreen 목록에서 그 메시지로 스크롤한다(부모 책임 — 이 모달은 검색만 한다).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from './Icon';
import { chatApi } from '../api/chat';
import { chatDateDividerLabel } from '../utils/date';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';
import type { ChatMessage } from '../types';

interface Props {
  visible: boolean;
  relationId: number;
  myId: number | undefined;
  partnerName: string;
  onClose: () => void;
  onSelect: (message: ChatMessage) => void;
}

// 타이핑마다 요청하면 서버에 부담이자 낭비다 — 300ms 멈춤 후에만 검색한다
const DEBOUNCE_MS = 300;

export function ChatSearchModal({ visible, relationId, myId, partnerName, onClose, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [searched, setSearched] = useState(false);
  // 응답이 늦게 와서 최신 검색어를 덮어쓰는 경합을 막는다(빠르게 지웠다 다시 치는 경우)
  const requestSeq = useRef(0);

  const runSearch = useCallback(
    async (q: string) => {
      const seq = ++requestSeq.current;
      const trimmed = q.trim();
      if (!trimmed) {
        setResults([]);
        setSearched(false);
        setHasMore(true);
        return;
      }
      setLoading(true);
      try {
        const page = await chatApi.search(relationId, trimmed);
        if (seq !== requestSeq.current) return; // 이미 낡은 응답
        setResults(page);
        setHasMore(page.length > 0);
        setSearched(true);
      } catch {
        if (seq !== requestSeq.current) return;
        setResults([]);
        setHasMore(false);
        setSearched(true);
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    },
    [relationId],
  );

  // 디바운스 — query 가 바뀔 때마다 타이머를 새로 건다
  useEffect(() => {
    const id = setTimeout(() => runSearch(query), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query, runSearch]);

  // 모달을 닫을 때 상태를 비워야 다음에 열었을 때 이전 검색이 잠깐 보이지 않는다
  const close = () => {
    setQuery('');
    setResults([]);
    setSearched(false);
    onClose();
  };

  const loadMore = async () => {
    if (loadingMore || !hasMore || results.length === 0) return;
    setLoadingMore(true);
    try {
      const oldest = results[results.length - 1];
      const page = await chatApi.search(relationId, query.trim(), oldest.id);
      setResults((prev) => [...prev, ...page]);
      setHasMore(page.length > 0);
    } catch {
      // 다음 페이지 실패는 조용히 넘어간다 — 이미 보이는 결과는 그대로 둔다
    } finally {
      setLoadingMore(false);
    }
  };

  // 일치한 부분만 강조 — 대소문자 무시(백엔드와 동일 규칙)
  const renderHighlighted = (content: string, keyword: string) => {
    const idx = content.toLowerCase().indexOf(keyword.toLowerCase());
    if (idx === -1) return <Text style={styles.resultContent} numberOfLines={2}>{content}</Text>;
    return (
      <Text style={styles.resultContent} numberOfLines={2}>
        {content.slice(0, idx)}
        <Text style={styles.highlight}>{content.slice(idx, idx + keyword.length)}</Text>
        {content.slice(idx + keyword.length)}
      </Text>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="닫기" hitSlop={8}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.textPrimary} />
          </Pressable>
          <View style={styles.searchBox}>
            <MaterialCommunityIcons name="magnify" size={18} color={colors.textSecondary} />
            <TextInput
              style={styles.input}
              value={query}
              onChangeText={setQuery}
              placeholder="대화 검색"
              placeholderTextColor={colors.textTertiary}
              autoFocus
              returnKeyType="search"
            />
            {query ? (
              <Pressable onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="검색어 지우기">
                <MaterialCommunityIcons name="close-circle" size={18} color={colors.textTertiary} />
              </Pressable>
            ) : null}
          </View>
        </View>

        {loading ? (
          <ActivityIndicator style={styles.loading} color={colors.primary} />
        ) : (
          <FlatList
            data={results}
            keyExtractor={(m) => String(m.id)}
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={results.length === 0 ? styles.emptyContainer : undefined}
            ListEmptyComponent={
              searched ? (
                <View style={styles.empty}>
                  <MaterialCommunityIcons name="text-search" size={32} color={colors.textTertiary} />
                  <Text style={styles.emptyText}>검색 결과가 없어요</Text>
                </View>
              ) : null
            }
            ListFooterComponent={
              loadingMore ? <ActivityIndicator style={styles.loading} color={colors.primary} /> : null
            }
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [styles.resultRow, pressed && styles.resultRowPressed]}
                onPress={() => onSelect(item)}
                accessibilityRole="button"
              >
                <Text style={styles.resultSender}>{item.senderId === myId ? '나' : partnerName}</Text>
                {renderHighlighted(item.content ?? '', query.trim())}
                <Text style={styles.resultDate}>{chatDateDividerLabel(item.createdAt)}</Text>
              </Pressable>
            )}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.md,
  },
  input: { flex: 1, fontSize: fontSize.body, color: colors.textPrimary, padding: 0 },
  loading: { marginTop: spacing.xl },
  emptyContainer: { flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingTop: spacing.xxl },
  emptyText: { color: colors.textSecondary, fontSize: fontSize.body },
  resultRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 2,
  },
  resultRowPressed: { backgroundColor: colors.surfaceAlt },
  resultSender: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textSecondary },
  resultContent: { fontSize: fontSize.body, color: colors.textPrimary },
  highlight: { backgroundColor: colors.primarySoft, color: colors.primary, fontWeight: '800' },
  resultDate: { fontSize: fontSize.caption, color: colors.textTertiary },
}));
