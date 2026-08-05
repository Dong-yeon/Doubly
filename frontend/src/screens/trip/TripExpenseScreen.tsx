/** 여행 경비 정산 — 합계·정산(누가 누구에게)·항목 목록 + 추가/수정 */
import React, { useCallback, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Alert } from '../../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { PlaceStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { TripSectionTabs } from './TripSectionTabs';
import { tripApi } from '../../api/trip';
import { useAuthStore } from '../../store/authStore';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { formatMoney } from '../../utils/format';
import { haptics } from '../../utils/haptics';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { TripExpense, TripExpenses } from '../../types';

type Props = NativeStackScreenProps<PlaceStackParamList, 'TripExpense'>;

const CATEGORIES = ['식비', '교통', '숙박', '쇼핑', '관광', '기타'];

/*
 * 천단위 구분은 공용 유틸(utils/format)로 옮겼다 — 이 화면에만 로컬 함수가 있어서
 * 칼로리 등 다른 숫자는 구분 없이 표기되고 있었다.
 */
const money = formatMoney;

interface ExpenseForm {
  amount: string;
  paidByPartner: boolean;
  category: string | null;
  memo: string;
}

export function TripExpenseScreen({ route }: Props) {
  const { tripId, title } = route.params;
  const myId = useAuthStore((s) => s.user?.id);
  const [data, setData] = useState<TripExpenses | null>(null);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TripExpense | null>(null);
  const [form, setForm] = useState<ExpenseForm>({
    amount: '',
    paidByPartner: false,
    category: '식비',
    memo: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await tripApi.expenses(tripId));
    } catch (e) {
      toast.error(getErrorMessage(e, '경비를 불러오지 못했어요.'));
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const partnerName = data?.partnerName ?? '상대';

  const openAdd = () => {
    setEditing(null);
    setForm({ amount: '', paidByPartner: false, category: '식비', memo: '' });
    setModalOpen(true);
  };

  const openEdit = (e: TripExpense) => {
    setEditing(e);
    setForm({
      amount: String(e.amount),
      paidByPartner: !e.mine,
      category: e.category ?? null,
      memo: e.memo ?? '',
    });
    setModalOpen(true);
  };

  const save = async () => {
    const amount = Number(form.amount.replace(/,/g, '').trim());
    if (!amount || amount <= 0) {
      toast.error('금액을 올바르게 입력해주세요.');
      return;
    }
    const paidBy = form.paidByPartner ? data?.partnerId ?? null : myId ?? null;
    const payload = {
      amount,
      paidBy,
      category: form.category,
      memo: form.memo.trim() || null,
    };
    try {
      if (editing) {
        await tripApi.updateExpense(tripId, editing.id, payload);
        toast.success('경비를 수정했어요.');
      } else {
        await tripApi.addExpense(tripId, payload);
        toast.success('경비를 추가했어요.');
      }
      haptics.light();
      setModalOpen(false);
      load();
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e));
    }
  };

  const remove = (e: TripExpense) => {
    Alert.alert('경비 삭제', `"${money(e.amount)}"${e.memo ? ` (${e.memo})` : ''} 경비를 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await tripApi.removeExpense(tripId, e.id);
            haptics.light();
            toast.success('경비를 삭제했어요.');
            load();
          } catch (err) {
            Alert.alert('오류', getErrorMessage(err));
          }
        },
      },
    ]);
  };

  const settlementLine = () => {
    if (!data) return '';
    const { direction, amount } = data.settlement;
    if (direction === 'SETTLED') return '정산 완료 — 딱 반반이에요';
    if (direction === 'PARTNER_OWES_ME') return `${partnerName}님이 나에게 ${money(amount)} 줄 차례예요`;
    return `내가 ${partnerName}님에게 ${money(amount)} 줄 차례예요`;
  };

  const settled = data?.settlement.direction === 'SETTLED';

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* 형제 화면(준비물·앨범·회고)으로 바로 이동 — 여행 상세를 거치지 않는다 */}
      <TripSectionTabs tripId={tripId} title={title} />
      <FlatList
        data={data?.expenses ?? []}
        keyExtractor={(e) => String(e.id)}
        contentContainerStyle={styles.list}
        refreshing={loading}
        onRefresh={load}
        ListHeaderComponent={
          data ? (
            <View style={styles.summary}>
              <Text style={styles.totalLabel}>우리 여행 총 지출</Text>
              <Text style={styles.totalValue}>{money(data.total)}</Text>

              <View style={[styles.settleBanner, settled ? styles.settleDone : styles.settleOwe]}>
                <Text style={[styles.settleText, settled ? styles.settleTextDone : styles.settleTextOwe]}>
                  {settlementLine()}
                </Text>
              </View>

              <View style={styles.breakdown}>
                <View style={styles.breakCol}>
                  <Text style={styles.breakName}>내가 낸 돈</Text>
                  <Text style={styles.breakValue}>{money(data.myPaid)}</Text>
                </View>
                <View style={styles.breakDivider} />
                <View style={styles.breakCol}>
                  <Text style={styles.breakName}>{partnerName}</Text>
                  <Text style={styles.breakValue}>{money(data.partnerPaid)}</Text>
                </View>
              </View>

              <Text style={styles.sectionTitle}>지출 내역 ({data.expenses.length})</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            activeOpacity={0.7}
            onPress={() => openEdit(item)}
            onLongPress={() => remove(item)}
          >
            <View style={styles.rowLeft}>
              <View style={styles.rowTitleLine}>
                {item.category ? (
                  <View style={styles.catChip}>
                    <Text style={styles.catChipText}>{item.category}</Text>
                  </View>
                ) : null}
                <Text style={styles.rowMemo} numberOfLines={1}>
                  {item.memo || item.category || '지출'}
                </Text>
              </View>
              <Text style={styles.rowPayer}>
                {item.mine ? '내가' : `${item.paidByName}님이`} 결제
                {item.dayNo ? ` · ${item.dayNo}일차` : ''}
              </Text>
            </View>
            <Text style={styles.rowAmount}>{money(item.amount)}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.empty}>
              아직 지출이 없어요. 아래 버튼으로 경비를 추가해보세요! (항목을 길게 눌러 삭제)
            </Text>
          ) : null
        }
      />

      <View style={styles.fabWrap}>
        <Button title="＋ 경비 추가" onPress={openAdd} />
      </View>

      {/* 추가/수정 모달 */}
      <Modal visible={modalOpen} transparent animationType="slide" onRequestClose={() => setModalOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setModalOpen(false)}>
          {/* onPress 로 탭을 흡수한다 — 없으면 시트 빈 곳 터치가 배경으로 새어나가 닫힌다 */}
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>{editing ? '경비 수정' : '경비 추가'}</Text>

            <Text style={styles.fieldLabel}>금액 (원)</Text>
            <TextInput
              style={styles.input}
              placeholder="예: 30000"
              placeholderTextColor={colors.textTertiary}
              value={form.amount}
              onChangeText={(t) => setForm((f) => ({ ...f, amount: t.replace(/[^0-9]/g, '') }))}
              keyboardType="number-pad"
              maxLength={12}
            />
            {/*
              입력창은 숫자만 담고(커서 위치가 튀지 않게), 읽기용 콤마는 아래에 보조로 보여준다.
              1250000 을 콤마 없이 읽으며 자릿수를 세야 했던 문제를 이 한 줄이 없앤다.
            */}
            {form.amount ? (
              <Text style={styles.amountPreview}>{formatMoney(Number(form.amount))}</Text>
            ) : null}

            <Text style={styles.fieldLabel}>누가 냈나요</Text>
            <View style={styles.payerRow}>
              <TouchableOpacity
                style={[styles.payerBtn, !form.paidByPartner && styles.payerBtnOn]}
                onPress={() => setForm((f) => ({ ...f, paidByPartner: false }))}
              >
                <Text style={[styles.payerText, !form.paidByPartner && styles.payerTextOn]}>나</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.payerBtn, form.paidByPartner && styles.payerBtnOn]}
                onPress={() => setForm((f) => ({ ...f, paidByPartner: true }))}
              >
                <Text style={[styles.payerText, form.paidByPartner && styles.payerTextOn]}>{partnerName}</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>종류</Text>
            <View style={styles.catRow}>
              {CATEGORIES.map((c) => {
                const on = form.category === c;
                return (
                  <TouchableOpacity
                    key={c}
                    style={[styles.catSelect, on && styles.catSelectOn]}
                    onPress={() => setForm((f) => ({ ...f, category: on ? null : c }))}
                  >
                    <Text style={[styles.catSelectText, on && styles.payerTextOn]}>{c}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>메모 (선택)</Text>
            <TextInput
              style={styles.input}
              placeholder="예: 흑돼지 저녁"
              placeholderTextColor={colors.textTertiary}
              value={form.memo}
              onChangeText={(t) => setForm((f) => ({ ...f, memo: t }))}
              maxLength={200}
            />

            <View style={styles.sheetActions}>
              <Button title="취소" variant="ghost" size="md" onPress={() => setModalOpen(false)} />
              <Button title={editing ? '수정' : '추가'} size="md" onPress={save} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, paddingBottom: 120 },

  summary: { marginBottom: spacing.md },
  totalLabel: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700' },
  totalValue: { fontSize: fontSize.display, color: colors.textPrimary, fontWeight: '800', marginTop: 2 },

  settleBanner: { marginTop: spacing.md, padding: spacing.md, borderRadius: radius.lg },
  settleDone: { backgroundColor: colors.successBg },
  settleOwe: { backgroundColor: colors.accentSoft },
  settleText: { fontSize: fontSize.body, fontWeight: '800', textAlign: 'center' },
  settleTextDone: { color: colors.success },
  settleTextOwe: { color: colors.accent },

  breakdown: {
    flexDirection: 'row',
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
  },
  breakCol: { flex: 1, alignItems: 'center' },
  breakDivider: { width: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  breakName: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700' },
  breakValue: { fontSize: fontSize.subtitle, color: colors.textPrimary, fontWeight: '800', marginTop: 4 },

  sectionTitle: { fontSize: fontSize.subtitle, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.lg },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  rowLeft: { flex: 1, paddingRight: spacing.md },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  catChip: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.primaryBg },
  catChipText: { fontSize: 11, color: colors.primary, fontWeight: '700' },
  rowMemo: { flexShrink: 1, fontSize: fontSize.body, fontWeight: '700', color: colors.textPrimary },
  rowPayer: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: spacing.xs },
  rowAmount: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },

  empty: { fontSize: fontSize.caption, color: colors.textSecondary, textAlign: 'center', paddingVertical: spacing.xl, lineHeight: 20 },

  fabWrap: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: spacing.xl },
  sheet: { backgroundColor: colors.surfaceCard, borderRadius: radius.xl, padding: spacing.lg, maxHeight: '85%' },
  sheetTitle: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.md },
  sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.lg },

  fieldLabel: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700', marginBottom: spacing.xs, marginTop: spacing.sm },
  /* 입력 중 자릿수 확인용 보조 표시 */
  amountPreview: {
    fontSize: fontSize.body,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: spacing.xs,
    textAlign: 'right',
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.body,
    color: colors.textPrimary,
  },
  payerRow: { flexDirection: 'row', gap: spacing.sm },
  payerBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  payerBtnOn: { backgroundColor: colors.secondary, borderColor: colors.secondary },
  payerText: { fontSize: fontSize.body, fontWeight: '800', color: colors.textSecondary },
  payerTextOn: { color: '#fff' },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  catSelect: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  catSelectOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  catSelectText: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textSecondary },
});
