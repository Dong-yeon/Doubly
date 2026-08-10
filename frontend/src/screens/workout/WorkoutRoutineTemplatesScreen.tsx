/** ⑤ 검증된 분할 템플릿 — 루틴 짜기가 막막한 초보를 위한 시스템 제공 루틴.
 *  "복사해서 담기"로 내 루틴 목록에 그대로 가져간 뒤 자유롭게 편집해서 쓴다. */
import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
import type { WorkoutRoutine } from '../../types';

type Props = NativeStackScreenProps<WorkoutStackParamList, 'WorkoutRoutineTemplates'>;

export function WorkoutRoutineTemplatesScreen({ navigation }: Props) {
  const [templates, setTemplates] = useState<WorkoutRoutine[]>([]);
  const [loading, setLoading] = useState(false);
  const [copyingId, setCopyingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTemplates(await workoutApi.routineTemplates());
    } catch (e) {
      toast.error(getErrorMessage(e, '템플릿을 불러오지 못했어요.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onCopy = async (template: WorkoutRoutine) => {
    haptics.light();
    setCopyingId(template.id);
    try {
      await workoutApi.copyRoutine(template.id);
      haptics.success();
      toast.success(`"${template.title}"을(를) 내 루틴에 담았어요!`);
      navigation.goBack();
    } catch (e) {
      toast.error(getErrorMessage(e, '복사에 실패했어요.'));
    } finally {
      setCopyingId(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={templates}
        keyExtractor={(t) => String(t.id)}
        contentContainerStyle={styles.list}
        refreshing={loading}
        onRefresh={load}
        ListHeaderComponent={
          <Text style={styles.headerHint}>
            루틴 짜기가 막막하다면, 검증된 분할 템플릿을 담아 내 입맛에 맞게 편집해보세요.
          </Text>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.title}>{item.title}</Text>
              <TouchableOpacity
                style={styles.copyBtn}
                onPress={() => onCopy(item)}
                disabled={copyingId === item.id}
              >
                <Text style={styles.copyBtnText}>{copyingId === item.id ? '담는 중…' : '복사해서 담기'}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.summary} numberOfLines={2}>
              {item.exercises.map((e) => e.exerciseName).join(' · ') || '운동 없음'}
            </Text>
            <Text style={styles.count}>{item.exercises.length}개 운동</Text>
          </View>
        )}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="clipboard-text-outline"
              title="템플릿을 불러오지 못했어요"
              description="잠시 후 다시 시도해주세요."
            />
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, paddingBottom: 40 },
  headerHint: { fontSize: fontSize.caption, color: colors.textSecondary, marginBottom: spacing.md, lineHeight: 18 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { flex: 1, fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary },
  copyBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryBg,
  },
  copyBtnText: { fontSize: fontSize.caption, color: colors.primary, fontWeight: '800' },
  summary: { fontSize: fontSize.caption, color: colors.textPrimary, marginTop: spacing.xs, lineHeight: 18 },
  count: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: spacing.xs },
});
