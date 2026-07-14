/** 트레이너 대시보드 — 회원 현황 + 초대코드 (TRAINER-02) */
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { Avatar } from '../../components/Avatar';
import { EmptyState } from '../../components/EmptyState';
import { trainerApi, TrainerDashboard } from '../../api/trainer';
import { relationApi } from '../../api/relation';
import { getErrorMessage } from '../../utils/error';
import { copyText, shareText } from '../../utils/share';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { colors, fontSize, radius, spacing } from '../../constants/theme';

type Props = NativeStackScreenProps<HomeStackParamList, 'TrainerDashboard'>;

export function TrainerDashboardScreen({ navigation }: Props) {
  const [dashboard, setDashboard] = useState<TrainerDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [inviting, setInviting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDashboard(await trainerApi.dashboard());
    } catch (e) {
      toast.error(getErrorMessage(e, '대시보드를 불러오지 못했어요.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onInvite = async () => {
    setInviting(true);
    try {
      const invite = await relationApi.createTrainerInvite();
      haptics.success();
      Alert.alert('회원 초대코드 🎟️', `${invite.code}\n(24시간 동안 유효해요)`, [
        {
          text: '📋 복사',
          onPress: async () => {
            await copyText(invite.code);
            toast.success('초대코드를 복사했어요 📋');
          },
        },
        {
          text: '📤 공유',
          onPress: () => shareText(`Doubly에서 회원으로 연결해요! 초대코드: ${invite.code} (24시간 유효)`),
        },
        { text: '닫기', style: 'cancel' },
      ]);
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e));
    } finally {
      setInviting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={dashboard?.members ?? []}
        keyExtractor={(m) => String(m.member.id)}
        contentContainerStyle={styles.list}
        refreshing={loading}
        onRefresh={load}
        ListHeaderComponent={
          <View>
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{dashboard?.totalMembers ?? 0}</Text>
                <Text style={styles.statLabel}>총 회원</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{dashboard?.completedToday ?? 0}</Text>
                <Text style={styles.statLabel}>오늘 운동 완료</Text>
              </View>
            </View>
            <Button title="🎟️ 회원 초대코드 만들기" variant="secondary" onPress={onInvite} loading={inviting} />
            <Text style={styles.sectionTitle}>회원 목록</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.memberRow}
            activeOpacity={0.7}
            onPress={() =>
              navigation.navigate('TrainerMemberDetail', {
                memberId: item.member.id,
                name: item.member.name,
              })
            }
          >
            <Avatar name={item.member.name} imageUrl={item.member.profileImageUrl} size={44} />
            <View style={styles.memberInfo}>
              <Text style={styles.memberName}>{item.member.name}</Text>
              <Text style={styles.memberSub}>
                {item.lastWorkoutDate ? `마지막 운동 ${item.lastWorkoutDate}` : '아직 운동 기록이 없어요'}
              </Text>
            </View>
            <Text style={styles.todayBadge}>{item.todayCompleted ? '✅ 완료' : '💤 미완료'}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              emoji="🤝"
              title="아직 연결된 회원이 없어요"
              description="초대코드를 만들어 회원에게 공유해보세요!"
            />
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, paddingBottom: spacing.xl },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  statValue: { fontSize: fontSize.title, fontWeight: '800', color: colors.primary },
  statLabel: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 2 },
  sectionTitle: {
    fontSize: fontSize.subtitle,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  memberInfo: { flex: 1 },
  memberName: { fontSize: fontSize.body, fontWeight: '700', color: colors.textPrimary },
  memberSub: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 2 },
  todayBadge: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textPrimary },
});
