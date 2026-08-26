/** 여행 준비물 체크리스트 — 진행률 + 인라인 추가 + 체크 토글 + 이름수정/삭제 */
import React, { useCallback, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
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
import type { HomeStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { TripSectionTabs } from './TripSectionTabs';
import { Sheet } from '../../components/Sheet';
import { confirmDiscard } from '../../utils/discardGuard';
import { useDeleteAction } from '../../hooks/useDeleteAction';
import { tripApi } from '../../api/trip';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { Checklist, ChecklistItem } from '../../types';
import { themedStyles } from '../../theme/themedStyles';
import { onColor } from '../../theme/onColor';

type Props = NativeStackScreenProps<HomeStackParamList, 'TripChecklist'>;

export function TripChecklistScreen({ route }: Props) {
  const { tripId, title } = route.params;
  const [data, setData] = useState<Checklist | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [newText, setNewText] = useState('');
  const [adding, setAdding] = useState(false);
  const { deletingId, runDelete } = useDeleteAction<number>();

  // 이름 수정 모달
  const [renameItem, setRenameItem] = useState<ChecklistItem | null>(null);
  const [renameText, setRenameText] = useState('');
  // adding(추가 전용)과 분리 — 수정 버튼만의 저장 중 상태 (QA_CHECKLIST.md 패턴 6)
  const [renaming, setRenaming] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      setData(await tripApi.checklist(tripId));
    } catch (e) {
      toast.error(getErrorMessage(e, '준비물을 불러오지 못했어요.'));
      // 실패해도 데이터는 비우지 않는다 — "진짜 빈 목록"과 구분은 loadError 로 한다
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const add = async () => {
    const content = newText.trim();
    if (!content || adding) return;
    setAdding(true);
    try {
      await tripApi.addChecklistItem(tripId, content);
      setNewText('');
      haptics.light();
      load();
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e));
    } finally {
      setAdding(false);
    }
  };

  // 체크 토글 — 낙관적 반영 후 서버 호출
  const toggle = async (item: ChecklistItem) => {
    haptics.light();
    setData((d) =>
      d
        ? {
            ...d,
            checkedCount: d.checkedCount + (item.checked ? -1 : 1),
            items: d.items.map((x) => (x.id === item.id ? { ...x, checked: !x.checked } : x)),
          }
        : d,
    );
    try {
      await tripApi.toggleChecklistItem(tripId, item.id);
      load();
    } catch (e) {
      toast.error(getErrorMessage(e, '체크에 실패했어요.'));
      load();
    }
  };

  const onLongPress = (item: ChecklistItem) => {
    Alert.alert(item.content, undefined, [
      {
        text: '이름 수정',
        onPress: () => {
          setRenameItem(item);
          setRenameText(item.content);
        },
      },
      { text: '삭제', style: 'destructive', onPress: () => remove(item) },
      { text: '취소', style: 'cancel' },
    ]);
  };

  const saveRename = async () => {
    if (!renameItem) return;
    const content = renameText.trim();
    if (!content) {
      toast.error('준비물 이름을 입력해주세요.');
      return;
    }
    // 저장 중 in-flight 가드 — 느린 네트워크에서 수정 버튼 연타 방지 (QA_CHECKLIST.md 패턴 6)
    setRenaming(true);
    try {
      await tripApi.renameChecklistItem(tripId, renameItem.id, content);
      setRenameItem(null);
      haptics.light();
      load();
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e));
    } finally {
      setRenaming(false);
    }
  };

  // 삭제 in-flight 가드 — useDeleteAction 이 중복 DELETE 를 막고 실패 시 토스트를 띄운다
  // (QA_CHECKLIST.md 패턴 7)
  const remove = (item: ChecklistItem) => {
    Alert.alert('준비물 삭제', `"${item.content}"을(를) 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () =>
          runDelete(item.id, async () => {
            await tripApi.removeChecklistItem(tripId, item.id);
            haptics.light();
            load();
          }),
      },
    ]);
  };

  const total = data?.total ?? 0;
  const checked = data?.checkedCount ?? 0;
  const pct = total > 0 ? Math.round((checked / total) * 100) : 0;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* 형제 화면(경비·앨범·회고)으로 바로 이동 — 여행 상세를 거치지 않는다 */}
      <TripSectionTabs tripId={tripId} title={title} />
      <FlatList
        data={data?.items ?? []}
        keyExtractor={(i) => String(i.id)}
        contentContainerStyle={styles.list}
        refreshing={loading}
        onRefresh={load}
        ListHeaderComponent={
          <View>
            {/* 진행률 */}
            <View style={styles.progressCard}>
              <View style={styles.progressTop}>
                <Text style={styles.progressLabel}>챙긴 준비물</Text>
                <Text style={styles.progressCount}>
                  {checked} / {total}
                </Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${pct}%` }]} />
              </View>
              {total > 0 && checked === total ? (
                <Text style={styles.progressDone}>모두 챙겼어요!</Text>
              ) : null}
            </View>

            {/* 인라인 추가 */}
            <View style={styles.addRow}>
              <TextInput
                style={styles.addInput}
                placeholder="준비물 추가 (예: 여권, 충전기)"
                placeholderTextColor={colors.textTertiary}
                value={newText}
                onChangeText={setNewText}
                onSubmitEditing={add}
                returnKeyType="done"
                maxLength={200}
              />
              <Button title="추가" size="md" onPress={add} disabled={!newText.trim() || adding} />
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.row, deletingId === item.id && styles.rowDeleting]}
            activeOpacity={0.7}
            disabled={deletingId === item.id}
            onPress={() => toggle(item)}
            onLongPress={() => onLongPress(item)}
          >
            <View style={[styles.checkbox, item.checked && styles.checkboxOn]}>
              {item.checked ? <Text style={styles.checkMark}>✓</Text> : null}
            </View>
            <View style={styles.rowBody}>
              <Text style={[styles.rowText, item.checked && styles.rowTextChecked]}>{item.content}</Text>
              {item.checked && item.checkedByName ? (
                <Text style={styles.rowBy}>{item.checkedByName}님이 챙김</Text>
              ) : null}
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          !loading ? (
            loadError ? (
              <EmptyState
                icon="cloud-off-outline"
                title="준비물을 불러오지 못했어요"
                description="네트워크 상태를 확인하고 다시 시도해주세요."
                error
                onRetry={load}
              />
            ) : (
              <EmptyState
                icon="clipboard-text-outline"
                title="아직 준비물이 없어요"
                description="위에서 함께 챙길 것을 추가해보세요! (항목을 길게 눌러 수정·삭제)"
              />
            )
          ) : null
        }
      />

      {/* 이름 수정 모달 — 입력 중이면 백드롭 탭에 확인을 건다 */}
      <Sheet
        visible={renameItem != null}
        onClose={() =>
          confirmDiscard(renameText.trim() !== (renameItem?.content ?? ''), () => setRenameItem(null))
        }
      >
        {/*
          Sheet 자체는 KeyboardAvoidingView 를 갖지 않는다 — 화면 중앙 카드라 키보드가
          뜨면 "수정" 버튼이 가려졌다. Sheet.tsx 는 여러 화면이 공유하는 껍데기라 건드리지
          않고, 이 화면의 사용부에서만 감싼다 (QA_CHECKLIST.md 패턴 4).
        */}
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Text style={styles.sheetTitle}>준비물 이름 수정</Text>
          <TextInput
            style={styles.addInput}
            value={renameText}
            onChangeText={setRenameText}
            placeholder="준비물 이름"
            placeholderTextColor={colors.textTertiary}
            maxLength={200}
            autoFocus
          />
          <View style={styles.sheetActions}>
            <Button title="취소" variant="ghost" size="md" onPress={() => setRenameItem(null)} />
            <Button title="수정" size="md" onPress={saveRename} loading={renaming} />
          </View>
        </KeyboardAvoidingView>
      </Sheet>
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, paddingBottom: spacing.xxl },

  progressCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  progressTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressLabel: { fontSize: fontSize.body, fontWeight: '700', color: colors.textSecondary },
  progressCount: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  progressTrack: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  progressFill: { height: 8, borderRadius: radius.pill, backgroundColor: colors.success },
  progressDone: { fontSize: fontSize.caption, color: colors.success, fontWeight: '800', marginTop: spacing.sm },

  addRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md, marginBottom: spacing.sm },
  addInput: {
    flex: 1,
    // 웹 필수 — <input> 내재 최소 폭 탓에 flex:1 이어도 안 줄어든다
    // (WorkoutSessionScreen.setInput 과 같은 문제). 네이티브에는 영향 없다.
    minWidth: 0,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.body,
    color: colors.textPrimary,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  checkboxOn: { backgroundColor: colors.success, borderColor: colors.success },
  // 다크의 success(#3FBF80, L=0.399)는 흰 글자가 2.34:1 이었다 — ink 면 7.27:1
  checkMark: { color: onColor(colors.success), fontSize: 14, fontWeight: '900', lineHeight: 18 },
  rowBody: { flex: 1 },
  rowText: { fontSize: fontSize.body, fontWeight: '700', color: colors.textPrimary },
  rowTextChecked: { color: colors.textTertiary, textDecorationLine: 'line-through' },
  rowBy: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 2 },
  // 삭제 진행 중 표시 — useDeleteAction (QA_CHECKLIST.md 패턴 7)
  rowDeleting: { opacity: 0.5 },

  empty: { fontSize: fontSize.caption, color: colors.textSecondary, textAlign: 'center', paddingVertical: spacing.xl, lineHeight: 20 },

  /* 배경·모서리·패딩은 Sheet 가 담당한다 */
  sheetTitle: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.md },
  sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.md },
}));
