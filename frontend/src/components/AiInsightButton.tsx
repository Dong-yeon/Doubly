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
  /**
   * 결과를 가져온다. {@code refresh} 가 true 면 서버 캐시를 건너뛰고 새로 생성한다.
   *
   * <p>서버는 재료(식단 기록·저장한 장소·지난주 결산)가 그대로면 지난번 결과를 그대로
   * 돌려준다 — 두 번째부터 몇 초씩 기다리지 않고, AI 한도도 쓰지 않는다. 그래서 "다른 답이
   * 보고 싶다"는 요구는 아래 '다시 받기'로만 받는다.
   */
  fetcher: (refresh: boolean) => Promise<T>;
  render: (data: T) => React.ReactNode;
  style?: ViewStyle;
}

export function AiInsightButton<T>({ label, title, fetcher, render, style }: Props<T>) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<T | null>(null);

  const load = async (refresh: boolean) => {
    setLoading(true);
    setData(null);
    try {
      setData(await fetcher(refresh));
    } catch (e) {
      toast.error(getErrorMessage(e, 'AI 요청에 실패했어요.'));
      // 새로 받다 실패한 경우엔 모달을 닫지 않는다 — 방금까지 보던 결과가 있었는데
      // 통째로 사라지면 무엇 때문에 닫혔는지 알 수 없다. 다시 눌러볼 수 있게 열어둔다.
      if (!refresh) setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const onPress = () => {
    haptics.light();
    setOpen(true);
    void load(false);
  };

  const onRefresh = () => {
    haptics.light();
    void load(true);
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
            <View style={styles.actions}>
              {/* 다시 받기는 결과가 있을 때만 — 로딩 중이거나 아직 아무것도 못 받았으면
                  누를 이유가 없다. 이걸 눌렀을 때만 AI 한도를 새로 쓴다. */}
              {data && !loading ? (
                <TouchableOpacity style={styles.action} onPress={onRefresh}>
                  <Text style={styles.refreshText}>다시 받기</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={styles.action} onPress={() => setOpen(false)}>
                <Text style={styles.closeText}>닫기</Text>
              </TouchableOpacity>
            </View>
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
  actions: { flexDirection: 'row', marginTop: spacing.sm },
  action: { flex: 1, alignItems: 'center', paddingVertical: spacing.md },
  refreshText: { color: colors.primary, fontWeight: '700', fontSize: fontSize.body },
  closeText: { color: colors.textSecondary, fontWeight: '700', fontSize: fontSize.body },
}));
