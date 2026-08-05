/** AI 인사이트 버튼 — 탭하면 fetcher 를 호출해 결과를 모달로 보여준다.
 *  주간 식단 코칭 / 커플 주간 레터 / 데이트 코스 등 텍스트형 AI 결과에 공통 사용. */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { toast } from '../store/toastStore';
import { getErrorMessage } from '../utils/error';
import { haptics } from '../utils/haptics';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';
import { layout } from '../theme/layout';

interface Props<T> {
  label: string;
  title: string;
  fetcher: () => Promise<T>;
  render: (data: T) => React.ReactNode;
  style?: ViewStyle;
}

export function AiInsightButton<T>({ label, title, fetcher, render, style }: Props<T>) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<T | null>(null);

  const onPress = async () => {
    haptics.light();
    setOpen(true);
    setLoading(true);
    setData(null);
    try {
      setData(await fetcher());
    } catch (e) {
      toast.error(getErrorMessage(e, 'AI 요청에 실패했어요.'));
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <TouchableOpacity style={[styles.button, style]} activeOpacity={0.8} onPress={onPress}>
        <Text style={styles.buttonText}>{label}</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.card} onPress={() => {}}>
            <Text style={styles.title}>{title}</Text>
            {loading ? (
              <View style={styles.loading}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.loadingText}>AI가 생각 중이에요…</Text>
              </View>
            ) : data ? (
              <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
                {render(data)}
              </ScrollView>
            ) : null}
            <TouchableOpacity style={styles.close} onPress={() => setOpen(false)}>
              <Text style={styles.closeText}>닫기</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = themedStyles((colors) => ({
  button: {
    backgroundColor: colors.primaryBg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: spacing.md,
    // 패딩만으로는 35px — 최소 터치 크기를 맞춘다
    minHeight: layout.touchTarget,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: { color: colors.primary, fontWeight: '800', fontSize: fontSize.caption },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: spacing.lg },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, maxHeight: '75%' },
  title: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.md },
  loading: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  loadingText: { color: colors.textSecondary, fontSize: fontSize.caption },
  body: { flexGrow: 0 },
  bodyContent: { paddingBottom: spacing.sm },
  close: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.sm },
  closeText: { color: colors.textSecondary, fontWeight: '700', fontSize: fontSize.body },
}));
