/** 커플 대결 — 기간 내 운동/식단 기록일로 겨루기. 진행바 + 승자 배지. */
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { WorkoutStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { EmptyState } from '../../components/EmptyState';
import { challengeApi } from '../../api/challenge';
import { getErrorMessage } from '../../utils/error';
import { toDateString } from '../../utils/date';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { Challenge, ChallengeType } from '../../types';

type Props = NativeStackScreenProps<WorkoutStackParamList, 'Challenge'>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 이번 주 월~일 */
function thisWeek(): { start: string; end: string } {
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // 월=0
  const mon = new Date(now);
  mon.setDate(now.getDate() - day);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return { start: toDateString(mon), end: toDateString(sun) };
}

export function ChallengeScreen(_: Props) {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [type, setType] = useState<ChallengeType>('WORKOUT');
  const [title, setTitle] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [stake, setStake] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setChallenges(await challengeApi.list());
    } catch (e) {
      toast.error(getErrorMessage(e, '대결을 불러오지 못했어요.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openAdd = () => {
    const w = thisWeek();
    setType('WORKOUT');
    setTitle('이번 주 대결');
    setStart(w.start);
    setEnd(w.end);
    setStake('');
    setAddOpen(true);
  };

  const onCreate = async () => {
    if (!title.trim()) return toast.error('제목을 입력해주세요.');
    if (!DATE_RE.test(start) || !DATE_RE.test(end)) return toast.error('날짜는 YYYY-MM-DD 형식이어야 해요.');
    if (end < start) return toast.error('종료일은 시작일 이후여야 해요.');
    setSaving(true);
    try {
      await challengeApi.create({ type, title: title.trim(), startDate: start, endDate: end, stake: stake.trim() || undefined });
      haptics.success();
      toast.success('대결을 시작했어요! 🏆');
      setAddOpen(false);
      load();
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = (c: Challenge) => {
    Alert.alert('대결 삭제', `"${c.title}"을(를) 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await challengeApi.remove(c.id);
            haptics.light();
            load();
          } catch (e) {
            toast.error(getErrorMessage(e));
          }
        },
      },
    ]);
  };

  const renderBar = (mine: boolean, count: number, max: number, leading: boolean) => (
    <View style={styles.barRow}>
      <Text style={styles.barLabel}>{mine ? '나' : '상대'}</Text>
      <View style={styles.barTrack}>
        <View
          style={[
            styles.barFill,
            { width: `${max > 0 ? (count / max) * 100 : 0}%` },
            mine ? styles.barMine : styles.barPartner,
          ]}
        />
      </View>
      <Text style={[styles.barCount, leading && styles.barCountLead]}>
        {count}일{leading ? ' 👑' : ''}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={challenges}
        keyExtractor={(c) => String(c.id)}
        contentContainerStyle={styles.list}
        refreshing={loading}
        onRefresh={load}
        renderItem={({ item }) => {
          const max = Math.max(item.myCount, item.partnerCount, 1);
          return (
            <TouchableOpacity style={styles.card} activeOpacity={0.9} onLongPress={() => onDelete(item)}>
              <View style={styles.cardHeader}>
                <Text style={styles.title}>{item.title}</Text>
                <View style={[styles.statusChip, item.ended && styles.statusEnded]}>
                  <Text style={[styles.statusText, item.ended && styles.statusEndedText]}>
                    {item.ended ? '종료' : '진행 중'}
                  </Text>
                </View>
              </View>
              <Text style={styles.meta}>
                {item.typeLabel} 대결 · {item.startDate} ~ {item.endDate}
              </Text>
              {renderBar(true, item.myCount, max, item.leader === 'ME')}
              {renderBar(false, item.partnerCount, max, item.leader === 'PARTNER')}
              {item.leader === 'TIE' ? <Text style={styles.tie}>현재 동점! 🤝</Text> : null}
              {item.stake ? <Text style={styles.stake}>🎁 {item.stake}</Text> : null}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              emoji="🏆"
              title="커플 대결을 시작해보세요"
              description="이번 주 누가 더 많이 운동/식단을 기록하는지 겨뤄봐요. 벌칙도 걸 수 있어요!"
            />
          ) : null
        }
      />
      <View style={styles.fabWrap}>
        <Button title="＋ 대결 만들기" onPress={openAdd} />
      </View>

      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setAddOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>커플 대결 만들기</Text>
            <View style={styles.typeRow}>
              {(['WORKOUT', 'MEAL'] as ChallengeType[]).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.typeChip, type === t && styles.typeChipActive]}
                  onPress={() => setType(t)}
                >
                  <Text style={[styles.typeText, type === t && styles.typeTextActive]}>
                    {t === 'WORKOUT' ? '💪 운동' : '🍱 식단'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextField label="제목" value={title} onChangeText={setTitle} maxLength={100} />
            <View style={styles.formRow}>
              <View style={styles.flex}>
                <TextField label="시작일" value={start} onChangeText={setStart} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" maxLength={10} />
              </View>
              <View style={styles.flex}>
                <TextField label="종료일" value={end} onChangeText={setEnd} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" maxLength={10} />
              </View>
            </View>
            <TextField label="벌칙/보상 (선택)" value={stake} onChangeText={setStake} placeholder="예: 진 사람이 저녁 쏘기" />
            <Button title="대결 시작" onPress={onCreate} loading={saving} style={styles.modalBtn} />
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, paddingBottom: 100 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary, flex: 1 },
  statusChip: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.primaryBg },
  statusText: { fontSize: fontSize.caption, color: colors.primary, fontWeight: '800' },
  statusEnded: { backgroundColor: colors.surfaceAlt },
  statusEndedText: { color: colors.textSecondary },
  meta: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 2, marginBottom: spacing.sm },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  barLabel: { width: 28, fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700' },
  barTrack: { flex: 1, height: 14, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: radius.pill },
  barMine: { backgroundColor: colors.me },
  barPartner: { backgroundColor: colors.partner },
  barCount: { width: 56, textAlign: 'right', fontSize: fontSize.caption, color: colors.textPrimary, fontWeight: '700' },
  barCountLead: { color: colors.together, fontWeight: '800' },
  tie: { fontSize: fontSize.caption, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm, fontWeight: '700' },
  stake: { fontSize: fontSize.caption, color: colors.accent, fontWeight: '700', marginTop: spacing.sm },
  fabWrap: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: spacing.lg },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg },
  modalTitle: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.sm },
  typeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  typeChip: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  typeChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryBg },
  typeText: { fontSize: fontSize.body, color: colors.textSecondary, fontWeight: '700' },
  typeTextActive: { color: colors.primary },
  formRow: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  modalBtn: { marginTop: spacing.md },
});
