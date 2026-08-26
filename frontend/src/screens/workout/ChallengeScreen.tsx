/** 커플 대결 — 기간 내 운동/식단 기록일로 겨루기. 진행바 + 승자 배지. */
import React, { useCallback, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { WorkoutStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { DateField } from '../../components/DateField';
import { EmptyState } from '../../components/EmptyState';
import { challengeApi } from '../../api/challenge';
import { getErrorMessage } from '../../utils/error';
import { toDateString } from '../../utils/date';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { confirmDiscard } from '../../utils/discardGuard';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { Challenge, ChallengeType } from '../../types';
import { themedStyles } from '../../theme/themedStyles';
import { layout } from '../../theme/layout';
import { useDeleteAction } from '../../hooks/useDeleteAction';

type Props = NativeStackScreenProps<WorkoutStackParamList, 'Challenge'>;


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

/**
 * 강조할 쪽 — 확정된 결과가 있으면 그것을, 없으면 지금 우세를 따른다.
 * 발표된 승패와 막대 강조가 어긋나면 어느 쪽을 믿어야 할지 알 수 없다.
 */
function winnerSide(c: Challenge): 'ME' | 'PARTNER' | 'TIE' {
  return c.result ?? c.leader;
}

function resultLabel(c: Challenge): string {
  if (c.result === 'TIE') return '무승부 🤝';
  if (c.result === 'ME') return '내가 이겼어요! 🏆';
  return `${c.partnerName ?? '상대'}님이 이겼어요`;
}

export function ChallengeScreen(_: Props) {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(false);
  // 로드 실패를 "대결이 없어요"로 위장하지 않는다 (QA_CHECKLIST.md 전역 반복 패턴 1)
  const [loadError, setLoadError] = useState(false);
  // 삭제 in-flight 가드 — 공용 훅으로 중복 DELETE 방지 + 해당 카드 흐리게 (QA_CHECKLIST.md 전역 반복 패턴 7)
  const { deletingId, runDelete } = useDeleteAction<number>();

  const [addOpen, setAddOpen] = useState(false);
  const [type, setType] = useState<ChallengeType>('WORKOUT');
  const [title, setTitle] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [stake, setStake] = useState('');
  const [saving, setSaving] = useState(false);

  /*
   * 모달을 연 시점의 폼 스냅샷 — openAdd 가 제목·기간을 미리 채우므로
   * "비어있지 않음"으로는 사용자가 고쳤는지 알 수 없다. 달라졌을 때만 확인한다.
   */
  const addInitialRef = useRef('');
  const closeAddModal = () =>
    confirmDiscard(
      [type, title, start, end, stake].join('|') !== addInitialRef.current,
      () => setAddOpen(false),
    );

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      setChallenges(await challengeApi.list());
    } catch (e) {
      toast.error(getErrorMessage(e, '대결을 불러오지 못했어요.'));
      setLoadError(true);
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
    addInitialRef.current = ['WORKOUT', '이번 주 대결', w.start, w.end, ''].join('|');
    setAddOpen(true);
  };

  /** 시작일을 종료일 뒤로 옮기면 종료일이 뒤집힌다 — 함께 밀어준다 */
  const onChangeStart = (value: string) => {
    setStart(value);
    if (end && end < value) setEnd(value);
  };

  const onCreate = async () => {
    if (!title.trim()) return toast.error('제목을 입력해주세요.');
    if (!start || !end) return toast.error('대결 기간을 선택해주세요.');
    setSaving(true);
    try {
      await challengeApi.create({ type, title: title.trim(), startDate: start, endDate: end, stake: stake.trim() || undefined });
      haptics.success();
      toast.success('대결을 시작했어요! ');
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
        onPress: () =>
          runDelete(c.id, async () => {
            await challengeApi.remove(c.id);
            haptics.light();
            load();
          }),
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
        {count}일{leading ? ' ' : ''}
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
            // 탭에 연결된 동작이 없다 — 상세 화면이 따로 없으므로 activeOpacity 를
            // 1로 두어 눌러도 눌린 것처럼 보이지 않게 한다(길게 누르면 삭제는 그대로 동작).
            // 삭제 중인 카드는 흐리게 + disabled (QA_CHECKLIST.md 전역 반복 패턴 7)
            <TouchableOpacity
              style={[styles.card, deletingId === item.id && styles.cardDeleting]}
              activeOpacity={1}
              disabled={deletingId === item.id}
              onLongPress={() => onDelete(item)}
              accessibilityHint="길게 눌러 삭제"
            >
              <View style={styles.cardHeader}>
                <Text style={styles.title}>{item.title}</Text>
                <View style={[styles.statusChip, item.ended && styles.statusEnded]}>
                  <Text style={[styles.statusText, item.ended && styles.statusEndedText]}>
                    {/* 끝났지만 아직 아침 판정 전이면 "집계 중" — 종료라고만 하면
                        결과가 왜 안 보이는지 알 수 없다 */}
                    {!item.ended ? '진행 중' : item.settled ? '종료' : '집계 중'}
                  </Text>
                </View>
              </View>
              <Text style={styles.meta}>
                {item.typeLabel} 대결 · {item.startDate} ~ {item.endDate}
              </Text>
              {renderBar(true, item.myCount, max, winnerSide(item) === 'ME')}
              {renderBar(false, item.partnerCount, max, winnerSide(item) === 'PARTNER')}
              {/* 확정된 결과가 있으면 그걸 보여준다 — 진행 중이면 지금 우세만 */}
              {item.result ? (
                <Text style={[styles.tie, styles.resultText]}>{resultLabel(item)}</Text>
              ) : item.leader === 'TIE' ? (
                <Text style={styles.tie}>현재 동점! </Text>
              ) : null}
              {item.stake ? <Text style={styles.stake}>{item.stake}</Text> : null}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            loadError ? (
              <EmptyState
                icon="cloud-off-outline"
                title="대결을 불러오지 못했어요"
                description="네트워크 상태를 확인하고 다시 시도해주세요."
                error
                onRetry={load}
              />
            ) : (
              <EmptyState
                icon="trophy-outline"
                title="커플 대결을 시작해보세요"
                description="이번 주 누가 더 많이 운동/식단을 기록하는지 겨뤄봐요. 벌칙도 걸 수 있어요!"
              />
            )
          ) : null
        }
      />
      <View style={styles.fabWrap}>
        <Button title="＋ 대결 만들기" onPress={openAdd} />
      </View>

      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={closeAddModal}>
        <Pressable style={styles.backdrop} onPress={closeAddModal}>
          {/* 키보드가 "대결 시작" 버튼을 가리지 않도록 카드째로 밀어올린다 */}
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <Pressable style={styles.modalCard} onPress={() => {}}>
              <Text style={styles.modalTitle}>커플 대결 만들기</Text>
              <View style={styles.typeRow}>
                {(['WORKOUT', 'MEAL'] as ChallengeType[]).map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.typeChip, type === t && styles.typeChipActive]}
                    onPress={() => setType(t)}
                    accessibilityState={{ selected: type === t }}
                  >
                    <Text style={[styles.typeText, type === t && styles.typeTextActive]}>
                      {t === 'WORKOUT' ? '운동' : '식단'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextField label="제목" value={title} onChangeText={setTitle} maxLength={100} />
              <View style={styles.formRow}>
                <View style={styles.flex}>
                  <DateField label="시작일" value={start} onChange={onChangeStart} max={end || undefined} />
                </View>
                <View style={styles.flex}>
                  {/* 시작일보다 앞선 날은 아예 못 고르게 한다 */}
                  <DateField label="종료일" value={end} onChange={setEnd} min={start || undefined} />
                </View>
              </View>
              <TextField label="벌칙/보상 (선택)" value={stake} onChangeText={setStake} placeholder="예: 진 사람이 저녁 쏘기" />
              <Button title="대결 시작" onPress={onCreate} loading={saving} style={styles.modalBtn} />
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, paddingBottom: layout.listBottomWithFab },
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
  meta: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: spacing.xxs, marginBottom: spacing.sm },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  barLabel: { width: 28, fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700' },
  barTrack: { flex: 1, height: 14, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: radius.pill },
  barMine: { backgroundColor: colors.me },
  barPartner: { backgroundColor: colors.partner },
  barCount: { width: 56, textAlign: 'right', fontSize: fontSize.caption, color: colors.textPrimary, fontWeight: '700' },
  barCountLead: { color: colors.together, fontWeight: '800' },
  tie: { fontSize: fontSize.caption, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm, fontWeight: '700' },
  resultText: { fontSize: fontSize.body, color: colors.textPrimary, fontWeight: '800' },
  stake: { fontSize: fontSize.caption, color: colors.togetherText, fontWeight: '700', marginTop: spacing.sm },
  // 삭제 진행 중인 카드 흐리게 (QA_CHECKLIST.md 전역 반복 패턴 7)
  cardDeleting: { opacity: 0.4 },
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
}));
