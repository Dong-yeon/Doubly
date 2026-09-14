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
  /**
   * 재료가 아직 모자라 서버가 빈 결과를 돌려줄 것이 <b>화면에서 이미 보이는</b> 경우의 안내.
   * 주면 버튼이 흐려지고, 눌러도 모달·요청 없이 이 문구만 토스트로 보여준다.
   *
   * <p>서버도 같은 조건을 알고 빈 응답에 이유를 담아 보내지만, 그걸 들으려면 모달을 열고
   * AI 작업 폴링이 한 바퀴 돌아야 한다 — 프론트가 이미 아는 사실(저장한 장소 수, 인증 장소 수)로
   * 판정할 수 있으면 누르기 전에 말해주는 편이 낫다. 판정 근거가 서버와 어긋나면 안 되므로
   * 호출부에 조건을 적을 때 서버 상수를 함께 적어둔다.
   */
  disabledReason?: string;
}

export function AiInsightButton<T>({ label, title, fetcher, render, style, disabledReason }: Props<T>) {
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
    if (disabledReason) {
      // 완전히 못 누르게 막지 않는다 — 회색 버튼은 이유를 말해주지 않아서, 왜 안 되는지
      // 알아내려면 결국 눌러봐야 한다. 누르면 이유를 말하고 요청은 보내지 않는다.
      haptics.light();
      toast.info(disabledReason);
      return;
    }
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
      <TouchableOpacity
        style={[styles.button, !!disabledReason && styles.buttonMuted, style]}
        activeOpacity={0.8}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityHint={disabledReason}
      >
        <Text style={[styles.buttonText, !!disabledReason && styles.buttonTextMuted]}>{label}</Text>
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
  // 아직 재료가 모자란 상태 — 눌리긴 하지만(이유를 말해준다) 지금 할 일은 아니라는 표시
  buttonMuted: { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
  buttonText: { color: colors.primary, fontWeight: '800', fontSize: fontSize.caption },
  buttonTextMuted: { color: colors.textTertiary },
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
