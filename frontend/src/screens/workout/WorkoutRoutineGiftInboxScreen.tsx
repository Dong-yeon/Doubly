/**
 * 커플 루틴 선물함 — 애인과 주고받은 운동 루틴. "받은" 탭의 대기 중(PENDING) 카드만
 * 수락/거절 버튼을 보여준다. 수락하면 내 루틴 목록에 그대로 추가된다(원본과 별개 사본).
 */
import React, { useCallback, useState } from 'react';
import { FlatList, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { WorkoutStackParamList } from '../../navigation/types';
import { EmptyState } from '../../components/EmptyState';
import { workoutApi } from '../../api/workout';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';
import type { RoutineGift } from '../../types';

type Props = NativeStackScreenProps<WorkoutStackParamList, 'WorkoutRoutineGiftInbox'>;

type Tab = 'received' | 'sent';

const STATUS_LABEL: Record<RoutineGift['status'], string> = {
  PENDING: '대기 중',
  ACCEPTED: '받음',
  DECLINED: '거절함',
};

export function WorkoutRoutineGiftInboxScreen(_: Props) {
  const [tab, setTab] = useState<Tab>('received');
  const [received, setReceived] = useState<RoutineGift[]>([]);
  const [sent, setSent] = useState<RoutineGift[]>([]);
  const [loading, setLoading] = useState(false);
  // 로드 실패와 "진짜 빈 선물함"을 구분한다 (QA_CHECKLIST.md 패턴 1)
  const [loadError, setLoadError] = useState(false);
  const [respondingId, setRespondingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [receivedGifts, sentGifts] = await Promise.all([
        workoutApi.receivedRoutineGifts(),
        workoutApi.sentRoutineGifts(),
      ]);
      setReceived(receivedGifts);
      setSent(sentGifts);
    } catch (e) {
      toast.error(getErrorMessage(e, '선물함을 불러오지 못했어요.'));
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onAccept = async (gift: RoutineGift) => {
    haptics.light();
    setRespondingId(gift.id);
    try {
      const updated = await workoutApi.acceptRoutineGift(gift.id);
      haptics.success();
      toast.success(`"${updated.routine?.title ?? gift.routine?.title ?? '루틴'}"을(를) 내 루틴에 담았어요!`);
      setReceived((prev) => prev.map((g) => (g.id === gift.id ? updated : g)));
    } catch (e) {
      toast.error(getErrorMessage(e, '수락에 실패했어요.'));
    } finally {
      setRespondingId(null);
    }
  };

  const onDecline = (gift: RoutineGift) => {
    Alert.alert('선물 거절', '이 루틴을 거절할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '거절',
        style: 'destructive',
        onPress: async () => {
          setRespondingId(gift.id);
          try {
            await workoutApi.declineRoutineGift(gift.id);
            haptics.light();
            setReceived((prev) =>
              prev.map((g) => (g.id === gift.id ? { ...g, status: 'DECLINED' as const } : g)),
            );
          } catch (e) {
            toast.error(getErrorMessage(e));
          } finally {
            setRespondingId(null);
          }
        },
      },
    ]);
  };

  const list = tab === 'received' ? received : sent;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'received' && styles.tabBtnActive]}
          onPress={() => setTab('received')}
          accessibilityState={{ selected: tab === 'received' }}
        >
          <Text style={[styles.tabText, tab === 'received' && styles.tabTextActive]}>받은 선물</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'sent' && styles.tabBtnActive]}
          onPress={() => setTab('sent')}
          accessibilityState={{ selected: tab === 'sent' }}
        >
          <Text style={[styles.tabText, tab === 'sent' && styles.tabTextActive]}>보낸 선물</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={list}
        keyExtractor={(g) => String(g.id)}
        contentContainerStyle={styles.list}
        refreshing={loading}
        onRefresh={load}
        renderItem={({ item }) => {
          const otherName = tab === 'received' ? item.senderName : item.receiverName;
          const routineTitle = item.routine?.title ?? '삭제된 루틴';
          return (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.title}>{routineTitle}</Text>
                <View style={[styles.statusBadge, statusBadgeStyle(item.status)]}>
                  <Text style={[styles.statusText, statusTextStyle(item.status)]}>
                    {STATUS_LABEL[item.status]}
                  </Text>
                </View>
              </View>
              <Text style={styles.subline}>
                {tab === 'received' ? `${otherName ?? '애인'}님이 보냈어요` : `${otherName ?? '애인'}님에게 보냈어요`}
              </Text>
              {item.message ? <Text style={styles.message}>"{item.message}"</Text> : null}
              {item.routine ? (
                <>
                  <Text style={styles.summary} numberOfLines={2}>
                    {item.routine.exercises.map((e) => e.exerciseName).join(' · ') || '운동 없음'}
                  </Text>
                  <Text style={styles.count}>{item.routine.exercises.length}개 운동</Text>
                </>
              ) : null}
              {tab === 'received' && item.status === 'PENDING' ? (
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.declineBtn]}
                    disabled={respondingId === item.id}
                    onPress={() => onDecline(item)}
                  >
                    <Text style={styles.declineBtnText}>거절</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.acceptBtn]}
                    disabled={respondingId === item.id}
                    onPress={() => onAccept(item)}
                  >
                    <Text style={styles.acceptBtnText}>
                      {respondingId === item.id ? '담는 중…' : '수락하고 담기'}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            loadError ? (
              <EmptyState
                error
                onRetry={load}
                title="선물함을 불러오지 못했어요"
                description="네트워크 상태를 확인하고 다시 시도해주세요."
              />
            ) : (
              <EmptyState
                icon="gift-outline"
                title={tab === 'received' ? '받은 선물이 없어요' : '보낸 선물이 없어요'}
                description={
                  tab === 'received'
                    ? '애인이 루틴을 선물하면 여기에 나타나요.'
                    : '내 루틴 목록에서 애인에게 루틴을 선물해보세요.'
                }
              />
            )
          ) : null
        }
      />
    </SafeAreaView>
  );
}

function statusBadgeStyle(status: RoutineGift['status']) {
  if (status === 'ACCEPTED') return { backgroundColor: colors.successBg };
  if (status === 'DECLINED') return { backgroundColor: colors.surfaceAlt };
  return { backgroundColor: colors.primaryBg };
}

function statusTextStyle(status: RoutineGift['status']) {
  if (status === 'ACCEPTED') return { color: colors.success };
  if (status === 'DECLINED') return { color: colors.textTertiary };
  return { color: colors.primary };
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    padding: 4,
  },
  tabBtn: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.pill, alignItems: 'center' },
  tabBtnActive: { backgroundColor: colors.surface },
  tabText: { fontSize: fontSize.body, fontWeight: '700', color: colors.textSecondary },
  tabTextActive: { color: colors.primary },
  list: { padding: spacing.lg, paddingBottom: 40 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  title: { flex: 1, fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary },
  statusBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill },
  statusText: { fontSize: 10, fontWeight: '800' },
  subline: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: spacing.xs },
  message: {
    fontSize: fontSize.caption,
    color: colors.textPrimary,
    marginTop: spacing.xs,
    fontStyle: 'italic',
  },
  summary: { fontSize: fontSize.caption, color: colors.textPrimary, marginTop: spacing.xs, lineHeight: 18 },
  count: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 2 },
  actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  actionBtn: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.pill, alignItems: 'center' },
  declineBtn: { backgroundColor: colors.surfaceAlt },
  declineBtnText: { fontSize: fontSize.caption, fontWeight: '800', color: colors.textSecondary },
  acceptBtn: { backgroundColor: colors.primary },
  acceptBtnText: { fontSize: fontSize.caption, fontWeight: '800', color: colors.white },
}));
