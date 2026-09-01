/**
 * 진행 중인 운동 고정 바 — 어느 탭에 있든 하단 탭바 바로 위에 붙어 있다.
 *
 * <p><b>이게 있어야 하는 이유</b>: 운동 중에 노래 바꾸고, 카톡 답하고, 다시 돌아오는 건
 * 세트마다 일어나는 일이다. 예전엔 그 사이 하던 운동이 사라졌고(탭 전환이 세션 화면을
 * 언마운트시켰다), 사라졌다는 사실조차 어디에도 안 보였다. 짐워크·번핏이 잃어버릴 수 없는
 * 이유가 바로 이 바다 — 운동이 살아 있으면 <b>항상 보이고, 누르면 돌아간다</b>.
 *
 * <p><b>시계를 띄우지 않는 이유</b>: 세션 화면이 떠 있지 않은 동안에도 초 단위로 흐르는
 * 숫자를 보여주려면 앱을 껐다 켠 경우까지 감당해야 하는데, 아침에 30분 하고 닫은 운동이
 * 저녁에 "11시간째"로 보이면 고장 난 것처럼 보인다. 이 바가 할 일은 스톱워치가 아니라
 * <b>"안 끝낸 운동이 있다"는 사실과 돌아가는 길</b>이라, 마지막 기록 시각을 상대 시간으로만 쓴다.
 * (기록되는 운동 시간 자체는 초안의 elapsedSec 로 정확히 이어진다 — 세션 화면이 복원한다)
 */
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { MaterialCommunityIcons } from '../Icon';
import { useActiveWorkoutStore } from '../../store/activeWorkoutStore';
import type { MainTabParamList } from '../../navigation/types';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';
import { layout } from '../../theme/layout';
import { haptics } from '../../utils/haptics';

/** "방금 전 / N분 전 / N시간 전" — 분 단위 아래는 굳이 정확할 필요가 없다. */
function sinceLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 60_000) return '방금 전';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}분 전`;
  return `${Math.floor(minutes / 60)}시간 전`;
}

export function ActiveWorkoutBar() {
  const active = useActiveWorkoutStore((s) => s.active);
  const navigation = useNavigation<NavigationProp<MainTabParamList>>();

  if (!active) return null;

  const detail = active.doneSets > 0
    ? `${active.doneSets}세트 완료 · ${sinceLabel(active.savedAt)}`
    : `${active.exerciseCount}종목 담김 · ${sinceLabel(active.savedAt)}`;

  return (
    <TouchableOpacity
      style={styles.bar}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`진행 중인 운동 ${active.label}, ${detail}. 이어서 하기`}
      onPress={() => {
        haptics.light();
        /*
         * 운동 탭의 세션 화면으로 곧장 보낸다. resume 을 넘기면 세션 화면이 "이어서 할까요?"를
         * 다시 묻지 않는다 — 이 바를 누른 것이 이미 그 답이다.
         */
        navigation.navigate('Workout', {
          screen: 'WorkoutSession',
          params: { resume: true },
          /*
           * initial:false 가 없으면 세션 화면이 그 탭 스택의 <b>첫 화면</b>이 되어, 거기서
           * 뒤로 가면 운동 홈이 아니라 탭 밖으로 튕긴다. 운동 홈을 아래에 깔고 그 위에 얹는다
           * (HomeScreen 의 PlaceAdd 이동이 같은 이유로 쓰는 옵션).
           */
          initial: false,
        } as never);
      }}
    >
      <View style={styles.dot} />
      <View style={styles.texts}>
        <Text style={styles.title} numberOfLines={1}>
          운동 중 · {active.label}
        </Text>
        <Text style={styles.detail} numberOfLines={1}>
          {detail}
        </Text>
      </View>
      <Text style={styles.cta}>이어서 하기</Text>
      <MaterialCommunityIcons name="chevron-right" size={20} color={colors.primary} />
    </TouchableOpacity>
  );
}

const styles = themedStyles((colors) => ({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: layout.touchTarget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primaryBg,
    borderTopWidth: 1,
    borderTopColor: colors.primary,
  },
  // 진행 중이라는 신호 — 텍스트를 읽기 전에 눈에 먼저 걸리게 하는 작은 표식
  dot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.primary },
  texts: { flex: 1 },
  title: { fontSize: fontSize.caption, fontWeight: '800', color: colors.textPrimary },
  detail: { fontSize: fontSize.caption, color: colors.textSecondary },
  cta: { fontSize: fontSize.caption, fontWeight: '800', color: colors.primary },
}));
