/** 오늘의 질문 (커플 Q&A) — 둘 다 답하면 서로 공개. 지난 Q&A 히스토리. */
import React, { useCallback, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { TextField } from '../../components/TextField';
import { questionApi } from '../../api/question';
import { getErrorMessage } from '../../utils/error';
import { relativeDateLabel } from '../../utils/date';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { DailyQuestion, QuestionHistory } from '../../types';
import { themedStyles } from '../../theme/themedStyles';
import { useAndroidKeyboardHeight } from '../../hooks/useAndroidKeyboardHeight';

type Props = NativeStackScreenProps<HomeStackParamList, 'DailyQuestion'>;

export function DailyQuestionScreen(_: Props) {
  const androidKeyboardHeight = useAndroidKeyboardHeight();
  const [today, setToday] = useState<DailyQuestion | null>(null);
  const [history, setHistory] = useState<QuestionHistory[]>([]);
  const [loading, setLoading] = useState(false);
  // 로드 실패가 "질문이 없는 빈 상태"로 위장하지 않도록 별도로 추적한다 (QA_CHECKLIST.md 패턴 1)
  const [loadError, setLoadError] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [t, h] = await Promise.all([questionApi.today(), questionApi.history()]);
      setToday(t);
      setHistory(h);
      if (t.myAnswer) setDraft(t.myAnswer);
    } catch (e) {
      toast.error(getErrorMessage(e, '질문을 불러오지 못했어요.'));
      setLoadError(true);
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
      toast.success(updated.bothAnswered ? '서로의 답이 공개됐어요! ' : '답을 저장했어요. 상대의 답을 기다려요!');
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
              <Text style={styles.waiting}>{today.partnerName ?? '상대'}님이 답하면 서로 볼 수 있어요.</Text>
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
      {/* 키보드가 "답 남기기" 버튼을 가리지 않도록 회피 — Android 는 FlatList 를 직접
          감싸는 KeyboardAvoidingView 의 자동 높이 보정이 edge-to-edge 에서 먹지 않아
          (실기기 확인) useAndroidKeyboardHeight 로 실측 높이만큼 직접 패딩한다. */}
      <KeyboardAvoidingView
        style={[styles.flex, Platform.OS === 'android' && { paddingBottom: androidKeyboardHeight }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FlatList
          data={history}
          keyExtractor={(h) => h.questionDate}
          contentContainerStyle={styles.list}
          // 키보드가 열려 있어도 "답 남기기" 첫 탭이 바로 동작하도록
          keyboardShouldPersistTaps="handled"
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
          // today 도 history 도 비면 헤더까지 완전히 텅 빈 화면이 되던 문제 (QA_CHECKLIST.md 패턴 10).
          // today 가 있으면(답변 전이라도) renderToday() 가 이미 카드를 그리므로, 여기서는
          // today 가 없을 때만 보여준다 — FlatList 는 history 가 비어야만 이 컴포넌트를 그린다
          ListEmptyComponent={
            !loading && !today ? (
              loadError ? (
                <EmptyState
                  error
                  onRetry={load}
                  title="불러오지 못했어요"
                  description="네트워크 상태를 확인하고 다시 시도해주세요."
                />
              ) : (
                <EmptyState
                  icon="comment-question-outline"
                  title="오늘의 질문이 아직 없어요"
                  description="곧 새로운 질문이 준비될 거예요."
                />
              )
            ) : null
          }
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
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
}));
