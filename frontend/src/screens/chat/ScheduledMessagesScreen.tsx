/**
 * 예약 전송 대기 목록 — docs/CHAT_RETENTION_AND_KAKAO_BENCHMARK_2026-09-03.md §6 5순위.
 * ChatMoreMenuSheet 에서 연다. 페이징이 없다 — 관계당 대기 개수 상한이 20건이라
 * (ScheduledChatMessageService.MAX_PENDING_PER_RELATION) 한 번에 다 불러와도 된다.
 */
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ChatStackParamList } from '../../navigation/types';
import { EmptyState } from '../../components/EmptyState';
import { MaterialCommunityIcons } from '../../components/Icon';
import { chatApi } from '../../api/chat';
import { toast } from '../../store/toastStore';
import { getErrorMessage } from '../../utils/error';
import { messagePreview } from '../../utils/messagePreview';
import { formatDateTimeLabel } from '../../utils/date';
import type { ScheduledMessage } from '../../types';
import { colors, fontSize, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<ChatStackParamList, 'ScheduledMessages'>;

export function ScheduledMessagesScreen({ route }: Props) {
  const { relationId } = route.params;

  const [items, setItems] = useState<ScheduledMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [cancelingId, setCancelingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      setItems(await chatApi.scheduledMessages(relationId));
    } catch (e) {
      toast.error(getErrorMessage(e, '예약된 메시지를 불러오지 못했어요.'));
      setItems([]);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [relationId]);

  useFocusEffect(useCallback(() => void load(), [load]));

  const cancel = async (item: ScheduledMessage) => {
    setCancelingId(item.id);
    try {
      await chatApi.cancelScheduled(item.id);
      setItems((prev) => prev.filter((s) => s.id !== item.id));
      toast.success('예약을 취소했어요.');
    } catch (e) {
      toast.error(getErrorMessage(e, '취소하지 못했어요.'));
    } finally {
      setCancelingId(null);
    }
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(s) => String(s.id)}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}
        contentContainerStyle={items.length === 0 ? styles.emptyWrap : undefined}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowBody}>
              <Text style={styles.preview} numberOfLines={2}>
                {messagePreview(item.messageType, item.content)}
              </Text>
              <Text style={styles.when}>{formatDateTimeLabel(item.scheduledAt)} 발송 예정</Text>
            </View>
            <Pressable
              onPress={() => cancel(item)}
              disabled={cancelingId === item.id}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="예약 취소"
              style={styles.cancelBtn}
            >
              {cancelingId === item.id ? (
                <ActivityIndicator size="small" color={colors.textSecondary} />
              ) : (
                <MaterialCommunityIcons name="close-circle-outline" size={22} color={colors.textSecondary} />
              )}
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          loading ? null : loadError ? (
            <EmptyState
              icon="cloud-off-outline"
              title="불러오지 못했어요"
              description="네트워크 상태를 확인하고 다시 시도해주세요."
              error
              onRetry={load}
            />
          ) : (
            <EmptyState
              icon="clock-outline"
              title="예약된 메시지가 없어요"
              description={'입력창 옆 "+" 에서 예약 전송을 만들어보세요.'}
            />
          )
        }
      />
    </View>
  );
}

const styles = themedStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.background },
  emptyWrap: { flexGrow: 1, justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowBody: { flex: 1, gap: 2 },
  preview: { fontSize: fontSize.body, color: colors.textPrimary },
  when: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '600' },
  cancelBtn: { padding: spacing.xs },
}));
