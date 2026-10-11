/**
 * "살짝 찌르기" — 상대를 기다리는 게임 판에서 한 번 부른다. 종목 공통(docs/GAME_NUDGE_2026-09-30.md).
 *
 * <p>번갈아 두는 게임은 상대가 안 들어오면 기다리는 쪽이 할 수 있는 게 "판 접기"뿐이었다. 서버가 판마다
 * 한 사람당 하루 한 번으로 막고(그 이상은 재촉이 아니라 독촉), 내 차례일 때는 거절한다 — 이 버튼은
 * "지금 상대를 기다리는 중"인 화면에서만 그리면 된다. 한 번 보내면 이 화면에 있는 동안은 "알렸어요"로 둔다.
 */
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, Text } from 'react-native';
import { gameNudgeApi } from '../api/game';
import { toast } from '../store/toastStore';
import { getErrorMessage } from '../utils/error';
import { haptics } from '../utils/haptics';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';

interface Props {
  gameId: number;
  partnerName?: string | null;
}

export function GameNudgeButton({ gameId, partnerName }: Props) {
  const [busy, setBusy] = useState(false);
  /** 이 판에서 보낸 판 id — 판이 바뀌면(새 판) 다시 누를 수 있다 */
  const [sentFor, setSentFor] = useState<number | null>(null);
  const sent = sentFor === gameId;
  const name = partnerName ?? '상대';

  const onPress = async () => {
    if (busy || sent) return;
    setBusy(true);
    try {
      await gameNudgeApi.nudge(gameId);
      setSentFor(gameId);
      haptics.light();
      toast.success(`${name}님에게 알렸어요 👋`);
    } catch (e) {
      // "오늘은 이미 알렸어요" 도 여기로 온다 — 서버 문구 그대로 보여 주고 버튼은 보낸 상태로 둔다
      toast.info(getErrorMessage(e, '알리지 못했어요. 잠시 후 다시 시도해주세요.'));
      setSentFor(gameId);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable
      onPress={() => void onPress()}
      disabled={busy || sent}
      accessibilityRole="button"
      accessibilityLabel={sent ? `${name}님에게 알렸어요` : `${name}님 살짝 찌르기`}
      style={({ pressed }) => [styles.pill, sent && styles.pillSent, pressed && styles.pressed]}
      hitSlop={6}
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <Text style={[styles.text, sent && styles.textSent]}>{sent ? '알렸어요 · 내일 다시' : `👋 ${name}님 살짝 찌르기`}</Text>
      )}
    </Pressable>
  );
}

const styles = themedStyles((colors) => ({
  pill: {
    alignSelf: 'center',
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    marginTop: spacing.sm,
  },
  pillSent: { borderColor: colors.border, backgroundColor: colors.surfaceAlt },
  pressed: { opacity: 0.7 },
  text: { fontSize: fontSize.caption, fontWeight: '800', color: colors.primary },
  textSent: { color: colors.textSecondary },
}));
