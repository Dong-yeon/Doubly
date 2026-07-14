/** 오늘의 질문 (커플 Q&A) — 둘 다 답하면 서로 공개. 지난 Q&A 히스토리. */
import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { questionApi } from '../../api/question';
import { getErrorMessage } from '../../utils/error';
import { relativeDateLabel } from '../../utils/date';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { DailyQuestion, QuestionHistory } from '../../types';

type Props = NativeStackScreenProps<HomeStackParamList, 'DailyQuestion'>;

export function DailyQuestionScreen(_: Props) {
  const [today, setToday] = useState<DailyQuestion | null>(null);
  const [history, setHistory] = useState<QuestionHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, h] = await Promise.all([questionApi.today(), questionApi.history()]);
      setToday(t);
      setHistory(h);
      if (t.myAnswer) setDraft(t.myAnswer);
    } catch (e) {
      toast.error(getErrorMessage(e, '질문을 불러오지 못했어요.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onSubmit = async () => {
    if (!draft.trim()) return toast.error('답을 입력해주세요.');
    setSaving(true);
    try {
      const updated = await questionApi.answer(draft.trim());
      setToday(updated);
      haptics.success();
      toast.success(updated.bothAnswered ? '서로의 답이 공개됐어요! 💞' : '답을 저장했어요. 상대의 답을 기다려요!');
      questionApi.history().then(setHistory).catch(() => undefined);
    } catch (e) {
      toast.error(getErrorMessage(e, '저장에 실패했어요.'));
    } finally {
      setSaving(false);
    }
  };

  const renderToday = () => {
    if (!today) return null;
    const answered = !!today.myAnswer;
    return (
      <View style={styles.todayCard}>
        <Text style={styles.todayLabel}>오늘의 질문</Text>
        <Text style={styles.question}>{today.question}</Text>

        {answered ? (
          <>
            <View style={styles.answerBox}>
              <Text style={styles.answerWho}>나</Text>
              <Text style={styles.answerText}>{today.myAnswer}</Text>
            </View>
            {today.bothAnswered && today.partnerAnswer ? (
              <View style={[styles.answerBox, styles.partnerBox]}>
                <Text style={styles.answerWho}>{today.partnerName ?? '상대'}</Text>
                <Text style={styles.answerText}>{today.partnerAnswer}</Text>
              </View>
            ) : (
              <Text style={styles.waiting}>💌 {today.partnerName ?? '상대'}님이 답하면 서로 볼 수 있어요.</Text>
            )}
          </>
        ) : (
          <>
            <TextField
              placeholder="오늘의 답을 적어보세요"
              value={draft}
              onChangeText={setDraft}
              multiline
            />
            <Button title="답 남기기" onPress={onSubmit} loading={saving} style={styles.submitBtn} />
            <Text style={styles.hint}>둘 다 답해야 서로의 답이 공개돼요.</Text>
          </>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={history}
        keyExtractor={(h) => h.questionDate}
        contentContainerStyle={styles.list}
        refreshing={loading}
        onRefresh={load}
        ListHeaderComponent={
          <View>
            {renderToday()}
            {history.length > 0 ? <Text style={styles.sectionTitle}>지난 질문</Text> : null}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.histCard}>
            <Text style={styles.histDate}>{relativeDateLabel(item.questionDate)}</Text>
            <Text style={styles.histQuestion}>{item.question}</Text>
            <Text style={styles.histAnswer}>나: {item.myAnswer}</Text>
            <Text style={styles.histAnswer}>상대: {item.partnerAnswer}</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, paddingBottom: spacing.xl },
  todayCard: {
    backgroundColor: colors.primaryBg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: spacing.lg,
  },
  todayLabel: { fontSize: fontSize.caption, color: colors.primary, fontWeight: '800' },
  question: { fontSize: fontSize.title, fontWeight: '800', color: colors.textPrimary, marginTop: spacing.xs, lineHeight: 28 },
  answerBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  partnerBox: { borderWidth: 1, borderColor: colors.accent },
  answerWho: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '800', marginBottom: 2 },
  answerText: { fontSize: fontSize.body, color: colors.textPrimary, lineHeight: 22 },
  waiting: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: spacing.md, fontWeight: '600' },
  submitBtn: { marginTop: spacing.md },
  hint: { fontSize: fontSize.caption, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm },
  sectionTitle: { fontSize: fontSize.subtitle, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.lg, marginBottom: spacing.sm },
  histCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  histDate: { fontSize: fontSize.caption, color: colors.textMuted, fontWeight: '700' },
  histQuestion: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary, marginTop: 2 },
  histAnswer: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: spacing.xs, lineHeight: 18 },
});
